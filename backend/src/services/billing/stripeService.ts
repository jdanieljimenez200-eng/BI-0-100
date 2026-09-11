import Stripe from 'stripe';
import { Plan } from '../../models/Usuario';

// Stripe es opcional — si no hay key, todas las llamadas de billing fallan de forma
// controlada y el resto de la app sigue funcionando (patrón de degradación).
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

/** Planes que se pueden comprar por Checkout (freemium no se cobra). */
export type PurchasablePlan = 'pro' | 'pro_plus' | 'business' | 'enterprise';

/** Ciclo de facturación. El anual lleva ~20% de descuento. */
export type BillingCycle = 'monthly' | 'annual';

export const PURCHASABLE_PLANS: readonly PurchasablePlan[] = [
  'pro',
  'pro_plus',
  'business',
  'enterprise',
];

const PURCHASABLE_SET = new Set<string>(PURCHASABLE_PLANS);

/** Type guard para validar el `plan` que llega en el body de una request. */
export function isPurchasablePlan(value: unknown): value is PurchasablePlan {
  return typeof value === 'string' && PURCHASABLE_SET.has(value);
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === 'monthly' || value === 'annual';
}

/**
 * plan + ciclo → Stripe Price ID. Se configuran en el Dashboard de Stripe.
 * Las variables STRIPE_PRICE_PRO y STRIPE_PRICE_BUSINESS se mantienen como
 * fallback del ciclo mensual para no romper entornos ya configurados.
 */
const PRICE_IDS: Record<PurchasablePlan, Record<BillingCycle, string>> = {
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MENSUAL ?? process.env.STRIPE_PRICE_PRO ?? '',
    annual: process.env.STRIPE_PRICE_PRO_ANUAL ?? '',
  },
  pro_plus: {
    monthly: process.env.STRIPE_PRICE_PRO_PLUS_MENSUAL ?? process.env.STRIPE_PRICE_PRO_PLUS ?? '',
    annual: process.env.STRIPE_PRICE_PRO_PLUS_ANUAL ?? '',
  },
  business: {
    monthly: process.env.STRIPE_PRICE_BUSINESS_MENSUAL ?? process.env.STRIPE_PRICE_BUSINESS ?? '',
    annual: process.env.STRIPE_PRICE_BUSINESS_ANUAL ?? '',
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MENSUAL ?? process.env.STRIPE_PRICE_ENTERPRISE ?? '',
    annual: process.env.STRIPE_PRICE_ENTERPRISE_ANUAL ?? '',
  },
};

/** Devuelve el Price ID configurado, o null si ese plan/ciclo no está listo. */
export function getPriceId(plan: PurchasablePlan, ciclo: BillingCycle = 'monthly'): string | null {
  const id = PRICE_IDS[plan]?.[ciclo];
  return id ? id : null;
}

/** Planes realmente comprables hoy (con Price ID configurado en algún ciclo). */
export function getPlanesDisponibles(): PurchasablePlan[] {
  return PURCHASABLE_PLANS.filter(
    (p) => getPriceId(p, 'monthly') !== null || getPriceId(p, 'annual') !== null,
  );
}

export function isStripeAvailable(): boolean {
  return stripe !== null;
}

export async function getOrCreateCustomer(
  userId: string,
  email: string,
  existingCustomerId?: string,
): Promise<string> {
  if (!stripe) throw new Error('Stripe no configurado');

  if (existingCustomerId) return existingCustomerId;

  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  return customer.id;
}

export async function createCheckoutSession(params: {
  customerId: string;
  plan: PurchasablePlan;
  successUrl: string;
  cancelUrl: string;
  billingCycle?: BillingCycle;
}): Promise<string> {
  if (!stripe) throw new Error('Stripe no configurado');

  const ciclo: BillingCycle = params.billingCycle ?? 'monthly';
  const priceId = getPriceId(params.plan, ciclo);
  if (!priceId) {
    throw new Error(`Precio no configurado para plan ${params.plan} (${ciclo})`);
  }

  const session = await stripe.checkout.sessions.create({
    customer: params.customerId,
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    locale: 'es',
    // La moneda la define el Price en el Dashboard (USD según la estrategia de
    // precios). No se fuerza aquí para no chocar con la moneda del Price.
    allow_promotion_codes: true,
    metadata: {
      plan: params.plan,
      billing_cycle: ciclo,
    },
    subscription_data: {
      metadata: {
        plan: params.plan,
        billing_cycle: ciclo,
      },
    },
  });

  return session.url!;
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  if (!stripe) throw new Error('Stripe no configurado');

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

export function constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
  if (!stripe) throw new Error('Stripe no configurado');
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

/**
 * Stripe Product ID → Plan interno. Cada plan necesita su STRIPE_PRODUCT_*.
 * El orden va de mayor a menor para que un ID vacío no haga match accidental
 * (los `''` nunca igualan un productId real, que siempre empieza por `prod_`).
 */
export function extractSubscriptionPlan(productId: string): Plan {
  if (!productId) return 'freemium';

  const mapa: ReadonlyArray<[string, Plan]> = [
    [process.env.STRIPE_PRODUCT_ENTERPRISE ?? '', 'enterprise'],
    [process.env.STRIPE_PRODUCT_BUSINESS ?? '', 'business'],
    [process.env.STRIPE_PRODUCT_PRO_PLUS ?? '', 'pro_plus'],
    [process.env.STRIPE_PRODUCT_PRO ?? '', 'pro'],
  ];

  for (const [prodId, plan] of mapa) {
    if (prodId && prodId === productId) return plan;
  }
  return 'freemium';
}