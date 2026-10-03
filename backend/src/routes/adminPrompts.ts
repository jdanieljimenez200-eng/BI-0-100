import { Router, Response } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { authenticate } from '../middleware/auth';
import { requirePermiso, exigirTotpFresco, type AdminRequest } from '../middleware/requireAdmin';
import { exigirUuid } from '../middleware/validate';
import { PromptIA } from '../models/PromptIA';
import { Usuario } from '../models/Usuario';
import { registrarAccionAdmin } from '../services/admin/auditoria';
import { ah } from '../utils/asyncHandler';
import { hayClaveAnthropic } from '../config/anthropic';
import { catalogoClaves, esClaveValida, infoClave, textoPorDefecto } from '../services/ia/prompts';
import { invalidarCachePrompts } from '../services/ia/registroPrompts';
import {
  SECCIONES_NATIVAS,
  SeccionesExtraSchema,
  errorSeccionesOcultas,
} from '../services/ia/seccionesCatalogo';
import { casosDeModulo, probarVersion, ErrorPrueba } from '../services/ia/probarPrompt';
import { plantillaFichaNueva } from '../services/legal/fichasPais';

/**
 * /api/admin/prompts — prompts de IA versionados.
 *
 * Flujo: crear borrador → editar → probar con un caso → publicar (con código
 * fresco de la app) → revertir si hace falta. Lo publicado es inmutable (trigger
 * en la base) y un análisis en curso termina con la versión con la que empezó
 * (ancla en el worker), así que publicar no interfiere con nadie.
 *
 * Solo edita la parte de criterio: el formato de salida y las reglas de
 * seguridad viven en el código y se añaden siempre después.
 */
const router = Router();
router.use(authenticate, requirePermiso('gestionarPrompts'));
exigirUuid(router, 'id');

const repo = () => AppDataSource.getRepository(PromptIA);

const CONTENIDO_MIN = 200;
const CONTENIDO_MAX = 60_000;
/** Marcadores de la plantilla de ficha nueva: una ficha con huecos no se publica. */
const MARCADORES_PENDIENTES = /\[(completar|fecha|profesional o fuente)\]/i;

