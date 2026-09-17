import { EventEmitter } from 'events';
import type { Response } from 'express';

/**
 * Redis falso con pub/sub en memoria: todos los "procesos" (clientes duplicados)
 * comparten el mismo bus, como comparten un Redis real.
 */
const bus = new EventEmitter();
const mockRedis = {
  isReady: true,
  publish: jest.fn(async (canal: string, mensaje: string) => {
    bus.emit(canal, mensaje);
    return 1;
  }),
  duplicate: () => ({
    on: jest.fn(),
    connect: jest.fn(async () => undefined),
    quit: jest.fn(async () => undefined),
    subscribe: jest.fn(async (canal: string, fn: (m: string) => void) => {
      bus.on(canal, fn);
    }),
  }),
};
jest.mock('../../config/redis', () => ({ redisClient: mockRedis }));

import { addClient, removeClient, emitAnalysisUpdate, iniciarPuenteSSE, detenerPuenteSSE } from '../../events/sse';

const cliente = () => {
  const frames: string[] = [];
  return { frames, res: { write: (f: string) => frames.push(f) } as unknown as Response };
};
const EVENTO = { tipo: 'mercado', estado: 'completado' as const, productoId: 'p-1', id: 'a-1' };

/**
 * Con el worker en otro proceso (RUN_WORKER=false) o varias réplicas, el evento
 * nace donde no está la conexión del navegador. El puente lo reparte por Redis.
 */
describe('SSE — puente Redis entre procesos', () => {
  afterEach(async () => {
    await detenerPuenteSSE();
    bus.removeAllListeners();
    mockRedis.publish.mockClear();
    mockRedis.isReady = true;
  });

  it('sin puente entrega directamente a los clientes locales', () => {
    const { frames, res } = cliente();
    addClient('u-1', res);
    emitAnalysisUpdate('u-1', EVENTO);
    removeClient('u-1', res);

    expect(mockRedis.publish).not.toHaveBeenCalled();
    expect(frames).toEqual([`event: analysis-update\ndata: ${JSON.stringify(EVENTO)}\n\n`]);
  });

  it('con puente publica en Redis y entrega a través del suscriptor, una sola vez', async () => {
    await iniciarPuenteSSE();
    const { frames, res } = cliente();
    addClient('u-2', res);

    emitAnalysisUpdate('u-2', EVENTO);
    await new Promise((r) => setImmediate(r));
    removeClient('u-2', res);

    expect(mockRedis.publish).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(1);
  });

  it('si la publicación falla entrega al menos a los clientes locales', async () => {
    await iniciarPuenteSSE();
    mockRedis.publish.mockRejectedValueOnce(new Error('Redis caído'));
    const { frames, res } = cliente();
    addClient('u-3', res);

    emitAnalysisUpdate('u-3', EVENTO);
    await new Promise((r) => setImmediate(r));
    removeClient('u-3', res);

    expect(frames).toHaveLength(1);
  });
});
