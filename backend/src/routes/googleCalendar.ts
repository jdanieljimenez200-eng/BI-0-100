import { Router, Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess } from '../middleware/requirePlan';
import { Cita } from '../models/Cita';
import { ConexionGoogleCalendar } from '../models/ConexionGoogleCalendar';
import { ah } from '../utils/asyncHandler';
import { logger } from '../utils/logger';
import { cifrarToken, descifrarToken } from '../services/google/cifradoTokens';
import {
  consumirState,
  ErrorGoogle,
  googleConfigurado,
  intercambiarCodigo,
  olvidarAccessToken,
  revocarToken,
  urlAutorizacion,
  verificarState,
} from '../services/google/oauthGoogle';
import { encolarCitas } from '../workers/calendarQueue';

/**
 * /api/integraciones/google-calendar — enlazar la agenda con Google Calendar.
 *
 * Una conexión activa por cuenta: las citas del negocio van a un solo
 * calendario. Si otro miembro conecta el suyo, sustituye al anterior.
 */
const router = Router();

const repo = () => AppDataSource.getRepository(ConexionGoogleCalendar);

const MAX_CITAS_POR_SINCRONIZACION = 500;
/** Al sincronizar se suben también las citas de los últimos días (reprogramaciones recientes). */
const DIAS_ATRAS = 30;

function urlFrontend(resultado: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:3000')
    .trim()
    .replace(/\/+$/, '');
  return `${base}/dashboard/herramientas/calendario?google=${encodeURIComponent(resultado)}`;
}

