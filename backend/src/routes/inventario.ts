import { Router, Response } from 'express';
import { exigirUuid, esUuid, fechaISO, fechaISOOpcional, validateBody } from '../middleware/validate';
import { AppDataSource } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess } from '../middleware/requirePlan';
import { ah } from '../utils/asyncHandler';
import { logger } from '../utils/logger';
import { InsumoInventario } from '../models/InsumoInventario';
import { ItemPOSInsumo } from '../models/ItemPOSInsumo';
import { MovimientoInventario } from '../models/MovimientoInventario';
import { MovimientoContable } from '../models/MovimientoContable';
import { Producto } from '../models/Producto';
import {
  aplicarMovimiento,
  calcularResumenInventario,
  TipoMovInventario,
  ErrorMovimiento,
} from '../services/inventario/inventarioService';
import { hoyDePeticion } from '../utils/fechaLocal';
import { idempotente } from '../middleware/idempotency';
import { leerLimite, paginar, responderPagina } from '../utils/paginacion';
import { z } from 'zod';
import { cantidad, costoUnitario } from '../utils/limitesNumericos';
import { Negocio } from '../models/Negocio';

const router = Router();
exigirUuid(router, 'id');
router.use(authenticate);
router.use(requireToolCapability('inventario'));
// Desbloqueo por plan/selección para todas las rutas (sin getCount: el tope de
// movimientos no debe bloquear lecturas).
router.use(requireHerramientaAccess('inventario'));

// Tope freemium de movimientos. Se cuenta por la cuenta efectiva (owner), que
// requireToolCapability ya fijó en req.userId.
const contarMovimientosInventario = (cuentaId: string) =>
  AppDataSource.getRepository(MovimientoInventario).count({ where: { usuario_id: cuentaId } });

const repoInsumos = () => AppDataSource.getRepository(InsumoInventario);
const repoMovs    = () => AppDataSource.getRepository(MovimientoInventario);
const repoCont    = () => AppDataSource.getRepository(MovimientoContable);
const repoProd    = () => AppDataSource.getRepository(Producto);

// ═══════════════════════════════════════════════════════════════════════════
// INSUMOS — CRUD del catálogo de inventario
// ═══════════════════════════════════════════════════════════════════════════

router.get('/insumos', ah(async (req: AuthRequest, res: Response) => {
  const { negocio_id, incluir_inactivos } = req.query as Record<string, string | undefined>;
  // Los archivados (borrados con historial) no se listan salvo que se pidan.
  const soloActivos = incluir_inactivos === 'true' ? {} : { activo: true };
  const insumos = await repoInsumos().find({
    where: negocio_id
      ? { usuario_id: req.userId!, negocio_id, ...soloActivos }
      : { usuario_id: req.userId!, ...soloActivos },
    order: { nombre: 'ASC' },
  });

  const resumen = calcularResumenInventario(insumos);
  res.json({ insumos, resumen });
}));

// Longitudes y máximos = columnas de `insumos_inventario`. Sin esquema, un texto
// en un campo numérico acababa guardado como NaN (numeric lo admite) y
// envenenaba la valuación del almacén.
const textoOpcional = (max: number) => z.string().trim().max(max).nullable().optional();
const CamposInsumo = {
  nombre: z.string().trim().min(1, 'nombre es requerido').max(255),
  categoria: textoOpcional(100),
  unidad: z.string().trim().min(1).max(30).optional(),
  stock_minimo: cantidad('stock_minimo').optional(),
  proveedor_default: textoOpcional(200),
  ubicacion: textoOpcional(200),
  emoji: z.string().refine((e) => [...e].length <= 8, 'emoji demasiado largo').nullable().optional(),
};
const CrearInsumoSchema = z.object({
  ...CamposInsumo,
  stock_actual: cantidad('stock_actual').optional(),
  costo_promedio: costoUnitario('costo_promedio').optional(),
  negocio_id: z.string().uuid().nullable().optional(),
});
// Stock y costo solo cambian con movimientos (así queda el historial).
const EditarInsumoSchema = z.object(CamposInsumo).partial().extend({ activo: z.boolean().optional() });

router.post('/insumos', validateBody(CrearInsumoSchema), ah(async (req: AuthRequest, res: Response) => {
  const { nombre, categoria, unidad, stock_minimo, costo_promedio, proveedor_default, ubicacion, emoji, negocio_id, stock_actual } =
    req.body as z.infer<typeof CrearInsumoSchema>;

  if (negocio_id && !(await AppDataSource.getRepository(Negocio).exists({ where: { id: negocio_id, usuario_id: req.userId! } }))) {
    res.status(404).json({ error: 'Negocio no encontrado' });
    return;
  }

  const insumo = repoInsumos().create({
    usuario_id:        req.userId!,
    negocio_id:        negocio_id ?? null,
    nombre:            nombre.trim(),
    categoria:         categoria?.trim() || null,
    unidad:            (unidad ?? 'pieza').trim(),
    stock_actual:      Math.max(0, Number(stock_actual ?? 0)),
    stock_minimo:      Math.max(0, Number(stock_minimo ?? 0)),
    costo_promedio:    Math.max(0, Number(costo_promedio ?? 0)),
    proveedor_default: proveedor_default?.trim() || null,
    ubicacion:         ubicacion?.trim() || null,
    emoji:             emoji ?? null,
    activo:            true,
  });

  await repoInsumos().save(insumo);
  res.status(201).json(insumo);
}));

