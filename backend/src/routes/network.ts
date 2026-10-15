import { Router, Response, NextFunction } from 'express';
import { EntityManager, IsNull } from 'typeorm';
import { exigirUuid } from '../middleware/validate';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { Experto, CATEGORIAS_EXPERTO } from '../models/Experto';
import { ResenaExperto } from '../models/ResenaExperto';
import { Usuario } from '../models/Usuario';
import { Negocio } from '../models/Negocio';
import { Producto } from '../models/Producto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermiso } from '../middleware/requireAdmin';
import { ah } from '../utils/asyncHandler';
import { filasSql } from '../utils/filasSql';
import { urlApp } from '../utils/urlApp';
import * as expertosService from '../services/network/expertosService';
import * as resenasService from '../services/network/resenasService';
import * as patrociniosService from '../services/network/patrociniosService';
import * as documentos from '../services/network/documentosService';
import * as impulsos from '../services/network/impulsosService';
import * as metricas from '../services/network/metricasService';
import {
  recibirDocumentoExperto,
  recibirAvatarExperto,
  recibirPortadaExperto,
  recibirImagenGaleria,
} from '../middleware/upload';
import { StorageService } from '../services/StorageService';
import { notificarRevisionFicha } from '../services/email/emailService';
import { registrarAccionAdmin, MotivoSchema } from '../services/admin/auditoria';
import {
  isStripeAvailable,
  getOrCreateCustomer,
  getPriceIdPatrocinio,
  createSponsorshipCheckoutSession,
  describirPrecio,
  textoCargoRecurrente,
  createImpulsoCheckoutSession,
} from '../services/billing/stripeService';
import { aceptoExpresamente, origenDePeticion, registrarAutorizacionCargo } from '../services/cumplimiento/aceptaciones';

/**
 * Red de expertos: directorio de profesionales que los usuarios consultan desde
 * los resultados de sus análisis.
 *
 * Tres accesos distintos conviven en este fichero y conviene no confundirlos:
 *
 *  - **Público** (sin token): el directorio y la ficha. Solo ven `aprobado`, y
 *    solo las columnas de `COLUMNAS_PUBLICAS` del servicio.
 *  - **Dueño** (autenticado): da de alta y edita SU ficha. No puede tocar
 *    `estado`, `verificado` ni el rating.
 *  - **Admin**: la cola de revisión. Es el único que ve la cédula y el único
 *    que concede la insignia de verificado.
 */

const router = Router();
exigirUuid(router, 'id', 'imagenId', 'servicioId');

// ─────────────────────────────────────────────────────────────────────────────
// Validación
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIAS = CATEGORIAS_EXPERTO;

/**
 * URL de verdad, y solo http/https.
 *
 * `z.string().url()` acepta cualquier esquema, `javascript:alert(1)` incluido.
 * Estas URLs acaban en el `href` de un enlace de la ficha, así que dejar pasar
 * ese esquema convierte el perfil en un XSS con un clic.
 */
const urlSegura = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => {
      try {
        return ['http:', 'https:'].includes(new URL(v).protocol);
      } catch {
        return false;
      }
    }, 'La URL debe empezar por http:// o https://');

const texto = (max: number) => z.string().trim().max(max);

/** Campos que el propio experto rellena. Ni estado, ni verificado, ni rating. */
const CamposEditablesSchema = z.object({
  nombre_comercial: texto(160).min(2, 'El nombre comercial es obligatorio'),
  nombre_display: texto(160).min(2, 'El nombre visible es obligatorio'),
  bio_corta: texto(280).default(''),
  bio_larga: texto(4000).nullable().optional(),
  categoria: z.enum(CATEGORIAS),
  especialidad: texto(120).default(''),
  sub_especialidades: z.array(texto(60).min(1)).max(10).default([]),
  ciudad: texto(120).default(''),
  pais: z.string().trim().length(2).toUpperCase().nullable().optional(),
  direccion: texto(255).nullable().optional(),
  google_maps_url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => {
      if (!v) return true;
      try {
        return ['http:', 'https:'].includes(new URL(v).protocol);
      } catch {
        return false;
      }
    }, 'El enlace de Google Maps debe empezar por http:// o https://')
    .nullable()
    .optional(),
  latitud: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitud: z.coerce.number().min(-180).max(180).nullable().optional(),
  email_contacto: z.string().trim().email().max(180).nullable().optional(),
  telefono: texto(40).nullable().optional(),
  // Solo dígitos, con lada de país: es lo que wa.me necesita para abrir el chat.
  whatsapp: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s()+-]/g, ''))
    .refine((v) => /^\d{10,15}$/.test(v), 'El WhatsApp debe tener entre 10 y 15 dígitos, con lada de país')
    .nullable()
    .optional(),
  mostrar_contacto: z.boolean().default(false),
  sitio_web: urlSegura(300).nullable().optional(),
  avatar_url: urlSegura(500).nullable().optional(),
  tarifa_desde: z.number().nonnegative().max(9_999_999).nullable().optional(),
  moneda: texto(10).default('MXN'),
  ofrece_consulta_gratis: z.boolean().default(false),
  video_url: urlSegura(500).nullable().optional(),
  // `documento_url` NO está aquí a propósito. Guarda la clave interna del
  // documento privado y solo la escribe el endpoint de subida: si se pudiera
  // mandar en el cuerpo, cualquiera apuntaría su ficha al documento de otro.
});

/** En la edición todo es opcional: se aplica solo lo que venga. */
const EdicionSchema = CamposEditablesSchema.partial();

const DirectorioQuerySchema = z.object({
  categoria: z.enum(CATEGORIAS).optional(),
  ciudad: texto(120).optional(),
  q: texto(120).optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
  pagina: z.coerce.number().int().min(1).default(1),
});

const UUID = z.string().uuid();

const ResenaSchema = z.object({
  puntuacion: z.number().int().min(1, 'La puntuación va de 1 a 5').max(5, 'La puntuación va de 1 a 5'),
  comentario: texto(2000).nullable().optional(),
});

/**
 * Reconoce al usuario si trae un token válido, y sigue adelante si no.
 *
 * Sirve para UNA cosa: que la ficha pública sepa marcar `es_mia` en la reseña
 * propia y no ofrezca un botón de "valorar" que va a responder 409. No autoriza
 * nada y no comprueba la denylist de Redis, así que **jamás** debe usarse para
 * decidir si alguien puede leer o escribir algo. Para eso está `authenticate`.
 */
function sesionOpcional(req: AuthRequest, _res: Response, next: NextFunction): void {
  const token = req.cookies?.access_token ?? req.headers.authorization?.split(' ')[1];
  const secret = process.env.JWT_SECRET;
  if (token && secret) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as { userId?: string };
      if (payload.userId) req.userId = payload.userId;
    } catch {
      // Token ausente, caducado o inválido: se sigue como visitante anónimo.
    }
  }
  next();
}

/**
 * Cambios que obligan a revisar la ficha otra vez.
 *
 * Sin esto queda un agujero evidente: alguien se da de alta como "Juan,
 * consultor", le aprueban y le verifican, y luego se renombra a "Despacho Legal
 * Verificado S.A." conservando la insignia. La insignia dejaría de significar
 * nada. Cambiar la bio o la tarifa no exige revisión; cambiar quién dices ser,
 * sí.
 */
const CAMPOS_QUE_EXIGEN_REVISION = [
  'nombre_comercial',
  'nombre_display',
  'categoria',
  'especialidad',
] as const;

