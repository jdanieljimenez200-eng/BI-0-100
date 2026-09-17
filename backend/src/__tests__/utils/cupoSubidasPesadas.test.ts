import { EventEmitter } from 'events';
import type { Request, Response } from 'express';
import {
  reservarCupoSubidaPesada,
  _subidasPesadasEnCurso,
  MAX_SUBIDAS_PESADAS_POR_USUARIO,
} from '../../middleware/upload';

/** Respuesta mínima: emite 'finish'/'close' y registra el status devuelto. */
function respuesta() {
  const res = new EventEmitter() as EventEmitter & { statusCode?: number; body?: unknown; headers: Record<string, string> };
  res.headers = {};
  Object.assign(res, {
    setHeader: (k: string, v: string) => (res.headers[k] = v),
    status: (c: number) => ((res.statusCode = c), res),
    json: (b: unknown) => ((res.body = b), res),
  });
  return res as unknown as Response & typeof res;
}

const peticion = (userId?: string) => ({ userId, ip: '10.0.0.1' }) as unknown as Request;

/**
 * Vídeo y audio se leen completos a RAM. El cupo evita que unas cuantas subidas
 * simultáneas de 50 MB tumben el proceso por falta de memoria.
 */
describe('cupo de subidas pesadas', () => {
  const abiertas: ReturnType<typeof respuesta>[] = [];
  const reservar = (userId?: string) => {
    const res = respuesta();
    const ok = reservarCupoSubidaPesada(peticion(userId), res);
    if (ok) abiertas.push(res);
    return { ok, res };
  };

  afterEach(() => {
    // Libera todo lo reservado para que cada test empiece en cero.
    while (abiertas.length) abiertas.pop()!.emit('finish');
    process.env.MAX_SUBIDAS_PESADAS_SIMULTANEAS = '';
  });

  it(`permite ${MAX_SUBIDAS_PESADAS_POR_USUARIO} por usuario y rechaza la siguiente con 429`, () => {
    for (let i = 0; i < MAX_SUBIDAS_PESADAS_POR_USUARIO; i++) expect(reservar('u-1').ok).toBe(true);

    const { ok, res } = reservar('u-1');
    expect(ok).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('15');

    // Otro usuario no se ve afectado.
    expect(reservar('u-2').ok).toBe(true);
  });

  it('libera el cupo al terminar la respuesta, y una sola vez aunque se cierre también', () => {
    const { res } = reservar('u-1');
    reservar('u-1');
    expect(reservar('u-1').ok).toBe(false);

    res.emit('finish');
    res.emit('close');
    abiertas.splice(abiertas.indexOf(res), 1);

    expect(_subidasPesadasEnCurso()).toBe(1);
    expect(reservar('u-1').ok).toBe(true);
  });

  it('respeta el tope global configurable', () => {
    process.env.MAX_SUBIDAS_PESADAS_SIMULTANEAS = '3';
    expect(reservar('a').ok).toBe(true);
    expect(reservar('b').ok).toBe(true);
    expect(reservar('c').ok).toBe(true);
    const { ok, res } = reservar('d');
    expect(ok).toBe(false);
    expect(res.statusCode).toBe(429);
  });

  it('sin usuario autenticado cuenta por IP', () => {
    expect(reservar().ok).toBe(true);
    expect(reservar().ok).toBe(true);
    expect(reservar().ok).toBe(false);
  });
});
