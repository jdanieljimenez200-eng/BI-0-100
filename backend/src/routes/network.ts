import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { Experto } from '../models/Experto';
import { ResenaExperto } from '../models/ResenaExperto';
import { Usuario } from '../models/Usuario';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermiso } from '../middleware/requireAdmin';
import { ah } from '../utils/asyncHandler';
import * as expertosService from '../services/network/expertosService';
import * as resenasService from '../services/network/resenasService';
import * as patrociniosService from '../services/network/patrociniosService';
import * as documentos from '../services/network/documentosService';
import { recibirDocumentoExperto, recibirAvatarExperto } from '../middleware/upload';
import { StorageService } from '../services/StorageService';
import { notificarRevisionFicha } from '../services/email/emailService';
import { registrarAccionAdmin, MotivoSchema } from '../services/admin/auditoria';
import {
  isStripeAvailable,
  getOrCreateCustomer,
  getPriceIdPatrocinio,
  createSponsorshipCheckoutSession,
} from '../services/billing/stripeService';

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

// ─────────────────────────────────────────────────────────────────────────────
// Validación
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIAS = ['legal', 'marketing', 'ventas'] as const;

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
  email_contacto: z.string().trim().email().max(180).nullable().optional(),
  telefono: texto(40).nullable().optional(),
  mostrar_contacto: z.boolean().default(false),
  sitio_web: urlSegura(300).nullable().optional(),
  avatar_url: urlSegura(500).nullable().optional(),
  tarifa_desde: z.number().nonnegative().max(9_999_999).nullable().optional(),
  moneda: texto(10).default('USD'),
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

    const { expertos, total } = await expertosService.listarDirectorio({
      categoria,
      ciudad,
      q,
      limit: limite,
      offset: (pagina - 1) * limite,
    });

    res.json({ expertos, total, pagina, limite });
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

    res.json({ experto: ficha, resenas, distribucion: reparto });
  })
);

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

/** Las fichas propias, en cualquier estado, con el motivo del rechazo si lo hay. */
router.get(
  '/mis-fichas',
  ah(async (req: AuthRequest, res: Response) => {
    const fichas = await AppDataSource.getRepository(Experto).find({
      where: { usuario_id: req.userId! },
      order: { fecha_creacion: 'DESC' },
    });
    res.json({ fichas: fichas.map(sinClaveDocumento) });
  })
);

/**
 * Alta. Entra siempre como `pendiente` y sin verificar, pase lo que pase en el
 * cuerpo de la petición: esos dos campos ni se leen de aquí.
 */
router.post(
  '/expertos',
  ah(async (req: AuthRequest, res: Response) => {
    const parsed = CamposEditablesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }

    const repo = AppDataSource.getRepository(Experto);
    const yaTiene = await repo.findOne({
      where: { usuario_id: req.userId!, categoria: parsed.data.categoria },
    });
    if (yaTiene) {
      return res.status(409).json({
        error: 'Ya tienes una ficha en esta categoría. Edítala en vez de crear otra.',
        experto_id: yaTiene.id,
      });
    }

    try {
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
      res.status(201).json({ experto: sinClaveDocumento(experto), mensaje: 'Ficha enviada a revisión' });
    } catch (e) {
      // El índice único es la red de seguridad ante dos altas simultáneas.
      if ((e as { code?: string }).code === '23505') {
        return res.status(409).json({ error: 'Ya tienes una ficha en esta categoría.' });
      }
      throw e;
    }
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

    await repo.delete(experto.id);
    // Darse de baja tiene que llevarse también la cédula. Un documento de
    // identidad que sobrevive al borrado de la cuenta es una fuga en diferido.
    await documentos.borrarDocumento(experto.documento_url);
    await StorageService.deleteFile(experto.avatar_url, 'images');

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
      select: ['id', 'estado', 'usuario_id'],
    });
    // Mismo 404 para "no existe" y "no está aprobado": reseñar una ficha que
    // nadie puede ver no significa nada, y el 404 no confirma que exista.
    if (!experto || experto.estado !== 'aprobado') {
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
    if (!getPriceIdPatrocinio(experto.categoria)) {
      return res.status(503).json({
        error: `Todavía no hay patrocinios a la venta en ${experto.categoria}`,
      });
    }

    const usuario = await AppDataSource.getRepository(Usuario).findOne({
      where: { id: req.userId! },
      select: ['id', 'email', 'stripe_customer_id'],
    });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

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

    const base = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const url = await createSponsorshipCheckoutSession({
      customerId,
      expertoId: experto.id,
      categoria: experto.categoria,
      successUrl: `${base}/network/mis-fichas?patrocinio=ok`,
      cancelUrl: `${base}/network/mis-fichas?patrocinio=cancelado`,
    });

    res.json({ url });
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

export default router;