/**
 * La ficha tal como se devuelve a su dueño o a un admin: sin la clave interna
 * del documento, con un booleano en su lugar.
 *
 * La clave por sí sola no abre nada —el documento solo se sirve por el endpoint
 * de admin—, pero no hay razón para sacar al cliente un detalle del almacén que
 * no necesita. Lo que la interfaz necesita saber es si hay documento o no.
 */
function sinClaveDocumento(experto: Experto) {
  const { documento_url, ...resto } = experto;
  return { ...resto, tiene_documento: Boolean(documento_url) };
}

/**
 * Devuelve una ficha a la cola de revisión y le retira la insignia.
 *
 * Se usa cuando cambia algo que un revisor había dado por bueno: quién dice ser
 * el experto, o el documento con el que lo demostró.
 */
function devolverARevision(experto: Experto): void {
  experto.estado = 'pendiente';
  experto.verificado = false;
  experto.fecha_aprobacion = null;
  experto.motivo_rechazo = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Público
// ─────────────────────────────────────────────────────────────────────────────

/** Directorio. Solo expertos aprobados; los patrocinados van marcados. */
router.get(
  '/expertos',
  ah(async (req: AuthRequest, res: Response) => {
    const parsed = DirectorioQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Filtros inválidos' });
    }
    const { categoria, ciudad, q, limite, pagina } = parsed.data;

    const [{ expertos, total }, promocionados] = await Promise.all([
      expertosService.listarDirectorio({
        categoria,
        ciudad,
        q,
        limit: limite,
        offset: (pagina - 1) * limite,
      }),
      // Los impulsos se muestran en la primera página, aparte y etiquetados:
      // mezclarlos en `expertos` movería la paginación orgánica.
      pagina === 1
        ? expertosService.listarPromocionados({ categoria, ciudad, q, limite: impulsos.HUECOS_PROMOCIONADOS })
        : Promise.resolve([]),
    ]);

    res.json({ expertos, promocionados, total, pagina, limite });

    metricas.registrarImpresiones(
      [...promocionados, ...expertos].map((e) => e.id),
      promocionados.map((e) => e.id)
    );
  })
);

/** Ficha pública, con sus reseñas publicadas. 404 si no está aprobada. */
router.get(
  '/expertos/:id',
  sesionOpcional,
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }

    const ficha = await expertosService.obtenerFichaPublica(req.params.id);
    if (!ficha) return res.status(404).json({ error: 'Experto no encontrado' });

    const [resenas, reparto] = await Promise.all([
      resenasService.listarPublicadas(ficha.id, req.userId),
      resenasService.distribucion(ficha.id),
    ]);

    const { usuario_id: dueno, ...publica } = ficha;
    res.json({ experto: { ...publica, es_mia: Boolean(req.userId && req.userId === dueno) }, resenas, distribucion: reparto });

    // El experto revisando su propio perfil no cuenta como visita.
    if (!req.userId || req.userId !== dueno) {
      metricas.registrarVista(ficha.id, metricas.huellaVisitante(req.ip, req.get('user-agent')));
    }
  })
);

/**
 * Clic en un botón de contacto. Público: lo pulsa quien busca un experto, tenga
 * cuenta o no. Solo cuenta; el enlace ya lo tiene la ficha. Responde 204 aunque
 * falle el registro, para no retrasar la apertura de WhatsApp.
 */
router.post(
  '/expertos/:id/contacto',
  sesionOpcional,
  ah(async (req: AuthRequest, res: Response) => {
    const parsed = z
      .object({ canal: z.enum(['whatsapp', 'telefono', 'email', 'web']) })
      .safeParse(req.body);
    if (!UUID.safeParse(req.params.id).success || !parsed.success) {
      return res.status(400).json({ error: 'Canal o identificador inválido' });
    }
    const [experto] = await AppDataSource.query(
      `SELECT id, usuario_id FROM expertos WHERE id = $1 AND estado = 'aprobado' AND eliminado_en IS NULL`,
      [req.params.id]
    );
    if (!experto) return res.status(404).json({ error: 'Experto no encontrado' });

    if (!req.userId || req.userId !== experto.usuario_id) {
      await metricas
        .registrarClic(experto.id, parsed.data.canal, metricas.huellaVisitante(req.ip, req.get('user-agent')))
        .catch(() => undefined);
    }
    res.status(204).end();
  })
);

/**
 * Tarifas y límites de los impulsos. Público para poder enseñarlos en la página
 * de «anúnciate» antes de que el experto tenga cuenta.
 */
router.get('/impulsos/tarifas', (_req, res: Response) => {
  res.json({
    moneda: 'MXN',
    iva_incluido: true,
    tarifa_dia: impulsos.TARIFA_DIA_MXN,
    dias_min: impulsos.DIAS_MIN,
    dias_max: impulsos.DIAS_MAX,
    cupo: impulsos.CUPO,
  });
});

/** Reseñas publicadas de un experto aprobado. */
router.get(
  '/expertos/:id/resenas',
  sesionOpcional,
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    // Se pasa por la ficha para no listar las reseñas de un experto que no
    // está aprobado: sería una puerta lateral a fichas que no son públicas.
    const ficha = await expertosService.obtenerFichaPublica(req.params.id);
    if (!ficha) return res.status(404).json({ error: 'Experto no encontrado' });

    const [resenas, reparto] = await Promise.all([
      resenasService.listarPublicadas(ficha.id, req.userId),
      resenasService.distribucion(ficha.id),
    ]);
    res.json({ resenas, distribucion: reparto, total: ficha.total_resenas, rating: ficha.rating });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Dueño (autenticado)
// ─────────────────────────────────────────────────────────────────────────────

router.use(authenticate);

/**
 * Calcula el cupo de perfiles Net0 del usuario según la regla inteligente:
 * - Base para cuentas independientes (búsqueda o servicio): 2 perfiles.
 * - Cuentas con negocios validados/analizados con IA: 1 perfil por cada negocio activo (mínimo 2).
 */
export async function obtenerCupoNet0(
  usuarioId: string,
  manager: EntityManager = AppDataSource.manager
) {
  const [resNegocios, resFichas] = await Promise.all([
    manager.query(
      `
      SELECT COUNT(DISTINCT p.id)::int AS total
      FROM productos p
      WHERE p.usuario_id = $1
        AND (
          EXISTS (SELECT 1 FROM analisis_mercado WHERE producto_id = p.id AND estado_analisis = 'completado' AND resultado_estimado = false)
          OR EXISTS (SELECT 1 FROM analisis_marketing WHERE producto_id = p.id AND estado_analisis = 'completado' AND resultado_estimado = false)
          OR EXISTS (SELECT 1 FROM analisis_finanzas WHERE producto_id = p.id AND estado_analisis = 'completado' AND resultado_estimado = false)
          OR EXISTS (SELECT 1 FROM analisis_legal WHERE producto_id = p.id AND estado_analisis = 'completado' AND resultado_estimado = false)
          OR EXISTS (SELECT 1 FROM analisis_ventas WHERE producto_id = p.id AND estado_analisis = 'completado' AND resultado_estimado = false)
          OR EXISTS (SELECT 1 FROM analisis_brief WHERE producto_id = p.id AND estado_analisis = 'completado' AND resultado_estimado = false)
        )
      `,
      [usuarioId]
    ),
    manager.query(
      `
      SELECT COUNT(*)::int AS total
      FROM expertos
      WHERE usuario_id = $1
        AND eliminado_en IS NULL
      `,
      [usuarioId]
    ),
  ]);

  const totalAnalizados = Number(resNegocios?.[0]?.total ?? 0);
  const fichasActuales = Number(resFichas?.[0]?.total ?? 0);
  const limitePermitido = Math.max(2, totalAnalizados);
  const puedeCrear = fichasActuales < limitePermitido;

  return {
    fichas_actuales: fichasActuales,
    limite_permitido: limitePermitido,
    negocios_activos: totalAnalizados,
    puede_crear: puedeCrear,
  };
}

/** Consulta rápida del cupo de perfiles disponibles en Net0. */
router.get(
  '/cupo',
  ah(async (req: AuthRequest, res: Response) => {
    const cupo = await obtenerCupoNet0(req.userId!);
    res.json(cupo);
  })
);

/** Las fichas propias con su cupo disponible y lista de negocios vinculables. */
router.get(
  '/mis-fichas',
  ah(async (req: AuthRequest, res: Response) => {
    const usuarioId = req.userId!;
    const [fichas, cupo, negociosEntidades, productos] = await Promise.all([
      AppDataSource.getRepository(Experto).find({
        where: { usuario_id: usuarioId, eliminado_en: IsNull() },
        order: { fecha_creacion: 'DESC' },
      }),
      obtenerCupoNet0(usuarioId),
      AppDataSource.getRepository(Negocio).find({
        where: { usuario_id: usuarioId },
        select: ['id', 'nombre', 'emoji', 'descripcion'],
        order: { fecha_creacion: 'ASC' },
      }),
      AppDataSource.getRepository(Producto).find({
        where: { usuario_id: usuarioId },
        select: ['id', 'nombre', 'descripcion'],
        take: 20,
        order: { fecha_creacion: 'ASC' },
      }),
    ]);

    let negociosDisponibles = negociosEntidades.map((n) => ({
      id: n.id,
      nombre: n.nombre,
      emoji: n.emoji || '💼',
      descripcion: n.descripcion || '',
    }));

    if (negociosDisponibles.length === 0 && productos.length > 0) {
      negociosDisponibles = productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        emoji: '🚀',
        descripcion: p.descripcion || '',
      }));
    }

    res.json({
      fichas: fichas.map(sinClaveDocumento),
      cupo,
      negocios_disponibles: negociosDisponibles,
    });
  })
);

