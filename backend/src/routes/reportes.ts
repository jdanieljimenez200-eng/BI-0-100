import { Router, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { Producto } from '../models/Producto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess } from '../middleware/requirePlan';
import { ah } from '../utils/asyncHandler';
import { timezoneDePais } from '../utils/timezones';
import * as reportes from '../services/reportes/reportesService';
import type { FiltrosReporte, Granularidad } from '../services/reportes/reportesService';
import * as areas from '../services/reportes/reportesAreas';
import type { Area } from '../services/reportes/reportesAreas';

const router = Router();
router.use(authenticate);
// El área de Reportes vive dentro de Contabilidad, así que hereda su gating en
// vez de introducir una herramienta nueva que habría que vender aparte.
router.use(requireToolCapability('contabilidad'));
router.use(requireHerramientaAccess('contabilidad'));

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Tope de rango. Cinco años ya cubren cualquier comparativa razonable. */
const MAX_DIAS = 366 * 5;

const FiltrosSchema = z.object({
  // 'todos' = consolidado de la cuenta. Se acepta explícito para que el modo
  // consolidado sea una elección y no el resultado de omitir un parámetro.
  producto_id: z.string().optional(),
  negocio_id: z.string().uuid().optional(),
  desde: z.string().regex(FECHA_RE, 'desde inválida (YYYY-MM-DD)'),
  hasta: z.string().regex(FECHA_RE, 'hasta inválida (YYYY-MM-DD)'),
});

const GRANULARIDADES: Granularidad[] = ['dia', 'semana', 'mes', 'anio'];

type Resuelto = { ok: true; filtros: FiltrosReporte } | { ok: false; status: number; error: string };

/**
 * Valida los query params y resuelve el ámbito del reporte.
 *
 * Cuando hay un producto concreto se valida que sea del usuario y se toma su
 * país para la zona horaria. En modo consolidado se usa el país del primer
 * producto de la cuenta: es una aproximación consciente, y solo afecta al
 * heatmap de horarios.
 */
async function resolverFiltros(req: AuthRequest): Promise<Resuelto> {
  const parsed = FiltrosSchema.safeParse(req.query);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos' };
  }
  const { producto_id, negocio_id, desde, hasta } = parsed.data;

  if (desde > hasta) {
    return { ok: false, status: 400, error: 'desde no puede ser posterior a hasta' };
  }
  const dias = Math.round(
    (new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime()) / 86400000,
  );
  if (dias > MAX_DIAS) {
    return { ok: false, status: 400, error: 'El rango máximo es de 5 años' };
  }

  const repoProd = AppDataSource.getRepository(Producto);
  const consolidado = !producto_id || producto_id === 'todos';

  let pais: string | null = null;
  if (!consolidado) {
    const producto = await repoProd.findOne({
      where: { id: producto_id, usuario_id: req.userId! },
      select: ['id', 'pais'],
    });
    if (!producto) return { ok: false, status: 404, error: 'Producto no encontrado' };
    pais = producto.pais ?? null;
  } else {
    const alguno = await repoProd.findOne({
      where: { usuario_id: req.userId! },
      select: ['id', 'pais'],
      order: { fecha_creacion: 'ASC' },
    });
    pais = alguno?.pais ?? null;
  }

  return {
    ok: true,
    filtros: {
      usuarioId: req.userId!,
      productoId: consolidado ? null : producto_id!,
      negocioId: negocio_id ?? null,
      desde,
      hasta,
      tz: timezoneDePais(pais),
    },
  };
}

/**
 * Áreas visibles para quien pide: las herramientas contratadas por la cuenta,
 * recortadas por los permisos si es un trabajador. `requireHerramientaAccess`
 * ya dejó `req.userId` apuntando a la cuenta y `trabajadorRealId` a la persona.
 */
function areasVisibles(req: AuthRequest) {
  return areas.areasDisponibles(req.userId!, req.trabajadorRealId);
}

/**
 * Exige que el área esté visible. 403 con `area_no_disponible` para que la
 * interfaz enseñe "herramienta no contratada" en vez de un error genérico.
 */
function requiereArea(area: Area) {
  return ah(async (req: AuthRequest, res: Response, next: () => void) => {
    const visibles = await areasVisibles(req);
    if (!visibles[area]) {
      res.status(403).json({ error: 'Esta área corresponde a una herramienta que no tienes disponible', codigo: 'area_no_disponible', area });
      return;
    }
    next();
  });
}

/** Envuelve un handler resolviendo antes los filtros comunes. */
function conFiltros(fn: (f: FiltrosReporte, req: AuthRequest) => Promise<unknown>) {
  return ah(async (req: AuthRequest, res: Response) => {
    const r = await resolverFiltros(req);
    if (!r.ok) {
      res.status(r.status).json({ error: r.error });
      return;
    }
    res.json(await fn(r.filtros, req));
  });
}

