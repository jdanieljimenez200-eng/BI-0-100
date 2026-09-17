import { Router, Response } from 'express';
import { exigirUuid, fechaISO } from '../middleware/validate';
import { AppDataSource } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess } from '../middleware/requirePlan';
import { ah } from '../utils/asyncHandler';
import { logger } from '../utils/logger';
import { InsumoInventario } from '../models/InsumoInventario';
import { MovimientoInventario } from '../models/MovimientoInventario';
import { MovimientoContable } from '../models/MovimientoContable';
import { Producto } from '../models/Producto';
import {
  aplicarMovimiento,
  calcularResumenInventario,
  TipoMovInventario,
} from '../services/inventario/inventarioService';

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
  const { negocio_id } = req.query as Record<string, string | undefined>;
  const insumos = await repoInsumos().find({
    where: negocio_id
      ? { usuario_id: req.userId!, negocio_id }
      : { usuario_id: req.userId! },
    order: { nombre: 'ASC' },
  });

  const resumen = calcularResumenInventario(insumos);
  res.json({ insumos, resumen });
}));

router.post('/insumos', ah(async (req: AuthRequest, res: Response) => {
  const { nombre, categoria, unidad, stock_minimo, costo_promedio, proveedor_default, ubicacion, emoji, negocio_id, stock_actual } = req.body as {
    nombre: string;
    categoria?: string;
    unidad?: string;
    stock_minimo?: number;
    stock_actual?: number;
    costo_promedio?: number;
    proveedor_default?: string;
    ubicacion?: string;
    emoji?: string;
    negocio_id?: string | null;
  };

  if (!nombre?.trim()) {
    res.status(400).json({ error: 'nombre es requerido' });
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

router.patch('/insumos/:id', ah(async (req: AuthRequest, res: Response) => {
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

router.delete('/insumos/:id', ah(async (req: AuthRequest, res: Response) => {
  const insumo = await repoInsumos().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!insumo) { res.status(404).json({ error: 'Insumo no encontrado' }); return; }
  await repoInsumos().remove(insumo);
  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════════════════════
// MOVIMIENTOS — entradas (compras), salidas, mermas, ajustes
// ═══════════════════════════════════════════════════════════════════════════

router.get('/movimientos', ah(async (req: AuthRequest, res: Response) => {
  const { insumo_id, desde, hasta } = req.query as Record<string, string | undefined>;
  const qb = repoMovs()
    .createQueryBuilder('m')
    .leftJoinAndSelect('m.insumo', 'insumo')
    .where('m.usuario_id = :uid', { uid: req.userId })
    .orderBy('m.fecha', 'DESC')
    .addOrderBy('m.fecha_creacion', 'DESC');

  if (insumo_id) qb.andWhere('m.insumo_id = :iid', { iid: insumo_id });
  if (desde)     qb.andWhere('m.fecha >= :d', { d: desde });
  if (hasta)     qb.andWhere('m.fecha <= :h', { h: hasta });

  const movs = await qb.limit(200).getMany();
  res.json(movs);
}));

router.post('/movimientos', requireHerramientaAccess('inventario', contarMovimientosInventario), ah(async (req: AuthRequest, res: Response) => {
  const {
    insumo_id,
    tipo,
    cantidad,
    costo_unitario,
    stock_objetivo,
    motivo,
    proveedor,
    fecha,
    producto_id,
    registrar_en_finanzas,
  } = req.body as {
    insumo_id: string;
    tipo: TipoMovInventario;
    cantidad?: number;
    costo_unitario?: number;
    stock_objetivo?: number;
    motivo?: string;
    proveedor?: string;
    fecha?: string;
    producto_id?: string;       // necesario si tipo='entrada' Y registrar_en_finanzas
    registrar_en_finanzas?: boolean;
  };

  if (!insumo_id || !tipo) {
    res.status(400).json({ error: 'insumo_id y tipo son requeridos' });
    return;
  }

  if (fecha !== undefined && fecha !== '' && !fechaISO().safeParse(fecha).success) {
    res.status(400).json({ error: 'fecha inválida (YYYY-MM-DD)' });
    return;
  }
  const fechaMov = fecha || new Date().toISOString().slice(0, 10);

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
        cantidad:            Number(cantidad ?? 0),
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
    res.status(400).json({ error: err instanceof Error ? err.message : 'Movimiento inválido' });
  }
}));

router.delete('/movimientos/:id', ah(async (req: AuthRequest, res: Response) => {
  // Eliminar un movimiento NO revierte el stock automáticamente — eso requeriría
  // recalcular toda la cadena. Por simplicidad y seguridad, solo eliminamos el registro
  // contable asociado si lo hay, y dejamos el stock como está.
  // Si el usuario quiere "revertir" un movimiento, debe crear el contrario.
  const mov = await repoMovs().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!mov) { res.status(404).json({ error: 'Movimiento no encontrado' }); return; }

  if (mov.movimiento_contable_id) {
    await repoCont().delete({ id: mov.movimiento_contable_id, usuario_id: req.userId! }).catch((err) => {
      logger.warn('[inventario] Error al eliminar movimiento contable asociado:', err);
    });
  }

  await repoMovs().remove(mov);
  res.json({ ok: true, nota: 'Movimiento eliminado. El stock NO se revirtió — crea un movimiento inverso si lo necesitas.' });
}));

export default router;