/**
 * Alta. Entra siempre como `pendiente` y sin verificar.
 * Valida el cupo de perfiles permitidos y unicidad por categoría.
 */
router.post(
  '/expertos',
  ah(async (req: AuthRequest, res: Response) => {
    const parsed = CamposEditablesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }

    type Resultado =
      | { tipo: 'sin-cupo'; cupo: Awaited<ReturnType<typeof obtenerCupoNet0>> }
      | { tipo: 'ya-tiene'; expertoId: string }
      | { tipo: 'ok'; experto: Experto };

    // Se responde DESPUÉS del COMMIT, nunca desde dentro de la transacción: si
    // el 201 sale antes, el cliente puede usar el id (subir la cédula, editar)
    // mientras la fila aún no es visible para otras conexiones, y recibe 404.
    let resultado: Resultado;
    try {
      resultado = await AppDataSource.transaction(async (manager): Promise<Resultado> => {
        // Cerrojo consultivo de transacción por usuario para evitar condiciones de carrera en altas simultáneas
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['net0:cupo:' + req.userId]);

        const cupo = await obtenerCupoNet0(req.userId!, manager);
        if (!cupo.puede_crear) return { tipo: 'sin-cupo', cupo };

        const repo = manager.getRepository(Experto);
        const yaTiene = await repo.findOne({
          where: { usuario_id: req.userId!, categoria: parsed.data.categoria, eliminado_en: IsNull() },
        });
        if (yaTiene) return { tipo: 'ya-tiene', expertoId: yaTiene.id };

        const experto = await repo.save(
          repo.create({
            ...parsed.data,
            usuario_id: req.userId!,
            estado: 'pendiente',
            verificado: false,
            rating_promedio: 0,
            total_resenas: 0,
          })
        );
        return { tipo: 'ok', experto };
      });
    } catch (e) {
      // El índice único es la red de seguridad ante dos altas simultáneas.
      if ((e as { code?: string }).code === '23505') {
        return res.status(409).json({ error: 'Ya tienes una ficha en esta categoría.' });
      }
      throw e;
    }

    if (resultado.tipo === 'sin-cupo') {
      const { cupo } = resultado;
      return res.status(403).json({
        error: `Has alcanzado el límite de ${cupo.limite_permitido} perfil${cupo.limite_permitido > 1 ? 'es' : ''} en Net0. ${
          cupo.negocios_activos === 0
            ? 'Las cuentas independientes tienen un cupo base de 2 perfiles. Registra y analiza tus negocios con IA en BI 0 A 100 para desbloquear 1 perfil adicional por cada negocio.'
            : 'Para crear un perfil adicional en Net0, registra y valida un nuevo negocio con análisis de IA en la plataforma.'
        }`,
        cupo,
      });
    }
    if (resultado.tipo === 'ya-tiene') {
      return res.status(409).json({
        error: 'Ya tienes una ficha en esta categoría. Edítala en vez de crear otra.',
        experto_id: resultado.expertoId,
      });
    }
    return res.status(201).json({ experto: sinClaveDocumento(resultado.experto), mensaje: 'Ficha enviada a revisión' });
  })
);

/**
 * Edición del dueño.
 *
 * Solo su propia ficha —la pertenencia se comprueba en el `where`, no después,
 * para que no haya un hueco entre leer y escribir— y solo los campos
 * declarados. Si cambia quién dice ser, vuelve a la cola de revisión y pierde
 * la insignia hasta que un admin la conceda otra vez.
 */
router.patch(
  '/expertos/:id',
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    const parsed = EdicionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }

    const repo = AppDataSource.getRepository(Experto);
    const experto = await repo.findOne({
      where: { id: req.params.id, usuario_id: req.userId! },
    });
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });

    const cambios = parsed.data as Partial<Experto>;
    const claves = Object.keys(cambios) as (keyof Experto)[];
    if (claves.length === 0) {
      return res.status(400).json({ error: 'No hay nada que cambiar' });
    }

    const cambiaIdentidad = CAMPOS_QUE_EXIGEN_REVISION.some(
      (campo) => campo in cambios && cambios[campo] !== experto[campo]
    );

    Object.assign(experto, cambios);

    // Una ficha rechazada que se corrige vuelve a la cola por sí sola: es la
    // forma de volver a presentarse sin pedirle nada al usuario.
    if (cambiaIdentidad || experto.estado === 'rechazado') {
      devolverARevision(experto);
    }

    await repo.save(experto);
    res.json({
      experto: sinClaveDocumento(experto),
      mensaje: experto.estado === 'pendiente' ? 'Cambios guardados. La ficha vuelve a revisión.' : 'Cambios guardados',
    });
  })
);

/**
 * Sube el documento de acreditación.
 *
 * Va por su propio endpoint, y no en el cuerpo de la ficha, porque el fichero no
 * se guarda donde el resto: `documentosService` lo deja en una carpeta que no se
 * publica, y en la ficha solo queda una clave interna. Cambiar el documento
 * devuelve la ficha a revisión: es la prueba sobre la que un admin decidió.
 */
