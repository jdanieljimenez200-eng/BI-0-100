import { Router, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess, getPlanFromDB } from '../middleware/requirePlan';
import { validateBody, exigirUuid } from '../middleware/validate';
import { EquipoMantenimiento } from '../models/EquipoMantenimiento';
import { MantenimientoRealizado } from '../models/MantenimientoRealizado';
import { MovimientoContable } from '../models/MovimientoContable';
import {
  CATALOGO_MANTENIMIENTO,
  INTENSIDADES,
  aISO,
  estadoEquipo,
  sugerirIntervalo,
  tipoPorClave,
} from '../services/mantenimientos/catalogoIntervalos';
import { sugerirIntervaloConIa, sugerenciaGenerica } from '../services/mantenimientos/sugerenciaIaService';
import { hayClaveAnthropic } from '../config/anthropic';
import { CreditosInsuficientesError, conCreditos, responderSinCreditos } from '../services/billing/creditosIA';
import { ah } from '../utils/asyncHandler';

/**
 * Herramienta «Mantenimientos»: qué equipos hay que atender y cada cuánto.
 *
 * El «cada cuánto» sale del catálogo determinista
 * (`services/mantenimientos/catalogoIntervalos.ts`), gratis e instantáneo. La IA
 * solo se usa en POST /sugerencia, para objetos que el catálogo no reconoce, y
 * ahí cuesta 1 crédito.
 */

const router = Router();
exigirUuid(router, 'id');
router.use(authenticate);
router.use(requireToolCapability('mantenimientos'));
// Desbloqueo por plan/selección para todas las rutas (sin getCount: el tope de
// movimientos no debe bloquear lecturas).
router.use(requireHerramientaAccess('mantenimientos'));

/** Tope freemium: cada equipo dado de alta cuenta como un movimiento. */
const contarEquipos = (cuentaId: string) =>
  AppDataSource.getRepository(EquipoMantenimiento).count({ where: { usuario_id: cuentaId } });

const repoEquipos = () => AppDataSource.getRepository(EquipoMantenimiento);
const repoHistorial = () => AppDataSource.getRepository(MantenimientoRealizado);

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const IntensidadSchema = z.enum(['bajo', 'normal', 'intenso']);

const CrearEquipoSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(160),
  tipo_clave: z.string().trim().max(40).optional(),
  intensidad_uso: IntensidadSchema.default('normal'),
  // Si no llega, se resuelve con el catálogo (o el genérico si no se reconoce).
  intervalo_dias: z.number().int().min(1).max(3650).optional(),
  fecha_ultimo: z.string().regex(FECHA_ISO, 'fecha_ultimo inválida (YYYY-MM-DD)').nullable().optional(),
  ubicacion: z.string().trim().max(120).nullable().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
  emoji: z.string().trim().max(8).nullable().optional(),
  negocio_id: z.string().uuid().nullable().optional(),
  producto_id: z.string().uuid().nullable().optional(),
});

const EditarEquipoSchema = CrearEquipoSchema.partial().extend({
  activo: z.boolean().optional(),
});

const SugerenciaSchema = z.object({
  texto: z.string().trim().min(2, 'Escribe qué equipo es').max(160),
  intensidad_uso: IntensidadSchema.default('normal'),
  // La IA solo se llama si el usuario la pide expresamente: la pantalla consulta
  // el catálogo mientras se escribe, y eso jamás debe gastar un crédito.
  permitir_ia: z.boolean().default(false),
});

const RegistrarSchema = z.object({
  fecha: z.string().regex(FECHA_ISO, 'fecha inválida (YYYY-MM-DD)').optional(),
  costo: z.number().min(0).max(99_999_999).nullable().optional(),
  responsable: z.string().trim().max(160).nullable().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
});

/** Equipo + su semáforo, que es lo que pinta la pantalla. */
function conEstado(equipo: EquipoMantenimiento, hoy: string) {
  const tipo = tipoPorClave(equipo.tipo_clave);
  return {
    ...equipo,
    costo: undefined,
    tipo_label: tipo?.label ?? null,
    nota_servicio: tipo?.nota ?? null,
    ...estadoEquipo(equipo, hoy),
  };
}

// ─── GET /api/mantenimientos/catalogo ────────────────────────────────────────
// Tipos e intensidades para el selector del alta. No toca base de datos.
router.get('/catalogo', ah(async (_req: AuthRequest, res: Response) => {
  res.json({
    intensidades: INTENSIDADES,
    tipos: CATALOGO_MANTENIMIENTO.map((t) => ({
      clave: t.clave,
      label: t.label,
      emoji: t.emoji,
      categoria: t.categoria,
      intervalo_base_dias: t.intervalo_base_dias,
      nota: t.nota,
    })),
  });
}));