function resumenVersion(v: PromptIA) {
  return {
    id: v.id,
    version: v.version,
    estado: v.estado,
    notas: v.notas,
    fecha_creacion: v.fecha_creacion,
    fecha_actualizacion: v.fecha_actualizacion,
    fecha_publicacion: v.fecha_publicacion,
  };
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

router.get(
  '/',
  ah(async (_req: AdminRequest, res: Response) => {
    const filas = await repo().find({
      where: { estado: In(['publicado', 'borrador']) },
      select: ['id', 'clave', 'version', 'estado', 'notas', 'fecha_creacion', 'fecha_actualizacion', 'fecha_publicacion'],
    });
    const porClave = new Map<string, { publicada?: PromptIA; borrador?: PromptIA }>();
    for (const f of filas) {
      const e = porClave.get(f.clave) ?? {};
      if (f.estado === 'publicado') e.publicada = f;
      else e.borrador = f;
      porClave.set(f.clave, e);
    }
    res.json({
      claves: catalogoClaves().map((c) => {
        const e = porClave.get(c.clave) ?? {};
        return {
          ...c,
          en_uso: e.publicada ? 'publicada' : textoPorDefecto(c.clave) !== null ? 'repositorio' : 'sin_texto',
          publicada: e.publicada ? resumenVersion(e.publicada) : null,
          borrador: e.borrador ? resumenVersion(e.borrador) : null,
        };
      }),
      hay_clave_anthropic: hayClaveAnthropic(),
    });
  })
);

router.get(
  '/claves/:clave',
  ah(async (req: AdminRequest, res: Response) => {
    const info = infoClave(req.params.clave);
    if (!info) return res.status(404).json({ error: 'Clave de prompt desconocida' });

    const versiones = await repo().find({ where: { clave: info.clave }, order: { version: 'DESC' } });
    const autores = [...new Set(versiones.flatMap((v) => [v.creado_por_id, v.publicado_por_id]).filter(Boolean))] as string[];
    const emails = autores.length
      ? await AppDataSource.getRepository(Usuario).find({ where: { id: In(autores) }, select: ['id', 'email'] })
      : [];
    const email = new Map(emails.map((u) => [u.id, u.email]));

    res.json({
      ...info,
      repositorio: textoPorDefecto(info.clave),
      versiones: versiones.map((v) => ({
        ...resumenVersion(v),
        contenido: v.contenido,
        secciones_extra: v.secciones_extra,
        secciones_ocultas: v.secciones_ocultas,
        creado_por: v.creado_por_id ? email.get(v.creado_por_id) ?? null : null,
        publicado_por: v.publicado_por_id ? email.get(v.publicado_por_id) ?? null : null,
      })),
      secciones_nativas: info.tipo === 'modo' ? SECCIONES_NATIVAS[info.modulo] : [],
      casos: casosDeModulo(info.modulo),
    });
  })
);

// ─── Borradores ──────────────────────────────────────────────────────────────

const CrearBorradorSchema = z.object({ desde: z.string().uuid().optional() }).strict();

router.post(
  '/claves/:clave/borradores',
  ah(async (req: AdminRequest, res: Response) => {
    const clave = req.params.clave;
    if (!esClaveValida(clave)) return res.status(404).json({ error: 'Clave de prompt desconocida' });
    const parsed = CrearBorradorSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });

    const resultado = await AppDataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`prompts:${clave}`]);
      const r = manager.getRepository(PromptIA);

      const existente = await r.findOne({ where: { clave, estado: 'borrador' } });
      if (existente) return { status: 409, cuerpo: { error: 'Ya hay un borrador de este prompt', id: existente.id } };

      let base: Pick<PromptIA, 'contenido' | 'secciones_extra' | 'secciones_ocultas'> | null = null;
      if (parsed.data.desde) {
        base = await r.findOne({ where: { id: parsed.data.desde, clave } });
        if (!base) return { status: 404, cuerpo: { error: 'Versión de origen no encontrada' } };
      } else {
        base = await r.findOne({ where: { clave, estado: 'publicado' } });
      }
      const iso = /^legal\.pais\.([A-Z]{2})$/.exec(clave)?.[1];
      const contenido = base?.contenido ?? textoPorDefecto(clave) ?? (iso ? plantillaFichaNueva(iso) : '');

      const { max } = (await r
        .createQueryBuilder('p')
        .select('MAX(p.version)', 'max')
        .where('p.clave = :clave', { clave })
        .getRawOne()) as { max: number | null };

      const borrador = await r.save(
        r.create({
          clave,
          version: (Number(max) || 0) + 1,
          estado: 'borrador',
          contenido,
          secciones_extra: base?.secciones_extra ?? [],
          secciones_ocultas: base?.secciones_ocultas ?? [],
          creado_por_id: req.userId as string,
        })
      );
      await registrarAccionAdmin(manager, req, {
        accion: 'prompt.borrador_creado',
        recursoTipo: 'prompt_ia',
        recursoId: borrador.id,
        despues: { clave, version: borrador.version, desde: parsed.data.desde ?? (base ? 'publicada' : 'repositorio') },
      });
      return { status: 201, cuerpo: { id: borrador.id, version: borrador.version } };
    });
    res.status(resultado.status).json(resultado.cuerpo);
  })
);