router.patch('/insumos/:id', validateBody(EditarInsumoSchema), ah(async (req: AuthRequest, res: Response) => {
  const insumo = await repoInsumos().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!insumo) { res.status(404).json({ error: 'Insumo no encontrado' }); return; }

  const updatable = ['nombre', 'categoria', 'unidad', 'stock_minimo', 'proveedor_default', 'ubicacion', 'emoji', 'activo'] as const;
  for (const k of updatable) {
    if (k in req.body) {
      (insumo as unknown as Record<string, unknown>)[k] = req.body[k];
    }
  }

  await repoInsumos().save(insumo);
  res.json(insumo);
}));

// Con movimientos, el insumo se archiva: borrarlo arrastraba en cascada todo su
// historial de compras, mermas y consumos por venta. Sale de las recetas (como
// antes con el borrado), así que ninguna venta nueva lo descuenta.
router.delete('/insumos/:id', ah(async (req: AuthRequest, res: Response) => {
  const insumo = await repoInsumos().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!insumo) { res.status(404).json({ error: 'Insumo no encontrado' }); return; }

  const conHistorial = await repoMovs().exists({ where: { insumo_id: insumo.id, usuario_id: req.userId! } });
  if (!conHistorial) {
    await repoInsumos().remove(insumo);
    res.json({ ok: true, archivado: false });
    return;
  }
  await AppDataSource.transaction(async (manager) => {
    await manager.delete(ItemPOSInsumo, { insumo_id: insumo.id, usuario_id: req.userId! });
    await manager.update(InsumoInventario, { id: insumo.id, usuario_id: req.userId! }, { activo: false });
  });
  res.json({ ok: true, archivado: true, mensaje: 'El insumo tiene movimientos: se archivó para conservar su historial.' });
}));

// ═══════════════════════════════════════════════════════════════════════════
// MOVIMIENTOS — entradas (compras), salidas, mermas, ajustes
// ═══════════════════════════════════════════════════════════════════════════

router.get('/movimientos', ah(async (req: AuthRequest, res: Response) => {
  const { insumo_id, desde, hasta } = req.query as Record<string, string | undefined>;
  if (
    (insumo_id && !esUuid(insumo_id)) ||
    (desde && !fechaISO().safeParse(desde).success) ||
    (hasta && !fechaISO().safeParse(hasta).success)
  ) {
    res.status(400).json({ error: 'Filtros inválidos (insumo_id UUID, fechas YYYY-MM-DD)' });
    return;
  }
  // El join con el insumo es muchos-a-uno: no multiplica filas, así que la
  // paginación por cursor cuenta movimientos, no filas unidas.
  const qb = repoMovs()
    .createQueryBuilder('m')
    .leftJoinAndSelect('m.insumo', 'insumo')
    .where('m.usuario_id = :uid', { uid: req.userId });

  if (insumo_id) qb.andWhere('m.insumo_id = :iid', { iid: insumo_id });
  if (desde)     qb.andWhere('m.fecha >= :d', { d: desde });
  if (hasta)     qb.andWhere('m.fecha <= :h', { h: hasta });

  const pagina = await paginar(
    qb,
    [{ expr: 'm.fecha', tipo: 'date' }, { expr: 'm.fecha_creacion', tipo: 'timestamp' }, { expr: 'm.id', tipo: 'uuid' }],
    req.query.antes,
    leerLimite(req.query.limite)
  );
  if (!pagina) { res.status(400).json({ error: 'Cursor de paginación inválido' }); return; }
  responderPagina(res, pagina);
}));

const MovimientoSchema = z.object({
  insumo_id: z.string().uuid('insumo_id debe ser un UUID válido'),
  tipo: z.enum(['entrada', 'salida', 'ajuste', 'merma'], { errorMap: () => ({ message: 'tipo debe ser entrada, salida, ajuste o merma' }) }),
  cantidad: cantidad('cantidad').optional(),
  costo_unitario: costoUnitario('costo_unitario').optional(),
  stock_objetivo: cantidad('stock_objetivo').optional(),
  motivo: z.string().trim().max(255).optional(),
  proveedor: z.string().trim().max(200).optional(),
  fecha: fechaISOOpcional('fecha inválida (YYYY-MM-DD)'),
  producto_id: z.string().uuid().optional(),
  registrar_en_finanzas: z.boolean().optional(),
});

