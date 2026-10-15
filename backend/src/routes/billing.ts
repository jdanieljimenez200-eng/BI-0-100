import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import Stripe from 'stripe';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { urlApp } from '../utils/urlApp';
import { AppDataSource } from '../config/database';
import { Usuario, Plan } from '../models/Usuario';
import { getLimites, PLAN_LIMITES } from '../services/billing/planService';
import { estadoCreditos, COSTO_CREDITOS } from '../services/billing/creditosIA';
import {
  isStripeAvailable,
  isPurchasablePlan,
  getPlanesDisponibles,
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
  extractSubscriptionPlan,
  esPatrocinio,
  esImpulso,
  datosPatrocinio,
  PURCHASABLE_PLANS,
  BillingCycle,
  getPriceId,
  describirPrecio,
  textoCargoRecurrente,
  textoImporte,
  estadoSuscripcion,
  programarCancelacion,
  reanudarSuscripcion,
  EstadoSuscripcion,
} from '../services/billing/stripeService';
import { aceptoExpresamente, origenDePeticion, registrarAutorizacionCargo } from '../services/cumplimiento/aceptaciones';
import { enviarAvisoRenovacion } from '../services/email/emailService';
import * as patrocinios from '../services/network/patrociniosService';
import * as impulsosNet from '../services/network/impulsosService';
import { Producto } from '../models/Producto';
import { AnalisisMercado } from '../models/AnalisisMercado';
import { AnalisisMarketing } from '../models/AnalisisMarketing';
import { AnalisisVentas } from '../models/AnalisisVentas';
import { AnalisisFinanzas } from '../models/AnalisisFinanzas';
import { StripeEvent } from '../models/StripeEvent';
import { reportarError } from '../config/sentry';
import { esErrorDeBaseTransitorio } from '../utils/erroresTransitorios';
import { invalidatePlanCache } from '../middleware/requirePlan';
import { QueryFailedError, EntityManager, FindOptionsWhere } from 'typeorm';

// Error transitorio (DB caída, timeout) — debemos responder 500 para que Stripe
// reintente. Los errores de datos NO recuperables se ackean con 200 tras loguear,
// para no entrar en un bucle de reintentos infinito sobre un evento defectuoso.
class TransientError extends Error {}

// Error de Postgres de conexión o capacidad (no un dato inválido): Stripe reintenta.
function isTransientDbError(err: unknown): boolean {
  return err instanceof TransientError || esErrorDeBaseTransitorio(err);
}

const router = Router();

// ─── GET /api/billing/planes ──────────────────────────────────────────────────
/**
 * Catálogo público de planes (sin sesión): precios, créditos y funciones.
 *
 * La página /pricing lo lee de aquí para que el precio que ve un visitante sea
 * siempre el que se cobra. Antes estaba escrito a mano en el frontend y se
 * separó de Stripe.
 */
router.get('/planes', (_req: Request, res: Response) => {
  res.json({
    moneda: 'MXN',
    iva_incluido: true,
    planes: PLAN_LIMITES,
    costo_creditos: COSTO_CREDITOS,
  });
});

