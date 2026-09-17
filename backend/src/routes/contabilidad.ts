import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Between, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../config/database';
import { MovimientoContable } from '../models/MovimientoContable';
import { Producto } from '../models/Producto';
import { CanalCobro } from '../models/CanalCobro';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess, requirePlanFeature, getPlanFromDB } from '../middleware/requirePlan';
import { validateBody, exigirUuid } from '../middleware/validate';
import { calcularCalibracion } from '../services/contabilidad/calibracionService';
import {
  calcularDesgloseComision,
  calcularPrecioObjetivo,
  registrarAsientosComisionTransaccional,
  PRESETS_CANALES_DEFAULT,
} from '../services/contabilidad/comisionesService';
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
  // Campos de comisiones y canales
  canal_cobro_id: z.string().uuid().nullable().optional(),
  institucion: z.string().optional(),
  comision_porcentaje: z.number().min(0).max(1).optional(),
  comision_fija: z.number().min(0).optional(),
  aplica_iva_comision: z.boolean().optional(),
  retencion_isr_porcentaje: z.number().min(0).max(1).optional(),
  retencion_iva_porcentaje: z.number().min(0).max(1).optional(),
  desglosar_comision: z.boolean().optional(),
});

const CanalCobroInputSchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es requerido').max(120),
  tipo_canal: z.enum(['terminal', 'delivery', 'pasarela_web', 'transferencia', 'efectivo', 'otro']),
  institucion: z.string().trim().min(1, 'institucion es requerida').max(100),
  comision_porcentaje: z.number().min(0).max(1).default(0),
  comision_fija: z.number().min(0).default(0),
  aplica_iva_comision: z.boolean().default(true),
  retencion_isr_porcentaje: z.number().min(0).max(1).default(0),
  retencion_iva_porcentaje: z.number().min(0).max(1).default(0),
  dias_liquidacion: z.number().int().min(0).max(90).default(1),
  activo: z.boolean().default(true),
  color: z.string().max(30).nullable().optional(),
  icono: z.string().max(60).nullable().optional(),
  notas: z.string().nullable().optional(),
});

/** Conciliar una liquidación: confirmar que el dinero ya entró al banco. Sin fecha se usa hoy. */
const ConciliarLiquidacionSchema = z.object({
  fecha_liquidacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_liquidacion inválida (YYYY-MM-DD)').optional(),
});

