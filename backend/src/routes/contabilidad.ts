import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Between, In } from 'typeorm';
import { randomUUID as uuidv4 } from 'crypto';
import { AppDataSource } from '../config/database';
import { MovimientoContable } from '../models/MovimientoContable';
import { Producto } from '../models/Producto';
import { CanalCobro } from '../models/CanalCobro';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess, requirePlanFeature, getPlanFromDB } from '../middleware/requirePlan';
import { validateBody, exigirUuid, fechaISO } from '../middleware/validate';
import { calcularCalibracionMensual } from '../services/contabilidad/calibracionService';
import {
  FUENTES,
  FiltrosMovimientos,
  agregadoMensual,
  analisisCanales,
  decodificarCursor,
  kpisLiquidaciones,
  listarLiquidaciones,
  listarMovimientos,
  pnl,
  recorrerMovimientos,
  resumenContable,
} from '../services/contabilidad/consultasContables';
import {
  calcularDesgloseComision,
  calcularPrecioObjetivo,
  registrarAsientosComisionTransaccional,
  PRESETS_CANALES_DEFAULT,
  PAISES_CON_PRESETS,
} from '../services/contabilidad/comisionesService';
import { ah } from '../utils/asyncHandler';
import { auditarDinero } from '../services/auditoria/auditoriaDinero';
import { AuditoriaDinero } from '../models/AuditoriaDinero';
import { paginar, responderPagina, leerLimite as leerLimitePagina } from '../utils/paginacion';
import { hoyDePeticion, hoyEnZona, zonaDePeticion } from '../utils/fechaLocal';
import { idempotente } from '../middleware/idempotency';
import { dinero, MAX_DINERO } from '../utils/limitesNumericos';
import { getTaxConfig, impuestoIncluido } from '../utils/taxConfig';

const CrearMovimientoContableSchema = z.object({
  tipo: z.enum(['ingreso', 'egreso'], { errorMap: () => ({ message: 'tipo debe ser ingreso o egreso' }) }),
  // Topes = columnas de `movimientos_contables` (varchar(255), numeric(12,2),
  // varchar(100)): un valor mayor era un 500 de Postgres en vez de un 400.
  descripcion: z.string().trim().min(1, 'descripcion es requerida').max(255),
  monto: dinero('monto').refine((m) => m > 0, 'monto debe ser un número positivo'),
  fecha: fechaISO('fecha inválida (YYYY-MM-DD)'),
  categoria: z.string().max(100).optional(),
  parent_movimiento_id: z.string().uuid().nullable().optional(),
  es_auto_generado: z.boolean().optional(),
  tiene_cfdi: z.boolean().optional(),
  // Campos de comisiones y canales
  canal_cobro_id: z.string().uuid().nullable().optional(),
  institucion: z.string().max(100).optional(),
  comision_porcentaje: z.number().min(0).max(1).optional(),
  comision_fija: z.number().min(0).max(MAX_DINERO).optional(),
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
  comision_fija: z.number().min(0).max(MAX_DINERO).default(0),
  aplica_iva_comision: z.boolean().default(true),
  retencion_isr_porcentaje: z.number().min(0).max(1).default(0),
  retencion_iva_porcentaje: z.number().min(0).max(1).default(0),
  dias_liquidacion: z.number().int().min(0).max(90).default(1),
  activo: z.boolean().default(true),
  color: z.string().max(30).nullable().optional(),
  icono: z.string().max(60).nullable().optional(),
  notas: z.string().nullable().optional(),
});

/**
 * Conciliar una liquidación: confirmar que el dinero ya entró al banco.
 *
 * La fecha se validaba... nada: llegaba del cuerpo y se guardaba tal cual en una
 * columna `date`, así que cualquier texto reventaba la query con un 500 en vez
 * de responder 400. Sin fecha se usa hoy.
 */
