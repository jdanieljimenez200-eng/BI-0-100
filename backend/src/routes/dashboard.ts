import { Router, Response } from 'express';
import { Not } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { Producto } from '../models/Producto';
import { Negocio } from '../models/Negocio';
import { AnalisisMercado } from '../models/AnalisisMercado';
import { AnalisisMarketing } from '../models/AnalisisMarketing';
import { AnalisisVentas } from '../models/AnalisisVentas';
import { AnalisisFinanzas } from '../models/AnalisisFinanzas';
import { AnalisisLegal } from '../models/AnalisisLegal';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getLimites } from '../services/billing/planService';
import { extraerAlertas, resumirNiveles } from '../services/alertas/extractorAnalisis';
import { generarAlertasOperativas } from '../services/alertas/agregadorOperativo';
import { hoyDePeticion } from '../utils/fechaLocal';
import { generarResumenIaAlertas } from '../services/alertas/resumenIaService';
import { generarResumenCompleto } from '../services/alertas/resumenCompletoService';
import { requirePlanFeature, getPlanFromDB } from '../middleware/requirePlan';
import { conCreditos, responderSinCreditos, CreditosInsuficientesError } from '../services/billing/creditosIA';
import { parseFlagQuery } from '../utils/queryFlags';
import { logger } from '../utils/logger';

const router = Router();

async function findUsuario(req: AuthRequest): Promise<Usuario | null> {
  const usuarioRepo = AppDataSource.getRepository(Usuario);
  return usuarioRepo.findOne({ where: { id: req.userId } });
}