// ─── GET /api/billing/status ──────────────────────────────────────────────────
router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Usuario);
    const user = await repo.findOneBy({ id: req.userId! } as FindOptionsWhere<Usuario>);
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const planType = user.plan as Plan;
    const limites = getLimites(planType);

    // Contar uso actual — usuario_id es string (UUID)
    const userIdStr = user.id.toString();
    const [productos, analisisMercado, analisisMarketing, analisisVentas, analisisFinanzas] = await Promise.all([
      AppDataSource.getRepository(Producto).count({ where: { usuario_id: userIdStr, status: 'activo' } as FindOptionsWhere<Producto> }),
      AppDataSource.getRepository(AnalisisMercado).count({ where: { usuario_id: userIdStr } as FindOptionsWhere<AnalisisMercado> }),
      AppDataSource.getRepository(AnalisisMarketing).count({ where: { usuario_id: userIdStr } as FindOptionsWhere<AnalisisMarketing> }),
      AppDataSource.getRepository(AnalisisVentas).count({ where: { usuario_id: userIdStr } as FindOptionsWhere<AnalisisVentas> }),
      AppDataSource.getRepository(AnalisisFinanzas).count({ where: { usuario_id: userIdStr } as FindOptionsWhere<AnalisisFinanzas> }),
    ]);

    const creditos = await estadoCreditos(user.id, planType);

    // Si la renovación ya está cancelada, la pantalla lo dice (y ofrece deshacerlo).
    let suscripcion: EstadoSuscripcion | null = null;
    if (user.stripe_subscription_id && isStripeAvailable()) {
      try {
        suscripcion = await estadoSuscripcion(user.stripe_subscription_id);
      } catch (err) {
        logger.warn('[billing] no se pudo leer la suscripción en Stripe:', err);
      }
    }

    res.json({
      plan: planType,
      limites,
      creditos,
      costo_creditos: COSTO_CREDITOS,
      uso: {
        productos,
        analisis: {
          mercado: analisisMercado,
          marketing: analisisMarketing,
          ventas: analisisVentas,
          finanzas: analisisFinanzas,
          total: analisisMercado + analisisMarketing + analisisVentas + analisisFinanzas,
        },
      },
      stripe_disponible: isStripeAvailable(),
      plan_expires_at: user.plan_expires_at ?? null,
      suscripcion: suscripcion && {
        estado: suscripcion.estado,
        cancelacion_programada: suscripcion.cancelacionProgramada,
        fin_periodo: suscripcion.finPeriodo,
      },
      todos_planes: PLAN_LIMITES,
      planes_comprables: isStripeAvailable() ? getPlanesDisponibles() : [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─── POST /api/billing/checkout ───────────────────────────────────────────────
router.post(
  '/checkout',
  authenticate,
  [
    body('plan')
      .isIn(PURCHASABLE_PLANS as unknown as string[])
      .withMessage(`plan debe ser uno de: ${PURCHASABLE_PLANS.join(', ')}`),
    body('billing_cycle')
      .optional()
      .isIn(['monthly', 'annual'])
      .withMessage('billing_cycle debe ser monthly o annual'),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!isStripeAvailable()) {
      res.status(503).json({
        error: 'Pagos no disponibles en este entorno',
        mensaje: 'Configura STRIPE_SECRET_KEY para habilitar pagos',
      });
      return;
    }

    try {
      const plan = req.body?.plan as unknown;
      if (!isPurchasablePlan(plan)) {
        res.status(400).json({ error: 'Plan no disponible para compra' });
        return;
      }
      const billingCycle: BillingCycle =
        req.body?.billing_cycle === 'annual' ? 'annual' : 'monthly';

      // LFPC art. 76 Bis fr. VIII: el cargo recurrente necesita autorización expresa.
      if (!aceptoExpresamente(req.body?.autoriza_cargo_recurrente)) {
        res.status(400).json({
          error: 'Para suscribirte autoriza el cargo automático recurrente',
          codigo: 'autorizacion_requerida',
        });
        return;
      }
      const priceId = getPriceId(plan, billingCycle);
      if (!priceId) {
        res.status(400).json({ error: 'Ese plan no está disponible para ese ciclo de pago' });
        return;
      }

      const repo = AppDataSource.getRepository(Usuario);
      const user = await repo.findOneBy({ id: req.userId! } as FindOptionsWhere<Usuario>);
      if (!user) {
        res.status(404).json({ error: 'Usuario no encontrado' });
        return;
      }

      const customerId = await getOrCreateCustomer(user.id.toString(), user.email, user.stripe_customer_id ?? undefined);

      if (!user.stripe_customer_id) {
        await repo.update({ id: user.id } as FindOptionsWhere<Usuario>, { stripe_customer_id: customerId });
      }

      // Lo que se autoriza es el cargo tal como lo tiene Stripe, y queda registrado
      // antes de mandar a pagar.
      const precio = await describirPrecio(priceId);
      await registrarAutorizacionCargo(
        AppDataSource.manager,
        user.id,
        { concepto: `plan:${plan}:${billingCycle}`, ...precio },
        origenDePeticion(req),
      );

      const url = await createCheckoutSession({
        customerId,
        plan,
        successUrl: urlApp('/dashboard/billing', { session: 'success', plan }),
        cancelUrl: urlApp('/dashboard/billing', { session: 'cancel' }),
        billingCycle,
        textoAutorizacion: textoCargoRecurrente(precio),
      });

      res.json({ checkout_url: url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno';
      res.status(500).json({ error: msg });
    }
  },
);

// ─── POST /api/billing/portal ─────────────────────────────────────────────────
router.post('/portal', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isStripeAvailable()) {
    res.status(503).json({ error: 'Pagos no disponibles en este entorno' });
    return;
  }

  try {
    const repo = AppDataSource.getRepository(Usuario);
    const user = await repo.findOneBy({ id: req.userId! } as FindOptionsWhere<Usuario>);
    if (!user?.stripe_customer_id) {
      res.status(400).json({ error: 'No tienes una suscripción activa' });
      return;
    }

    const url = await createPortalSession(user.stripe_customer_id, urlApp('/dashboard/billing'));
    res.json({ portal_url: url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    res.status(500).json({ error: msg });
  }
});

// ─── POST /api/billing/cancelar · /reanudar ───────────────────────────────────
/**
 * Cancelar la suscripción desde la app, en un clic y sin flujo de retención
 * (LFPC art. 76 Bis fr. IX). No hay más cargos; el plan sigue hasta el fin del
 * periodo pagado y luego la cuenta pasa al plan Gratis (webhook `deleted`).
 */
async function cambiarRenovacion(req: AuthRequest, res: Response, cancelar: boolean): Promise<void> {
  if (!isStripeAvailable()) {
    res.status(503).json({ error: 'Pagos no disponibles en este entorno' });
    return;
  }
  try {
    const user = await AppDataSource.getRepository(Usuario).findOne({
      where: { id: req.userId! } as FindOptionsWhere<Usuario>,
      select: ['id', 'stripe_subscription_id'],
    });
    if (!user?.stripe_subscription_id) {
      res.status(400).json({ error: 'No tienes una suscripción activa' });
      return;
    }
    const estado = cancelar
      ? await programarCancelacion(user.stripe_subscription_id)
      : await reanudarSuscripcion(user.stripe_subscription_id);
    logger.info(`[billing] ${req.userId} ${cancelar ? 'canceló' : 'reanudó'} la renovación de su suscripción`);
    res.json({
      estado: estado.estado,
      cancelacion_programada: estado.cancelacionProgramada,
      fin_periodo: estado.finPeriodo,
    });
  } catch (err) {
    logger.error(`[billing] error al ${cancelar ? 'cancelar' : 'reanudar'} la suscripción:`, err);
    reportarError(err, { userId: req.userId, accion: cancelar ? 'cancelar' : 'reanudar' });
    res.status(502).json({
      error: cancelar
        ? 'No pudimos cancelar en este momento. Inténtalo de nuevo o escríbenos y la cancelamos por ti.'
        : 'No pudimos reanudar la suscripción. Inténtalo de nuevo.',
    });
  }
}

router.post('/cancelar', authenticate, (req: AuthRequest, res: Response) => cambiarRenovacion(req, res, true));
router.post('/reanudar', authenticate, (req: AuthRequest, res: Response) => cambiarRenovacion(req, res, false));

// ─── POST /api/billing/webhook ────────────────────────────────────────────────
router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  if (!sig || typeof sig !== 'string') {
    res.status(400).json({ error: 'Firma requerida' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(req.body as Buffer, sig);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Firma inválida';
    res.status(400).json({ error: msg });
    return;
  }

  try {
    await handleStripeEvent(event);
    res.json({ received: true });
  } catch (err) {
    if (isTransientDbError(err)) {
      logger.error('[stripe:webhook] error transitorio, se solicita reintento:', err);
      res.status(500).json({ error: 'Error transitorio procesando evento' });
      return;
    }
    logger.error(`[stripe:webhook] error no recuperable en ${event.id} (${event.type}):`, err);
    reportarError(err, { stripe_event_id: event.id, stripe_event_type: event.type });
    res.json({ received: true, handled: false });
  }
});

// ── Stripe event handler ──────────────────────────────────────────────────────
const EVENTOS_QUE_CAMBIAN_PLAN = new Set<string>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

/** Días mínimos entre el aviso de renovación y el cargo (LFPC art. 76 Bis fr. IX). */
export const DIAS_AVISO_RENOVACION = 5;

type AvisoRenovacion = Parameters<typeof enviarAvisoRenovacion>[0];

/**
 * Datos del aviso de renovación a partir de un `invoice.upcoming`, o `null` si no
 * hay cargo que avisar (importe cero o sin fecha de cobro).
 */
export function avisoDeFactura(
  factura: Record<string, unknown>,
  usuario: { email: string; nombre: string },
): AvisoRenovacion | null {
  const monto = typeof factura['amount_due'] === 'number' ? (factura['amount_due'] as number) : 0;
  if (monto <= 0) return null;
  const lineas = (factura['lines'] as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
  const inicioLinea = (lineas[0]?.['period'] as { start?: number } | undefined)?.start;
  const cuando = (factura['next_payment_attempt'] as number | null | undefined) ?? inicioLinea ?? null;
  if (!cuando) return null;
  return {
    email: usuario.email,
    nombre: usuario.nombre,
    conceptos: lineas
      .map((l) => (typeof l['description'] === 'string' ? (l['description'] as string) : ''))
      .filter(Boolean)
      .slice(0, 10),
    importe: textoImporte(monto, String(factura['currency'] ?? 'mxn').toUpperCase()),
    fechaCargo: new Date(cuando * 1000),
  };
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  let avisoRenovacion: AvisoRenovacion | null = null;

  await AppDataSource.transaction(async (manager) => {
    const yaProcesado = await registrarEvento(manager, event);
    if (yaProcesado) return;

    type StripeObj = Record<string, unknown>;
    const repo = manager.getRepository(Usuario);

    // ── Patrocinios de la red de expertos ────────────────────────────────
    //
    // Un patrocinio se cobra por el mismo Stripe y al mismo cliente, pero NO es
    // un plan del SaaS. Hay que desviarlo ANTES de que el switch toque al
    // usuario: `extractSubscriptionPlan` devuelve 'freemium' ante un producto
    // que no reconoce, así que un experto con plan Pro que pagara un patrocinio
    // se quedaría en freemium por haber pagado más. Y su
    // `stripe_subscription_id` pasaría a apuntar al patrocinio, dejando su
    // suscripción real sin rastro.
    // ── Aviso de renovación (planes y patrocinios por igual) ───────────────
    //
    // Va antes del desvío de patrocinios: el aviso es por cualquier cargo
    // recurrente y no toca el plan de nadie. El correo sale tras el COMMIT.
    if (event.type === 'invoice.upcoming') {
      const factura = event.data.object as unknown as Record<string, unknown>;
      const usuario = await repo.findOne({
        where: { stripe_customer_id: factura['customer'] as string } as FindOptionsWhere<Usuario>,
        select: ['id', 'email', 'nombre', 'activo'],
      });
      if (usuario && usuario.activo !== false) avisoRenovacion = avisoDeFactura(factura, usuario);
      return;
    }

    if (esPatrocinio(event.data.object)) {
      await manejarEventoPatrocinio(manager, event);
      return;
    }

    // ── Impulsos de la red: pago único, tampoco toca el plan ──────────────
    if (esImpulso(event.data.object)) {
      await manejarEventoImpulso(manager, event);
      return;
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as unknown as StripeObj;
        const customerId = session['customer'] as string;
        const subscriptionId = session['subscription'] as string;
        if (customerId && subscriptionId) {
          await repo.update(
            { stripe_customer_id: customerId } as FindOptionsWhere<Usuario>,
            { stripe_subscription_id: subscriptionId },
          );
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as unknown as StripeObj;
        const customerId = sub['customer'] as string;
        if (!(await debeAplicarseEvento(repo, customerId, event.created))) break;

        const status = sub['status'] as string;
        const items = sub['items'] as { data: { price: { product: string } }[] };
        const productId = items?.data?.[0]?.price?.product ?? '';
        const periodEnd = sub['current_period_end'] as number;

        const plan = extractSubscriptionPlan(productId);
        const isActive = ['active', 'trialing'].includes(status);

        await repo.update(
          { stripe_customer_id: customerId } as FindOptionsWhere<Usuario>,
          {
            plan: isActive ? plan : 'freemium',
            stripe_subscription_id: sub['id'] as string,
            plan_expires_at: isActive ? new Date(periodEnd * 1000) : (null as any),
            stripe_event_ts: event.created,
          },
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as unknown as StripeObj;
        const customerId = sub['customer'] as string;
        if (!(await debeAplicarseEvento(repo, customerId, event.created))) break;

        await repo.update(
          { stripe_customer_id: customerId } as FindOptionsWhere<Usuario>,
          {
            plan: 'freemium',
            stripe_subscription_id: null as any,
            plan_expires_at: null as any,
            stripe_event_ts: event.created,
          },
        );
        break;
      }
    }
  });

  if (avisoRenovacion) await enviarAvisoDeRenovacion(avisoRenovacion, event.id);

  if (EVENTOS_QUE_CAMBIAN_PLAN.has(event.type)) {
    const obj = event.data.object as unknown as Record<string, unknown>;
    const customerId = obj['customer'] as string | undefined;
    if (customerId) {
      try {
        const usuario = await AppDataSource.getRepository(Usuario).findOne({
          where: { stripe_customer_id: customerId } as FindOptionsWhere<Usuario>,
          select: ['id'],
        });
        if (usuario) await invalidatePlanCache(usuario.id.toString());
      } catch (err) {
        logger.error('[stripe:webhook] no se pudo invalidar la caché de plan:', err);
      }
    }
  }
}

/**
 * Manda el aviso de renovación y deja rastro si no cumple los 5 días (Stripe manda
 * `invoice.upcoming` con los días configurados en Settings › Billing ›
 * Subscriptions) o si el correo no sale.
 */
async function enviarAvisoDeRenovacion(aviso: AvisoRenovacion, eventId: string): Promise<void> {
  const dias = (aviso.fechaCargo.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  if (dias < DIAS_AVISO_RENOVACION) {
    const err = new Error(
      `invoice.upcoming llegó ${dias.toFixed(1)} días antes del cargo: configura en Stripe el aviso con al menos 7 días`,
    );
    logger.error(`[billing] ${err.message}`);
    reportarError(err, { stripe_event_id: eventId });
  }
  if (!(await enviarAvisoRenovacion(aviso))) {
    logger.error(`[billing] el aviso de renovación del evento ${eventId} no se pudo enviar`);
    reportarError(new Error('Aviso de renovación no enviado'), { stripe_event_id: eventId });
  }
}

/**
 * Eventos de Stripe que corresponden a un patrocinio de la red de expertos.
 *
 * Ningún camino de aquí toca la tabla `usuarios`: un patrocinio no cambia el
 * plan de nadie. Se ejecuta dentro de la transacción del webhook, junto al
 * registro del evento, para que un reenvío no lo aplique dos veces.
 */
async function manejarEventoPatrocinio(
  manager: EntityManager,
  event: Stripe.Event,
): Promise<void> {
  const obj = event.data.object as unknown as Record<string, unknown>;
  const datos = datosPatrocinio(obj);

  if (!datos) {
    logger.error(
      `[network] evento de patrocinio ${event.id} (${event.type}) sin experto_id o categoría válidos en la metadata`,
    );
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      // La sesión trae el id de la suscripción recién creada.
      const subscriptionId = obj['subscription'] as string | null;
      if (!subscriptionId) {
        logger.error(`[network] checkout de patrocinio ${event.id} sin suscripción`);
        return;
      }
      await patrocinios.activarPatrocinio(manager, {
        expertoId: datos.expertoId,
        categoria: datos.categoria,
        subscriptionId,
        fechaFin: null,
      });
      logger.info(`[network] patrocinio activado para el experto ${datos.expertoId} (${datos.categoria})`);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscriptionId = obj['id'] as string;
      const status = obj['status'] as string;
      const periodEnd = obj['current_period_end'] as number | null;

      if (['active', 'trialing'].includes(status)) {
        // `current_period_end` marca hasta cuándo está pagado. Si el experto
        // canceló pero el periodo sigue corriendo, el patrocinio sigue vigente
        // hasta esa fecha: ya lo pagó.
        await patrocinios.activarPatrocinio(manager, {
          expertoId: datos.expertoId,
          categoria: datos.categoria,
          subscriptionId,
          fechaFin: periodEnd ? new Date(periodEnd * 1000) : null,
        });
      } else {
        // Impagado, incompleto o cancelado: deja de subir a nadie.
        await patrocinios.cerrarPatrocinio(manager, subscriptionId, 'vencido');
        logger.info(`[network] patrocinio ${subscriptionId} vencido (estado Stripe: ${status})`);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      await patrocinios.cerrarPatrocinio(manager, obj['id'] as string, 'cancelado');
      logger.info(`[network] patrocinio ${obj['id']} cancelado`);
      break;
    }
  }
}

/**
 * Pago de un impulso de la red. `checkout.session.completed` llega con
 * `payment_status = 'paid'` en tarjeta; con métodos diferidos (OXXO) llega
 * `unpaid` y el cobro se confirma después con `async_payment_succeeded`.
 */
async function manejarEventoImpulso(manager: EntityManager, event: Stripe.Event): Promise<void> {
  const obj = event.data.object as unknown as Record<string, unknown>;
  const impulsoId = (obj['metadata'] as Record<string, unknown> | undefined)?.['impulso_id'];
  if (typeof impulsoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(impulsoId)) {
    logger.error(`[network] evento de impulso ${event.id} (${event.type}) sin impulso_id válido`);
    return;
  }
  const paymentIntent = typeof obj['payment_intent'] === 'string' ? (obj['payment_intent'] as string) : null;

  switch (event.type) {
    case 'checkout.session.completed':
      if (obj['payment_status'] === 'paid') {
        await impulsosNet.activarPagado(manager, { impulsoId, sessionId: obj['id'] as string, paymentIntent });
      }
      break;
    case 'checkout.session.async_payment_succeeded':
      await impulsosNet.activarPagado(manager, { impulsoId, sessionId: obj['id'] as string, paymentIntent });
      break;
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      await impulsosNet.expirarSesion(manager, impulsoId);
      break;
  }
}

async function registrarEvento(manager: EntityManager, event: Stripe.Event): Promise<boolean> {
  try {
    await manager.insert(StripeEvent, {
      event_id: event.id,
      event_type: event.type,
      event_created: event.created,
    });
    return false;
  } catch (err) {
    if (err instanceof QueryFailedError && (err as QueryFailedError & { code?: string }).code === '23505') {
      return true;
    }
    throw err;
  }
}

async function debeAplicarseEvento(
  repo: ReturnType<EntityManager['getRepository']> | import('typeorm').Repository<Usuario>,
  customerId: string,
  eventCreated: number,
): Promise<boolean> {
  if (!customerId) return false;
  const user = await (repo as import('typeorm').Repository<Usuario>).findOne({
    where: { stripe_customer_id: customerId } as FindOptionsWhere<Usuario>,
    select: ['id', 'stripe_event_ts'],
  });
  if (!user) return false;
  const ultimo = user.stripe_event_ts != null ? Number(user.stripe_event_ts) : null;
  return ultimo === null || eventCreated >= ultimo;
}

export default router;