// ─── POST /api/mantenimientos/sugerencia ─────────────────────────────────────
// Intervalo para un objeto. Si el catálogo lo reconoce responde gratis; si no,
// lo estima la IA y cuesta 1 crédito (se devuelve si la IA cae a plantilla).
router.post('/sugerencia', validateBody(SugerenciaSchema), ah(async (req: AuthRequest, res: Response) => {
  const { texto, intensidad_uso, permitir_ia } = req.body as z.infer<typeof SugerenciaSchema>;

  const delCatalogo = sugerirIntervalo({ texto, intensidad: intensidad_uso });
  if (delCatalogo) {
    res.json({ sugerencia: delCatalogo, costo_creditos: 0 });
    return;
  }

  // El catálogo no lo reconoce y no se pidió IA: se responde sin sugerencia y
  // sin cobrar, para que la pantalla ofrezca el botón.
  if (!permitir_ia) {
    res.json({ sugerencia: null, costo_creditos: 0, requiere_ia: true });
    return;
  }

  // Sin clave de IA no hay estimación que cobrar: plantilla gratis.
  if (!hayClaveAnthropic()) {
    res.json({
      sugerencia: sugerenciaGenerica(texto, intensidad_uso),
      costo_creditos: 0,
      ia_disponible: false,
    });
    return;
  }

  try {
    const plan = await getPlanFromDB(req.userId!);
    const sugerencia = await conCreditos(req.userId!, plan, 'mantenimiento_sugerencia', () =>
      sugerirIntervaloConIa({ texto, intensidad: intensidad_uso })
    );
    res.json({ sugerencia, costo_creditos: 1 });
  } catch (err) {
    if (err instanceof CreditosInsuficientesError) {
      responderSinCreditos(res, err);
      return;
    }
    throw err;
  }
}));

// ─── GET /api/mantenimientos ─────────────────────────────────────────────────
router.get('/', ah(async (req: AuthRequest, res: Response) => {
  const { negocio_id, incluir_inactivos } = req.query as Record<string, string | undefined>;

  const qb = repoEquipos()
    .createQueryBuilder('e')
    .where('e.usuario_id = :uid', { uid: req.userId! });
  if (negocio_id) qb.andWhere('(e.negocio_id = :negocio_id OR e.negocio_id IS NULL)', { negocio_id });
  if (incluir_inactivos !== 'true') qb.andWhere('e.activo = true');

  const equipos = await qb.orderBy('e.fecha_creacion', 'DESC').limit(300).getMany();
  const hoy = aISO(new Date());
  const conSemaforo = equipos.map((e) => conEstado(e, hoy));

  res.json({
    equipos: conSemaforo,
    resumen: {
      total: conSemaforo.length,
      vencidos: conSemaforo.filter((e) => e.estado === 'vencido').length,
      proximos: conSemaforo.filter((e) => e.estado === 'proximo').length,
      al_dia: conSemaforo.filter((e) => e.estado === 'al_dia').length,
      sin_registro: conSemaforo.filter((e) => e.estado === 'sin_registro').length,
    },
  });
}));

// ─── POST /api/mantenimientos ────────────────────────────────────────────────
router.post(
  '/',
  requireHerramientaAccess('mantenimientos', contarEquipos),
  validateBody(CrearEquipoSchema),
  ah(async (req: AuthRequest, res: Response) => {
    const datos = req.body as z.infer<typeof CrearEquipoSchema>;

    // El intervalo que manda es el que el usuario ya vio en pantalla; si no
    // llega, se resuelve aquí con el catálogo para no depender del cliente.
    const delCatalogo = sugerirIntervalo({
      clave: datos.tipo_clave ?? null,
      texto: datos.nombre,
      intensidad: datos.intensidad_uso,
    });
    const intervalo = datos.intervalo_dias ?? delCatalogo?.intervalo_dias ?? null;
    if (!intervalo) {
      res.status(400).json({
        error: 'No reconocemos este equipo: estima el intervalo o escribe cada cuántos días darle mantenimiento',
        codigo: 'INTERVALO_REQUERIDO',
      });
      return;
    }

    const equipo = repoEquipos().create({
      usuario_id: req.userId!,
      creado_por_id: req.trabajadorRealId ?? null,
      negocio_id: datos.negocio_id ?? null,
      producto_id: datos.producto_id ?? null,
      nombre: datos.nombre,
      tipo_clave: delCatalogo?.clave ?? datos.tipo_clave ?? 'otro',
      emoji: datos.emoji ?? delCatalogo?.emoji ?? null,
      ubicacion: datos.ubicacion ?? null,
      intensidad_uso: datos.intensidad_uso,
      intervalo_dias: intervalo,
      intervalo_origen: datos.intervalo_dias && !delCatalogo ? 'manual' : delCatalogo ? 'catalogo' : 'manual',
      fecha_ultimo: datos.fecha_ultimo ?? null,
      notas: datos.notas ?? null,
      activo: true,
    });

    await repoEquipos().save(equipo);
    res.status(201).json(conEstado(equipo, aISO(new Date())));
  })
);