const EditarBorradorSchema = z
  .object({
    contenido: z.string().min(CONTENIDO_MIN, `El prompt debe tener al menos ${CONTENIDO_MIN} caracteres`).max(CONTENIDO_MAX).optional(),
    secciones_extra: SeccionesExtraSchema.optional(),
    secciones_ocultas: z.array(z.string().max(80)).max(20).optional(),
    notas: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

router.patch(
  '/versiones/:id',
  ah(async (req: AdminRequest, res: Response) => {
    const parsed = EditarBorradorSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });

    const version = await repo().findOneBy({ id: req.params.id });
    if (!version) return res.status(404).json({ error: 'Versión no encontrada' });
    if (version.estado !== 'borrador') {
      return res.status(409).json({ error: 'Solo se edita un borrador: crea uno nuevo a partir de esta versión' });
    }
    const info = infoClave(version.clave);
    if (!info) return res.status(404).json({ error: 'Clave de prompt desconocida' });

    const d = parsed.data;
    if (info.tipo !== 'modo' && ((d.secciones_extra?.length ?? 0) > 0 || (d.secciones_ocultas?.length ?? 0) > 0)) {
      return res.status(400).json({ error: 'Las secciones se configuran en el modo del módulo, no en una ficha de país' });
    }
    if (d.secciones_ocultas) {
      const error = errorSeccionesOcultas(info.modulo, d.secciones_ocultas);
      if (error) return res.status(400).json({ error });
    }

    await repo().update(version.id, {
      ...(d.contenido !== undefined ? { contenido: d.contenido } : {}),
      ...(d.secciones_extra !== undefined ? { secciones_extra: d.secciones_extra } : {}),
      ...(d.secciones_ocultas !== undefined ? { secciones_ocultas: [...new Set(d.secciones_ocultas)] } : {}),
      ...(d.notas !== undefined ? { notas: d.notas } : {}),
    });
    res.json({ ok: true });
  })
);

router.delete(
  '/versiones/:id',
  ah(async (req: AdminRequest, res: Response) => {
    const resultado = await AppDataSource.transaction(async (manager) => {
      const r = manager.getRepository(PromptIA);
      const version = await r.findOneBy({ id: req.params.id });
      if (!version) return { status: 404, cuerpo: { error: 'Versión no encontrada' } };
      if (version.estado !== 'borrador') {
        return { status: 409, cuerpo: { error: 'Una versión publicada o archivada no se borra: es el historial' } };
      }
      await r.delete(version.id);
      await registrarAccionAdmin(manager, req, {
        accion: 'prompt.borrador_eliminado',
        recursoTipo: 'prompt_ia',
        recursoId: version.id,
        antes: { clave: version.clave, version: version.version },
      });
      return { status: 200, cuerpo: { ok: true } };
    });
    res.status(resultado.status).json(resultado.cuerpo);
  })
);

// ─── Probar ──────────────────────────────────────────────────────────────────

