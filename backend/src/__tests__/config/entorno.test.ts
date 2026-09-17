import { revisarEntornoProduccion, verificarEntornoProduccion } from '../../config/entorno';

const SECRETO = 'x'.repeat(64);

/** Producción completa y válida: cada test rompe una sola cosa. */
const entornoCompleto = (): Record<string, string | undefined> => ({
  NODE_ENV: 'production',
  JWT_SECRET: SECRETO,
  JWT_REFRESH_SECRET: SECRETO,
  ADMIN_TOTP_KEY: SECRETO,
  ADMIN_JWT_SECRET: SECRETO,
  AWS_ACCESS_KEY_ID: 'AKIA',
  AWS_SECRET_ACCESS_KEY: 'secreto',
  AWS_BUCKET_NAME: 'bi0a100-prod',
  AWS_BUCKET_URL_BASE: 'https://cdn.bi0a100.com',
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_123',
  STRIPE_PRICE_PRO_MENSUAL: 'price_pro_m',
  STRIPE_PRODUCT_PRO: 'prod_pro',
  STRIPE_PRICE_PATROCINIO: 'price_patrocinio',
  RESEND_API_KEY: 're_123',
  METRICS_TOKEN: SECRETO,
  NEXT_PUBLIC_APP_URL: 'https://bi0a100.com',
});

describe('config/entorno — contrato de variables de producción', () => {
  it('un entorno completo no tiene faltantes', () => {
    expect(revisarEntornoProduccion(entornoCompleto()).faltantes).toEqual([]);
  });

  it('fuera de producción no exige nada', () => {
    expect(() => verificarEntornoProduccion({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => verificarEntornoProduccion({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('en producción no arranca si falta algo imprescindible', () => {
    const env = { ...entornoCompleto(), ADMIN_JWT_SECRET: undefined };
    expect(() => verificarEntornoProduccion(env)).toThrow(/ADMIN_JWT_SECRET/);
  });

  it('detecta S3_BUCKET_NAME como nombre equivocado de AWS_BUCKET_NAME', () => {
    const env = { ...entornoCompleto(), AWS_BUCKET_NAME: undefined, S3_BUCKET_NAME: 'bi0a100-prod' };
    const { faltantes } = revisarEntornoProduccion(env);
    expect(faltantes).toEqual([expect.stringMatching(/AWS_BUCKET_NAME.*S3_BUCKET_NAME.*renómbrala/)]);
  });

  it('exige la URL pública del bucket', () => {
    const env = { ...entornoCompleto(), AWS_BUCKET_URL_BASE: '' };
    expect(revisarEntornoProduccion(env).faltantes).toEqual([expect.stringMatching(/^AWS_BUCKET_URL_BASE/)]);
  });

  it('rechaza secretos JWT cortos', () => {
    const env = { ...entornoCompleto(), JWT_SECRET: 'corto' };
    expect(revisarEntornoProduccion(env).faltantes).toEqual([expect.stringMatching(/^JWT_SECRET.*32/)]);
  });

  it('con Stripe activo exige el secreto del webhook', () => {
    const env = { ...entornoCompleto(), STRIPE_WEBHOOK_SECRET: undefined };
    expect(revisarEntornoProduccion(env).faltantes).toEqual([expect.stringMatching(/^STRIPE_WEBHOOK_SECRET/)]);
  });

  it('un plan con precio y sin producto bloquea: el cliente quedaría en Gratis', () => {
    const env = { ...entornoCompleto(), STRIPE_PRICE_BUSINESS_ANUAL: 'price_bus_a' };
    expect(revisarEntornoProduccion(env).faltantes).toEqual([expect.stringMatching(/^STRIPE_PRODUCT_BUSINESS/)]);
  });

  it('acepta el precio mensual heredado STRIPE_PRICE_<PLAN>', () => {
    const env = { ...entornoCompleto(), STRIPE_PRICE_PRO_MENSUAL: undefined, STRIPE_PRICE_PRO: 'price_pro' };
    expect(revisarEntornoProduccion(env).faltantes).toEqual([]);
  });

  it('Stripe activo sin ningún plan con precio bloquea', () => {
    const env = { ...entornoCompleto(), STRIPE_PRICE_PRO_MENSUAL: undefined };
    expect(revisarEntornoProduccion(env).faltantes).toEqual([expect.stringMatching(/ningún plan tiene precio/)]);
  });

  it('sin Stripe solo avisa: la facturación degrada a 503', () => {
    const env = { ...entornoCompleto(), STRIPE_SECRET_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined };
    const { faltantes, avisos } = revisarEntornoProduccion(env);
    expect(faltantes).toEqual([]);
    expect(avisos).toEqual([expect.stringMatching(/pagos quedan desactivados/)]);
  });

  it('con correo configurado exige la URL base de los enlaces', () => {
    const env = { ...entornoCompleto(), NEXT_PUBLIC_APP_URL: undefined };
    expect(revisarEntornoProduccion(env).faltantes).toEqual([expect.stringMatching(/^NEXT_PUBLIC_APP_URL.*localhost/)]);
  });

  it('sin correo configurado solo avisa', () => {
    const env = { ...entornoCompleto(), RESEND_API_KEY: undefined, NEXT_PUBLIC_APP_URL: undefined };
    const { faltantes, avisos } = revisarEntornoProduccion(env);
    expect(faltantes).toEqual([]);
    expect(avisos).toContainEqual(expect.stringMatching(/no se enviarán correos/));
  });

  it('METRICS_TOKEN ausente avisa; corto bloquea', () => {
    const sinToken = revisarEntornoProduccion({ ...entornoCompleto(), METRICS_TOKEN: undefined });
    expect(sinToken.faltantes).toEqual([]);
    expect(sinToken.avisos).toContainEqual(expect.stringMatching(/METRICS_TOKEN.*404/));

    const corto = revisarEntornoProduccion({ ...entornoCompleto(), METRICS_TOKEN: 'abc' });
    expect(corto.faltantes).toEqual([expect.stringMatching(/^METRICS_TOKEN.*32/)]);
  });

  it('patrocinios sin precio solo avisan', () => {
    const env = { ...entornoCompleto(), STRIPE_PRICE_PATROCINIO: undefined, STRIPE_PRICE_PATROCINIO_LEGAL: 'price_l' };
    const { faltantes, avisos } = revisarEntornoProduccion(env);
    expect(faltantes).toEqual([]);
    expect(avisos.filter((a) => a.startsWith('Patrocinio'))).toHaveLength(2);
  });
});
