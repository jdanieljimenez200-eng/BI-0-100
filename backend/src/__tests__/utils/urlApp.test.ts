import { urlApp } from '../../utils/urlApp';

describe('urlApp', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.FRONTEND_URL = originalFrontendUrl;
    process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
  });

  it('devuelve localhost:3000 por defecto si no hay variable de entorno', () => {
    delete process.env.FRONTEND_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(urlApp()).toBe('http://localhost:3000');
  });

  it('extrae el primer origen canónico si FRONTEND_URL tiene varios separados por coma', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.FRONTEND_URL = 'https://app.bi0a100.com, https://bi0a100.com';
    expect(urlApp()).toBe('https://app.bi0a100.com');
  });

  it('construye rutas relativas con y sin barra inicial', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.FRONTEND_URL = 'https://app.bi0a100.com/';
    expect(urlApp('/net0/mis-fichas')).toBe('https://app.bi0a100.com/net0/mis-fichas');
    expect(urlApp('net0/mis-fichas')).toBe('https://app.bi0a100.com/net0/mis-fichas');
  });

  it('añade parámetros query correctamente', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.FRONTEND_URL = 'https://app.bi0a100.com';
    expect(urlApp('/net0/mis-fichas', { impulso: 'ok' })).toBe('https://app.bi0a100.com/net0/mis-fichas?impulso=ok');
  });
});