router.post('/movimientos', idempotente('inventario_mov'), requireHerramientaAccess('inventario', contarMovimientosInventario), ah(async (req: AuthRequest, res: Response) => {
  const parsed = MovimientoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Movimiento inválido' });
    return;
  }
  const {
    insumo_id,
    tipo,
    cantidad: cantidadMov,
    costo_unitario,
    stock_objetivo,
    motivo,
    proveedor,
    fecha,
    producto_id,
    registrar_en_finanzas,
  } = parsed.data;
  const fechaMov = fecha || (await hoyDePeticion(req));

  // Pre-verificar producto si se registrará en finanzas
  const prod = (tipo === 'entrada' && registrar_en_finanzas !== false && producto_id)
    ? await repoProd().findOne({ where: { id: producto_id, usuario_id: req.userId! } })
    : null;

  try {
    const { mov, insumoActualizado, movContable } = await AppDataSource.transaction(async manager => {
      // Bloqueo pesimista de escritura para prevenir lost updates ante concurrencia
      const insumo = await manager.findOne(InsumoInventario, {
        where: { id: insumo_id, usuario_id: req.userId! },
        lock: { mode: 'pessimistic_write' },
      });
      if (!insumo) {
        throw new Error('INSU_NOT_FOUND');
      }

      const resultado = aplicarMovimiento({
        tipo,
        stockActual:         Number(insumo.stock_actual),
        costoPromedioActual: Number(insumo.costo_promedio),
        cantidad:            Number(cantidadMov ?? 0),
        costoUnitarioMov:    Number(costo_unitario ?? 0),
        stockObjetivo:       stock_objetivo !== undefined ? Number(stock_objetivo) : undefined,
      });

      const m = manager.create(MovimientoInventario, {
        usuario_id:       req.userId!,
        creado_por_id:    req.trabajadorRealId ?? null,
        insumo_id,
        producto_id:      producto_id ?? null,
        tipo,
        cantidad:         resultado.cantidadEfectiva,
        costo_unitario:   resultado.costoUnitarioEfectivo,
        costo_total:      resultado.costoTotalMov,
        stock_resultante: resultado.stockNuevo,
        fecha:            fechaMov,
        motivo:           motivo?.trim() || null,
        proveedor:        proveedor?.trim() || null,
      });
      await manager.save(MovimientoInventario, m);

      insumo.stock_actual = resultado.stockNuevo;
      insumo.costo_promedio = resultado.costoPromedioNuevo;
      await manager.save(InsumoInventario, insumo);

      let mc: MovimientoContable | null = null;
      if (prod && resultado.costoTotalMov > 0) {
        mc = manager.create(MovimientoContable, {
          usuario_id:           req.userId!,
          creado_por_id:        req.trabajadorRealId ?? null,
          producto_id:          prod.id,
          tipo:                 'egreso',
          descripcion:          `Compra inventario — ${resultado.cantidadEfectiva} ${insumo.unidad} de ${insumo.nombre}${proveedor ? ` (${proveedor})` : ''}`,
          categoria:            'Inventario',
          monto:                resultado.costoTotalMov,
          fecha:                fechaMov,
          parent_movimiento_id: null,
          es_auto_generado:     false,
          tiene_cfdi:           true,
          fuente:               'inventario',
          batch_id:             null,
          referencia_tipo:      'compra_inventario',
          referencia_id:        m.id,
        });
        await manager.save(MovimientoContable, mc);

        m.movimiento_contable_id = mc.id;
        await manager.save(MovimientoInventario, m);
      }

      return { mov: m, insumoActualizado: insumo, movContable: mc };
    });

    res.status(201).json({
      movimiento: mov,
      insumo: insumoActualizado,
      movimiento_contable_id: movContable?.id ?? null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'INSU_NOT_FOUND') {
      res.status(404).json({ error: 'Insumo no encontrado' });
      return;
    }
    // Solo los errores de la operación son 400. Antes CUALQUIER error (incluido
    // un corte de la base) salía como 400 con el mensaje interno de Postgres.
    if (err instanceof ErrorMovimiento) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

router.delete('/movimientos/:id', ah(async (req: AuthRequest, res: Response) => {
  // Eliminar un movimiento NO revierte el stock automáticamente — eso requeriría
  // recalcular toda la cadena. Por simplicidad y seguridad, solo eliminamos el registro
  // contable asociado si lo hay, y dejamos el stock como está.
  // Si el usuario quiere "revertir" un movimiento, debe crear el contrario.
  const mov = await repoMovs().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!mov) { res.status(404).json({ error: 'Movimiento no encontrado' }); return; }

  // Un movimiento de una venta no se borra desde aquí: es el consumo (o la
  // devolución) que respalda esa venta, y borrarlo deja al almacén sin poder
  // explicar el stock y rompe la devolución al cancelar. Se corrige cancelando
  // la venta en el POS.
  if (mov.venta_id) {
    res.status(409).json({
      error: 'Este movimiento lo generó una venta del POS. Cancela la venta y el almacén se ajusta solo.',
      venta_id: mov.venta_id,
    });
    return;
  }

  if (mov.movimiento_contable_id) {
    await repoCont().delete({ id: mov.movimiento_contable_id, usuario_id: req.userId! }).catch((err) => {
      logger.warn('[inventario] Error al eliminar movimiento contable asociado:', err);
    });
  }

  await repoMovs().remove(mov);
  res.json({ ok: true, nota: 'Movimiento eliminado. El stock NO se revirtió — crea un movimiento inverso si lo necesitas.' });
}));

export default router;
