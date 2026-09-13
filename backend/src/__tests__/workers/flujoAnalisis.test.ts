import { randomUUID } from 'crypto';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { initTestDb, closeTestDb } from '../helpers/testApp';
import { describeWithDb } from '../helpers/dbGuard';
import { AppDataSource } from '../../config/database';
import { registrarFallbackIA } from '../../utils/seguimientoIA';

jest.mock('../../events/sse', () => ({
  emitAnalysisUpdate: jest.fn(),
  emitAnalysisList: jest.fn(),
}));
jest.mock('../../services/email/emailService', () => ({
  notificarAnalisisCompleto: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../services/legal/legalService', () => ({
  generarAnalisisLegal: jest.fn(),
}));

import { emitAnalysisUpdate } from '../../events/sse';
import { notificarAnalisisCompleto } from '../../services/email/emailService';
import { generarAnalisisLegal } from '../../services/legal/legalService';
import { procesarAnalisis } from '../../workers/analysisWorker';
import { marcarAnalisisError, MENSAJE_ERROR_ANALISIS } from '../../workers/analysisQueue';

const emitir = emitAnalysisUpdate as jest.Mock;
const notificar = notificarAnalisisCompleto as jest.Mock;
const legal = generarAnalisisLegal as jest.Mock;

const RESULTADO_LEGAL = { giro_detectado: 'Cafetería', cumplimiento_global: 'amarillo', puntaje_cumplimiento: 60 };

/**
 * Del trabajo en cola a lo que ve el usuario.
 *
 * Lo que se vigila:
 *  1. Brief, Legal y Finanzas avisan al dueño correcto al terminar (antes el
 *     aviso salía sin destinatario).
 *  2. Un fallo con reintentos pendientes no se le muestra al usuario como error.
 *  3. El error definitivo lleva un mensaje genérico, no el detalle técnico.
 *  4. Si la IA cayó a plantilla, el análisis queda marcado como estimado.
 */
describeWithDb('Flujo de un análisis en la cola', () => {
  let usuarioId: string;
  let productoId: string;
  const claveOriginal = process.env.ANTHROPIC_API_KEY;

  const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);
  const crearFila = async (tabla: string): Promise<string> => {
    const [fila] = await q(
      `INSERT INTO ${tabla} (usuario_id, producto_id, estado_analisis) VALUES ($1, $2, 'procesando') RETURNING id`,
      [usuarioId, productoId]
    );
    return fila.id;
  };
  const fila = async (tabla: string, id: string) =>
    (await q(`SELECT estado_analisis, error_mensaje, resultado_estimado FROM ${tabla} WHERE id = $1`, [id]))[0];
  const trabajo = (data: Record<string, unknown>) => ({ id: randomUUID(), data } as unknown as Job);

  beforeAll(async () => {
    await initTestDb();
    const [u] = await q(
      `INSERT INTO usuarios (email, password_hash, nombre) VALUES ($1, 'x', 'Flujo') RETURNING id`,
      [`flujo-${randomUUID()}@example.com`]
    );
    usuarioId = u.id;
    const [p] = await q(`INSERT INTO productos (usuario_id, nombre, pais) VALUES ($1, 'Café de prueba', 'MX') RETURNING id`, [
      usuarioId,
    ]);
    productoId = p.id;
  }, 60_000);

  afterAll(async () => {
    process.env.ANTHROPIC_API_KEY = claveOriginal;
    await q(`DELETE FROM usuarios WHERE id = $1`, [usuarioId]).catch(() => undefined);
    await closeTestDb();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('Brief avisa al dueño por SSE y correo al terminar', async () => {
    const id = await crearFila('analisis_brief');
    await procesarAnalisis(
      trabajo({
        moduleName: 'brief',
        analisisId: id,
        usuarioId,
        productoId,
        payload: {
          emocion: 'Confianza',
          estilo_visual: 'Minimalista',
          paleta_elegida: 'A',
          tipo_logo: 'Isotipo',
          tono_comunicacion: 'Cercano',
          posicionamiento: 'Confiable (el de siempre)',
          nivel_diferenciacion: 'Medio (algunas diferencias)',
        },
      })
    );

    expect((await fila('analisis_brief', id)).estado_analisis).toBe('completado');
    expect(emitir).toHaveBeenCalledWith(usuarioId, expect.objectContaining({ estado: 'completado', productoId, id }));
    expect(notificar).toHaveBeenCalledWith(expect.objectContaining({ ownerId: usuarioId }));
  });

  it('un fallo con reintentos pendientes no marca error ni lo avisa', async () => {
    const id = await crearFila('analisis_legal');
    legal.mockRejectedValueOnce(new Error('connection terminated unexpectedly'));

    await expect(
      procesarAnalisis(trabajo({ moduleName: 'legal', analisisId: id, usuarioId, productoId, payload: {} }))
    ).rejects.toThrow('connection terminated');

    expect((await fila('analisis_legal', id)).estado_analisis).toBe('procesando');
    expect(emitir).not.toHaveBeenCalledWith(usuarioId, expect.objectContaining({ estado: 'error' }));
  });

  it('el error definitivo usa un mensaje genérico y avisa al usuario', async () => {
    const id = await crearFila('analisis_legal');
    await marcarAnalisisError('legal', id, usuarioId, productoId);

    const f = await fila('analisis_legal', id);
    expect(f.estado_analisis).toBe('error');
    expect(f.error_mensaje).toBe(MENSAJE_ERROR_ANALISIS);
    expect(emitir).toHaveBeenCalledWith(
      usuarioId,
      expect.objectContaining({ estado: 'error', id, errorMessage: MENSAJE_ERROR_ANALISIS })
    );
  });

  it('sin producto falla de inmediato, sin gastar reintentos', async () => {
    const id = await crearFila('analisis_legal');
    await expect(
      procesarAnalisis(trabajo({ moduleName: 'legal', analisisId: id, usuarioId, productoId: randomUUID(), payload: {} }))
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('si la IA cayó a plantilla, el análisis queda como estimado', async () => {
    process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
    legal.mockImplementationOnce(async () => {
      registrarFallbackIA('legal');
      return RESULTADO_LEGAL;
    });
    const id = await crearFila('analisis_legal');
    await procesarAnalisis(trabajo({ moduleName: 'legal', analisisId: id, usuarioId, productoId, payload: {} }));

    const f = await fila('analisis_legal', id);
    expect(f.estado_analisis).toBe('completado');
    expect(f.resultado_estimado).toBe(true);
  });

  it('una respuesta real de la IA no queda como estimada, y los trabajos no se contaminan', async () => {
    process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
    legal.mockResolvedValueOnce(RESULTADO_LEGAL);
    const id = await crearFila('analisis_legal');
    await procesarAnalisis(trabajo({ moduleName: 'legal', analisisId: id, usuarioId, productoId, payload: {} }));

    expect((await fila('analisis_legal', id)).resultado_estimado).toBe(false);
  });
});
