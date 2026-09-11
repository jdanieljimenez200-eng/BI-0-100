import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireProPlus } from '../middleware/requirePlan';
import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { TemaUsuario, UIConfig, UI_CONFIG_DEFAULT } from '../models/TemaUsuario';
import { upload } from '../middleware/upload';
import { StorageService } from '../services/StorageService';
import { WALLPAPER_PRESETS, PALETA_PRESETS } from '../config/temaPresets';
import { ah } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

// Carga la cuenta (owner) y exige que el solicitante sea el DUEÑO. Devuelve el
// id de la cuenta o null; escribe la respuesta de error y devuelve null si no
// procede. Centraliza el gate compartido por PUT/POST de escritura del tema.
async function requireOwnerYCuenta(req: AuthRequest, res: Response): Promise<string | null> {
  const usuario = await AppDataSource.getRepository(Usuario).findOne({
    select: ['id', 'account_role'],
    where: { id: req.userId! },
  });
  if (!usuario) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return null;
  }
  if (usuario.account_role !== 'owner') {
    res.status(403).json({ error: 'Solo el dueño de la cuenta puede cambiar el tema del sistema' });
    return null;
  }
  return usuario.id;
}

// Upsert helper: devuelve el TemaUsuario de la cuenta, creándolo si no existe.
async function obtenerOCrearTema(usuarioId: string): Promise<TemaUsuario> {
  const repo = AppDataSource.getRepository(TemaUsuario);
  let tema = await repo.findOne({ where: { usuario_id: usuarioId } });
  if (!tema) {
    tema = repo.create({ usuario_id: usuarioId, ui_config: { ...UI_CONFIG_DEFAULT } });
    await repo.save(tema);
  }
  return tema;
}

// Resuelve la CUENTA (owner) dueña del tema: si es trabajador, apunta a su
// owner_id; si es dueño, a su propio id. El tema es único por cuenta.
async function resolveCuentaId(userId: string): Promise<string | null> {
  const repo = AppDataSource.getRepository(Usuario);
  const usuario = await repo.findOne({
    select: ['id', 'account_role', 'owner_id'],
    where: { id: userId },
  });
  if (!usuario) return null;
  if (usuario.account_role === 'trabajador' && usuario.owner_id) {
    return usuario.owner_id;
  }
  return usuario.id;
}

// Devuelve un tema por defecto (no persistido) cuando la cuenta aún no lo creó,
// para que el frontend siempre reciba un shape completo.
function temaPorDefecto(usuarioId: string): Partial<TemaUsuario> {
  return {
    usuario_id: usuarioId,
    wallpaper_url: null,
    wallpaper_preset: null,
    wallpaper_overlay: 50,
    tema_preset: 'midnight',
    color_acento: null,
    color_fondo: null,
    logo_url: null,
    nombre_sistema: null,
    ui_config: { ...UI_CONFIG_DEFAULT },
  };
}

// ─── GET /api/config/tema ─────────────────────────────────────────────────────
// El tema es de LECTURA para cualquier miembro de la cuenta (owner o trabajador),
// porque afecta a toda la UI que ambos ven. Por eso NO va tras requireProPlus:
// un trabajador de una cuenta Pro Plus debe poder cargar el tema del dueño.
router.get('/tema', ah(async (req: AuthRequest, res: Response) => {
  const cuentaId = await resolveCuentaId(req.userId!);
  if (!cuentaId) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }

  const tema = await AppDataSource.getRepository(TemaUsuario).findOne({
    where: { usuario_id: cuentaId },
  });

  res.json({ tema: tema ?? temaPorDefecto(cuentaId) });
}));