const SimularPreciosSchema = z.object({
  monto_deseado_neto: z.number().positive('monto_deseado_neto debe ser un número positivo'),
  canal_cobro_id: z.string().uuid().nullable().optional(),
  canal_custom: z.object({
    institucion: z.string().optional(),
    comision_porcentaje: z.number().min(0).max(1).default(0),
    comision_fija: z.number().min(0).default(0),
    aplica_iva_comision: z.boolean().default(true),
    retencion_isr_porcentaje: z.number().min(0).max(1).default(0),
    retencion_iva_porcentaje: z.number().min(0).max(1).default(0),
  }).optional(),
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

  const {
    tipo,
    descripcion,
    categoria,
    monto,
    fecha,
    parent_movimiento_id,
    es_auto_generado,
    tiene_cfdi,
    canal_cobro_id,
    institucion,
    comision_porcentaje,
    comision_fija,
    aplica_iva_comision,
    retencion_isr_porcentaje,
    retencion_iva_porcentaje,
    desglosar_comision = true,
  } = req.body as {
    tipo: 'ingreso' | 'egreso';
    descripcion: string;
    categoria?: string;
    monto: number;
    fecha: string;
    parent_movimiento_id?: string | null;
    es_auto_generado?: boolean;
    tiene_cfdi?: boolean;
    canal_cobro_id?: string | null;
    institucion?: string;
    comision_porcentaje?: number;
    comision_fija?: number;
    aplica_iva_comision?: boolean;
    retencion_isr_porcentaje?: number;
    retencion_iva_porcentaje?: number;
    desglosar_comision?: boolean;
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

  // Resolver canal si viene canal_cobro_id o datos personalizados
  let canalResolv: CanalCobro | null = null;
  if (canal_cobro_id) {
    canalResolv = await AppDataSource.getRepository(CanalCobro).findOne({
      where: { id: canal_cobro_id, usuario_id: req.userId! },
    });
    if (!canalResolv) {
      res.status(404).json({ error: 'Canal de cobro no encontrado' });
      return;
    }
  }

  const tieneComision = Boolean(
    tipo === 'ingreso' &&
    (canalResolv || comision_porcentaje !== undefined || comision_fija !== undefined || institucion)
  );

  let desgloseResult = null;
  let canalConfig = null;

  if (tieneComision) {
    canalConfig = {
      nombre: canalResolv?.nombre,
      institucion: canalResolv?.institucion || institucion || 'Terminal / Plataforma',
      comision_porcentaje: canalResolv ? Number(canalResolv.comision_porcentaje) : (comision_porcentaje ?? 0),
      comision_fija: canalResolv ? Number(canalResolv.comision_fija) : (comision_fija ?? 0),
      aplica_iva_comision: canalResolv ? canalResolv.aplica_iva_comision : (aplica_iva_comision ?? true),
      retencion_isr_porcentaje: canalResolv ? Number(canalResolv.retencion_isr_porcentaje) : (retencion_isr_porcentaje ?? 0),
      retencion_iva_porcentaje: canalResolv ? Number(canalResolv.retencion_iva_porcentaje) : (retencion_iva_porcentaje ?? 0),
      dias_liquidacion: canalResolv ? canalResolv.dias_liquidacion : 1,
    };
    desgloseResult = calcularDesgloseComision(Number(monto), canalConfig);
  }

  const mov = await AppDataSource.transaction(async (manager) => {
    const nuevo = manager.create(MovimientoContable, {
      usuario_id: req.userId!,
      creado_por_id: req.trabajadorRealId ?? null,
      producto_id: req.params.productoId,
      tipo,
      descripcion: descripcion.trim(),
      categoria: categoria?.trim() || (tipo === 'ingreso' ? 'Ventas' : 'Otros'),
      monto: Number(monto),
      fecha,
      parent_movimiento_id: parent_movimiento_id ?? null,
      es_auto_generado: es_auto_generado ?? false,
      tiene_cfdi: tiene_cfdi ?? false,
      fuente: (canalResolv?.tipo_canal === 'delivery' ? 'delivery' : canalResolv?.tipo_canal === 'terminal' ? 'terminal' : 'manual'),
      canal_cobro_id: canalResolv?.id ?? null,
      canal_nombre_snapshot: canalConfig?.nombre ?? canalConfig?.institucion ?? null,
      institucion_snapshot: canalConfig?.institucion ?? null,
      monto_bruto: desgloseResult ? desgloseResult.montoBruto : null,
      comision_monto: desgloseResult ? desgloseResult.comisionBase : null,
      comision_iva: desgloseResult ? desgloseResult.comisionIva : null,
      retencion_monto: desgloseResult ? (desgloseResult.retencionIsr + desgloseResult.retencionIva) : null,
      monto_neto: desgloseResult ? desgloseResult.montoNeto : Number(monto),
      // Pendiente solo si un tercero lo deposita después; un egreso o un
      // ingreso sin canal ya está en caja.
      estado_liquidacion: canalConfig && (canalConfig.dias_liquidacion ?? 0) > 0 ? 'pendiente' : 'liquidado',
      fecha_liquidacion: canalConfig && (canalConfig.dias_liquidacion ?? 0) > 0 ? null : fecha,
    });

    await manager.save(MovimientoContable, nuevo);

    // Si tiene comisiones y el usuario solicitó desglosarlas, crear los asientos hijos
    if (desgloseResult && desglosar_comision && canalConfig) {
      await registrarAsientosComisionTransaccional(manager, {
        movPadre: nuevo,
        canal: canalConfig,
        desglose: desgloseResult,
        usuarioId: req.userId!,
        productoId: req.params.productoId,
        fecha,
        creadoPorId: req.trabajadorRealId,
        fuente: 'manual',
      });
    }

    return nuevo;
  });

  res.status(201).json({ ...mov, desglose: desgloseResult });
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

// ── CANALES DE COBRO Y TERMINALES / DELIVERY ─────────────────────────────────

const repoCanales = () => AppDataSource.getRepository(CanalCobro);

// GET /api/contabilidad/:productoId/canales — Listar canales configurados
router.get('/:productoId/canales', ah(async (req: AuthRequest, res: Response) => {
  const canales = await repoCanales()
    .createQueryBuilder('c')
    .where('c.usuario_id = :uid', { uid: req.userId! })
    .andWhere('(c.producto_id = :productoId OR c.producto_id IS NULL)', { productoId: req.params.productoId })
    .andWhere('c.activo = true')
    .orderBy('c.tipo_canal', 'ASC')
    .addOrderBy('c.nombre', 'ASC')
    .getMany();
  res.json(canales);
}));

/** Crear canales colgados de un producto ajeno dejaba filas con FK a datos de otra cuenta. */
const exigirProductoPropio = ah(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const existe = await AppDataSource.getRepository(Producto).exists({
    where: { id: req.params.productoId, usuario_id: req.userId! },
  });
  if (!existe) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }
  next();
});

// POST /api/contabilidad/:productoId/canales — Crear nuevo canal
router.post('/:productoId/canales', exigirProductoPropio, validateBody(CanalCobroInputSchema), ah(async (req: AuthRequest, res: Response) => {
  const body = req.body;
  const canal = repoCanales().create({
    usuario_id: req.userId!,
    producto_id: req.params.productoId,
    nombre: body.nombre.trim(),
    tipo_canal: body.tipo_canal,
    institucion: body.institucion.trim(),
    comision_porcentaje: Number(body.comision_porcentaje ?? 0),
    comision_fija: Number(body.comision_fija ?? 0),
    aplica_iva_comision: Boolean(body.aplica_iva_comision ?? true),
    retencion_isr_porcentaje: Number(body.retencion_isr_porcentaje ?? 0),
    retencion_iva_porcentaje: Number(body.retencion_iva_porcentaje ?? 0),
    dias_liquidacion: Number(body.dias_liquidacion ?? 1),
    activo: body.activo ?? true,
    color: body.color ?? null,
    icono: body.icono ?? null,
    notas: body.notas?.trim() ?? null,
  });

  await repoCanales().save(canal);
  res.status(201).json(canal);
}));

// PUT /api/contabilidad/:productoId/canales/:id — Editar canal
router.put('/:productoId/canales/:id', validateBody(CanalCobroInputSchema), ah(async (req: AuthRequest, res: Response) => {
  const canal = await repoCanales().findOne({
    where: { id: req.params.id, usuario_id: req.userId! },
  });
  if (!canal) {
    res.status(404).json({ error: 'Canal no encontrado' });
    return;
  }

  const body = req.body;
  canal.nombre = body.nombre.trim();
  canal.tipo_canal = body.tipo_canal;
  canal.institucion = body.institucion.trim();
  canal.comision_porcentaje = Number(body.comision_porcentaje ?? 0);
  canal.comision_fija = Number(body.comision_fija ?? 0);
  canal.aplica_iva_comision = Boolean(body.aplica_iva_comision ?? true);
  canal.retencion_isr_porcentaje = Number(body.retencion_isr_porcentaje ?? 0);
  canal.retencion_iva_porcentaje = Number(body.retencion_iva_porcentaje ?? 0);
  canal.dias_liquidacion = Number(body.dias_liquidacion ?? 1);
  canal.activo = body.activo ?? canal.activo;
  canal.color = body.color ?? canal.color;
  canal.icono = body.icono ?? canal.icono;
  canal.notas = body.notas?.trim() ?? null;

  await repoCanales().save(canal);
  res.json(canal);
}));

// DELETE /api/contabilidad/:productoId/canales/:id — Desactivar canal
router.delete('/:productoId/canales/:id', ah(async (req: AuthRequest, res: Response) => {
  const canal = await repoCanales().findOne({
    where: { id: req.params.id, usuario_id: req.userId! },
  });
  if (!canal) {
    res.status(404).json({ error: 'Canal no encontrado' });
    return;
  }

  canal.activo = false;
  await repoCanales().save(canal);
  res.json({ ok: true });
}));

// POST /api/contabilidad/:productoId/canales/seed-defaults — Cargar catálogo inicial de canales
router.post('/:productoId/canales/seed-defaults', exigirProductoPropio, ah(async (req: AuthRequest, res: Response) => {
  const existentes = await repoCanales().find({
    where: { usuario_id: req.userId!, producto_id: req.params.productoId },
    select: ['nombre'],
  });
  const nombresSet = new Set(existentes.map((c) => c.nombre.toLowerCase()));

  const nuevos = PRESETS_CANALES_DEFAULT.filter(
    (preset) => !nombresSet.has(preset.nombre.toLowerCase())
  ).map((preset) =>
    repoCanales().create({
      usuario_id: req.userId!,
      producto_id: req.params.productoId,
      ...preset,
    })
  );

  if (nuevos.length > 0) {
    await repoCanales().save(nuevos);
  }

  const todos = await repoCanales().find({
    where: { usuario_id: req.userId!, producto_id: req.params.productoId, activo: true },
    order: { tipo_canal: 'ASC', nombre: 'ASC' },
  });
  res.status(201).json({ creados: nuevos.length, canales: todos });
}));

// POST /api/contabilidad/:productoId/canales/simular — Simulador de precios / markup
router.post('/:productoId/canales/simular', validateBody(SimularPreciosSchema), ah(async (req: AuthRequest, res: Response) => {
  const { monto_deseado_neto, canal_cobro_id, canal_custom } = req.body as {
    monto_deseado_neto: number;
    canal_cobro_id?: string | null;
    canal_custom?: {
      institucion?: string;
      comision_porcentaje: number;
      comision_fija: number;
      aplica_iva_comision: boolean;
      retencion_isr_porcentaje?: number;
      retencion_iva_porcentaje?: number;
    };
  };

  let cfg = {
    institucion: 'Personalizado',
    comision_porcentaje: 0,
    comision_fija: 0,
    aplica_iva_comision: true,
    retencion_isr_porcentaje: 0,
    retencion_iva_porcentaje: 0,
  };

  if (canal_cobro_id) {
    const canal = await repoCanales().findOne({ where: { id: canal_cobro_id, usuario_id: req.userId! } });
    if (canal) {
      cfg = {
        institucion: canal.institucion,
        comision_porcentaje: Number(canal.comision_porcentaje),
        comision_fija: Number(canal.comision_fija),
        aplica_iva_comision: canal.aplica_iva_comision,
        retencion_isr_porcentaje: Number(canal.retencion_isr_porcentaje),
        retencion_iva_porcentaje: Number(canal.retencion_iva_porcentaje),
      };
    }
  } else if (canal_custom) {
    cfg = {
      institucion: canal_custom.institucion || 'Personalizado',
      comision_porcentaje: Number(canal_custom.comision_porcentaje ?? 0),
      comision_fija: Number(canal_custom.comision_fija ?? 0),
      aplica_iva_comision: Boolean(canal_custom.aplica_iva_comision ?? true),
      retencion_isr_porcentaje: Number(canal_custom.retencion_isr_porcentaje ?? 0),
      retencion_iva_porcentaje: Number(canal_custom.retencion_iva_porcentaje ?? 0),
    };
  }

  const simulacion = calcularPrecioObjetivo(monto_deseado_neto, cfg);
  res.json(simulacion);
}));

// GET /api/contabilidad/:productoId/liquidaciones — Movimientos y conciliación de liquidaciones
router.get('/:productoId/liquidaciones', ah(async (req: AuthRequest, res: Response) => {
  const movs = await repo()
    .createQueryBuilder('m')
    .where('m.usuario_id = :uid', { uid: req.userId! })
    .andWhere('(m.producto_id = :productoId OR m.producto_id IS NULL)', { productoId: req.params.productoId })
    .andWhere('m.tipo = :tipo', { tipo: 'ingreso' })
    .andWhere('(m.canal_cobro_id IS NOT NULL OR m.monto_bruto IS NOT NULL OR m.comision_monto IS NOT NULL)')
    .orderBy('m.fecha', 'DESC')
    .addOrderBy('m.fecha_creacion', 'DESC')
    .getMany();

  let totalPendienteCobro = 0;
  let totalLiquidado = 0;
  let totalComisionesDeducidas = 0;

  for (const m of movs) {
    const neto = Number(m.monto_neto ?? m.monto ?? 0);
    const comision = Number(m.comision_monto ?? 0) + Number(m.comision_iva ?? 0) + Number(m.retencion_monto ?? 0);
    totalComisionesDeducidas += comision;
    if (m.estado_liquidacion === 'pendiente') {
      totalPendienteCobro += neto;
    } else {
      totalLiquidado += neto;
    }
  }

  res.json({
    movimientos: movs,
    kpis: {
      total_pendiente_cobro: Math.round(totalPendienteCobro * 100) / 100,
      total_liquidado: Math.round(totalLiquidado * 100) / 100,
      total_comisiones_deducidas: Math.round(totalComisionesDeducidas * 100) / 100,
      conteo_pendientes: movs.filter((m) => m.estado_liquidacion === 'pendiente').length,
    },
  });
}));

// PATCH /api/contabilidad/liquidaciones/:id/conciliar — Marcar liquidación como depositada en banco
router.patch('/liquidaciones/:id/conciliar', validateBody(ConciliarLiquidacionSchema), ah(async (req: AuthRequest, res: Response) => {
  const { fecha_liquidacion } = req.body as z.infer<typeof ConciliarLiquidacionSchema>;
  const fechaEfectiva = fecha_liquidacion || new Date().toISOString().slice(0, 10);

  const actualizado = await AppDataSource.transaction(async (manager) => {
    const mov = await manager.getRepository(MovimientoContable).findOne({
      where: { id: req.params.id, usuario_id: req.userId! },
    });
    if (!mov) return null;

    mov.estado_liquidacion = 'liquidado';
    mov.fecha_liquidacion = fechaEfectiva;
    await manager.save(MovimientoContable, mov);

    // Sincronizar también los asientos hijos vinculados (comisiones derivadas)
    await manager
      .createQueryBuilder()
      .update(MovimientoContable)
      .set({ estado_liquidacion: 'liquidado', fecha_liquidacion: fechaEfectiva })
      .where('parent_movimiento_id = :parentId AND usuario_id = :uid', {
        parentId: mov.id,
        uid: req.userId!,
      })
      .execute();

    return mov;
  });

  if (!actualizado) {
    res.status(404).json({ error: 'Movimiento no encontrado' });
    return;
  }

  res.json({ ok: true, movimiento: actualizado });
}));

// GET /api/contabilidad/:productoId/analisis-canales — Fugas por comisiones por institución
router.get('/:productoId/analisis-canales', ah(async (req: AuthRequest, res: Response) => {
  const movs = await repo()
    .createQueryBuilder('m')
    .where('m.usuario_id = :uid', { uid: req.userId! })
    .andWhere('(m.producto_id = :productoId OR m.producto_id IS NULL)', { productoId: req.params.productoId })
    .andWhere('m.tipo = :tipo', { tipo: 'ingreso' })
    .andWhere('(m.comision_monto IS NOT NULL OR m.canal_cobro_id IS NOT NULL)')
    .getMany();

  const map: Record<
    string,
    {
      institucion: string;
      canal_nombre: string;
      transacciones: number;
      total_bruto: number;
      total_comisiones: number;
      total_comisiones_iva: number;
      total_retenciones: number;
      total_deducciones: number;
      total_neto: number;
    }
  > = {};

  let granTotalBruto = 0;
  let granTotalComisiones = 0;

  for (const m of movs) {
    const key = m.institucion_snapshot || m.canal_nombre_snapshot || 'Otras Terminales';
    if (!map[key]) {
      map[key] = {
        institucion: m.institucion_snapshot || key,
        canal_nombre: m.canal_nombre_snapshot || key,
        transacciones: 0,
        total_bruto: 0,
        total_comisiones: 0,
        total_comisiones_iva: 0,
        total_retenciones: 0,
        total_deducciones: 0,
        total_neto: 0,
      };
    }

    const bruto = Number(m.monto_bruto ?? m.monto ?? 0);
    const comision = Number(m.comision_monto ?? 0);
    const comisionIva = Number(m.comision_iva ?? 0);
    const retencion = Number(m.retencion_monto ?? 0);
    const deducciones = comision + comisionIva + retencion;
    const neto = Number(m.monto_neto ?? bruto - deducciones);

    map[key].transacciones += 1;
    map[key].total_bruto += bruto;
    map[key].total_comisiones += comision;
    map[key].total_comisiones_iva += comisionIva;
    map[key].total_retenciones += retencion;
    map[key].total_deducciones += deducciones;
    map[key].total_neto += neto;

    granTotalBruto += bruto;
    granTotalComisiones += deducciones;
  }

  const canalesArray = Object.values(map).map((item) => ({
    ...item,
    porcentaje_fuga: item.total_bruto > 0 ? Math.round((item.total_deducciones / item.total_bruto) * 1000) / 10 : 0,
  }));

  res.json({
    canales: canalesArray,
    totales: {
      gran_total_bruto: Math.round(granTotalBruto * 100) / 100,
      gran_total_comisiones: Math.round(granTotalComisiones * 100) / 100,
      porcentaje_fuga_global: granTotalBruto > 0 ? Math.round((granTotalComisiones / granTotalBruto) * 1000) / 10 : 0,
    },
  });
}));

// GET /api/contabilidad/:productoId/pnl — Estado de Resultados Financiero (P&L)
router.get('/:productoId/pnl', ah(async (req: AuthRequest, res: Response) => {
  const { mes, desde, hasta } = req.query as { mes?: string; desde?: string; hasta?: string };

  const qb = repo()
    .createQueryBuilder('m')
    .where('m.usuario_id = :uid', { uid: req.userId! })
    .andWhere('(m.producto_id = :productoId OR m.producto_id IS NULL)', { productoId: req.params.productoId });

  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, mNum] = mes.split('-').map(Number);
    const primerDia = `${mes}-01`;
    const ultimoDia = new Date(Date.UTC(y, mNum, 0)).toISOString().slice(0, 10);
    qb.andWhere("m.fecha BETWEEN :primerDia AND :ultimoDia", { primerDia, ultimoDia });
  } else if (desde && hasta) {
    qb.andWhere("m.fecha BETWEEN :desde AND :hasta", { desde, hasta });
  }

  const movs = await qb.getMany();

  let ingresosBrutos = 0;
  let comisionesPasarelas = 0;
  let costoVentasCOGS = 0;
  let gastosOperativosOPEX = 0;
  let impuestosTotales = 0;

  const CATEGORIAS_COGS = ['insumos', 'materiales', 'costo de venta', 'costo de ventas', 'mercancia', 'materia prima'];
  const CATEGORIAS_COMISIONES = ['comisiones financieras / plataformas', 'comision', 'comisiones', 'comision clip', 'comision uber'];
  const CATEGORIAS_IMPUESTOS = ['iva por pagar', 'isr provisional', 'imss', 'infonavit', 'retención iva', 'retención isr', 'impuestos', 'iva acreditable / comisiones'];

  for (const m of movs) {
    const monto = Number(m.monto ?? 0);
    const cat = (m.categoria || '').trim().toLowerCase();

    if (m.tipo === 'ingreso') {
      ingresosBrutos += Number(m.monto_bruto ?? monto);
      if (m.comision_monto) {
        comisionesPasarelas += Number(m.comision_monto) + Number(m.comision_iva ?? 0) + Number(m.retencion_monto ?? 0);
      }
    } else {
      // Es egreso
      if (CATEGORIAS_COMISIONES.some((c) => cat.includes(c))) {
        // Ya sumado si era auto-generado con comision_monto, pero si no tenía padre:
        if (!m.parent_movimiento_id) {
          comisionesPasarelas += monto;
        }
      } else if (CATEGORIAS_COGS.some((c) => cat.includes(c)) || m.fuente === 'inventario') {
        costoVentasCOGS += monto;
      } else if (CATEGORIAS_IMPUESTOS.some((c) => cat.includes(c))) {
        impuestosTotales += monto;
      } else {
        gastosOperativosOPEX += monto;
      }
    }
  }

  const ingresoNetoOperativo = Math.max(0, ingresosBrutos - comisionesPasarelas);
  const utilidadBruta = ingresoNetoOperativo - costoVentasCOGS;
  const ebitda = utilidadBruta - gastosOperativosOPEX;
  const utilidadNeta = ebitda - impuestosTotales;

  const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const pct = (part: number, total: number) => (total > 0 ? r2((part / total) * 100) : 0);

  res.json({
    periodo: mes || (desde && hasta ? `${desde} a ${hasta}` : 'Histórico acumulado'),
    pnl: {
      ingresos_brutos: r2(ingresosBrutos),
      comisiones_pasarelas_delivery: r2(comisionesPasarelas),
      ingreso_neto_operativo: r2(ingresoNetoOperativo),
      costo_ventas_cogs: r2(costoVentasCOGS),
      utilidad_bruta: r2(utilidadBruta),
      margen_bruto_porcentaje: pct(utilidadBruta, ingresosBrutos),
      gastos_operativos_opex: r2(gastosOperativosOPEX),
      utilidad_operativa_ebitda: r2(ebitda),
      margen_operativo_porcentaje: pct(ebitda, ingresosBrutos),
      impuestos: r2(impuestosTotales),
      utilidad_neta: r2(utilidadNeta),
      margen_neto_porcentaje: pct(utilidadNeta, ingresosBrutos),
    },
  });
}));

export default router;