const ConciliarLiquidacionSchema = z.object({
  fecha_liquidacion: fechaISO('fecha_liquidacion inválida (YYYY-MM-DD)').optional(),
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

// `Date.parse('2026-02-30')` es válido en JavaScript (lo pasa a 2 de marzo) y
// Postgres lo rechazaba a mitad de la importación.
const isValidDate = (s: string): boolean => fechaISO().safeParse(s).success;

function validateRow(row: ImportRow): string | null {
  if (!isValidDate(row.fecha)) return `Fecha inválida: "${row.fecha}"`;
  if (!row.descripcion?.trim()) return 'Descripción vacía';
  if (!['ingreso', 'egreso'].includes(row.tipo)) return `Tipo inválido: "${row.tipo}"`;
  if (typeof row.monto !== 'number' || row.monto <= 0 || !isFinite(row.monto) || row.monto > MAX_DINERO) return `Monto inválido: ${row.monto}`;
  if (row.descripcion.trim().length > 500) return 'Descripción de más de 500 caracteres';
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

/**
 * El producto de la ruta tiene que ser de la cuenta: crear canales o importar
 * movimientos sobre un producto ajeno dejaba filas con FK a datos de otra cuenta.
 */
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

/**
 * IVA del país del producto y si sus precios ya lo traen, para que la comisión
 * y las retenciones de un ingreso manual o del simulador salgan igual que en el
 * POS. Antes Contabilidad usaba 16 % fijo (también en Colombia, con 19 %).
 */
async function impuestoDelProducto(usuarioId: string, productoId: string): Promise<{ tasa: number; incluido: boolean; pais: string }> {
  const p = await AppDataSource.getRepository(Producto).findOne({
    where: { id: productoId, usuario_id: usuarioId },
    select: ['id', 'pais', 'cobra_impuesto_consumo'],
  });
  const pais = p?.pais || 'MX';
  return { tasa: getTaxConfig(pais).consumo.tasa, incluido: p?.cobra_impuesto_consumo !== false, pais };
}

// ── Filtros comunes de las consultas (query string) ──────────────────────────
const FiltrosQuerySchema = z
  .object({
    tipo: z.enum(['ingreso', 'egreso']).optional(),
    fuente: z.enum(FUENTES).optional(),
    categoria: z.string().trim().max(100).optional(),
    q: z.string().trim().max(100).optional(),
    desde: fechaISO('desde inválida (YYYY-MM-DD)').optional(),
    hasta: fechaISO('hasta inválida (YYYY-MM-DD)').optional(),
  })
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, { message: 'desde no puede ser posterior a hasta' });

function leerFiltros(req: AuthRequest, res: Response): FiltrosMovimientos | null {
  const r = FiltrosQuerySchema.safeParse(req.query);
  if (!r.success) {
    res.status(400).json({ error: r.error.errors[0]?.message ?? 'Filtros inválidos' });
    return null;
  }
  const { categoria, q, ...resto } = r.data;
  return {
    usuarioId: req.userId!,
    productoId: req.params.productoId,
    ...resto,
    categoria: categoria || undefined,
    q: q || undefined,
  };
}

const LIMITE_PAGINA = 200;
const LIMITE_MAXIMO = 500;
const leerLimite = (valor: unknown) => {
  const n = parseInt(String(valor ?? ''), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), LIMITE_MAXIMO) : LIMITE_PAGINA;
};

// GET /api/contabilidad/auditoria — quién tocó dinero ya registrado.
//
// Va ANTES de `/:productoId` a propósito: si no, Express leería "auditoria"
// como un id de producto. Solo el dueño: es justo el registro que vigila a
// quien opera la caja, así que un trabajador no puede ni leerlo.
router.get('/auditoria', ah(async (req: AuthRequest, res: Response) => {
  if (req.trabajadorRealId) {
    res.status(403).json({ error: 'Solo el dueño de la cuenta puede ver la auditoría' });
    return;
  }
  const qb = AppDataSource.getRepository(AuditoriaDinero)
    .createQueryBuilder('a')
    .where('a.usuario_id = :uid', { uid: req.userId! });
  if (typeof req.query.accion === 'string' && req.query.accion) {
    qb.andWhere('a.accion = :accion', { accion: req.query.accion });
  }
  const pagina = await paginar(
    qb,
    [
      { expr: 'a.fecha_creacion', tipo: 'timestamp' },
      { expr: 'a.id', tipo: 'uuid' },
    ],
    req.query.antes,
    leerLimitePagina(req.query.limite),
  );
  if (!pagina) { res.status(400).json({ error: 'Cursor inválido' }); return; }
  responderPagina(res, pagina);
}));

// GET /api/contabilidad/:productoId — una página de movimientos (más recientes primero).
// Query: filtros + `limite` (1-500, 200 por defecto) + `antes` (cursor de la página anterior).
// Respuesta: { movimientos, siguiente } — `siguiente` es null en la última página.
router.get('/:productoId', ah(async (req: AuthRequest, res: Response) => {
  const filtros = leerFiltros(req, res);
  if (!filtros) return;
  const antes = req.query.antes ? decodificarCursor(req.query.antes) : null;
  if (req.query.antes && !antes) {
    res.status(400).json({ error: 'Cursor de paginación inválido' });
    return;
  }
  res.json(await listarMovimientos(filtros, leerLimite(req.query.limite), antes));
}));

// GET /api/contabilidad/:productoId/resumen — KPIs, conteos, categorías,
// calibración y base fiscal sobre TODO el historial (o el rango filtrado),
// agregados en SQL: la pantalla ya no necesita descargar cada movimiento.
router.get('/:productoId/resumen', ah(async (req: AuthRequest, res: Response) => {
  const filtros = leerFiltros(req, res);
  if (!filtros) return;
  const [resumen, meses] = await Promise.all([resumenContable(filtros), agregadoMensual(filtros)]);
  res.json({ ...resumen, calibracion: calcularCalibracionMensual(meses) });
}));

// GET /api/contabilidad/:productoId/exportar — CSV con los filtros aplicados.
// Se escribe por lotes: la memoria no crece con el tamaño del historial.
router.get('/:productoId/exportar', ah(async (req: AuthRequest, res: Response) => {
  const filtros = leerFiltros(req, res);
  if (!filtros) return;
  const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="movimientos_${hoyEnZona(await zonaDePeticion(req))}.csv"`);
  res.write('\uFEFF' + ['ID', 'Fecha', 'Tipo', 'Descripcion', 'Categoria', 'Monto', 'Fuente', 'Comprobante_Fiscal', 'Auto_Generado'].join(',') + '\n');
  for await (const lote of recorrerMovimientos(filtros)) {
    const texto = lote
      .map((m) =>
        [
          celda(m.id), celda(m.fecha), celda(m.tipo), celda(m.descripcion), celda(m.categoria),
          Number(m.monto).toFixed(2), celda(m.fuente ?? 'manual'), celda(m.tiene_cfdi ? 'Si' : 'No'),
          celda(m.es_auto_generado ? 'Si' : 'No'),
        ].join(',')
      )
      .join('\n');
    if (!res.write(texto + '\n')) await new Promise((r) => res.once('drain', r));
  }
  res.end();
}));

// POST /api/contabilidad/:productoId — create movement
router.post('/:productoId', idempotente('contabilidad_mov'), requireHerramientaAccess('contabilidad', contarMovimientosManuales), validateBody(CrearMovimientoContableSchema), ah(async (req: AuthRequest, res: Response) => {
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
    const imp = await impuestoDelProducto(req.userId!, req.params.productoId);
    desgloseResult = calcularDesgloseComision(
      Number(monto),
      canalConfig,
      imp.tasa,
      imp.incluido ? impuestoIncluido(Number(monto), imp.tasa) : 0
    );
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
const EditarMovimientoSchema = z.object({
  monto: dinero('monto').refine((m) => m > 0, 'monto debe ser mayor que 0').optional(),
  // varchar(255): con .max(500), una descripción de 256 a 500 caracteres
  // pasaba la validación y reventaba el UPDATE.
  descripcion: z.string().trim().min(1, 'descripcion no puede estar vacía').max(255).optional(),
});

/**
 * Un asiento DERIVADO (el ingreso de una venta, el egreso de una nómina, la
 * comisión de una terminal…) no se edita ni se borra desde Contabilidad.
 *
 * Cambiarle el monto o borrarlo dejaba a Contabilidad diciendo una cosa y a
 * Ventas, Nómina o Almacén otra, sin forma de saber cuál era la buena; y como
 * era editable, también era la vía discreta para maquillar una caja. Lo que se
 * corrige es el hecho, en su herramienta: la venta se cancela, el pago se borra
 * desde Nómina, y el asiento se ajusta solo.
 */
const HERRAMIENTA_DE_ORIGEN: Record<string, string> = {
  venta: 'el POS (cancela la venta)',
  cotizacion: 'Cotizaciones',
  pago_nomina: 'Nómina',
  compra_inventario: 'Inventario',
  mantenimiento: 'Mantenimientos',
};

function bloqueoPorDerivado(mov: MovimientoContable): string | null {
  if (!mov.referencia_tipo || mov.referencia_tipo === 'ajuste_manual') return null;
  const origen = HERRAMIENTA_DE_ORIGEN[mov.referencia_tipo] ?? 'la herramienta que lo generó';
  return `Este movimiento lo genera ${origen}: corrígelo ahí y la contabilidad se actualiza sola.`;
}

router.patch('/movimiento/:id', validateBody(EditarMovimientoSchema), ah(async (req: AuthRequest, res: Response) => {
  const mov = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!mov) { res.status(404).json({ error: 'No encontrado' }); return; }
  const bloqueo = bloqueoPorDerivado(mov);
  if (bloqueo) { res.status(409).json({ error: bloqueo, referencia_tipo: mov.referencia_tipo }); return; }

  const { monto, descripcion } = req.body as z.infer<typeof EditarMovimientoSchema>;
  const montoAntes = Number(mov.monto);
  const actualizado = await AppDataSource.transaction(async manager => {
    if (monto !== undefined) mov.monto = monto;
    if (descripcion !== undefined) mov.descripcion = descripcion;
    await manager.save(MovimientoContable, mov);
    if (monto !== undefined && monto !== montoAntes) {
      await auditarDinero(manager, req, {
        accion:       'movimiento_editado',
        entidad:      'movimiento_contable',
        entidadId:    mov.id,
        productoId:   mov.producto_id,
        montoAntes,
        montoDespues: monto,
        detalle:      { descripcion: mov.descripcion, fecha: mov.fecha },
      });
    }
    return mov;
  });
  res.json(actualizado);
}));

// DELETE /api/contabilidad/movimiento/:id — borra un asiento MANUAL y sus hijos
router.delete('/movimiento/:id', ah(async (req: AuthRequest, res: Response) => {
  const mov = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!mov) { res.status(404).json({ error: 'No encontrado' }); return; }
  const bloqueo = bloqueoPorDerivado(mov);
  if (bloqueo) { res.status(409).json({ error: bloqueo, referencia_tipo: mov.referencia_tipo }); return; }

  // Padre e hijos, en una sola transacción: antes eran dos sentencias sueltas y
  // un fallo a medias dejaba los hijos huérfanos.
  await AppDataSource.transaction(async manager => {
    await auditarDinero(manager, req, {
      accion:     'movimiento_borrado',
      entidad:    'movimiento_contable',
      entidadId:  mov.id,
      productoId: mov.producto_id,
      montoAntes: Number(mov.monto),
      detalle:    { descripcion: mov.descripcion, fecha: mov.fecha, tipo: mov.tipo, categoria: mov.categoria },
    });
    await manager.delete(MovimientoContable, { parent_movimiento_id: mov.id, usuario_id: req.userId! });
    await manager.remove(MovimientoContable, mov);
  });
  res.json({ ok: true });
}));

// POST /api/contabilidad/:productoId/import — bulk import pre-parsed rows (Pro only)
router.post('/:productoId/import', requirePlanFeature('csv_import', 'La importación masiva CSV'), exigirProductoPropio, ah(async (req: AuthRequest, res: Response) => {
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

  // Bulk insert en lotes de 500, TODO en una transacción: si un lote falla no
  // quedan a medias los anteriores (antes se guardaban y el usuario no lo sabía).
  let importados = 0;
  const CHUNK = 500;
  await AppDataSource.transaction(async (manager) => {
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
    await manager.save(MovimientoContable, chunk);
    importados += chunk.length;
  }
  });

  // Calibración con el historial del producto, agregado por mes en SQL.
  const calibracion = calcularCalibracionMensual(
    await agregadoMensual({ usuarioId: req.userId!, productoId: req.params.productoId })
  );

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
  // Las tarifas de referencia son mexicanas (pesos, IVA 16 %, retenciones del
  // SAT): en otro país darían comisiones falsas. Ahí el dueño da de alta las suyas.
  const { pais } = await impuestoDelProducto(req.userId!, req.params.productoId);
  if (!PAISES_CON_PRESETS.includes(pais)) {
    const canales = await repoCanales().find({
      where: { usuario_id: req.userId!, producto_id: req.params.productoId, activo: true },
      order: { tipo_canal: 'ASC', nombre: 'ASC' },
    });
    res.status(200).json({
      creados: 0,
      canales,
      sin_referencia: true,
      mensaje: 'Aún no tenemos tarifas de referencia para tu país. Agrega tu terminal o app con la comisión de tu contrato.',
    });
    return;
  }
  const existentes = await repoCanales().find({
    where: { usuario_id: req.userId!, producto_id: req.params.productoId },
    select: ['nombre', 'institucion', 'tipo_canal'],
  });
  const nombresSet = new Set(existentes.map((c) => c.nombre.toLowerCase()));
  // También por institución + tipo: si alguien renombró "Mercado Pago" a "MP",
  // comparar solo nombres lo volvía a crear en cada carga del catálogo.
  const huellaSet = new Set(existentes.map((c) => `${c.institucion?.toLowerCase() ?? ''}|${c.tipo_canal}`));

  const nuevos = PRESETS_CANALES_DEFAULT.filter(
    (preset) =>
      !nombresSet.has(preset.nombre.toLowerCase()) &&
      !huellaSet.has(`${preset.institucion?.toLowerCase() ?? ''}|${preset.tipo_canal}`)
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
    // Antes un canal inexistente simulaba con 0 % de comisión sin avisar, y el
    // precio sugerido salía corto justo por lo que cobra la terminal.
    if (!canal) {
      res.status(404).json({ error: 'Canal de cobro no encontrado' });
      return;
    }
    cfg = {
      institucion: canal.institucion,
      comision_porcentaje: Number(canal.comision_porcentaje),
      comision_fija: Number(canal.comision_fija),
      aplica_iva_comision: canal.aplica_iva_comision,
      retencion_isr_porcentaje: Number(canal.retencion_isr_porcentaje),
      retencion_iva_porcentaje: Number(canal.retencion_iva_porcentaje),
    };
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

  const imp = await impuestoDelProducto(req.userId!, req.params.productoId);
  const simulacion = calcularPrecioObjetivo(monto_deseado_neto, cfg, imp.tasa, imp.incluido);
  res.json(simulacion);
}));

// GET /api/contabilidad/:productoId/liquidaciones — movimientos por liquidar
// (primero los pendientes) y KPIs sobre todo el historial, calculados en SQL.
// Query: `estado` (pendiente | liquidado), `limite` (1-500, 200 por defecto).
router.get('/:productoId/liquidaciones', ah(async (req: AuthRequest, res: Response) => {
  const filtros = leerFiltros(req, res);
  if (!filtros) return;
  const estado = req.query.estado === 'pendiente' || req.query.estado === 'liquidado' ? req.query.estado : undefined;
  const [movimientos, kpis] = await Promise.all([
    listarLiquidaciones(filtros, estado, leerLimite(req.query.limite)),
    kpisLiquidaciones(filtros),
  ]);
  res.json({ movimientos, kpis });
}));

// PATCH /api/contabilidad/liquidaciones/:id/conciliar — Marcar liquidación como depositada en banco
router.patch('/liquidaciones/:id/conciliar', validateBody(ConciliarLiquidacionSchema), ah(async (req: AuthRequest, res: Response) => {
  const { fecha_liquidacion } = req.body as z.infer<typeof ConciliarLiquidacionSchema>;
  const fechaEfectiva = fecha_liquidacion || (await hoyDePeticion(req));

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

// GET /api/contabilidad/:productoId/analisis-canales — fugas por comisiones por institución
router.get('/:productoId/analisis-canales', ah(async (req: AuthRequest, res: Response) => {
  const filtros = leerFiltros(req, res);
  if (!filtros) return;
  res.json(await analisisCanales(filtros));
}));

// GET /api/contabilidad/:productoId/pnl — Estado de Resultados (P&L)
// Query: `mes` (YYYY-MM) o `desde` + `hasta`; sin ellos, histórico acumulado.
router.get('/:productoId/pnl', ah(async (req: AuthRequest, res: Response) => {
  const { mes, ...resto } = req.query as Record<string, string | undefined>;
  let desde = resto.desde;
  let hasta = resto.hasta;
  if (mes !== undefined) {
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes);
    if (!m) {
      res.status(400).json({ error: 'mes inválido (YYYY-MM)' });
      return;
    }
    desde = `${mes}-01`;
    hasta = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).toISOString().slice(0, 10);
  }
  const r = FiltrosQuerySchema.safeParse({ desde, hasta });
  if (!r.success) {
    res.status(400).json({ error: r.error.errors[0]?.message ?? 'Rango inválido' });
    return;
  }
  const filtros: FiltrosMovimientos = { usuarioId: req.userId!, productoId: req.params.productoId, desde, hasta };
  res.json({
    periodo: mes || (desde && hasta ? `${desde} a ${hasta}` : 'Histórico acumulado'),
    pnl: await pnl(filtros),
  });
}));

export default router;