router.post(
  '/expertos/:id/documento',
  recibirDocumentoExperto,
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    if (!req.file) return res.status(400).json({ error: 'No llegó ningún documento' });

    const repo = AppDataSource.getRepository(Experto);
    const experto = await repo.findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });

    const anterior = experto.documento_url;
    experto.documento_url = await documentos.guardarDocumento(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    devolverARevision(experto);
    await repo.save(experto);

    // Solo después de guardar el nuevo: si se borrara antes y fallara la
    // escritura, la ficha se quedaría sin acreditación ninguna.
    await documentos.borrarDocumento(anterior);

    res.json({
      mensaje: 'Documento recibido. Tu ficha vuelve a revisión.',
      tiene_documento: true,
    });
  })
);

/** Foto o logotipo de la ficha. Esta sí es pública, así que va a StorageService. */
router.post(
  '/expertos/:id/avatar',
  recibirAvatarExperto,
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    if (!req.file) return res.status(400).json({ error: 'No llegó ninguna imagen' });

    const repo = AppDataSource.getRepository(Experto);
    const experto = await repo.findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });

    const anterior = experto.avatar_url;
    experto.avatar_url = await StorageService.uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'images'
    );
    // La foto no es una afirmación sobre quién eres: cambiarla no exige volver
    // a pasar por revisión.
    await repo.save(experto);
    await StorageService.deleteFile(anterior, 'images');

    res.json({ avatar_url: experto.avatar_url });
  })
);

/** Imagen de cabecera del perfil. Como la foto, no exige volver a revisión. */
router.post(
  '/expertos/:id/portada',
  recibirPortadaExperto,
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    if (!req.file) return res.status(400).json({ error: 'No llegó ninguna imagen' });

    const repo = AppDataSource.getRepository(Experto);
    const experto = await repo.findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });

    const anterior = experto.portada_url;
    experto.portada_url = await StorageService.uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'images'
    );
    await repo.save(experto);
    await StorageService.deleteFile(anterior, 'images');
    res.json({ portada_url: experto.portada_url });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Contenido del perfil: galería y servicios (autenticado, solo el dueño)
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_MULTIMEDIA = 15;
export const MAX_IMAGENES = MAX_MULTIMEDIA;
export const MAX_SERVICIOS = 15;

/** La ficha propia, o null. La pertenencia va en el `where`. */
async function fichaPropia(req: AuthRequest): Promise<Experto | null> {
  if (!UUID.safeParse(req.params.id).success) return null;
  return AppDataSource.getRepository(Experto).findOne({
    where: { id: req.params.id, usuario_id: req.userId! },
    select: ['id', 'usuario_id', 'categoria', 'estado', 'ciudad', 'nombre_comercial'],
  });
}

/** Galería y servicios de la ficha propia, esté en el estado que esté. */
router.get(
  '/expertos/:id/contenido',
  ah(async (req: AuthRequest, res: Response) => {
    const experto = await fichaPropia(req);
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });
    const [imagenes, servicios] = await Promise.all([
      expertosService.imagenesDe(experto.id),
      expertosService.serviciosDe(experto.id),
    ]);
    res.json({
      imagenes,
      servicios,
      max_imagenes: MAX_MULTIMEDIA,
      max_multimedia: MAX_MULTIMEDIA,
      max_servicios: MAX_SERVICIOS,
    });
  })
);

/**
 * Añade una imagen o vídeo a la galería desde archivo. Se publica sin pasar
 * por revisión, como en un perfil de redes: la ficha ya está aprobada y moderación
 * puede retirarla.
 */
router.post(
  '/expertos/:id/imagenes',
  recibirImagenGaleria,
  ah(async (req: AuthRequest, res: Response) => {
    const experto = await fichaPropia(req);
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });
    if (!req.file) return res.status(400).json({ error: 'No llegó ningún archivo' });
    const descripcion = texto(200).safeParse(req.body?.descripcion ?? '');

    const esVideo = req.file.mimetype.split(';')[0].trim().toLowerCase().startsWith('video/');
    const prefijo = esVideo ? 'videos' : 'images';
    const tipo = esVideo ? 'video' : 'imagen';

    const url = await StorageService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, prefijo);

    // Candado por ficha: dos subidas simultáneas no pueden pasar ambas el límite.
    const imagen = await AppDataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`galeria:${experto.id}`]);
      const [{ total }] = await manager.query(
        `SELECT count(*)::int AS total FROM experto_imagenes WHERE experto_id = $1`,
        [experto.id]
      );
      if (total >= MAX_MULTIMEDIA) return null;
      const [fila] = await manager.query(
        `INSERT INTO experto_imagenes (experto_id, url, descripcion, orden, tipo)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, url, descripcion, tipo`,
        [experto.id, url, descripcion.success ? descripcion.data : '', total, tipo]
      );
      return fila;
    });

    if (!imagen) {
      await StorageService.deleteFile(url, prefijo);
      return res.status(409).json({ error: `La galería admite hasta ${MAX_MULTIMEDIA} fotos y vídeos` });
    }
    res.status(201).json({ imagen });
  })
);

/**
 * Inserta un vídeo en la galería por enlace (YouTube, Vimeo, TikTok o URL directa .mp4/.webm).
 */
router.post(
  '/expertos/:id/videos',
  ah(async (req: AuthRequest, res: Response) => {
    const experto = await fichaPropia(req);
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });

    const VideoBodySchema = z.object({
      url: z.string().trim().url('URL inválida').max(500),
      descripcion: texto(200).optional().default(''),
    });
    const parsed = VideoBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'URL inválida' });
    }

    const { url, descripcion } = parsed.data;

    const esVideoValido =
      /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)\/.+/i.test(url) ||
      /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url);

    if (!esVideoValido) {
      return res.status(400).json({
        error: 'El enlace debe ser de YouTube, Vimeo, TikTok o un archivo de vídeo (.mp4, .webm, .mov)',
      });
    }

    const item = await AppDataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`galeria:${experto.id}`]);
      const [{ total }] = await manager.query(
        `SELECT count(*)::int AS total FROM experto_imagenes WHERE experto_id = $1`,
        [experto.id]
      );
      if (total >= MAX_MULTIMEDIA) return null;
      const [fila] = await manager.query(
        `INSERT INTO experto_imagenes (experto_id, url, descripcion, orden, tipo)
         VALUES ($1, $2, $3, $4, 'video') RETURNING id, url, descripcion, tipo`,
        [experto.id, url, descripcion, total]
      );
      return fila;
    });

    if (!item) {
      return res.status(409).json({ error: `La galería admite hasta ${MAX_MULTIMEDIA} fotos y vídeos` });
    }

    res.status(201).json({ imagen: item });
  })
);

/** Reordena la galería: el cliente manda los ids en el orden nuevo. */
router.put(
  '/expertos/:id/imagenes/orden',
  ah(async (req: AuthRequest, res: Response) => {
    const experto = await fichaPropia(req);
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });
    const parsed = z.object({ ids: z.array(UUID).max(MAX_MULTIMEDIA) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Orden inválido' });

    await AppDataSource.query(
      `UPDATE experto_imagenes i SET orden = x.pos
         FROM unnest($2::uuid[]) WITH ORDINALITY AS x(id, pos)
        WHERE i.id = x.id AND i.experto_id = $1`,
      [experto.id, parsed.data.ids]
    );
    res.json({ imagenes: await expertosService.imagenesDe(experto.id) });
  })
);

