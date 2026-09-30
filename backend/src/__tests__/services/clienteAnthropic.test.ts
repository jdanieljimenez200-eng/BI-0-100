const mockCrear = jest.fn();
const mockCrearBeta = jest.fn();
const mockQuery = jest.fn().mockResolvedValue([]);

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCrear },
    beta: { messages: { create: mockCrearBeta } },
  })),
}));
jest.mock('../../config/database', () => ({
  AppDataSource: { isInitialized: true, query: (...args: unknown[]) => mockQuery(...args) },
}));

import { costoUsd, crearMensaje, textoDe, TAREAS, verificarClaveAnthropic, _reiniciarClientes } from '../../config/anthropic';
import { conSeguimientoIA } from '../../utils/seguimientoIA';
import { redactarSecretos } from '../../utils/logger';
import type { Message } from '@anthropic-ai/sdk/resources/messages/messages';

const respuesta = (over: Partial<Message> = {}): Message =>
  ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5',
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '', signature: 'x' },
      { type: 'text', text: '{"ok":true}' },
    ],
    usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    ...over,
  }) as unknown as Message;

const PARAMS = {
  max_tokens: 2000,
  temperature: 0.7,
  system: 'Eres un analista.',
  messages: [{ role: 'user' as const, content: 'Hola' }],
};

/**
 * Punto único de llamada a Claude.
 *
 *  1. Cada tarea va a su modelo y solo con los parámetros que ese modelo acepta
 *     (Sonnet 5 y Opus 5 devuelven 400 con `temperature`).
 *  2. Opus 5 usa los fallbacks del servidor por si su clasificador declina.
 *  3. Cada llamada se registra con su costo para medir y cobrar bien.
 *  4. La clave no sale en logs y en producción es obligatoria.
 */
