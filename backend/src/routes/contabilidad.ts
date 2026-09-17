import { Router, Response } from 'express';
import { z } from 'zod';
import { Between } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../config/database';
import { MovimientoContable } from '../models/MovimientoContable';
import { Producto } from '../models/Producto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess, requirePlanFeature, getPlanFromDB } from '../middleware/requirePlan';
import { validateBody, exigirUuid } from '../middleware/validate';
import { calcularCalibracion } from '../services/contabilidad/calibracionService';
import { ah } from '../utils/asyncHandler';

const CrearMovimientoContableSchema = z.object({
  tipo: z.enum(['ingreso', 'egreso'], { errorMap: () => ({ message: 'tipo debe ser ingreso o egreso' }) }),
  descripcion: z.string().trim().min(1, 'descripcion es requerida'),
  monto: z.number({ invalid_type_error: 'monto debe ser numérico' }).positive('monto debe ser un número positivo'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha inválida (YYYY-MM-DD)'),
  categoria: z.string().optional(),
  parent_movimiento_id: z.string().uuid().nullable().optional(),
  es_auto_generado: z.boolean().optional(),
  tiene_cfdi: z.boolean().optional(),
});

// Límites freemium del Centro de Mando — espejo del front
// (frontend/.../finanzas/.../resultado/.../page.tsx): máximo 3 movimientos
// manuales por producto y categorías premium bloqueadas. Pro+ = ilimitado.
const MAX_MOVIMIENTOS_MANUALES_FREEMIUM = 3;
const GATED_CATS_FREEMIUM = ['Gasolina', 'Insumos', 'Materiales'];

interface ImportRow {
  fecha: string;
  descripcion: string;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  categoria?: string;
  tiene_cfdi?: boolean;
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

function validateRow(row: ImportRow): string | null {
  if (!isValidDate(row.fecha)) return `Fecha inválida: "${row.fecha}"`;
  if (!row.descripcion?.trim()) return 'Descripción vacía';
  if (!['ingreso', 'egreso'].includes(row.tipo)) return `Tipo inválido: "${row.tipo}"`;
  if (typeof row.monto !== 'number' || row.monto <= 0 || !isFinite(row.monto)) return `Monto inválido: ${row.monto}`;
  return null;
}

const router = Router();
exigirUuid(router, 'id', 'productoId');
router.use(authenticate);
router.use(requireToolCapability('contabilidad'));
// Desbloqueo por plan/selección para todas las rutas.
//
// El tope de movimientos del plan gratuito se aplica solo al alta manual (ver
// POST /:productoId): POS, inventario y nómina también escriben aquí y no
// deben agotar el cupo con movimientos que el usuario no capturó.
router.use(requireHerramientaAccess('contabilidad'));

/** Movimientos capturados a mano en la cuenta: lo único que cuenta para el tope freemium. */
const contarMovimientosManuales = (cuentaId: string) =>
  AppDataSource.getRepository(MovimientoContable).count({ where: { usuario_id: cuentaId, fuente: 'manual' } });

const repo = () => AppDataSource.getRepository(MovimientoContable);

// GET /api/contabilidad/:productoId — list all movements for user+product
router.get('/:productoId', ah(async (req: AuthRequest, res: Response) => {
  const movimientos = await repo()
    .createQueryBuilder('m')
    .where('m.usuario_id = :uid', { uid: req.userId! })
    .andWhere('(m.producto_id = :productoId OR m.producto_id IS NULL)', { productoId: req.params.productoId })
    .orderBy('m.fecha', 'DESC')
    .addOrderBy('m.fecha_creacion', 'DESC')
    .getMany();
  res.json(movimientos);
}));

// POST /api/contabilidad/:productoId — create movement
router.post('/:productoId', requireHerramientaAccess('contabilidad', contarMovimientosManuales), validateBody(CrearMovimientoContableSchema), ah(async (req: AuthRequest, res: Response) => {
  const producto = await AppDataSource.getRepository(Producto).findOne({
    where: { id: req.params.productoId, usuario_id: req.userId },
  });
  if (!producto) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }

  const { tipo, descripcion, categoria, monto, fecha, parent_movimiento_id, es_auto_generado, tiene_cfdi } = req.body as {
    tipo: 'ingreso' | 'egreso';
    descripcion: string;
    categoria?: string;
    monto: number;
    fecha: string;
    parent_movimiento_id?: string | null;
    es_auto_generado?: boolean;
    tiene_cfdi?: boolean;
  };

  if (!['ingreso', 'egreso'].includes(tipo)) {
    res.status(400).json({ error: 'tipo debe ser ingreso o egreso' });
    return;
  }
  if (!descripcion?.trim()) {
    res.status(400).json({ error: 'descripcion es requerida' });
    return;
  }
  if (!monto || isNaN(Number(monto)) || Number(monto) <= 0) {
    res.status(400).json({ error: 'monto debe ser un número positivo' });
    return;
  }
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    res.status(400).json({ error: 'fecha inválida (YYYY-MM-DD)' });
    return;
  }

  // Gating freemium — solo aplica a movimientos manuales (los auto-generados,
  // p. ej. impuestos derivados, no cuentan contra el límite ni se bloquean).
  if (!es_auto_generado) {
    const plan = await getPlanFromDB(req.cuentaEfectivaId ?? req.userId!);
    if (plan === 'freemium') {
      if (GATED_CATS_FREEMIUM.includes((categoria ?? '').trim())) {
        res.status(403).json({
          error: `La categoría "${(categoria ?? '').trim()}" está disponible desde el plan Emprendedor`,
          upgrade_required: true,
          plan_actual: plan,
        });
        return;
      }
      const manualCount = await repo().count({
        where: { usuario_id: req.userId!, producto_id: req.params.productoId, es_auto_generado: false },
      });
      if (manualCount >= MAX_MOVIMIENTOS_MANUALES_FREEMIUM) {
        res.status(403).json({
          error: `Tu plan freemium permite máximo ${MAX_MOVIMIENTOS_MANUALES_FREEMIUM} movimientos manuales por producto`,
          upgrade_required: true,
          plan_actual: plan,
        });
        return;
      }
    }
  }

  const mov = repo().create({
    usuario_id: req.userId!,
    creado_por_id: req.trabajadorRealId ?? null,
    producto_id: req.params.productoId,
    tipo,
    descripcion: descripcion.trim(),
    categoria: categoria?.trim() || '',
    monto: Number(monto),
    fecha,
    parent_movimiento_id: parent_movimiento_id ?? null,
    es_auto_generado: es_auto_generado ?? false,
    tiene_cfdi: tiene_cfdi ?? false,
  });

  await repo().save(mov);
  res.status(201).json(mov);
}));

