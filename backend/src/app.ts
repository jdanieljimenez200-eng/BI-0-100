import 'dotenv/config';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { AppDataSource } from './config/database';
import { logger } from './utils/logger';
import { verificarClaveAnthropic } from './config/anthropic';
import { initRedis, redisClient } from './config/redis';
import { corsMiddleware, apiLimiter, analysisStatusLimiter } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { stopAnalysisWorker, startAnalysisWorker } from './workers/analysisQueue';
import { recordRequest, exportMetrics } from './utils/metrics';

// Route imports
import authRoutes from './routes/auth';
import productRoutes from './routes/productos';
import dashboardRoutes from './routes/dashboard';
import mercadoRoutes from './routes/mercado';
import marketingRoutes from './routes/marketing';
import financesRoutes from './routes/finanzas';
import legalRoutes from './routes/legal';
import briefRoutes from './routes/brief';
import herramientasRoutes from './routes/herramientas';
import billingRoutes from './routes/billing';
import configRoutes from './routes/config';
import marcaRoutes from './routes/marca';
import equipoRoutes from './routes/equipo';
import adminRoutes from './routes/admin';
import adminSesionRoutes from './routes/adminSesion';
import { programarPurgaPapelera } from './services/admin/papelera';
import eventsRoutes from './routes/events';
import calendarioRoutes from './routes/calendario';
import clientesRoutes from './routes/clientes';
import contabilidadRoutes from './routes/contabilidad';
import reportesRoutes from './routes/reportes';
import networkRoutes, { adminNetworkRouter } from './routes/network';
import cotizacionesRoutes from './routes/cotizaciones';
import inventarioRoutes from './routes/inventario';
import nominaRoutes from './routes/nomina';
import posRoutes from './routes/pos';
import negociosRoutes from './routes/negocios';
import verticalRoutes from './routes/vertical';
import ventasRoutes from './routes/ventas';

const app = express();
app.set('trust proxy', 1); // Railway/Vercel/Nginx: IP real para rate-limit

// Security Middleware
app.use(helmet());
app.use(corsMiddleware);

// Stripe Webhook requiere el payload en Buffer crudo para verificar la firma HMAC
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// Body Parser & Cookies
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// HTTP logging solo fuera de producción
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Grabación de métricas por request
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    recordRequest(req.method, req.path, res.statusCode, Date.now() - start);
  });
  next();
});

// Métricas Prometheus (fuera de /api para no consumir rate-limit)
app.get('/metrics', (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production' && process.env.METRICS_TOKEN) {
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers['x-metrics-token'];
    const expected = process.env.METRICS_TOKEN;
    const isAuthorized = authHeader === `Bearer ${expected}` || tokenHeader === expected;
    if (!isAuthorized) {
      res.status(401).send('Unauthorized');
      return;
    }
  }
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(exportMetrics());
});

// Imágenes y vídeos subidos en desarrollo (en prod las URL son absolutas de S3/R2).
// helmet() aplica Cross-Origin-Resource-Policy: same-origin, lo que impediría al
// frontend de :3000 incrustar un <img>/<video> servido por este backend en :3001,
// así que se relaja SOLO para /uploads y SOLO fuera de producción.
if (process.env.NODE_ENV !== 'production') {
  const uploadsDir =
    process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
  app.use(
    '/uploads',
    (_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(uploadsDir)
  );
}

// Rate limit: el polling de estado tiene su propio cupo por minuto y el
// stream SSE queda exento (apiLimiter ignora ambos).
app.use('/api', analysisStatusLimiter);
app.use('/api', apiLimiter);

// Health Check (alias /api/health para balanceadores que prefieren el prefijo)
const healthHandler = (_req: Request, res: Response): void => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: AppDataSource.isInitialized ? 'connected' : 'disconnected',
    redis: redisClient && redisClient.isReady ? 'connected' : 'disconnected',
  });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/productos', productRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/mercado', mercadoRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/finanzas', financesRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/brief', briefRoutes);
app.use('/api/herramientas', herramientasRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/config', configRoutes);
app.use('/api/marca', marcaRoutes);
app.use('/api/equipo', equipoRoutes);
// Antes que /api/admin: Express resuelve por orden de montaje.
// La sesión de admin emite el token que el resto de /api/admin exige: va delante.
app.use('/api/admin/sesion', adminSesionRoutes);
app.use('/api/admin/network', adminNetworkRouter);
app.use('/api/admin', adminRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/calendario', calendarioRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/contabilidad', contabilidadRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/network', networkRoutes);

// Retirados en la auditoría de 2026-09: /api/metas, /api/perfiles y
// /api/analytics eran 1.039 líneas de rutas que NINGUNA pantalla llamaba, sin
// tests y sin uso interno. Sus tablas (metas_negocio, perfiles_analiticos,
// perfiles_video) y sus entidades siguen intactas: volver a montarlos es
// reimportar la ruta si algún día se construye la interfaz.
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/nomina', nominaRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/negocios', negociosRoutes);
app.use('/api/vertical', verticalRoutes);
app.use('/api/ventas', ventasRoutes);

// 404 Handler
app.use((req: Request, res: Response): void => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
  });
});

// Global Error Handler (after routes)
app.use(errorHandler);

// Server Initialization
let server: ReturnType<typeof app.listen> | null = null;

export async function initializeApp(): Promise<void> {
  try {
    // Sin API key válida en producción no se arranca: se serviría plantilla a
    // todos los clientes como si fuera IA.
    verificarClaveAnthropic();

    // Initialize Database
    await AppDataSource.initialize();
    logger.info('[boot] Database initialized');

    // Initialize Redis (initRedis asigna redisClient y abre la conexión)
    await initRedis();
    logger.info('[boot] Redis initialized');

    // Start in-process worker (desactivable con RUN_WORKER=false para
    // ejecutarlo en un proceso/servicio aparte)
    if (process.env.RUN_WORKER !== 'false') {
      startAnalysisWorker();
    }

    // Purga diaria de la papelera (cuentas con más de 30 días) y de cédulas
    // huérfanas. Un advisory lock evita que dos instancias purguen a la vez.
    programarPurgaPapelera();

    // Start server
    const port = parseInt(process.env.PORT || '3001', 10);
    await new Promise<void>((resolve) => {
      server = app.listen(port, () => {
        logger.info(`[boot] Server running on port ${port}`);
        resolve();
      });
    });
  } catch (error) {
    logger.error('[boot] Failed to initialize app:', error);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`[shutdown] Recibido ${signal}, cerrando elegantemente...`);
  try {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await stopAnalysisWorker();
    if (redisClient && redisClient.isReady) {
      await redisClient.quit();
    }
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    logger.info('[shutdown] Cierre completado');
    process.exit(0);
  } catch (err) {
    logger.error('[shutdown] Error durante el cierre:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Evitar crash silencioso por promesas no manejadas
process.on('unhandledRejection', (reason) => {
  logger.error('[process] Unhandled rejection:', reason);
});

// Ejecutar cuando este archivo es el entrypoint directo
if (require.main === module) {
  void initializeApp();
}

export default app;
