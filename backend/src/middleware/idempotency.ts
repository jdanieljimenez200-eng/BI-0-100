import { createHash } from 'crypto';
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * Idempotency lock para endpoints POST /:modulo/analizar.
 *
 * Previene:
 *   - Doble-clic del usuario → 2 análisis + 2 cobros de Anthropic.
 *   - Race entre el plan-check y el insert de la fila `procesando`.
 *
 * Diseño:
 *   Clave Redis:  analisis_lock:{modulo}:{usuarioId}:{productoId}
 *   TTL:          30 s (cubre el click burst; la fila DB y el job BullMQ
 *                 persisten el estado real más allá de eso).
 *   NX:           si la clave existe, rechaza con 409.
 *
 * Si la petición se acepta (202), el lock caduca solo por TTL: no se borra al
 * completar el análisis porque eso obligaría a propagar el release hasta el worker.
 *
 * Si la petición termina en error (400 de validación, 402 sin créditos, 404,
 * 5xx…) el lock se borra al responder: no se creó ningún análisis, y antes quien
 * corregía el formulario y reenviaba en menos de 30 s recibía un 409 "Ya hay un
 * análisis en curso" que no existía.
 */
export function requireAnalisisLock(modulo: string, opciones: { porCuenta?: boolean } = {}) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    // Los routers usan tanto snake_case como camelCase
    const productoId = req.body?.producto_id ?? req.body?.productoId;
    if (!productoId || !req.userId) {
      // Si falta algún dato, que la validación downstream maneje el 400.
      next();
      return;
    }

    // `porCuenta`: para módulos cuya cuota es por cuenta y no por producto.
    const key = opciones.porCuenta
      ? `analisis_lock:${modulo}:${req.userId}`
      : `analisis_lock:${modulo}:${req.userId}:${productoId}`;

    try {
      const acquired = await redisClient.set(key, '1', { NX: true, EX: 30 });
      if (!acquired) {
        res.status(409).json({
          error: 'Ya hay un análisis en curso para este producto. Espera unos segundos antes de reintentar.',
          retry_after_seconds: 30,
        });
        return;
      }
      res.once('finish', () => {
        if (res.statusCode < 400) return;
        redisClient.del(key).catch((err: unknown) => logger.warn('[idempotency] No se pudo liberar el lock:', err));
      });
    } catch (err) {
      // Si Redis está caído, fallamos abierto para no bloquear a los usuarios.
      // El riesgo (doble-click) es menor que el de un outage de Redis bloqueando
      // todos los análisis. Se loguea para que el oncall lo vea.
      logger.error('[idempotency] Redis unreachable, proceeding without lock:', err);
    }

    next();
  };
}

// ─── Idempotencia de altas (Idempotency-Key) ─────────────────────────────────

const CLAVE_VALIDA = /^[A-Za-z0-9_-]{8,100}$/;
const TTL_PROCESANDO_S = 60;
const TTL_RESPUESTA_S = 24 * 3600;
const ESPERA_MAX_MS = 10_000;

interface Registro {
  estado: 'procesando' | 'hecho';
  huella: string;
  status?: number;
  body?: unknown;
}

const huellaDe = (body: unknown) =>
  createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');

/**
 * Hace idempotente un alta: la misma operación enviada dos veces (doble clic,
 * reintento tras un corte de red) solo se ejecuta una vez.
 *
 * El cliente manda `Idempotency-Key` (estable mientras no cambie lo que envía).
 *  - Primera vez: se ejecuta y la respuesta (< 500) se guarda 24 h.
 *  - Repetida: se devuelve la respuesta guardada con `Idempotent-Replayed: true`.
 *  - Llega mientras la primera sigue en curso: espera hasta 10 s su resultado.
 *  - Misma clave con otro contenido: 422 (es un error del cliente).
 *  - 5xx: la clave se libera para poder reintentar.
 * Sin cabecera, o sin Redis, no hace nada (compatible hacia atrás; falla abierto).
 */
export function idempotente(ambito: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const cabecera = req.headers['idempotency-key'];
    if (cabecera === undefined) return next();
    if (typeof cabecera !== 'string' || !CLAVE_VALIDA.test(cabecera)) {
      res.status(400).json({ error: 'Idempotency-Key inválida (8-100 caracteres: letras, números, - o _)' });
      return;
    }
    const cache = redisClient?.isReady ? redisClient : null;
    if (!cache || !req.userId) return next();

    const clave = `idem:${ambito}:${req.userId}:${cabecera}`;
    const huella = huellaDe(req.body);
    try {
      const tomada = await cache.set(clave, JSON.stringify({ estado: 'procesando', huella } satisfies Registro), {
        NX: true,
        EX: TTL_PROCESANDO_S,
      });

      if (tomada !== 'OK') {
        const limite = Date.now() + ESPERA_MAX_MS;
        for (;;) {
          const guardado = await cache.get(clave);
          if (!guardado) break; // la primera falló con 5xx: se reintenta abajo
          const registro = JSON.parse(guardado) as Registro;
          if (registro.huella !== huella) {
            res.status(422).json({ error: 'Esta Idempotency-Key ya se usó con otro contenido' });
            return;
          }
          if (registro.estado === 'hecho') {
            res.setHeader('Idempotent-Replayed', 'true');
            res.status(registro.status ?? 200).json(registro.body);
            return;
          }
          if (Date.now() > limite) {
            res.status(409).json({ error: 'La misma operación todavía se está procesando. Revisa el resultado en unos segundos.' });
            return;
          }
          await new Promise((r) => setTimeout(r, 150));
        }
        const retomada = await cache.set(clave, JSON.stringify({ estado: 'procesando', huella } satisfies Registro), {
          NX: true,
          EX: TTL_PROCESANDO_S,
        });
        if (retomada !== 'OK') {
          res.status(409).json({ error: 'La misma operación todavía se está procesando. Revisa el resultado en unos segundos.' });
          return;
        }
      }

      // Capturar la respuesta para poder repetirla.
      let cuerpo: unknown;
      const jsonOriginal = res.json.bind(res);
      res.json = (body: unknown) => {
        cuerpo = body;
        return jsonOriginal(body);
      };
      res.once('finish', () => {
        const accion =
          res.statusCode >= 500
            ? cache.del(clave)
            : cache.set(clave, JSON.stringify({ estado: 'hecho', huella, status: res.statusCode, body: cuerpo } satisfies Registro), {
                EX: TTL_RESPUESTA_S,
              });
        Promise.resolve(accion).catch((err: unknown) => logger.warn('[idempotency] No se pudo guardar la respuesta:', err));
      });
    } catch (err) {
      logger.error('[idempotency] Redis no disponible, sigue sin idempotencia:', err);
    }
    next();
  };
}