router.delete(
  '/expertos/:id/imagenes/:imagenId',
  ah(async (req: AuthRequest, res: Response) => {
    const experto = await fichaPropia(req);
    if (!experto || !UUID.safeParse(req.params.imagenId).success) {
      return res.status(404).json({ error: 'Elemento no encontrado' });
    }
    const [borrada] = filasSql<{ url: string }>(
      await AppDataSource.query(`DELETE FROM experto_imagenes WHERE id = $1 AND experto_id = $2 RETURNING url`, [
        req.params.imagenId,
        experto.id,
      ])
    );
    if (!borrada) return res.status(404).json({ error: 'Elemento no encontrado' });
    await StorageService.deleteFile(borrada.url);
    res.json({ mensaje: 'Elemento eliminado' });
  })
);

const ServicioSchema = z.object({
  nombre: texto(120).min(2, 'El servicio necesita un nombre'),
  descripcion: texto(1000).default(''),
  precio_desde: z.number().nonnegative().max(9_999_999).nullable().default(null),
  unidad: texto(40).default(''),
  orden: z.number().int().min(0).max(100).optional(),
});

router.post(
  '/expertos/:id/servicios',
  ah(async (req: AuthRequest, res: Response) => {
    const experto = await fichaPropia(req);
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });
    const parsed = ServicioSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }
    const d = parsed.data;

    const servicio = await AppDataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`servicios:${experto.id}`]);
      const [{ total }] = await manager.query(
        `SELECT count(*)::int AS total FROM experto_servicios WHERE experto_id = $1`,
        [experto.id]
      );
      if (total >= MAX_SERVICIOS) return null;
      const [fila] = await manager.query(
        `INSERT INTO experto_servicios (experto_id, nombre, descripcion, precio_desde, unidad, orden)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nombre, descripcion, precio_desde, unidad`,
        [experto.id, d.nombre, d.descripcion, d.precio_desde, d.unidad, d.orden ?? total]
      );
      return fila;
    });
    if (!servicio) return res.status(409).json({ error: `Puedes publicar hasta ${MAX_SERVICIOS} servicios` });
    res.status(201).json({
      servicio: { ...servicio, precio_desde: servicio.precio_desde === null ? null : Number(servicio.precio_desde) },
    });
  })
);

router.patch(
  '/expertos/:id/servicios/:servicioId',
  ah(async (req: AuthRequest, res: Response) => {
    const experto = await fichaPropia(req);
    if (!experto || !UUID.safeParse(req.params.servicioId).success) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    // Sin `.default()` en la edición: un campo ausente no se toca.
    const parsed = z
      .object({
        nombre: texto(120).min(2).optional(),
        descripcion: texto(1000).optional(),
        precio_desde: z.number().nonnegative().max(9_999_999).nullable().optional(),
        unidad: texto(40).optional(),
        orden: z.number().int().min(0).max(100).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }
    const campos = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
    if (campos.length === 0) return res.status(400).json({ error: 'No hay nada que cambiar' });

    // Las columnas salen del schema, nunca del cuerpo: no hay interpolación de datos del cliente.
    const sets = campos.map(([k], i) => `"${k}" = $${i + 3}`).join(', ');
    const [servicio] = filasSql<{ precio_desde: string | null }>(
      await AppDataSource.query(
        `UPDATE experto_servicios SET ${sets} WHERE id = $1 AND experto_id = $2
         RETURNING id, nombre, descripcion, precio_desde, unidad`,
        [req.params.servicioId, experto.id, ...campos.map(([, v]) => v)]
      )
    );
    if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json({
      servicio: { ...servicio, precio_desde: servicio.precio_desde === null ? null : Number(servicio.precio_desde) },
    });
  })
);

router.delete(
  '/expertos/:id/servicios/:servicioId',
  ah(async (req: AuthRequest, res: Response) => {
    const experto = await fichaPropia(req);
    if (!experto || !UUID.safeParse(req.params.servicioId).success) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    const filas = filasSql(
      await AppDataSource.query(`DELETE FROM experto_servicios WHERE id = $1 AND experto_id = $2 RETURNING id`, [
        req.params.servicioId,
        experto.id,
      ])
    );
    if (filas.length === 0) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json({ mensaje: 'Servicio eliminado' });
  })
);

/** Apariciones, visitas y clics de la ficha propia en los últimos 30 días. */
router.get(
  '/expertos/:id/metricas',
  ah(async (req: AuthRequest, res: Response) => {
    const experto = await fichaPropia(req);
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });
    const dias = z.coerce.number().int().min(7).max(90).catch(30).parse(req.query.dias);
    res.json(await metricas.resumen(experto.id, dias));
  })
);

/** Baja: borra la ficha, sus reseñas (cascada) y el documento del almacén. */
router.delete(
  '/expertos/:id',
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    const repo = AppDataSource.getRepository(Experto);
    const experto = await repo.findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });

    // Las URLs de la galería se leen antes: la cascada borra las filas.
    const galeria: { url: string }[] = await AppDataSource.query(
      `SELECT url FROM experto_imagenes WHERE experto_id = $1`,
      [experto.id]
    );
    await repo.delete(experto.id);
    // Darse de baja tiene que llevarse también la cédula. Un documento de
    // identidad que sobrevive al borrado de la cuenta es una fuga en diferido.
    await documentos.borrarDocumento(experto.documento_url);
    await StorageService.deleteFile(experto.avatar_url, 'images');
    await StorageService.deleteFile(experto.portada_url, 'images');
    for (const { url } of galeria) await StorageService.deleteFile(url);

    res.json({ mensaje: 'Ficha eliminada' });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Reseñas (autenticado)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dejar una reseña.
 *
 * Puede reseñar cualquier usuario con cuenta —fue la decisión de producto— con
 * tres límites que la hacen sostenible sin contradecirla: una por persona (lo
 * garantiza un índice único, no una comprobación que se pueda colar por una
 * carrera), nadie se reseña a sí mismo, y el admin puede ocultar una reseña.
 *
 * Sin el primero, inflar el rating cuesta lo que repetir el POST, y la
 * puntuación deja de servir para lo único que sirve: elegir a quién contratar.
 */
router.post(
  '/expertos/:id/resenas',
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    const parsed = ResenaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }

    const experto = await AppDataSource.getRepository(Experto).findOne({
      where: { id: req.params.id },
      select: ['id', 'estado', 'usuario_id', 'eliminado_en'],
    });
    // Mismo 404 para "no existe", "no está aprobado" y "cuenta en la papelera":
    // reseñar una ficha que nadie puede ver no significa nada, y el 404 no
    // confirma que exista.
    if (!experto || experto.estado !== 'aprobado' || experto.eliminado_en) {
      return res.status(404).json({ error: 'Experto no encontrado' });
    }
    if (experto.usuario_id && experto.usuario_id === req.userId) {
      return res.status(403).json({ error: 'No puedes reseñar tu propia ficha' });
    }

    const repo = AppDataSource.getRepository(ResenaExperto);
    try {
      const resena = await repo.save(
        repo.create({
          experto_id: experto.id,
          usuario_id: req.userId!,
          puntuacion: parsed.data.puntuacion,
          comentario: parsed.data.comentario?.trim() || null,
          estado: 'publicada',
        })
      );
      await resenasService.recalcularRating(experto.id);
      res.status(201).json({ resena });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        return res.status(409).json({ error: 'Ya has reseñado a este experto. Edita tu reseña.' });
      }
      throw e;
    }
  })
);