// Normaliza y valida el ui_config entrante contra los valores permitidos,
// cayendo al default en cada campo inválido para no romper la UI.
function sanitizeUIConfig(input: unknown): UIConfig {
  const base = { ...UI_CONFIG_DEFAULT };
  if (!input || typeof input !== 'object') return base;
  const raw = input as Record<string, unknown>;

  if (raw.radio_botones === 'cuadrado' || raw.radio_botones === 'redondeado' || raw.radio_botones === 'pill') {
    base.radio_botones = raw.radio_botones;
  }
  if (raw.densidad === 'compacta' || raw.densidad === 'normal' || raw.densidad === 'espaciosa') {
    base.densidad = raw.densidad;
  }
  if (raw.fuente === 'inter' || raw.fuente === 'mono' || raw.fuente === 'rounded') {
    base.fuente = raw.fuente;
  }
  if (typeof raw.animaciones === 'boolean') base.animaciones = raw.animaciones;
  if (typeof raw.sidebar_collapsed === 'boolean') base.sidebar_collapsed = raw.sidebar_collapsed;
  if (Array.isArray(raw.widgets_activos)) {
    base.widgets_activos = raw.widgets_activos.filter((w): w is string => typeof w === 'string').slice(0, 30);
  }
  return base;
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// ─── PUT /api/config/tema ─────────────────────────────────────────────────────
// Solo el DUEÑO de una cuenta Pro Plus+ puede modificar el tema (afecta a todos
// los miembros). Upsert idempotente: crea el registro si no existe, o lo actualiza.
router.put('/tema', requireProPlus(), ah(async (req: AuthRequest, res: Response) => {
  const usuario = await AppDataSource.getRepository(Usuario).findOne({
    select: ['id', 'account_role'],
    where: { id: req.userId! },
  });
  if (!usuario) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }
  if (usuario.account_role !== 'owner') {
    res.status(403).json({ error: 'Solo el dueño de la cuenta puede cambiar el tema del sistema' });
    return;
  }

  const body = req.body ?? {};

  // Validaciones de formato antes de tocar la DB.
  if (body.color_acento != null && !HEX_RE.test(String(body.color_acento))) {
    res.status(400).json({ error: 'color_acento debe ser un HEX válido (#RGB, #RRGGBB o #RRGGBBAA)' });
    return;
  }
  const overlay = body.wallpaper_overlay;
  if (overlay != null && (typeof overlay !== 'number' || overlay < 30 || overlay > 80)) {
    res.status(400).json({ error: 'wallpaper_overlay debe ser un número entre 30 y 80' });
    return;
  }
  if (body.nombre_sistema != null && String(body.nombre_sistema).length > 60) {
    res.status(400).json({ error: 'nombre_sistema no puede superar 60 caracteres' });
    return;
  }

  const repo = AppDataSource.getRepository(TemaUsuario);
  let tema = await repo.findOne({ where: { usuario_id: usuario.id } });
  if (!tema) {
    tema = repo.create({ usuario_id: usuario.id, ui_config: { ...UI_CONFIG_DEFAULT } });
  }

  // Solo se sobrescriben los campos presentes en el body (patch parcial).
  if ('wallpaper_url' in body) tema.wallpaper_url = body.wallpaper_url || null;
  if ('wallpaper_preset' in body) tema.wallpaper_preset = body.wallpaper_preset || null;
  if (overlay != null) tema.wallpaper_overlay = overlay;
  if ('tema_preset' in body) tema.tema_preset = body.tema_preset || null;
  if ('color_acento' in body) tema.color_acento = body.color_acento || null;
  if ('color_fondo' in body) tema.color_fondo = body.color_fondo || null;
  if ('logo_url' in body) tema.logo_url = body.logo_url || null;
  if ('nombre_sistema' in body) tema.nombre_sistema = body.nombre_sistema?.trim() || null;
  if ('ui_config' in body) tema.ui_config = sanitizeUIConfig(body.ui_config);

  await repo.save(tema);
  res.json({ ok: true, tema });
}));

// ─── GET /api/config/presets ──────────────────────────────────────────────────
// Catálogo estático de wallpapers y paletas. Lectura libre para cualquier
// miembro autenticado (el selector se muestra aunque el guardado esté gated).
router.get('/presets', (_req: AuthRequest, res: Response) => {
  res.json({ wallpapers: WALLPAPER_PRESETS, paletas: PALETA_PRESETS });
});

// ─── POST /api/config/tema/wallpaper ──────────────────────────────────────────
// Sube una imagen de wallpaper propia (Pro Plus+, solo owner) y la fija como
// wallpaper_url, limpiando cualquier preset previo. Campo FormData: 'imagen'.
router.post('/tema/wallpaper', requireProPlus(), upload.single('imagen'), async (req: AuthRequest, res: Response) => {
  try {
    const cuentaId = await requireOwnerYCuenta(req, res);
    if (!cuentaId) return;
    if (!req.file) {
      res.status(400).json({ error: 'No se recibió ninguna imagen (campo "imagen")' });
      return;
    }
    const url = await StorageService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    const tema = await obtenerOCrearTema(cuentaId);
    const anterior = tema.wallpaper_url; // para limpiar el huérfano tras guardar
    tema.wallpaper_url = url;
    tema.wallpaper_preset = null; // la imagen propia tiene prioridad sobre el preset
    await AppDataSource.getRepository(TemaUsuario).save(tema);
    // Borrado best-effort del anterior: no bloquea ni condiciona la respuesta.
    StorageService.deleteFile(anterior).catch(() => {});
    res.json({ ok: true, wallpaper_url: url, tema });
  } catch (err) {
    logger.error('[config/tema/wallpaper]', err);
    res.status(500).json({ error: 'No se pudo subir el wallpaper' });
  }
});

// ─── POST /api/config/tema/logo ───────────────────────────────────────────────
// Sube el logo de marca del sistema (Pro Plus+, solo owner). Campo FormData: 'imagen'.
router.post('/tema/logo', requireProPlus(), upload.single('imagen'), async (req: AuthRequest, res: Response) => {
  try {
    const cuentaId = await requireOwnerYCuenta(req, res);
    if (!cuentaId) return;
    if (!req.file) {
      res.status(400).json({ error: 'No se recibió ninguna imagen (campo "imagen")' });
      return;
    }
    const url = await StorageService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    const tema = await obtenerOCrearTema(cuentaId);
    const anterior = tema.logo_url; // para limpiar el huérfano tras guardar
    tema.logo_url = url;
    await AppDataSource.getRepository(TemaUsuario).save(tema);
    StorageService.deleteFile(anterior).catch(() => {});
    res.json({ ok: true, logo_url: url, tema });
  } catch (err) {
    logger.error('[config/tema/logo]', err);
    res.status(500).json({ error: 'No se pudo subir el logo' });
  }
});

export default router;