function fechaDesde(): string {
  const d = new Date(Date.now() - DIAS_ATRAS * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Citas a subir: las recientes/futuras que Google aún no tiene al día. */
async function idsPorSincronizar(cuentaId: string, todas: boolean): Promise<string[]> {
  const qb = AppDataSource.getRepository(Cita)
    .createQueryBuilder('c')
    .select('c.id', 'id')
    .where('c.usuario_id = :cuentaId', { cuentaId })
    .andWhere('c.fecha >= :desde', { desde: fechaDesde() })
    // Una cancelada que nunca llegó a Google no hace falta subirla.
    .andWhere("(c.estado <> 'cancelada' OR c.google_event_id IS NOT NULL)");
  if (!todas) qb.andWhere("(c.google_sync_estado IS NULL OR c.google_sync_estado <> 'sincronizada')");
  const filas = await qb.orderBy('c.fecha', 'ASC').limit(MAX_CITAS_POR_SINCRONIZACION).getRawMany<{ id: string }>();
  return filas.map((f) => f.id);
}

// ─── GET /callback — vuelve de Google (público: lo abre el navegador) ────────
router.get('/callback', ah(async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  const datos = verificarState(state);
  if (!datos || !(await consumirState(state!))) {
    res.status(400).json({ error: 'Enlace de Google caducado o inválido. Vuelve a intentarlo desde la agenda.' });
    return;
  }
  if (error || !code) {
    res.redirect(302, urlFrontend(error === 'access_denied' ? 'cancelado' : 'error'));
    return;
  }

  try {
    const tokens = await intercambiarCodigo(code);

    await AppDataSource.transaction(async (manager) => {
      const anteriores = await manager.find(ConexionGoogleCalendar, { where: { cuenta_id: datos.cuentaId } });
      const mismoCalendario = anteriores.some((a) => a.email_google && a.email_google === tokens.email);
      if (!mismoCalendario) {
        // Otro calendario: los eventos ya creados no existen allí; se crean de nuevo.
        await manager.update(
          Cita,
          { usuario_id: datos.cuentaId },
          { google_event_id: null, google_sync_estado: null, google_sync_error: null }
        );
      }
      await manager.delete(ConexionGoogleCalendar, { cuenta_id: datos.cuentaId });
      await manager.delete(ConexionGoogleCalendar, { usuario_id: datos.usuarioId });
      await manager.save(
        manager.create(ConexionGoogleCalendar, {
          usuario_id: datos.usuarioId,
          cuenta_id: datos.cuentaId,
          email_google: tokens.email,
          calendario_id: 'primary',
          refresh_token_cifrado: cifrarToken(tokens.refreshToken),
          activa: true,
          ultimo_error: null,
        })
      );
      for (const a of anteriores) await olvidarAccessToken(a.id);
    });

    await encolarCitas(await idsPorSincronizar(datos.cuentaId, true)).catch((err) =>
      logger.warn('[googleCalendar] No se pudo encolar la sincronización inicial', {
        error: err instanceof Error ? err.message : String(err),
      })
    );
    res.redirect(302, urlFrontend('conectado'));
  } catch (err) {
    logger.warn('[googleCalendar] Falló el enlace con Google', {
      error: err instanceof Error ? err.message : String(err),
    });
    const motivo = err instanceof ErrorGoogle && err.codigo === 'scope_insuficiente' ? 'sin_permiso' : 'error';
    res.redirect(302, urlFrontend(motivo));
  }
}));

// ─── Rutas autenticadas ──────────────────────────────────────────────────────
router.use(authenticate);
router.use(requireToolCapability('citas'));
router.use(requireHerramientaAccess('citas'));

// GET /estado
router.get('/estado', ah(async (req: AuthRequest, res: Response) => {
  const conexion = await repo().findOne({ where: { cuenta_id: req.userId! }, order: { fecha_actualizacion: 'DESC' } });
  const [pendientes, conError] = conexion
    ? await Promise.all([
        AppDataSource.getRepository(Cita).count({ where: { usuario_id: req.userId!, google_sync_estado: 'pendiente' } }),
        AppDataSource.getRepository(Cita).count({ where: { usuario_id: req.userId!, google_sync_estado: 'error' } }),
      ])
    : [0, 0];
  res.json({
    disponible: googleConfigurado(),
    conectado: Boolean(conexion?.activa),
    requiere_reconectar: Boolean(conexion && !conexion.activa),
    email: conexion?.email_google ?? null,
    // Quien lo conectó puede ser un trabajador: se dice si es el que pregunta.
    conectado_por_mi: conexion ? conexion.usuario_id === (req.trabajadorRealId ?? req.userId) : false,
    ultimo_error: conexion?.ultimo_error ?? null,
    citas_pendientes: pendientes,
    citas_con_error: conError,
  });
}));

// POST /conectar → URL de autorización de Google
router.post('/conectar', ah(async (req: AuthRequest, res: Response) => {
  if (!googleConfigurado()) {
    res.status(503).json({ error: 'La conexión con Google Calendar no está disponible todavía' });
    return;
  }
  res.json({ url: urlAutorizacion({ usuarioId: req.trabajadorRealId ?? req.userId!, cuentaId: req.userId! }) });
}));

// POST /sincronizar → sube las citas que Google aún no tiene al día
router.post('/sincronizar', ah(async (req: AuthRequest, res: Response) => {
  const conexion = await repo().findOne({ where: { cuenta_id: req.userId!, activa: true } });
  if (!conexion) {
    res.status(409).json({ error: 'Conecta tu Google Calendar primero' });
    return;
  }
  const encoladas = await encolarCitas(await idsPorSincronizar(req.userId!, false));
  res.json({ encoladas });
}));

// DELETE / → desconecta y revoca el permiso en Google (los eventos ya creados se quedan)
router.delete('/', ah(async (req: AuthRequest, res: Response) => {
  const conexion = (await repo()
    .createQueryBuilder('g')
    .addSelect('g.refresh_token_cifrado')
    .where('g.cuenta_id = :cuentaId', { cuentaId: req.userId! })
    .getOne()) as (ConexionGoogleCalendar & { refresh_token_cifrado: string }) | null;
  if (!conexion) {
    res.json({ ok: true });
    return;
  }
  // Un trabajador solo puede quitar la conexión que hizo él; el dueño, cualquiera.
  if (req.trabajadorRealId && conexion.usuario_id !== req.trabajadorRealId) {
    res.status(403).json({ error: 'Solo quien conectó el calendario o el dueño pueden desconectarlo' });
    return;
  }

  let revocado = false;
  try {
    revocado = await revocarToken(descifrarToken(conexion.refresh_token_cifrado));
  } catch {
    revocado = false;
  }
  await olvidarAccessToken(conexion.id);
  await repo().delete({ id: conexion.id });
  await AppDataSource.getRepository(Cita).update(
    { usuario_id: req.userId! },
    { google_sync_estado: null, google_sync_error: null }
  );
  res.json({ ok: true, revocado });
}));

export default router;