/** Editar la reseña propia. La pertenencia va en el `where`, no después. */
router.patch(
  '/resenas/:id',
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    const parsed = ResenaSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }
    if (parsed.data.puntuacion === undefined && parsed.data.comentario === undefined) {
      return res.status(400).json({ error: 'No hay nada que cambiar' });
    }

    const repo = AppDataSource.getRepository(ResenaExperto);
    const resena = await repo.findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
    if (!resena) return res.status(404).json({ error: 'Reseña no encontrada' });

    if (parsed.data.puntuacion !== undefined) resena.puntuacion = parsed.data.puntuacion;
    if (parsed.data.comentario !== undefined) resena.comentario = parsed.data.comentario?.trim() || null;

    await repo.save(resena);
    await resenasService.recalcularRating(resena.experto_id);
    res.json({ resena });
  })
);

/** Retirar la reseña propia. */
router.delete(
  '/resenas/:id',
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    const repo = AppDataSource.getRepository(ResenaExperto);
    const resena = await repo.findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
    if (!resena) return res.status(404).json({ error: 'Reseña no encontrada' });

    await repo.delete(resena.id);
    await resenasService.recalcularRating(resena.experto_id);
    res.json({ mensaje: 'Reseña retirada' });
  })
);

/** Las reseñas que ha escrito el usuario, incluidas las que un admin ocultó. */
router.get(
  '/mis-resenas',
  ah(async (req: AuthRequest, res: Response) => {
    const resenas = await AppDataSource.getRepository(ResenaExperto).find({
      where: { usuario_id: req.userId! },
      order: { fecha_creacion: 'DESC' },
      take: 100,
    });
    res.json({ resenas });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Patrocinios (autenticado, solo el dueño de la ficha)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Abre el Checkout para patrocinar una ficha propia.
 *
 * Solo fichas **aprobadas**: cobrar por destacar algo que todavía nadie puede
 * ver sería cobrar por nada. Y el patrocinio no compra la insignia de
 * verificado ni salta la revisión — pagar no acredita a nadie.
 */
router.post(
  '/patrocinios/checkout',
  ah(async (req: AuthRequest, res: Response) => {
    if (!isStripeAvailable()) {
      return res.status(503).json({ error: 'Los pagos no están disponibles ahora mismo' });
    }

    const parsed = z.object({ experto_id: UUID }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Falta el identificador de la ficha' });
    }

    const experto = await AppDataSource.getRepository(Experto).findOne({
      where: { id: parsed.data.experto_id, usuario_id: req.userId! },
    });
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });
    if (experto.estado !== 'aprobado') {
      return res.status(409).json({
        error: 'Tu ficha tiene que estar aprobada antes de patrocinarla',
      });
    }
    if (await patrociniosService.tienePatrocinioVigente(experto.id)) {
      return res.status(409).json({ error: 'Esta ficha ya tiene un patrocinio vigente' });
    }
    // Los patrocinios mensuales solo existen en las tres categorías originales;
    // el resto se promociona con impulsos.
    const categoriaPatrocinio = experto.categoria;
    if (
      (categoriaPatrocinio !== 'legal' && categoriaPatrocinio !== 'marketing' && categoriaPatrocinio !== 'ventas') ||
      !getPriceIdPatrocinio(categoriaPatrocinio)
    ) {
      return res.status(503).json({
        error: `Todavía no hay patrocinios a la venta en ${experto.categoria}`,
      });
    }

    // LFPC art. 76 Bis fr. VIII: un patrocinio se renueva solo, así que el cargo
    // recurrente necesita autorización expresa, registrada antes de pagar.
    if (!aceptoExpresamente(req.body?.autoriza_cargo_recurrente)) {
      return res.status(400).json({
        error: 'Para patrocinar tu ficha autoriza el cargo automático recurrente',
        codigo: 'autorizacion_requerida',
      });
    }

    const usuario = await AppDataSource.getRepository(Usuario).findOne({
      where: { id: req.userId! },
      select: ['id', 'email', 'stripe_customer_id'],
    });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const precio = await describirPrecio(getPriceIdPatrocinio(categoriaPatrocinio)!);
    await registrarAutorizacionCargo(
      AppDataSource.manager,
      usuario.id,
      { concepto: `patrocinio:${categoriaPatrocinio}:${experto.id}`, ...precio },
      origenDePeticion(req)
    );

    const customerId = await getOrCreateCustomer(
      usuario.id,
      usuario.email,
      usuario.stripe_customer_id ?? undefined
    );
    // Se guarda el cliente para no crear uno nuevo en cada intento de pago.
    if (usuario.stripe_customer_id !== customerId) {
      await AppDataSource.getRepository(Usuario).update(usuario.id, {
        stripe_customer_id: customerId,
      });
    }

    const url = await createSponsorshipCheckoutSession({
      customerId,
      expertoId: experto.id,
      categoria: categoriaPatrocinio,
      successUrl: `${urlApp()}/net0/mis-fichas?patrocinio=ok`,
      cancelUrl: `${urlApp()}/net0/mis-fichas?patrocinio=cancelado`,
      textoAutorizacion: textoCargoRecurrente(precio),
    });

    res.json({ url });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Impulsos (autenticado, solo el dueño de la ficha)
// ─────────────────────────────────────────────────────────────────────────────

const ImpulsoSchema = z
  .object({
    experto_id: UUID,
    alcance: z.enum(['ciudad', 'nacional']),
    ciudad: texto(120).nullable().optional(),
    dias: z.coerce.number().int().min(impulsos.DIAS_MIN).max(impulsos.DIAS_MAX),
  })
  .refine((d) => d.alcance === 'nacional' || Boolean(d.ciudad?.trim()), {
    message: 'Elige la ciudad donde quieres aparecer',
  });

/** Precio y disponibilidad antes de pagar. No reserva nada. */
router.get(
  '/impulsos/cotizacion',
  ah(async (req: AuthRequest, res: Response) => {
    const parsed = ImpulsoSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }
    const d = parsed.data;
    const experto = await AppDataSource.getRepository(Experto).findOne({
      where: { id: d.experto_id, usuario_id: req.userId! },
      select: ['id', 'categoria'],
    });
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });

    const disp = await impulsos.disponibilidad(experto.categoria, d.alcance, d.ciudad ?? null);
    res.json({
      monto_mxn: impulsos.cotizar(d.alcance, d.dias),
      tarifa_dia: impulsos.TARIFA_DIA_MXN[d.alcance],
      dias: d.dias,
      ...disp,
    });
  })
);

/**
 * Reserva el cupo y abre el Checkout. El impulso solo se activa cuando el
 * webhook confirma el pago; si el experto abandona, la reserva caduca sola.
 */
router.post(
  '/impulsos/checkout',
  ah(async (req: AuthRequest, res: Response) => {
    if (!isStripeAvailable()) {
      return res.status(503).json({ error: 'Los pagos no están disponibles ahora mismo' });
    }
    const parsed = ImpulsoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }
    const d = parsed.data;

    const experto = await AppDataSource.getRepository(Experto).findOne({
      where: { id: d.experto_id, usuario_id: req.userId! },
      select: ['id', 'categoria', 'estado', 'nombre_comercial', 'eliminado_en'],
    });
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });
    // Cobrar por mostrar algo que nadie puede ver sería cobrar por nada.
    if (experto.estado !== 'aprobado' || experto.eliminado_en) {
      return res.status(409).json({ error: 'Tu perfil tiene que estar aprobado antes de impulsarlo' });
    }

    const usuario = await AppDataSource.getRepository(Usuario).findOne({
      where: { id: req.userId! },
      select: ['id', 'email', 'stripe_customer_id'],
    });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const reserva = await impulsos.reservar({
      expertoId: experto.id,
      categoria: experto.categoria,
      alcance: d.alcance,
      ciudad: d.ciudad ?? null,
      dias: d.dias,
    });
    if (!reserva.ok) {
      return res.status(409).json(
        reserva.motivo === 'ya_tiene'
          ? { error: 'Ya tienes un impulso vigente o en pago para ese lugar', motivo: reserva.motivo }
          : {
              error: 'No quedan espacios de impulso en ese lugar ahora mismo',
              motivo: reserva.motivo,
              libera_el: reserva.libera_el,
            }
      );
    }

    try {
      const customerId = await getOrCreateCustomer(usuario.id, usuario.email, usuario.stripe_customer_id ?? undefined);
      if (usuario.stripe_customer_id !== customerId) {
        await AppDataSource.getRepository(Usuario).update(usuario.id, { stripe_customer_id: customerId });
      }
      const lugar = d.alcance === 'nacional' ? 'todo el país' : d.ciudad!.trim();
      const sesion = await createImpulsoCheckoutSession({
        customerId,
        impulsoId: reserva.impulsoId,
        montoMxn: reserva.monto,
        descripcion: `Impulso de ${d.dias} días en ${lugar} — ${experto.nombre_comercial}`.slice(0, 250),
        successUrl: `${urlApp()}/net0/mis-fichas?impulso=ok`,
        cancelUrl: `${urlApp()}/net0/mis-fichas?impulso=cancelado`,
      });
      await impulsos.guardarSesion(reserva.impulsoId, sesion.id);
      res.json({ url: sesion.url, impulso_id: reserva.impulsoId, monto_mxn: reserva.monto });
    } catch (err) {
      await impulsos.descartarReserva(reserva.impulsoId);
      throw err;
    }
  })
);

