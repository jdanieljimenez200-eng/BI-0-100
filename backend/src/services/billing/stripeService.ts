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

// ─────────────────────────────────────────────────────────────────────────────
// Cargos recurrentes (LFPC art. 76 Bis fr. VIII y IX)
//
// Antes de mandar a pagar una suscripción se muestra y se registra el cargo
// exacto: importe, moneda y periodicidad tal como los tiene el Price en Stripe
// (no los del catálogo de la app, que podrían no coincidir con lo que se cobra).
// ─────────────────────────────────────────────────────────────────────────────

export interface PrecioRecurrente {
  priceId: string;
  /** Unidad mínima de la moneda (centavos). */
  montoMinimo: number | null;
  moneda: string;
  intervalo: string | null;
  intervaloCantidad: number | null;
}

const cachePrecios = new Map<string, { precio: PrecioRecurrente; vence: number }>();

/** Importe y periodicidad de un Price (en caché 10 min: cambian casi nunca). */
export async function describirPrecio(priceId: string): Promise<PrecioRecurrente> {
  if (!stripe) throw new Error('Stripe no configurado');
  const enCache = cachePrecios.get(priceId);
  if (enCache && enCache.vence > Date.now()) return enCache.precio;
  const p = await stripe.prices.retrieve(priceId);
  const precio: PrecioRecurrente = {
    priceId,
    montoMinimo: p.unit_amount ?? null,
    moneda: (p.currency ?? 'mxn').toUpperCase(),
    intervalo: p.recurring?.interval ?? null,
    intervaloCantidad: p.recurring?.interval_count ?? null,
  };
  cachePrecios.set(priceId, { precio, vence: Date.now() + 10 * 60 * 1000 });
  return precio;
}

const PERIODO: Record<string, [string, string]> = {
  day: ['día', 'días'],
  week: ['semana', 'semanas'],
  month: ['mes', 'meses'],
  year: ['año', 'años'],
};

/** «cada mes», «cada 3 meses», «cada año». */
export function textoPeriodicidad(intervalo: string | null, cantidad: number | null): string {
  const [uno, varios] = PERIODO[intervalo ?? ''] ?? ['periodo', 'periodos'];
  const n = cantidad && cantidad > 1 ? cantidad : 1;
  return n === 1 ? `cada ${uno}` : `cada ${n} ${varios}`;
}

/** «$599.00 MXN», con el formato mexicano de miles. */
export function textoImporte(montoMinimo: number | null, moneda: string): string {
  if (montoMinimo === null) return `el importe indicado en ${moneda}`;
  const valor = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(montoMinimo / 100);
  return `$${valor} ${moneda}`;
}

/**
 * Texto de la autorización del cargo recurrente: el mismo que se muestra en el
 * Checkout de Stripe, junto al botón de pagar.
 */
export function textoCargoRecurrente(precio: PrecioRecurrente): string {
  return (
    `Al suscribirte autorizas un cargo automático de ${textoImporte(precio.montoMinimo, precio.moneda)} ` +
    `${textoPeriodicidad(precio.intervalo, precio.intervaloCantidad)} a este método de pago hasta que canceles. ` +
    'Te avisaremos por correo al menos 5 días antes de cada renovación y puedes cancelar en cualquier momento, ' +
    'sin penalización, desde Facturación.'
  );
}

