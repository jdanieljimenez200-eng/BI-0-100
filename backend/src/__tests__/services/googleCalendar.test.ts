import { revisarEntornoProduccion } from '../../config/entorno';
import { cifrarToken, descifrarToken } from '../../services/google/cifradoTokens';
import { construirEvento, idEventoDeCita } from '../../services/google/calendarSync';
import {
  ErrorGoogle,
  firmarState,
  intercambiarCodigo,
  SCOPES,
  urlAutorizacion,
  verificarState,
} from '../../services/google/oauthGoogle';
import { esZonaValida, resolverZonaHoraria, zonaPorPais } from '../../services/google/zonaHoraria';

/**
 * Enlace con Google Calendar sin red: firma del `state`, cifrado de tokens,
 * armado del evento y zona horaria. Las llamadas a Google se simulan con `fetch`.
 */

const CITA = {
  id: '3f2b8c1e-5d4a-4b6c-9e7f-1a2b3c4d5e6f',
  titulo: 'Corte de cabello',
  fecha: '2026-11-01',
  hora_inicio: '10:00:00',
  hora_fin: '10:45:00',
  estado: 'confirmada' as const,
  cliente_nombre: 'Ana López',
  cliente_telefono: '5512345678',
  notas: 'Trae foto de referencia',
};

describe('Google Calendar — state firmado', () => {
  const datos = { usuarioId: 'u-1', cuentaId: 'c-1' };

  it('verifica un state recién firmado', () => {
    expect(verificarState(firmarState(datos))).toEqual(datos);
  });

  it('rechaza un state caducado (más de 10 minutos)', () => {
    const state = firmarState(datos, Date.now() - 11 * 60 * 1000);
    expect(verificarState(state)).toBeNull();
  });

  it('rechaza un state manipulado: no se puede enlazar Google a la cuenta de otro', () => {
    const state = firmarState(datos);
    const [cuerpo, firma] = state.split('.');
    const alterado = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(cuerpo, 'base64url').toString()), c: 'victima' })
    ).toString('base64url');
    expect(verificarState(`${alterado}.${firma}`)).toBeNull();
    expect(verificarState(`${cuerpo}.${firma.slice(0, -2)}xx`)).toBeNull();
  });

  it('rechaza basura', () => {
    for (const valor of [undefined, '', 'abc', 'a.b.c', 42, 'x'.repeat(2000)]) {
      expect(verificarState(valor)).toBeNull();
    }
  });
});

describe('Google Calendar — OAuth', () => {
  const entornoOriginal = { ...process.env };
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'cliente.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'secreto';
    process.env.GOOGLE_REDIRECT_URI = 'https://api.bi0a100.com/api/integraciones/google-calendar/callback';
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    process.env = { ...entornoOriginal };
  });

  const respuesta = (status: number, cuerpo: object) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }) as unknown as Response;

  it('la URL pide acceso offline, consentimiento y solo el scope de eventos', () => {
    const url = new URL(urlAutorizacion({ usuarioId: 'u', cuentaId: 'c' }));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('scope')).toBe(SCOPES.join(' '));
    expect(url.searchParams.get('scope')).not.toContain('auth/calendar ');
    expect(verificarState(url.searchParams.get('state'))).toEqual({ usuarioId: 'u', cuentaId: 'c' });
  });

  it('sin credenciales no genera URL', () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(() => urlAutorizacion({ usuarioId: 'u', cuentaId: 'c' })).toThrow(ErrorGoogle);
  });

  it('canjea el código y lee el email del id_token', async () => {
    const idToken = `x.${Buffer.from(JSON.stringify({ email: 'dueno@gmail.com' })).toString('base64url')}.y`;
    fetchSpy.mockResolvedValueOnce(
      respuesta(200, {
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3599,
        scope: SCOPES.join(' '),
        id_token: idToken,
      })
    );
    const r = await intercambiarCodigo('codigo');
    expect(r).toEqual({ refreshToken: 'rt', accessToken: 'at', expiraEnS: 3599, email: 'dueno@gmail.com' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(String(init.body)).toContain('grant_type=authorization_code');
  });

  it('si el usuario desmarcó el permiso del calendario, falla con motivo claro', async () => {
    fetchSpy.mockResolvedValueOnce(respuesta(200, { access_token: 'at', refresh_token: 'rt', scope: 'openid email' }));
    await expect(intercambiarCodigo('codigo')).rejects.toMatchObject({ codigo: 'scope_insuficiente' });
  });

  it('invalid_grant pide reconectar', async () => {
    fetchSpy.mockResolvedValueOnce(respuesta(400, { error: 'invalid_grant', error_description: 'Bad Request' }));
    const err = await intercambiarCodigo('codigo').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErrorGoogle);
    expect((err as ErrorGoogle).requiereReconectar).toBe(true);
  });

  it('un corte de red se trata como transitorio (503)', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(intercambiarCodigo('codigo')).rejects.toMatchObject({ status: 503 });
  });
});