describe('config/anthropic', () => {
  const claveOriginal = process.env.ANTHROPIC_API_KEY;
  const entornoOriginal = process.env.NODE_ENV;

  beforeEach(() => {
    mockCrear.mockReset();
    mockCrearBeta.mockReset();
    mockQuery.mockClear();
    _reiniciarClientes();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-prueba';
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = claveOriginal;
    process.env.NODE_ENV = entornoOriginal;
  });

  it('calcula el costo por modelo, con caché', () => {
    expect(costoUsd('claude-sonnet-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(12);
    expect(costoUsd('claude-haiku-4-5', { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.1, 6);
    expect(costoUsd('claude-opus-5', { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(6.25, 6);
    expect(costoUsd('modelo-desconocido', { input_tokens: 5, output_tokens: 5 })).toBe(0);
    // Id con sufijo de versión: se cobra con el precio del modelo base.
    expect(costoUsd('claude-sonnet-5-20260801', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(12);
    // Un prefijo parcial no confunde modelos distintos.
    expect(costoUsd('claude-opus-4-8-20260101', { input_tokens: 1_000_000, output_tokens: 0 })).toBe(5);
  });

  it('estrategia va a Sonnet 5 sin temperature, con razonamiento y holgura de tokens', async () => {
    mockCrear.mockResolvedValueOnce(respuesta());
    await crearMensaje('mercado.dafo', 'estrategia', PARAMS);

    const cuerpo = mockCrear.mock.calls[0][0];
    expect(cuerpo.model).toBe('claude-sonnet-5');
    expect(cuerpo).not.toHaveProperty('temperature');
    expect(cuerpo.thinking).toEqual({ type: 'adaptive' });
    expect(cuerpo.output_config).toEqual({ effort: 'medium' });
    expect(cuerpo.max_tokens).toBe(2000 * TAREAS.estrategia.holguraTokens);
    expect(mockCrearBeta).not.toHaveBeenCalled();
  });

  it('mecánica va a Haiku 4.5 y conserva temperature, sin razonamiento', async () => {
    mockCrear.mockResolvedValueOnce(respuesta({ model: 'claude-haiku-4-5' }));
    await crearMensaje('marketing.copies', 'mecanica', PARAMS);

    const cuerpo = mockCrear.mock.calls[0][0];
    expect(cuerpo.model).toBe('claude-haiku-4-5');
    expect(cuerpo.temperature).toBe(0.7);
    expect(cuerpo).not.toHaveProperty('thinking');
  });

  it('crítica va a Opus 5 con fallbacks del servidor', async () => {
    mockCrearBeta.mockResolvedValueOnce(respuesta({ model: 'claude-opus-5' }));
    await crearMensaje('legal.dictamen', 'critica', PARAMS);

    const cuerpo = mockCrearBeta.mock.calls[0][0];
    expect(cuerpo.model).toBe('claude-opus-5');
    expect(cuerpo.fallbacks).toBe('default');
    expect(cuerpo.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(cuerpo).not.toHaveProperty('temperature');
  });

  it('una respuesta declinada lanza error para que entre la plantilla', async () => {
    mockCrear.mockResolvedValueOnce(respuesta({ stop_reason: 'refusal' as Message['stop_reason'] }));
    await expect(crearMensaje('ventas.tips', 'estrategia', PARAMS)).rejects.toThrow('declinó');
  });

  it('el texto ignora los bloques de razonamiento', () => {
    expect(textoDe(respuesta())).toBe('{"ok":true}');
  });

  it('registra uso con el usuario y módulo del trabajo en curso', async () => {
    mockCrear.mockResolvedValueOnce(respuesta());
    await conSeguimientoIA(() => crearMensaje('mercado.dafo', 'estrategia', PARAMS), {
      usuarioId: 'u-1',
      modulo: 'mercado',
      analisisId: 'a-1',
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, valores] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO uso_ia');
    // usuario, módulo, sección, modelo, input, output, cache write, cache read, costo, duración, análisis
    expect(valores.slice(0, 8)).toEqual(['u-1', 'mercado', 'mercado.dafo', 'claude-sonnet-5', 1000, 500, 0, 0]);
    expect(valores[8]).toBeCloseTo(0.007, 6); // 1000 × $2 + 500 × $10 por millón
    expect(valores[10]).toBe('a-1');
  });

  it('registra con qué versión del modo se hizo la llamada', async () => {
    mockCrear.mockResolvedValueOnce(respuesta());
    await conSeguimientoIA(() => crearMensaje('legal.dictamen', 'estrategia', PARAMS), {
      modulo: 'legal',
      versionesPrompt: { 'legal.modo': 'v-3', 'legal.pais.MX': null },
    });
    const [sql, valores] = mockQuery.mock.calls[0];
    expect(sql).toContain('prompt_version_id');
    expect(valores[11]).toBe('v-3');
  });

  it('sin versión anclada, prompt_version_id va vacío', async () => {
    mockCrear.mockResolvedValueOnce(respuesta());
    await crearMensaje('mercado.dafo', 'estrategia', PARAMS);
    expect(mockQuery.mock.calls[0][1][11]).toBeNull();
  });

  it('en producción exige una clave con formato válido', () => {
    process.env.NODE_ENV = 'production';
    process.env.ANTHROPIC_API_KEY = '';
    expect(() => verificarClaveAnthropic()).toThrow();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-valida';
    expect(() => verificarClaveAnthropic()).not.toThrow();
    process.env.NODE_ENV = 'test';
    process.env.ANTHROPIC_API_KEY = '';
    expect(() => verificarClaveAnthropic()).not.toThrow();
  });

  it('los logs redactan claves de Anthropic, OpenAI, Stripe y tokens Bearer', () => {
    const texto =
      'fallo con sk-ant-api03-AbCdEf1234567890xyz y sk-proj-abcdefghijklmnopqrstuv1234 ' +
      'stripe sk_live_ABCDEFGH12345678 whsec_ABCDEFGH12345678 Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc';
    const limpio = redactarSecretos(texto);
    expect(limpio).not.toMatch(/sk-ant-api03|sk-proj-|sk_live_|whsec_|eyJhbGci/);
    expect(limpio).toContain('[REDACTADO]');
  });
});