// GET /api/reportes/resumen — KPIs del periodo y comparativa con el anterior
router.get('/resumen', conFiltros((f) => reportes.resumen(f)));

// GET /api/reportes/serie?granularidad=dia|semana|mes|anio
router.get('/serie', requiereArea('ventas'), conFiltros(async (f, req) => {
  const g = String(req.query.granularidad ?? 'dia') as Granularidad;
  const granularidad = GRANULARIDADES.includes(g) ? g : 'dia';
  return { granularidad, puntos: await reportes.serie(f, granularidad) };
}));

// GET /api/reportes/productos — ranking de lo más vendido
router.get('/productos', requiereArea('ventas'), conFiltros(async (f, req) => {
  const limiteRaw = Number(req.query.limite ?? 20);
  const limite = Number.isFinite(limiteRaw) ? Math.min(Math.max(1, limiteRaw), 100) : 20;
  return { productos: await reportes.topProductos(f, limite) };
}));

// GET /api/reportes/almacen — entradas, salidas, mermas y alertas de stock
router.get('/almacen', requiereArea('inventario'), conFiltros((f) => reportes.almacen(f)));

// GET /api/reportes/clientes — nuevos vs recurrentes y top por facturación
router.get('/clientes', requiereArea('clientes'), conFiltros((f) => reportes.clientes(f)));

// GET /api/reportes/horarios — heatmap día × hora
router.get('/horarios', requiereArea('ventas'), conFiltros((f) => reportes.horarios(f)));

// GET /api/reportes/metodos-pago
router.get('/metodos-pago', requiereArea('ventas'), conFiltros(async (f) => ({ metodos: await reportes.metodosPago(f) })));

// GET /api/reportes/cotizaciones — tasa de conversión
router.get('/cotizaciones', requiereArea('cotizaciones'), conFiltros((f) => reportes.cotizaciones(f)));

/**
 * GET /api/reportes/panel — todo lo del panel en una sola respuesta.
 *
 * El front necesita las ocho piezas a la vez al abrir la pestaña; pedirlas por
 * separado son ocho round-trips y ocho estados de carga distintos parpadeando.
 * Cada bloque conserva su endpoint individual para los refrescos puntuales.
 */
router.get('/panel', conFiltros(async (f, req) => {
  const g = String(req.query.granularidad ?? 'dia') as Granularidad;
  const granularidad = GRANULARIDADES.includes(g) ? g : 'dia';

  const visibles = await areasVisibles(req);
  const [res_, puntos, productos, alm, cli, hor, met, cot] = await Promise.all([
    reportes.resumen(f),
    visibles.ventas ? reportes.serie(f, granularidad) : [],
    visibles.ventas ? reportes.topProductos(f, 10) : [],
    visibles.inventario ? reportes.almacen(f) : null,
    visibles.clientes ? reportes.clientes(f) : null,
    visibles.ventas ? reportes.horarios(f) : null,
    visibles.ventas ? reportes.metodosPago(f) : [],
    visibles.cotizaciones ? reportes.cotizaciones(f) : null,
  ]);

  return {
    resumen: res_,
    serie: { granularidad, puntos },
    productos,
    almacen: alm,
    clientes: cli,
    horarios: hor,
    metodos_pago: met,
    cotizaciones: cot,
  };
}));

// ═══════════════════════════════════════════════════════════════════════════
// Reportes por área
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/reportes/areas — qué áreas puede ver esta persona
router.get('/areas', ah(async (req: AuthRequest, res: Response) => {
  res.json({ areas: await areasVisibles(req) });
}));

// GET /api/reportes/panorama — KPIs de todas las áreas visibles y alertas
router.get('/panorama', conFiltros(async (f, req) => areas.panorama(f, await areasVisibles(req))));

// GET /api/reportes/completo — todas las áreas visibles, para el PDF
router.get('/completo', conFiltros(async (f, req) => ({
  periodo: { desde: f.desde, hasta: f.hasta },
  generado_en: new Date().toISOString(),
  ...(await areas.completo(f, await areasVisibles(req))),
})));

// GET /api/reportes/area/:area — detalle de un área
router.get('/area/:area', ah(async (req: AuthRequest, res: Response) => {
  const area = req.params.area;
  if (!areas.esArea(area)) {
    res.status(404).json({ error: 'Área de reporte desconocida' });
    return;
  }
  const visibles = await areasVisibles(req);
  if (!visibles[area]) {
    res.status(403).json({ error: 'Esta área corresponde a una herramienta que no tienes disponible', codigo: 'area_no_disponible', area });
    return;
  }
  const r = await resolverFiltros(req);
  if (!r.ok) {
    res.status(r.status).json({ error: r.error });
    return;
  }
  res.json({ area, ...(await areas.CALCULAR_AREA[area](r.filtros) as object) });
}));

export default router;