export async function createCheckoutSession(params: {
  customerId: string;
  plan: PurchasablePlan;
  successUrl: string;
  cancelUrl: string;
  billingCycle?: BillingCycle;
  /** Texto de la autorización del cargo recurrente, visible junto al botón de pagar. */
  textoAutorizacion?: string;
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
    // La moneda la define el Price en el Dashboard (MXN con IVA incluido, ver
    // docs/pricing/PROPUESTA_PLANES_2026-09.md). No se fuerza aquí para no chocar
    // con la moneda del Price.
    allow_promotion_codes: true,
    ...(params.textoAutorizacion ? { custom_text: { submit: { message: params.textoAutorizacion } } } : {}),
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

// ─────────────────────────────────────────────────────────────────────────────
// Patrocinios de la red de expertos
//
// Un patrocinio es una suscripción más, cobrada por el mismo Stripe y al mismo
// cliente, pero NO es un plan del SaaS. Esa distinción no es cosmética: el
// webhook de billing traduce cada suscripción a un plan con
// `extractSubscriptionPlan`, que devuelve 'freemium' ante un producto que no
// reconoce. Sin marcar estas suscripciones, un experto con plan Pro que pagara
// un patrocinio se quedaría en freemium por haber pagado más.
//
// La marca viaja en la metadata, en la sesión y en la suscripción, y el webhook
// desvía por ella antes de tocar al usuario.
// ─────────────────────────────────────────────────────────────────────────────

/** Marca que distingue una suscripción de patrocinio de un plan del SaaS. */
export const TIPO_SUSCRIPCION_PATROCINIO = 'patrocinio_experto';

export type CategoriaPatrocinable = 'legal' | 'marketing' | 'ventas';

const PRICE_IDS_PATROCINIO: Record<CategoriaPatrocinable, string> = {
  legal: process.env.STRIPE_PRICE_PATROCINIO_LEGAL ?? process.env.STRIPE_PRICE_PATROCINIO ?? '',
  marketing:
    process.env.STRIPE_PRICE_PATROCINIO_MARKETING ?? process.env.STRIPE_PRICE_PATROCINIO ?? '',
  ventas: process.env.STRIPE_PRICE_PATROCINIO_VENTAS ?? process.env.STRIPE_PRICE_PATROCINIO ?? '',
};

/** Price del patrocinio de esa categoría, o null si no está configurado. */
export function getPriceIdPatrocinio(categoria: CategoriaPatrocinable): string | null {
  return PRICE_IDS_PATROCINIO[categoria] || null;
}

/**
 * Checkout de un patrocinio.
 *
 * `experto_id` y `categoria` viajan en la metadata porque el webhook llega sin
 * más contexto que el id de la suscripción: es lo único que le permite saber a
 * qué ficha activar el patrocinio.
 */
export async function createSponsorshipCheckoutSession(params: {
  customerId: string;
  expertoId: string;
  categoria: CategoriaPatrocinable;
  successUrl: string;
  cancelUrl: string;
  textoAutorizacion?: string;
}): Promise<string> {
  if (!stripe) throw new Error('Stripe no configurado');

  const priceId = getPriceIdPatrocinio(params.categoria);
  if (!priceId) {
    throw new Error(`Precio de patrocinio no configurado para ${params.categoria}`);
  }

  const metadata = {
    tipo: TIPO_SUSCRIPCION_PATROCINIO,
    experto_id: params.expertoId,
    categoria: params.categoria,
  };

  const session = await stripe.checkout.sessions.create({
    customer: params.customerId,
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    locale: 'es',
    allow_promotion_codes: true,
    ...(params.textoAutorizacion ? { custom_text: { submit: { message: params.textoAutorizacion } } } : {}),
    metadata,
    // También en la suscripción: los eventos `customer.subscription.*` no
    // traen la metadata de la sesión, solo la suya.
    subscription_data: { metadata },
  });

  return session.url!;
}

/**
 * ¿Este objeto de Stripe pertenece a un patrocinio?
 *
 * Se consulta desde el webhook sobre la sesión o sobre la suscripción, por eso
 * acepta cualquier objeto con metadata.
 */
export function esPatrocinio(obj: unknown): boolean {
  const metadata = (obj as { metadata?: Record<string, unknown> } | null)?.metadata;
  return metadata?.tipo === TIPO_SUSCRIPCION_PATROCINIO;
}

/** Lee `experto_id` y `categoria` de la metadata de un objeto de Stripe. */
export function datosPatrocinio(
  obj: unknown
): { expertoId: string; categoria: CategoriaPatrocinable } | null {
  const metadata = (obj as { metadata?: Record<string, unknown> } | null)?.metadata;
  const expertoId = metadata?.experto_id;
  const categoria = metadata?.categoria;
  if (typeof expertoId !== 'string' || !expertoId) return null;
  if (categoria !== 'legal' && categoria !== 'marketing' && categoria !== 'ventas') return null;
  return { expertoId, categoria };
}

// ─────────────────────────────────────────────────────────────────────────────
// Impulsos de la red de expertos
//
// Pago único, no suscripción: el experto compra N días de visibilidad. El precio
// lo calcula el backend (`impulsosService.cotizar`) y viaja como `price_data`, así
// que no hace falta dar de alta un Price en Stripe por cada combinación de días y
// alcance. La marca `tipo` hace que el webhook lo desvíe antes de tocar el plan.
// ─────────────────────────────────────────────────────────────────────────────

export const TIPO_PAGO_IMPULSO = 'impulso_experto';

export async function createImpulsoCheckoutSession(params: {
  customerId: string;
  impulsoId: string;
  montoMxn: number;
  descripcion: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  if (!stripe) throw new Error('Stripe no configurado');

  const metadata = { tipo: TIPO_PAGO_IMPULSO, impulso_id: params.impulsoId };
  const session = await stripe.checkout.sessions.create({
    customer: params.customerId,
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'mxn',
          unit_amount: Math.round(params.montoMxn * 100),
          product_data: { name: params.descripcion },
        },
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    locale: 'es',
    metadata,
    payment_intent_data: { metadata },
    // El cupo queda reservado mientras la sesión vive: 30 min es el mínimo de Stripe.
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  return { id: session.id, url: session.url! };
}

/** ¿Este objeto de Stripe es el pago de un impulso? */
export function esImpulso(obj: unknown): boolean {
  const metadata = (obj as { metadata?: Record<string, unknown> } | null)?.metadata;
  return metadata?.tipo === TIPO_PAGO_IMPULSO;
}
/**
 * Cancela una suscripción al momento.
 *
 * Se usa al enviar una cuenta a la papelera: una cuenta que nadie puede usar no
 * puede seguir cobrándose. Devuelve si Stripe confirmó la cancelación, para que
 * el panel diga la verdad si no lo hizo. Una suscripción que ya no existe cuenta
 * como cancelada.
 */
export async function cancelarSuscripcion(subscriptionId: string): Promise<boolean> {
  if (!stripe) return false;
  try {
    await stripe.subscriptions.cancel(subscriptionId);
    return true;
  } catch (err) {
    const codigo = (err as { code?: string }).code;
    if (codigo === 'resource_missing') return true;
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancelación desde la app (LFPC art. 76 Bis fr. IX: inmediata y sin trabas)
//
// Se programa al final del periodo ya pagado: no hay más cargos y la persona
// conserva lo que pagó. Se puede deshacer mientras el periodo siga corriendo.
// ─────────────────────────────────────────────────────────────────────────────

export interface EstadoSuscripcion {
  estado: string;
  cancelacionProgramada: boolean;
  /** Fin del periodo pagado: fecha del próximo cargo, o del fin del plan si se canceló. */
  finPeriodo: Date | null;
}

function aEstado(sub: Stripe.Subscription): EstadoSuscripcion {
  return {
    estado: sub.status,
    cancelacionProgramada: sub.cancel_at_period_end === true,
    finPeriodo: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
  };
}

export async function estadoSuscripcion(subscriptionId: string): Promise<EstadoSuscripcion> {
  if (!stripe) throw new Error('Stripe no configurado');
  return aEstado(await stripe.subscriptions.retrieve(subscriptionId));
}

/** Deja de renovar la suscripción: termina al acabar el periodo pagado. */
export async function programarCancelacion(subscriptionId: string): Promise<EstadoSuscripcion> {
  if (!stripe) throw new Error('Stripe no configurado');
  return aEstado(await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true }));
}

/** Deshace una cancelación programada (solo mientras el periodo siga vigente). */
export async function reanudarSuscripcion(subscriptionId: string): Promise<EstadoSuscripcion> {
  if (!stripe) throw new Error('Stripe no configurado');
  return aEstado(await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false }));
}
