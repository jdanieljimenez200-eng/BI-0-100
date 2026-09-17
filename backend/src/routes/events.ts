import { randomBytes } from 'crypto';
import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { addClient, removeClient } from '../events/sse';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

const router = Router();

/** Vida de un ticket de SSE: solo tiene que llegar del POST al GET. */
const TICKET_TTL_SECONDS = 60;
const claveTicket = (ticket: string) => `sse_ticket:${ticket}`;

/**
 * POST /api/events/ticket — ticket de un solo uso para abrir el stream.
 *
 * EventSource no permite cabeceras, y antes el access token viajaba en
 * `?token=`: quedaba escrito en logs de proxies, CDN y del propio servidor. El
 * ticket no sirve para nada más que abrir UNA conexión SSE en el próximo minuto.
 */
router.post('/ticket', authenticate, async (req: AuthRequest, res: Response) => {
  if (!redisClient?.isReady) {
    res.status(503).json({ error: 'Notificaciones en tiempo real no disponibles' });
    return;
  }
  try {
    const ticket = randomBytes(24).toString('base64url');
    await redisClient.setEx(claveTicket(ticket), TICKET_TTL_SECONDS, req.userId!);
    res.json({ ticket, expira_en_s: TICKET_TTL_SECONDS });
  } catch (err) {
    logger.error('[SSE] No se pudo emitir el ticket:', err);
    res.status(503).json({ error: 'Notificaciones en tiempo real no disponibles' });
  }
});

/**
 * Identifica al usuario del stream: por ticket (navegador) o por cabecera
 * Authorization (clientes que sí pueden enviarla, con las mismas comprobaciones
 * de denylist y bloqueo que el resto de la API).
 */
async function autenticarStream(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : undefined;
  if (!ticket) {
    await authenticate(req, res, next);
    return;
  }
  if (!redisClient?.isReady) {
    res.status(503).json({ error: 'Notificaciones en tiempo real no disponibles' });
    return;
  }
  try {
    // GETDEL: el ticket se consume al usarlo; una URL copiada no abre otro stream.
    const userId = await redisClient.getDel(claveTicket(ticket));
    if (!userId) {
      res.status(401).json({ error: 'Ticket inválido o caducado' });
      return;
    }
    req.userId = userId;
    next();
  } catch (err) {
    logger.error('[SSE] No se pudo validar el ticket:', err);
    res.status(503).json({ error: 'Notificaciones en tiempo real no disponibles' });
  }
}

// GET /api/events?ticket=… — stream de Server-Sent Events
router.get('/', autenticarStream, (req: AuthRequest, res: Response) => {
  // Headers obligatorios para Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    // IMPORTANTE: Evitar que proxies cierren por inactividad
    'X-Accel-Buffering': 'no',
  });

  // Flush inicial para confirmar conexión
  res.write('data: {"status":"connected"}\n\n');

  addClient(req.userId!, res);

  // Heartbeat: evita que balanceadores y proxies corten la conexión inactiva (~60 s)
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      removeClient(req.userId!, res);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(req.userId!, res);
  });
});

export default router;
