import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { Experto } from '../models/Experto';
import { ResenaExperto } from '../models/ResenaExperto';
import { Usuario } from '../models/Usuario';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';
import { ah } from '../utils/asyncHandler';
import { logger } from '../utils/logger';
import * as expertosService from '../services/network/expertosService';
import * as resenasService from '../services/network/resenasService';
import * as patrociniosService from '../services/network/patrociniosService';
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
  documento_url: urlSegura(500).nullable().optional(),
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
  'documento_url',
] as const;

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
    res.json({ fichas });
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
      res.status(201).json({ experto, mensaje: 'Ficha enviada a revisión' });
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
      experto.estado = 'pendiente';
      experto.verificado = false;
      experto.fecha_aprobacion = null;
      experto.motivo_rechazo = null;
    }

    await repo.save(experto);
    res.json({
      experto,
      mensaje: experto.estado === 'pendiente' ? 'Cambios guardados. La ficha vuelve a revisión.' : 'Cambios guardados',
    });
  })
);

/** Baja: borra la ficha y con ella sus datos personales (cascada en la BD). */
router.delete(
  '/expertos/:id',
  ah(async (req: AuthRequest, res: Response) => {
    if (!UUID.safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }
    const resultado = await AppDataSource.getRepository(Experto).delete({
      id: req.params.id,
      usuario_id: req.userId!,
    });
    if (!resultado.affected) return res.status(404).json({ error: 'Ficha no encontrada' });
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
adminNetworkRouter.use(authenticate, requireAdmin);

const EstadoAdminSchema = z.object({
  estado: z.enum(['pendiente', 'aprobado', 'rechazado', 'suspendido']),
  // La insignia de verificado es una afirmación sobre el mundo real: que
  // alguien comprobó la cédula. Solo se concede desde aquí, y explícitamente.
  verificado: z.boolean().optional(),
  motivo_rechazo: texto(1000).nullable().optional(),
});

/** Cola de revisión. Aquí SÍ se ve `documento_url`: es lo que hay que revisar. */
adminNetworkRouter.get(
  '/pendientes',
  ah(async (_req: AuthRequest, res: Response) => {
    const fichas = await AppDataSource.getRepository(Experto).find({
      where: { estado: 'pendiente' },
      order: { fecha_creacion: 'ASC' },
      take: 100,
    });
    res.json({ fichas, total: fichas.length });
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
    res.json({ fichas, total: fichas.length });
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

    if (estado === 'rechazado' && !motivo_rechazo?.trim()) {
      return res.status(400).json({ error: 'Un rechazo necesita motivo: el experto tiene que saber qué corregir' });
    }

    const repo = AppDataSource.getRepository(Experto);
    const experto = await repo.findOne({ where: { id: req.params.id } });
    if (!experto) return res.status(404).json({ error: 'Ficha no encontrada' });

    experto.estado = estado;
    experto.motivo_rechazo = estado === 'rechazado' ? motivo_rechazo!.trim() : null;
    experto.fecha_aprobacion = estado === 'aprobado' ? new Date() : null;
    // Suspender o rechazar retira la insignia: dejarla puesta sería seguir
    // afirmando algo sobre alguien a quien acabas de apartar del directorio.
    experto.verificado = estado === 'aprobado' ? (verificado ?? experto.verificado) : false;

    await repo.save(experto);
    logger.info(
      `[network] admin ${req.userId} puso la ficha ${experto.id} en '${estado}' (verificado=${experto.verificado})`
    );
    res.json({ experto });
  })
);

/** Reseñas para moderar, filtrables por estado. */
adminNetworkRouter.get(
  '/resenas',
  ah(async (req: AuthRequest, res: Response) => {
    const estado = z.enum(['publicada', 'oculta']).safeParse(req.query.estado);
    const resenas = await AppDataSource.getRepository(ResenaExperto).find({
      where: estado.success ? { estado: estado.data } : {},
      order: { fecha_creacion: 'DESC' },
      take: 200,
    });
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

    const repo = AppDataSource.getRepository(ResenaExperto);
    const resena = await repo.findOne({ where: { id: req.params.id } });
    if (!resena) return res.status(404).json({ error: 'Reseña no encontrada' });

    resena.estado = parsed.data.estado;
    await repo.save(resena);
    await resenasService.recalcularRating(resena.experto_id);

    logger.info(`[network] admin ${req.userId} puso la reseña ${resena.id} en '${resena.estado}'`);
    res.json({ resena });
  })
);

export default router;