describe('Google Calendar — cifrado de tokens', () => {
  it('ida y vuelta, con IV distinto cada vez', () => {
    const a = cifrarToken('1//refresh-token');
    const b = cifrarToken('1//refresh-token');
    expect(a).not.toBe(b);
    expect(a).not.toContain('refresh-token');
    expect(descifrarToken(a)).toBe('1//refresh-token');
  });

  it('detecta manipulación', () => {
    const [v, iv, tag, dato] = cifrarToken('secreto').split('.');
    const alterado = Buffer.from(dato, 'base64url');
    alterado[0] ^= 1;
    expect(() => descifrarToken([v, iv, tag, alterado.toString('base64url')].join('.'))).toThrow();
    expect(() => descifrarToken('texto-plano')).toThrow();
  });

  it('usa GOOGLE_TOKENS_KEY cuando existe', () => {
    const original = process.env.GOOGLE_TOKENS_KEY;
    try {
      process.env.GOOGLE_TOKENS_KEY = 'a'.repeat(64);
      const cifrado = cifrarToken('x');
      process.env.GOOGLE_TOKENS_KEY = 'b'.repeat(64);
      expect(() => descifrarToken(cifrado)).toThrow();
    } finally {
      if (original === undefined) delete process.env.GOOGLE_TOKENS_KEY;
      else process.env.GOOGLE_TOKENS_KEY = original;
    }
  });
});

describe('Google Calendar — evento', () => {
  it('hora local más zona IANA, id estable derivado de la cita', () => {
    const e = construirEvento(CITA, 'America/Monterrey');
    expect(e.id).toBe('bi3f2b8c1e5d4a4b6c9e7f1a2b3c4d5e6f');
    expect(e.id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(e.start).toEqual({ dateTime: '2026-11-01T10:00:00', timeZone: 'America/Monterrey' });
    expect(e.end).toEqual({ dateTime: '2026-11-01T10:45:00', timeZone: 'America/Monterrey' });
    expect(e.status).toBe('confirmed');
    expect(e.description).toContain('Ana López');
    expect(e.extendedProperties.private.bi0a100_cita_id).toBe(CITA.id);
    expect(idEventoDeCita(CITA.id)).toBe(e.id);
  });

  it('acepta horas HH:MM y mapea los estados', () => {
    expect(construirEvento({ ...CITA, hora_inicio: '9:05', estado: 'pendiente' }, 'UTC')).toMatchObject({
      start: { dateTime: '2026-11-01T09:05:00' },
      status: 'tentative',
    });
    expect(construirEvento({ ...CITA, estado: 'cancelada' }, 'UTC').status).toBe('cancelled');
    expect(construirEvento({ ...CITA, estado: 'completada' }, 'UTC').status).toBe('confirmed');
  });

  it('nunca manda un fin anterior al inicio (Google lo rechazaría)', () => {
    expect(construirEvento({ ...CITA, hora_fin: '09:00:00' }, 'UTC').end.dateTime).toBe('2026-11-01T10:30:00');
    expect(construirEvento({ ...CITA, hora_inicio: '23:50:00', hora_fin: '23:50:00' }, 'UTC').end.dateTime).toBe(
      '2026-11-01T23:59:00'
    );
  });
});

describe('Zona horaria', () => {
  it('valida nombres IANA y descarta cabeceras manipuladas', () => {
    for (const z of ['America/Mexico_City', 'America/Argentina/Buenos_Aires', 'Europe/Madrid', 'UTC']) {
      expect(esZonaValida(z)).toBe(true);
    }
    for (const z of ['', 'Marte/Olympus', "America/Mexico_City'; --", '../../etc', 'x'.repeat(80), 5, null]) {
      expect(esZonaValida(z)).toBe(false);
    }
  });

  it('prefiere la zona del navegador, luego el país y al final CDMX', () => {
    expect(resolverZonaHoraria(['America/Tijuana'], ['CO'])).toBe('America/Tijuana');
    expect(resolverZonaHoraria([null, 'basura'], ['co'])).toBe('America/Bogota');
    expect(resolverZonaHoraria([undefined], [undefined, 'MX'])).toBe('America/Mexico_City');
    expect(resolverZonaHoraria([], ['ZZ'])).toBe('America/Mexico_City');
    expect(zonaPorPais('ES')).toBe('Europe/Madrid');
    expect(zonaPorPais(undefined)).toBeNull();
  });
});

describe('Contrato de entorno — Google Calendar', () => {
  const base = { NODE_ENV: 'production' };

  it('sin GOOGLE_CLIENT_ID solo avisa', () => {
    const r = revisarEntornoProduccion(base);
    expect(r.avisos.some((a) => a.includes('GOOGLE_CLIENT_ID'))).toBe(true);
    expect(r.faltantes.some((f) => f.startsWith('GOOGLE_'))).toBe(false);
  });

  it('con GOOGLE_CLIENT_ID exige el resto y una clave de 32 bytes', () => {
    const faltan = revisarEntornoProduccion({ ...base, GOOGLE_CLIENT_ID: 'id' }).faltantes.filter((f) =>
      f.startsWith('GOOGLE_')
    );
    expect(faltan.map((f) => f.split(' ')[0])).toEqual(['GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_TOKENS_KEY']);

    const corta = revisarEntornoProduccion({
      ...base,
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 's',
      GOOGLE_REDIRECT_URI: 'https://x',
      GOOGLE_TOKENS_KEY: 'corta',
    }).faltantes;
    expect(corta.some((f) => f.includes('32 bytes'))).toBe(true);

    const bien = revisarEntornoProduccion({
      ...base,
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 's',
      GOOGLE_REDIRECT_URI: 'https://x',
      GOOGLE_TOKENS_KEY: 'f'.repeat(64),
    }).faltantes;
    expect(bien.some((f) => f.startsWith('GOOGLE_'))).toBe(false);
  });
});
