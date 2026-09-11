import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { addClient, removeClient } from '../events/sse';
import { redisClient } from '../config/redis';
import jwt from 'jsonwebtoken';

const router = Router();

// GET /api/events
// EventSource soporta Authorization header, cookie HttpOnly o ?token= (fallback)
router.get('/', async (req: AuthRequest, res: Response) => {
  const headerToken = req.headers.authorization?.split(' ')[1];
  const cookieToken = req.cookies?.access_token;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const token = headerToken || cookieToken || queryToken;
  if (!token) {
    res.status(401).json({ error: 'Token requerido' });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as { userId: string; jti?: string };
    if (payload.jti && redisClient?.isReady) {
      const isDenied = await redisClient.get(`deny:${payload.jti}`);
      if (isDenied) {
        res.status(401).json({ error: 'Token revocado' });
        return;
      }
    }
    req.userId = payload.userId;
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
    return;
  }
  // Headers obligatorios para Server-Sent Events (Tunnel Unidireccional)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    // IMPORTANTE: Evitar que proxies cierren por inactividad
    'X-Accel-Buffering': 'no',
  });

  // Flush inicial para confirmar conexión 
  res.write('data: {"status":"connected"}\n\n');

  // Registrar cliente en memoria
  addClient(req.userId!, res);

  // Intervalo tonto para Heartbeat (previene timeout en AWS/Vercel/Nginx a los 60s)
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