/** Campañas de las fichas propias, con lo que rindió cada una. */
router.get(
  '/mis-impulsos',
  ah(async (req: AuthRequest, res: Response) => {
    res.json({ impulsos: await impulsos.listar({ usuarioId: req.userId! }) });
  })
);

/** Los patrocinios de las fichas propias, con su estado y vigencia. */
router.get(
  '/mis-patrocinios',
  ah(async (req: AuthRequest, res: Response) => {
    const lista = await patrociniosService.listarDeUsuario(req.userId!);
    res.json({ patrocinios: lista });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Admin — se monta aparte, en /api/admin/network
// ─────────────────────────────────────────────────────────────────────────────

export const adminNetworkRouter = Router();
exigirUuid(adminNetworkRouter, 'id');
// Toda la revisión de la red —fichas, cédulas, reseñas— es cosa de moderación.
adminNetworkRouter.use(authenticate, requirePermiso('moderarRed'));

const EstadoAdminSchema = z.object({
  estado: z.enum(['pendiente', 'aprobado', 'rechazado', 'suspendido']),
  // La insignia de verificado es una afirmación sobre el mundo real: que
  // alguien comprobó la cédula. Solo se concede desde aquí, y explícitamente.
  verificado: z.boolean().optional(),
  motivo_rechazo: texto(1000).nullable().optional(),
});

/**
 * Cola de revisión. El documento no viaja en el listado: se abre con
 * `GET /expertos/:id/documento`, que vuelve a comprobar que quien lo pide es
 * admin antes de devolver el fichero.
 */
adminNetworkRouter.get(
  '/pendientes',
  ah(async (_req: AuthRequest, res: Response) => {
    const fichas = await AppDataSource.getRepository(Experto).find({
      where: { estado: 'pendiente' },
      order: { fecha_creacion: 'ASC' },
      take: 100,
    });
    res.json({ fichas: fichas.map(sinClaveDocumento), total: fichas.length });
  })
);

/** Todas las fichas, filtrables por estado, para el panel de administración. */
adminNetworkRouter.get(
  '/expertos',
  ah(async (req: AuthRequest, res: Response) => {
    const estado = z
      .enum(['pendiente', 'aprobado', 'rechazado', 'suspendido'])
      .safeParse(req.query.estado);

    const fichas = await AppDataSource.getRepository(Experto).find({
      where: estado.success ? { estado: estado.data } : {},
      order: { fecha_creacion: 'DESC' },
      take: 200,
    });
    res.json({ fichas: fichas.map(sinClaveDocumento), total: fichas.length });
  })
);

/** Aprobar, rechazar o suspender. */
adminNetworkRouter.patch(
  '/expertos/:id/estado',
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    const parsed = EstadoAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }
    const { estado, verificado, motivo_rechazo } = parsed.data;

    // Rechazar y suspender apartan a alguien del directorio: el experto tiene
    // que saber por qué, y la auditoría también.
    let motivo: string | null = null;
    if (estado === 'rechazado' || estado === 'suspendido') {
      const m = MotivoSchema.safeParse(motivo_rechazo);
      if (!m.success) {
        return res.status(400).json({
          error:
            estado === 'rechazado'
              ? 'Un rechazo necesita motivo: el experto tiene que saber qué corregir'
              : 'Una suspensión necesita motivo: queda en el registro y se le comunica al experto',
        });
      }
      motivo = m.data;
    }

    type Resultado =
      | { tipo: 'no-existe' }
      | { tipo: 'sin-documento' }
      | { tipo: 'ok'; experto: Experto; estadoAnterior: string };

    const resultado: Resultado = await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Experto);
      const experto = await repo.findOne({
        where: { id: req.params.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!experto) return { tipo: 'no-existe' };

      // La insignia dice "acreditación comprobada". Sin documento no hay nada que
      // se haya comprobado, así que concederla sería afirmar algo falso.
      if (estado === 'aprobado' && verificado === true && !experto.documento_url) {
        return { tipo: 'sin-documento' };
      }

      const antes = { estado: experto.estado, verificado: experto.verificado };
      const estadoAnterior = experto.estado;
      experto.estado = estado;
      experto.motivo_rechazo = motivo;
      experto.fecha_aprobacion = estado === 'aprobado' ? new Date() : null;
      // Suspender o rechazar retira la insignia: dejarla puesta sería seguir
      // afirmando algo sobre alguien a quien acabas de apartar del directorio.
      experto.verificado = estado === 'aprobado' ? (verificado ?? experto.verificado) : false;

      await repo.save(experto);
      await registrarAccionAdmin(manager, req, {
        accion: `experto.${estado}`,
        recursoTipo: 'experto',
        recursoId: experto.id,
        antes,
        despues: { estado: experto.estado, verificado: experto.verificado },
        motivo,
      });
      return { tipo: 'ok', experto, estadoAnterior };
    });

    if (resultado.tipo === 'no-existe') return res.status(404).json({ error: 'Ficha no encontrada' });
    if (resultado.tipo === 'sin-documento') {
      return res.status(409).json({
        error: 'No se puede marcar como verificada una ficha sin documento de acreditación',
      });
    }
    const { experto, estadoAnterior } = resultado;

    // Se avisa solo si cambió algo que el experto necesita saber. Volver a
    // guardar el mismo estado no debe llenarle la bandeja de correos repetidos.
    const hayQueAvisar =
      estado !== 'pendiente' && (estado !== estadoAnterior || estado === 'rechazado');
    let avisado = false;
    if (hayQueAvisar && experto.usuario_id) {
      const dueno = await AppDataSource.getRepository(Usuario).findOne({
        where: { id: experto.usuario_id },
        select: ['id', 'email'],
      });
      if (dueno?.email) {
        avisado = await notificarRevisionFicha({
          email: dueno.email,
          nombreComercial: experto.nombre_comercial,
          estado,
          verificado: experto.verificado,
          motivo: experto.motivo_rechazo,
          expertoId: experto.id,
        });
      }
    }

    res.json({ experto: sinClaveDocumento(experto), avisado });
  })
);