// PUT /dashboard/perfil — este router se monta en /api/dashboard, así que la ruta
// interna NO debe repetir el prefijo. Antes era '/dashboard/perfil', lo que resolvía
// a /api/dashboard/dashboard/perfil y devolvía 404 al frontend, que llama a
// /api/dashboard/perfil.
router.put('/perfil', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { nombre, email } = req.body ?? {};
    const usuarioRepo = AppDataSource.getRepository(Usuario);
    const usuario = await findUsuario(req);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (email !== undefined && email !== null && email !== '') {
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Email inválido' });
      }
      const existente = await usuarioRepo.findOne({ where: { email } });
      if (existente && existente.id !== usuario.id) {
        return res.status(409).json({ error: 'Email ya registrado por otro usuario' });
      }
      usuario.email = email;
    }

    usuario.nombre = nombre || usuario.nombre;
    await usuarioRepo.save(usuario);
    res.json({
      mensaje: 'Perfil actualizado',
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        plan: usuario.plan,
      },
    });
  } catch (err) {
    logger.error('dashboard perfil error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /dashboard/resumen — productos + último análisis por módulo (contrato UX:
// ProductoConAnalisis[] en frontend/app/dashboard/page.tsx)
router.get('/resumen', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const usuario = await findUsuario(req);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const productos = await AppDataSource.getRepository(Producto).find({
      where: { usuario_id: req.userId },
      order: { created_at: 'DESC' },
    });

    // Último análisis no-error por producto y módulo (una query por módulo)
    const repos = {
      mercado: AppDataSource.getRepository(AnalisisMercado),
      marketing: AppDataSource.getRepository(AnalisisMarketing),
      ventas: AppDataSource.getRepository(AnalisisVentas),
      finanzas: AppDataSource.getRepository(AnalisisFinanzas),
      legal: AppDataSource.getRepository(AnalisisLegal),
    };
    const snaps: Record<string, Map<string, { id: string; estado: string }>> = {};
    for (const [modulo, repo] of Object.entries(repos)) {
      const filas = await repo.find({
        where: { usuario_id: req.userId!, estado_analisis: Not('error') as any },
        select: ['id', 'producto_id', 'estado_analisis'],
        order: { fecha_creacion: 'DESC' },
        take: 500,
      });
      const mapa = new Map<string, { id: string; estado: string }>();
      for (const f of filas) {
        if (!mapa.has(f.producto_id)) {
          mapa.set(f.producto_id, { id: f.id, estado: f.estado_analisis });
        }
      }
      snaps[modulo] = mapa;
    }

    // Carpeta (negocio) por id — una query para todas
    const negocioIds = [...new Set(productos.map((p) => p.negocio_id).filter(Boolean))] as string[];
    const negocios = negocioIds.length
      ? await AppDataSource.getRepository(Negocio).find({ where: negocioIds.map((id) => ({ id })) })
      : [];
    const negocioMap = new Map(negocios.map((n) => [n.id, n]));

    const limites = getLimites(usuario.plan);
    const maxProd = limites.max_productos;

    const items = productos.map((p, idx) => ({
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria ?? '',
      // Se expone con el nombre REAL de la columna. Antes salía como
      // `precio_esperado`, un alias que no existía en la tabla y que obligaba a
      // recordar dos nombres para el mismo dato.
      precio: p.precio != null ? Number(p.precio) : null,
      imagen_url: p.imagen_url ?? null,
      negocio_id: p.negocio_id ?? null,
      negocio_nombre: p.negocio_id ? negocioMap.get(p.negocio_id)?.nombre ?? null : null,
      negocio_emoji: p.negocio_id ? negocioMap.get(p.negocio_id)?.emoji ?? null : null,
      // false → quedó fuera del plan (p. ej. tras downgrade freemium con >1 producto)
      dentro_del_plan: maxProd === -1 ? true : idx < maxProd,
      analisis: Object.fromEntries(
        Object.entries(snaps).map(([m, mapa]) => [m, mapa.get(p.id) ?? null])
      ),
    }));

    res.json({
      productos: items,
      totales: {
        productos: items.length,
        completos: items.filter(
          (p) =>
            ['mercado', 'marketing', 'finanzas', 'legal'].every(
              (m) => (p.analisis as Record<string, { estado?: string }>)[m]?.estado === 'completado'
            )
        ).length,
      },
    });
  } catch (err) {
    logger.error('dashboard resumen error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Las filas llegan ordenadas por fecha_creacion DESC, así que la primera
// aparición de cada producto es su análisis más reciente.
function ultimosPorProducto<T extends { producto_id: string }>(filas: T[]): T[] {
  const vistos = new Set<string>();
  const salida: T[] = [];
  for (const fila of filas) {
    if (vistos.has(fila.producto_id)) continue;
    vistos.add(fila.producto_id);
    salida.push(fila);
  }
  return salida;
}

// GET /dashboard/alertas — alertas unificadas de los módulos que las declaran
// (mercado, finanzas y legal; marketing, ventas y brief no tienen campo de
// alertas). Solo se consideran análisis 'completado': los que están en curso o
// en error no producen diagnóstico.
// Query opcional:
//   ?producto_id=UUID     limita a un producto
//   ?solo_accionables=1   descarta las alertas informativas (nivel verde). Acepta
//                         1/true/yes/on/si (sin distinguir mayúsculas) y el flag
//                         presente sin valor; 0/false/no/off lo desactivan.
//   ?max=3                tope de alertas por producto, las más graves primero
router.get('/alertas', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const productoId =
      typeof req.query.producto_id === 'string' && req.query.producto_id !== ''
        ? req.query.producto_id
        : null;
    const soloAccionables = parseFlagQuery(req.query.solo_accionables);
    const maxParseado = Number.parseInt(String(req.query.max ?? ''), 10);
    const maxPorProducto = Number.isFinite(maxParseado) && maxParseado > 0 ? maxParseado : 0;

    const base = { usuario_id: req.userId!, estado_analisis: 'completado' as const };
    const where = productoId ? { ...base, producto_id: productoId } : base;
    const order = { fecha_creacion: 'DESC' as const };

    const [mercado, finanzas, legal] = await Promise.all([
      AppDataSource.getRepository(AnalisisMercado).find({
        where,
        select: ['id', 'producto_id', 'alertas'],
        order,
        take: 500,
      }),
      AppDataSource.getRepository(AnalisisFinanzas).find({
        where,
        select: ['id', 'producto_id', 'resumen_data'],
        order,
        take: 500,
      }),
      AppDataSource.getRepository(AnalisisLegal).find({
        where,
        select: ['id', 'producto_id', 'cumplimiento_global', 'resultado_data'],
        order,
        take: 500,
      }),
    ]);

    const alertas = extraerAlertas({
      mercado: ultimosPorProducto(mercado),
      finanzas: ultimosPorProducto(finanzas),
      legal: ultimosPorProducto(legal),
      soloAccionables,
      maxPorProducto,
    });

    res.json({ alertas, resumen: resumirNiveles(alertas) });
  } catch (err) {
    logger.error('dashboard alertas error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /dashboard/alertas-operativas — alertas en vivo sobre datos de operación
// (stock del catálogo, ingresos del periodo vs. el anterior y avance de metas),
// evaluadas por services/alertas/alertasService.ts. A diferencia de /alertas,
// no depende de análisis de IA: sale directo de ventas, artículos y metas.
// Query opcional:
//   ?negocio_id=UUID       limita a una carpeta/negocio
//   ?dias=30               tamaño de la ventana comparada (1-365, def. 30)
//   ?umbral=0.2            caída de ingresos que dispara alerta roja (0-1)
//   ?solo_accionables=1    oculta las alertas informativas (nivel verde). Acepta
//                          1/true/yes/on/si (sin distinguir mayúsculas) y el flag
//                          presente sin valor; 0/false/no/off lo desactivan.
// `resumen` siempre cuenta TODAS las alertas evaluadas, también las verdes que
// `solo_accionables` oculta, para que el badge de la UI no cambie según el filtro.
/**
 * Filtros compartidos por los endpoints de alertas operativas.
 * Valores inválidos o ausentes de `dias`/`umbral` caen a los defaults del
 * agregador (30 días, 20% de caída de ingresos).
 */
function parseFiltrosAlertas(req: AuthRequest): {
  negocioId: string | null;
  dias: number;
  umbralCaidaIngresos: number | undefined;
} {
  const negocioId =
    typeof req.query.negocio_id === 'string' && req.query.negocio_id !== ''
      ? req.query.negocio_id
      : null;

  const diasParseado = Number.parseInt(String(req.query.dias ?? ''), 10);
  const dias = Number.isFinite(diasParseado) && diasParseado > 0 ? diasParseado : 30;

  const umbralParseado = Number.parseFloat(String(req.query.umbral ?? ''));
  const umbralCaidaIngresos =
    Number.isFinite(umbralParseado) && umbralParseado > 0 && umbralParseado < 1
      ? umbralParseado
      : undefined;

  return { negocioId, dias, umbralCaidaIngresos };
}

router.get('/alertas-operativas', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { negocioId, dias, umbralCaidaIngresos } = parseFiltrosAlertas(req);
    const soloAccionables = parseFlagQuery(req.query.solo_accionables);

    const resultado = await generarAlertasOperativas({
      usuarioId: req.userId!,
      negocioId,
      dias,
      umbralCaidaIngresos,
      soloAccionables,
      hoy: await hoyDePeticion(req),
    });

    res.json(resultado);
  } catch (err) {
    logger.error('dashboard alertas-operativas error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /dashboard/alertas-operativas/resumen — resumen ejecutivo (IA) sobre las
// MISMAS alertas que devuelve /alertas-operativas. Reutiliza el agregador y
// delega la interpretación a services/alertas/resumenIaService.ts, que cachea en
// Redis por huella de contenido (15 min) y cae a un resumen local determinista
// si no hay ANTHROPIC_API_KEY o el LLM falla: este endpoint no devuelve 5xx por
// un fallo del modelo, marca `es_mock: true`.
// Query opcional: mismos parámetros que /alertas-operativas (negocio_id, dias,
// umbral) más ?refrescar=1 para ignorar la caché. `solo_accionables` NO aplica:
// el resumen siempre se calcula sobre el diagnóstico completo.
router.get(
  '/alertas-operativas/resumen',
  authenticate,
  requirePlanFeature('alertas_automaticas', 'Resumen IA de alertas'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { negocioId, dias, umbralCaidaIngresos } = parseFiltrosAlertas(req);
      const refrescar = parseFlagQuery(req.query.refrescar);

      const datos = await generarAlertasOperativas({
        usuarioId: req.userId!,
        negocioId,
        dias,
        umbralCaidaIngresos,
        soloAccionables: false,
        hoy: await hoyDePeticion(req),
      });

      const resumenIa = await generarResumenIaAlertas({
        usuarioId: req.userId!,
        datos,
        negocioId,
        refrescar,
      });

      res.json({
        resumen_ia: resumenIa,
        resumen: datos.resumen,
        periodo: datos.periodo,
        metas_evaluadas: datos.metas_evaluadas,
        articulos_evaluados: datos.articulos_evaluados,
      });
    } catch (err) {
      logger.error('dashboard alertas-operativas resumen error:', err);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESO — "resumen completo": bajo demanda (el usuario lo pide, no se
// genera solo ni se guarda historial), junta el último análisis completado
// de cada uno de los 6 módulos y le pide a la IA un resumen del negocio +
// una recomendación de cuándo conviene volver a analizar cada módulo. No hay
// persistencia propia — deliberado, para no acumular costo de storage.
// ═══════════════════════════════════════════════════════════════════════════

// POST /dashboard/progreso/resumen-completo — Body: { producto_id }. Gateado: invoca IA.
router.post(
  '/progreso/resumen-completo',
  authenticate,
  requirePlanFeature('alertas_automaticas', 'Resumen completo de negocio'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { producto_id: productoId } = req.body ?? {};
      if (typeof productoId !== 'string' || !productoId) {
        return res.status(400).json({ error: 'producto_id es requerido' });
      }

      const plan = await getPlanFromDB(req.userId!);
      const resumen = await conCreditos(req.userId!, plan, 'resumen_completo', () =>
        generarResumenCompleto(req.userId!, productoId)
      );
      res.json({ resumen });
    } catch (err) {
      if (err instanceof CreditosInsuficientesError) return responderSinCreditos(res, err);
      logger.error('dashboard progreso resumen-completo error:', err);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
);

export default router;