// PATCH /api/contabilidad/movimiento/:id — inline edit
router.patch('/movimiento/:id', ah(async (req: AuthRequest, res: Response) => {
  const mov = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!mov) { res.status(404).json({ error: 'No encontrado' }); return; }
  const { monto, descripcion } = req.body as { monto?: number; descripcion?: string };
  if (monto !== undefined && Number(monto) > 0) mov.monto = Number(monto);
  if (descripcion !== undefined) {
    if (!descripcion.trim()) { res.status(400).json({ error: 'descripcion no puede estar vacía' }); return; }
    mov.descripcion = descripcion.trim();
  }
  await repo().save(mov);
  res.json(mov);
}));

// DELETE /api/contabilidad/movimiento/:id — delete own movement + auto-generated children
router.delete('/movimiento/:id', ah(async (req: AuthRequest, res: Response) => {
  const mov = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!mov) { res.status(404).json({ error: 'No encontrado' }); return; }
  await repo().delete({ parent_movimiento_id: req.params.id, usuario_id: req.userId! });
  await repo().remove(mov);
  res.json({ ok: true });
}));

// POST /api/contabilidad/:productoId/import — bulk import pre-parsed rows (Pro only)
router.post('/:productoId/import', requirePlanFeature('csv_import', 'La importación masiva CSV'), ah(async (req: AuthRequest, res: Response) => {
  const { rows, omitir_duplicados = true } = req.body as {
    rows: ImportRow[];
    omitir_duplicados?: boolean;
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'rows debe ser un array no vacío' });
    return;
  }
  if (rows.length > 5000) {
    res.status(400).json({ error: 'Máximo 5,000 filas por importación' });
    return;
  }

  const batchId = uuidv4();
  const errores: { fila: number; mensaje: string }[] = [];
  const validRows: ImportRow[] = [];

  rows.forEach((row, i) => {
    const err = validateRow(row);
    if (err) errores.push({ fila: i + 2, mensaje: err }); // +2 porque fila 1 es encabezado
    else validRows.push(row);
  });

  // Detectar duplicados: compara fecha+tipo+monto+descripcion
  let filasParaInsertar = validRows;
  let saltados = 0;

  if (omitir_duplicados && validRows.length > 0) {
    const fechas = validRows.map((r) => r.fecha).sort();
    const minFecha = fechas[0];
    const maxFecha = fechas[fechas.length - 1];

    const existentes = await repo().find({
      where: {
        usuario_id: req.userId!,
        producto_id: req.params.productoId,
        fecha: Between(minFecha, maxFecha),
      },
      select: ['fecha', 'tipo', 'monto', 'descripcion'],
    });
    const existenteSet = new Set(
      existentes.map((m) => `${m.fecha}|${m.tipo}|${Number(m.monto)}|${m.descripcion.trim().toLowerCase()}`)
    );
    filasParaInsertar = validRows.filter((r) => {
      const key = `${r.fecha}|${r.tipo}|${r.monto}|${r.descripcion.trim().toLowerCase()}`;
      if (existenteSet.has(key)) { saltados++; return false; }
      return true;
    });
  }

  // Bulk insert en lotes de 500
  let importados = 0;
  const CHUNK = 500;
  for (let i = 0; i < filasParaInsertar.length; i += CHUNK) {
    const chunk = filasParaInsertar.slice(i, i + CHUNK).map((r) =>
      repo().create({
        usuario_id:   req.userId!,
        creado_por_id: req.trabajadorRealId ?? null,
        producto_id:  req.params.productoId,
        tipo:         r.tipo,
        descripcion:  r.descripcion.trim(),
        categoria:    r.categoria?.trim() || '',
        monto:        r.monto,
        fecha:        r.fecha,
        tiene_cfdi:   r.tiene_cfdi ?? false,
        fuente:       'csv_import',
        batch_id:     batchId,
      })
    );
    await repo().save(chunk);
    importados += chunk.length;
  }

  // Calibración con todos los movimientos del producto
  const todosMovimientos = await repo().find({
    where: { usuario_id: req.userId!, producto_id: req.params.productoId },
  });
  const calibracion = calcularCalibracion(todosMovimientos);

  res.status(201).json({ importados, saltados, errores, batch_id: batchId, calibracion });
}));

// DELETE /api/contabilidad/:productoId/import/:batchId — deshacer una importación completa
router.delete('/:productoId/import/:batchId', ah(async (req: AuthRequest, res: Response) => {
  const result = await repo().delete({
    usuario_id:  req.userId!,
    producto_id: req.params.productoId,
    batch_id:    req.params.batchId,
    fuente:      'csv_import',
  });
  res.json({ eliminados: result.affected ?? 0 });
}));

export default router;