// ─── PATCH /api/mantenimientos/:id ───────────────────────────────────────────
router.patch('/:id', validateBody(EditarEquipoSchema), ah(async (req: AuthRequest, res: Response) => {
  const equipo = await repoEquipos().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!equipo) { res.status(404).json({ error: 'Equipo no encontrado' }); return; }

  const datos = req.body as z.infer<typeof EditarEquipoSchema>;
  const campos = ['nombre', 'ubicacion', 'notas', 'emoji', 'fecha_ultimo', 'activo', 'negocio_id', 'producto_id'] as const;
  for (const campo of campos) {
    if (campo in datos) (equipo as unknown as Record<string, unknown>)[campo] = datos[campo] ?? null;
  }

  // Un intervalo escrito a mano manda sobre el catálogo y queda marcado como tal.
  if (datos.intervalo_dias !== undefined) {
    equipo.intervalo_dias = datos.intervalo_dias;
    equipo.intervalo_origen = 'manual';
  } else if (datos.intensidad_uso && datos.intensidad_uso !== equipo.intensidad_uso && equipo.intervalo_origen === 'catalogo') {
    // Cambió la intensidad y el intervalo venía del catálogo: se recalcula.
    const recalculado = sugerirIntervalo({
      clave: equipo.tipo_clave,
      texto: equipo.nombre,
      intensidad: datos.intensidad_uso,
    });
    if (recalculado) equipo.intervalo_dias = recalculado.intervalo_dias;
  }
  if (datos.intensidad_uso) equipo.intensidad_uso = datos.intensidad_uso;

  await repoEquipos().save(equipo);
  res.json(conEstado(equipo, aISO(new Date())));
}));

// ─── DELETE /api/mantenimientos/:id ──────────────────────────────────────────
router.delete('/:id', ah(async (req: AuthRequest, res: Response) => {
  const equipo = await repoEquipos().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!equipo) { res.status(404).json({ error: 'Equipo no encontrado' }); return; }
  await repoEquipos().remove(equipo);
  res.json({ ok: true });
}));

// ─── POST /api/mantenimientos/:id/registrar ──────────────────────────────────
// «Ya le di mantenimiento»: historial, nueva fecha base del semáforo y, si hubo
// costo, el egreso en Contabilidad. Todo en una transacción.
router.post('/:id/registrar', validateBody(RegistrarSchema), ah(async (req: AuthRequest, res: Response) => {
  const equipo = await repoEquipos().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!equipo) { res.status(404).json({ error: 'Equipo no encontrado' }); return; }

  const datos = req.body as z.infer<typeof RegistrarSchema>;
  const hoy = aISO(new Date());
  const fecha = datos.fecha ?? hoy;
  if (fecha > hoy) {
    res.status(400).json({ error: 'La fecha del mantenimiento no puede ser futura' });
    return;
  }
  const costo = datos.costo ?? null;

  const resultado = await AppDataSource.transaction(async (manager) => {
    const registro = manager.create(MantenimientoRealizado, {
      usuario_id: req.userId!,
      creado_por_id: req.trabajadorRealId ?? null,
      equipo_id: equipo.id,
      fecha,
      costo,
      responsable: datos.responsable ?? null,
      notas: datos.notas ?? null,
      movimiento_contable_id: null,
    });
    await manager.save(MantenimientoRealizado, registro);

    // Sin costo no hay gasto que registrar.
    let movimiento: MovimientoContable | null = null;
    if (costo !== null && costo > 0) {
      movimiento = manager.create(MovimientoContable, {
        usuario_id: req.userId!,
        creado_por_id: req.trabajadorRealId ?? null,
        producto_id: equipo.producto_id,
        tipo: 'egreso',
        descripcion: `Mantenimiento — ${equipo.nombre}${datos.responsable ? ` (${datos.responsable})` : ''}`,
        categoria: 'Mantenimiento',
        monto: costo,
        fecha,
        parent_movimiento_id: null,
        es_auto_generado: false,
        tiene_cfdi: false,
        fuente: 'mantenimiento',
        batch_id: null,
        referencia_tipo: 'mantenimiento',
        referencia_id: registro.id,
      });
      await manager.save(MovimientoContable, movimiento);

      registro.movimiento_contable_id = movimiento.id;
      await manager.save(MantenimientoRealizado, registro);
    }

    // El semáforo cuenta desde el último servicio, aunque se capture con retraso.
    if (!equipo.fecha_ultimo || fecha > equipo.fecha_ultimo) {
      equipo.fecha_ultimo = fecha;
      await manager.save(EquipoMantenimiento, equipo);
    }

    return { registro, movimiento };
  });

  res.status(201).json({
    registro: resultado.registro,
    equipo: conEstado(equipo, hoy),
    movimiento_contable_id: resultado.movimiento?.id ?? null,
  });
}));

// ─── GET /api/mantenimientos/:id/historial ───────────────────────────────────
router.get('/:id/historial', ah(async (req: AuthRequest, res: Response) => {
  const equipo = await repoEquipos().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!equipo) { res.status(404).json({ error: 'Equipo no encontrado' }); return; }

  const historial = await repoHistorial().find({
    where: { usuario_id: req.userId!, equipo_id: equipo.id },
    order: { fecha: 'DESC', fecha_creacion: 'DESC' },
    take: 200,
  });

  const gastoTotal = historial.reduce((suma, h) => suma + (h.costo ?? 0), 0);
  res.json({ historial, gasto_total: gastoTotal });
}));

export default router;