/**
 * Abre el documento de acreditación de una ficha.
 *
 * Es el ÚNICO camino para leer el documento, y por eso vive detrás de
 * `requirePermiso('moderarRed')`. Se sirve con `no-store` —que no quede en ninguna caché
 * intermedia— e `inline`, para que el revisor lo vea en el navegador sin
 * descargarlo a su disco.
 */
adminNetworkRouter.get(
  '/expertos/:id/documento',
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    const experto = await AppDataSource.getRepository(Experto).findOne({
      where: { id: req.params.id },
      select: ['id', 'documento_url'],
    });
    if (!experto?.documento_url) {
      return res.status(404).json({ error: 'Esta ficha no tiene documento' });
    }

    const doc = await documentos.leerDocumento(experto.documento_url);
    if (!doc) return res.status(404).json({ error: 'El documento ya no está disponible' });

    // Abrir una cédula es leer un documento de identidad de un tercero: queda
    // registrado quién la abrió y cuándo. Si el registro falla, no se entrega el
    // documento — un acceso sin rastro es justo lo que no puede pasar aquí.
    await AppDataSource.transaction((manager) =>
      registrarAccionAdmin(manager, req, {
        accion: 'documento.abierto',
        recursoTipo: 'documento',
        recursoId: experto.id,
      })
    );

    res.setHeader('Content-Type', doc.tipo);
    res.setHeader('Content-Disposition', `inline; filename="${doc.nombre}"`);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(doc.buffer);
  })
);

/**
 * Reseñas para moderar, filtrables por estado.
 *
 * Trae el nombre del experto y del autor: moderar exige saber de quién se habla
 * y quién lo dice —una reseña de 1 estrella escrita por un competidor directo no
 * se juzga igual que la de un cliente—, y un par de UUID no dice ninguna de las
 * dos cosas. El email del autor sí va: es un panel de admin, y es lo que permite
 * contactarle o ver si una misma persona está atacando a varios expertos.
 */
adminNetworkRouter.get(
  '/resenas',
  ah(async (req: AuthRequest, res: Response) => {
    const estado = z.enum(['publicada', 'oculta']).safeParse(req.query.estado);
    const params: unknown[] = [];
    let filtro = '';
    if (estado.success) {
      params.push(estado.data);
      filtro = `WHERE r.estado = $1`;
    }

    const resenas = await AppDataSource.query(
      `SELECT r.id, r.experto_id, r.usuario_id, r.puntuacion, r.comentario, r.estado,
              r.fecha_creacion,
              e.nombre_comercial AS experto_nombre,
              u.nombre           AS autor_nombre,
              u.email            AS autor_email
         FROM resenas_experto r
         JOIN expertos e ON e.id = r.experto_id
         JOIN usuarios u ON u.id = r.usuario_id
         ${filtro}
        ORDER BY r.fecha_creacion DESC
        LIMIT 200`,
      params
    );
    res.json({ resenas, total: resenas.length });
  })
);

/**
 * Ocultar o volver a publicar una reseña.
 *
 * Ocultar no borra: queda el registro de qué se retiró y cuándo. Pero sí deja
 * de contar para el rating —lo hace `recalcularRating`—, porque esconder una
 * reseña abusiva y dejarle la estrella puesta no arregla nada.
 */
adminNetworkRouter.patch(
  '/resenas/:id/estado',
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    const parsed = z.object({ estado: z.enum(['publicada', 'oculta']) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'El estado debe ser publicada u oculta' });
    }

    // Ocultar la opinión de alguien es retirar lo que dijo: exige motivo.
    let motivo: string | null = null;
    if (parsed.data.estado === 'oculta') {
      const m = MotivoSchema.safeParse(req.body?.motivo);
      if (!m.success) return res.status(400).json({ error: m.error.errors[0].message });
      motivo = m.data;
    }

    const resena = await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ResenaExperto);
      const r = await repo.findOne({ where: { id: req.params.id }, lock: { mode: 'pessimistic_write' } });
      if (!r) return null;

      const antes = { estado: r.estado };
      r.estado = parsed.data.estado;
      await repo.save(r);
      await registrarAccionAdmin(manager, req, {
        accion: parsed.data.estado === 'oculta' ? 'resena.ocultada' : 'resena.publicada',
        recursoTipo: 'resena',
        recursoId: r.id,
        antes,
        despues: { estado: r.estado, experto_id: r.experto_id },
        motivo,
      });
      return r;
    });
    if (!resena) return res.status(404).json({ error: 'Reseña no encontrada' });

    // Tras el commit: el recálculo lee las reseñas ya confirmadas.
    await resenasService.recalcularRating(resena.experto_id);
    res.json({ resena });
  })
);

/** Todas las campañas de impulso, para revisar qué se está promocionando. */
adminNetworkRouter.get(
  '/impulsos',
  ah(async (_req: AuthRequest, res: Response) => {
    const lista = await impulsos.listar({ limite: 200 });
    res.json({ impulsos: lista, total: lista.length });
  })
);

/**
 * Corta un impulso (perfil engañoso, suspendido…). No devuelve el dinero por sí
 * solo: el reembolso se hace en Stripe, y la respuesta trae el pago para hacerlo.
 */
adminNetworkRouter.patch(
  '/impulsos/:id/cancelar',
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    const m = MotivoSchema.safeParse(req.body?.motivo);
    if (!m.success) return res.status(400).json({ error: m.error.errors[0].message });

    const cancelado = await AppDataSource.transaction(async (manager) => {
      const fila = await impulsos.cancelar(manager, req.params.id, m.data);
      if (!fila) return null;
      await registrarAccionAdmin(manager, req, {
        accion: 'impulso.cancelado',
        recursoTipo: 'impulso',
        recursoId: fila.id,
        despues: { estado: 'cancelado', experto_id: fila.experto_id },
        motivo: m.data,
      });
      return fila;
    });
    if (!cancelado) return res.status(404).json({ error: 'No hay un impulso activo con ese identificador' });
    res.json({ impulso: cancelado });
  })
);

/** Retira una imagen de la galería de un perfil. Exige motivo y queda auditado. */
adminNetworkRouter.delete(
  '/imagenes/:id',
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    const m = MotivoSchema.safeParse(req.body?.motivo);
    if (!m.success) return res.status(400).json({ error: m.error.errors[0].message });

    const borrada = await AppDataSource.transaction(async (manager) => {
      const [fila] = filasSql<{ id: string; experto_id: string; url: string }>(
        await manager.query(`DELETE FROM experto_imagenes WHERE id = $1 RETURNING id, experto_id, url`, [req.params.id])
      );
      if (!fila) return null;
      await registrarAccionAdmin(manager, req, {
        accion: 'imagen.retirada',
        recursoTipo: 'experto',
        recursoId: fila.experto_id,
        antes: { imagen_id: fila.id, url: fila.url },
        motivo: m.data,
      });
      return fila;
    });
    if (!borrada) return res.status(404).json({ error: 'Imagen no encontrada' });
    await StorageService.deleteFile(borrada.url);
    res.json({ mensaje: 'Imagen retirada' });
  })
);

export default router;