router.post(
  '/versiones/:id/probar',
  ah(async (req: AdminRequest, res: Response) => {
    const parsed = z.object({ caso: z.string().max(40) }).strict().safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Elige un caso de prueba' });

    const version = await repo().findOneBy({ id: req.params.id });
    if (!version) return res.status(404).json({ error: 'Versión no encontrada' });

    const inicio = Date.now();
    try {
      // El módulo «admin_prueba» separa este gasto del de los clientes en el panel de costos.
      const { caso, resultado } = await probarVersion(version, parsed.data.caso, req.userId as string);
      res.json({ caso, duracion_ms: Date.now() - inicio, sin_clave_ia: !hayClaveAnthropic(), resultado });
    } catch (err) {
      if (err instanceof ErrorPrueba) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  })
);

// ─── Publicar, restaurar y volver al repositorio ─────────────────────────────

const NotasSchema = z.object({
  notas: z.string().trim().min(5, 'Describe en una frase qué cambia y por qué').max(500),
});

/**
 * Publica un borrador, o vuelve a publicar una versión archivada (revertir).
 * Pide un código fresco: cambia lo que la IA dice a todos los clientes.
 */
router.post(
  '/versiones/:id/publicar',
  ah(async (req: AdminRequest, res: Response) => {
    const parsed = NotasSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });

    const previa = await repo().findOneBy({ id: req.params.id });
    if (!previa) return res.status(404).json({ error: 'Versión no encontrada' });
    if (previa.estado === 'publicado') return res.status(409).json({ error: 'Esta versión ya está publicada' });
    if (MARCADORES_PENDIENTES.test(previa.contenido)) {
      return res.status(400).json({ error: 'El texto aún tiene campos por completar ([completar], [fecha]…)' });
    }
    if (previa.contenido.trim().length < CONTENIDO_MIN) {
      return res.status(400).json({ error: `El prompt debe tener al menos ${CONTENIDO_MIN} caracteres` });
    }
    if (!(await exigirTotpFresco(req, res))) return;

    const resultado = await AppDataSource.transaction(async (manager) => {
      const r = manager.getRepository(PromptIA);
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`prompts:${previa.clave}`]);
      const version = await r.findOneBy({ id: previa.id });
      if (!version || version.estado === 'publicado') {
        return { status: 409, cuerpo: { error: 'La versión cambió mientras tanto: recarga' } };
      }
      const actual = await r.findOne({ where: { clave: version.clave, estado: 'publicado' } });
      if (actual) await r.update(actual.id, { estado: 'archivado' });

      const eraBorrador = version.estado === 'borrador';
      await r.update(version.id, {
        estado: 'publicado',
        publicado_por_id: req.userId as string,
        fecha_publicacion: new Date(),
        // Al revertir se conservan las notas originales; el motivo va a la auditoría.
        ...(eraBorrador ? { notas: parsed.data.notas } : {}),
      });
      await registrarAccionAdmin(manager, req, {
        accion: eraBorrador ? 'prompt.publicado' : 'prompt.restaurado',
        recursoTipo: 'prompt_ia',
        recursoId: version.id,
        antes: { clave: version.clave, publicada: actual ? { id: actual.id, version: actual.version } : 'repositorio' },
        despues: { clave: version.clave, publicada: { id: version.id, version: version.version } },
        motivo: parsed.data.notas,
      });
      return { status: 200, cuerpo: { ok: true, clave: version.clave, version: version.version } };
    });

    if (resultado.status === 200) invalidarCachePrompts(previa.clave);
    res.status(resultado.status).json(resultado.cuerpo);
  })
);

/** Deja de usar versiones de la base para esta clave: vuelve el texto del repositorio. */
router.post(
  '/claves/:clave/usar-repositorio',
  ah(async (req: AdminRequest, res: Response) => {
    const clave = req.params.clave;
    if (!esClaveValida(clave)) return res.status(404).json({ error: 'Clave de prompt desconocida' });
    if (textoPorDefecto(clave) === null) {
      return res.status(409).json({ error: 'Esta clave no tiene texto en el repositorio: publica otra versión en su lugar' });
    }
    const parsed = NotasSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    if (!(await exigirTotpFresco(req, res))) return;

    const resultado = await AppDataSource.transaction(async (manager) => {
      const r = manager.getRepository(PromptIA);
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`prompts:${clave}`]);
      const actual = await r.findOne({ where: { clave, estado: 'publicado' } });
      if (!actual) return { status: 409, cuerpo: { error: 'Ya se está usando el texto del repositorio' } };
      await r.update(actual.id, { estado: 'archivado' });
      await registrarAccionAdmin(manager, req, {
        accion: 'prompt.repositorio_restablecido',
        recursoTipo: 'prompt_ia',
        recursoId: actual.id,
        antes: { clave, publicada: { id: actual.id, version: actual.version } },
        despues: { clave, publicada: 'repositorio' },
        motivo: parsed.data.notas,
      });
      return { status: 200, cuerpo: { ok: true } };
    });

    if (resultado.status === 200) invalidarCachePrompts(clave);
    res.status(resultado.status).json(resultado.cuerpo);
  })
);

export default router;
