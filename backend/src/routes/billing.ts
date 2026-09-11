import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import Stripe from 'stripe';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { AppDataSource } from '../config/database';
import { Usuario, Plan } from '../models/Usuario';
import { getLimites, PLAN_LIMITES } from '../services/billing/planService';
import {
  isStripeAvailable,
  isPurchasablePlan,
  getPlanesDisponibles,
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
  extractSubscriptionPlan,
  PURCHASABLE_PLANS,
  BillingCycle,
} from '../services/billing/stripeService';
import { Producto } from '../models/Producto';
import { AnalisisMercado } from '../models/AnalisisMercado';
import { AnalisisMarketing } from '../models/AnalisisMarketing';
import { AnalisisVentas } from '../models/AnalisisVentas';
import { AnalisisFinanzas } from '../models/AnalisisFinanzas';
import { StripeEvent } from '../models/StripeEvent';
import * as Sentry from '@sentry/node';
import { invalidatePlanCache } from '../middleware/requirePlan';
import { QueryFailedError, EntityManager, FindOptionsWhere } from 'typeorm';

// Error transitorio (DB caída, timeout) — debemos responder 500 para que Stripe
// reintente. Los errores de datos NO recuperables se ackean con 200 tras loguear,
// para no entrar en un bucle de reintentos infinito sobre un evento defectuoso.
class TransientError extends Error {}

// Códigos de error de Postgres que indican un problema transitorio de conexión
// (no un dato inválido). Si aparecen, dejamos que Stripe reintente.
const TRANSIENT_PG_CODES = new Set([
  '08000', '08003', '08006', '08001', '08004', // connection_exception family
  '57P01', '57P02', '57P03',                     // admin_shutdown / crash / cannot_connect_now
  '53300', '53400',                              // too_many_connections / config limit
]);

function isTransientDbError(err: unknown): boolean {
  if (err instanceof TransientError) return true;
  if (err instanceof QueryFailedError) {
    const code = (err as QueryFailedError & { code?: string }).code;
    return code !== undefined && TRANSIENT_PG_CODES.has(code);
  }
  // Errores de driver fuera de una query (p. ej. pool agotado) suelen traer code.
  const code = (err as { code?: string } | null)?.code;
  return typeof code === 'string' && TRANSIENT_PG_CODES.has(code);
}

const router = Router();

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

    res.json({
      plan: planType,
      limites,
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

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const url = await createCheckoutSession({
        customerId,
        plan,
        successUrl: `${frontendUrl}/dashboard/billing?session=success&plan=${plan}`,
        cancelUrl: `${frontendUrl}/dashboard/billing?session=cancel`,
        billingCycle,
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

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const url = await createPortalSession(user.stripe_customer_id, `${frontendUrl}/dashboard/billing`);
    res.json({ portal_url: url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    res.status(500).json({ error: msg });
  }
});

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
    Sentry.captureException(err);
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

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  await AppDataSource.transaction(async (manager) => {
    const yaProcesado = await registrarEvento(manager, event);
    if (yaProcesado) return;

    type StripeObj = Record<string, unknown>;
    const repo = manager.getRepository(Usuario);

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