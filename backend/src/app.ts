import 'dotenv/config';
import path from 'path';
import { timingSafeEqual } from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { AppDataSource } from './config/database';
import { migrarAlArrancar } from './config/migracionesAlArrancar';
import { logger } from './utils/logger';
import { verificarClaveAnthropic } from './config/anthropic';
import { verificarEntornoProduccion } from './config/entorno';
import { initRedis, redisClient } from './config/redis';
import { corsMiddleware, apiLimiter, analysisStatusLimiter } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { stopAnalysisWorker, startAnalysisWorker, estadoWorker } from './workers/analysisQueue';
import { startCalendarWorker, stopCalendarWorker } from './workers/calendarQueue';
import { initSentry, reportarError, vaciarSentry } from './config/sentry';
import { iniciarPuenteSSE, detenerPuenteSSE } from './events/sse';
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
import adminPromptsRoutes from './routes/adminPrompts';
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
import mantenimientosRoutes from './routes/mantenimientos';
import googleCalendarRoutes from './routes/googleCalendar';
import privacidadRoutes from './routes/privacidad';

const app = express();
// Saltos de proxy delante del backend (Railway/Nginx = 1; Cloudflare + proxy del
// hosting = 2). Mal puesto, `req.ip` sería la IP del proxy y todos los usuarios
// anónimos compartirían un solo cupo de rate limit. TRUST_PROXY admite un número
// de saltos, 'true'/'false' o una lista de IPs/subredes.
function leerTrustProxy(valor: string | undefined): boolean | number | string {
  if (!valor) return 1;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 ? n : valor;
}
app.set('trust proxy', leerTrustProxy(process.env.TRUST_PROXY));

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
//
// En producción exigen SIEMPRE token: antes, sin METRICS_TOKEN definido el
// endpoint quedaba público (rutas, volumen de tráfico, errores). Sin token
// configurado responde 404, como si no existiera.
export function tokenMetricasValido(recibido: string | undefined, esperado: string): boolean {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

app.get('/metrics', (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    const esperado = process.env.METRICS_TOKEN;
    if (!esperado) {
      res.status(404).json({ error: 'Route not found' });
      return;
    }
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    const cabecera = typeof req.headers['x-metrics-token'] === 'string' ? req.headers['x-metrics-token'] : undefined;
    if (!tokenMetricasValido(bearer, esperado) && !tokenMetricasValido(cabecera, esperado)) {
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
//
// Responde 503 si Postgres o Redis no están operativos: el HEALTHCHECK de Docker
// y el de Railway solo miran el código HTTP, y un 200 fijo mantenía en rotación
// una instancia que no podía atender a nadie. `isInitialized` no basta para la
// base (sigue en true si Postgres cae después del arranque): se hace un SELECT 1
// con tiempo límite.
const HEALTH_DB_TIMEOUT_MS = 2000;

async function baseDeDatosResponde(): Promise<boolean> {
  if (!AppDataSource.isInitialized) return false;
  let temporizador: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      AppDataSource.query('SELECT 1'),
      new Promise((_, rechazar) => {
        temporizador = setTimeout(() => rechazar(new Error('timeout')), HEALTH_DB_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

const healthHandler = async (_req: Request, res: Response): Promise<void> => {
  const database = (await baseDeDatosResponde()) ? 'connected' : 'disconnected';
  const redis = redisClient && redisClient.isReady ? 'connected' : 'disconnected';
  const sano = database === 'connected' && redis === 'connected';
  res.status(sano ? 200 : 503).json({
    status: sano ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime_s: Math.round(process.uptime()),
    database,
    redis,
    // Informativo: con RUN_WORKER=false el worker vive en otro proceso.
    worker: estadoWorker(),
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
app.use('/api/admin/prompts', adminPromptsRoutes);
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
// perfil_videos) y sus entidades siguen intactas: volver a montarlos es
// reimportar la ruta si algún día se construye la interfaz.
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/nomina', nominaRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/negocios', negociosRoutes);
app.use('/api/vertical', verticalRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/mantenimientos', mantenimientosRoutes);
app.use('/api/integraciones/google-calendar', googleCalendarRoutes);
app.use('/api/privacidad', privacidadRoutes);

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
    // Primero Sentry: así un fallo de arranque también queda reportado.
    initSentry();

    // Una excepción no capturada deja el proceso en estado indefinido: se
    // registra, se reporta y se sale con código 1 para que el orquestador lo
    // reinicie limpio. Se instala aquí y no al importar el módulo para no
    // alterar a quien importa `app` sin arrancarlo (tests con supertest).
    process.on('uncaughtException', (err) => {
      logger.error('[process] Uncaught exception:', err);
      reportarError(err, { tipo: 'uncaughtException' });
      void vaciarSentry().finally(() => process.exit(1));
    });

    // Sin API key válida en producción no se arranca: se serviría plantilla a
    // todos los clientes como si fuera IA.
    verificarClaveAnthropic();
    // Almacenamiento, Stripe y panel de admin: sin sus variables, producción
    // arrancaría "sana" y fallaría al primer cliente (ver config/entorno.ts).
    verificarEntornoProduccion();

    // Migraciones pendientes (solo con TYPEORM_MIGRATIONS_RUN=true), bajo un
    // candado compartido con el worker, antes de abrir el pool de la app.
    await migrarAlArrancar();

    // Initialize Database
    await AppDataSource.initialize();
    logger.info('[boot] Database initialized');

    // Initialize Redis (initRedis asigna redisClient y abre la conexión)
    await initRedis();
    logger.info('[boot] Redis initialized');

    // Eventos SSE entre procesos (worker aparte o varias réplicas)
    await iniciarPuenteSSE();

    // Start in-process worker (desactivable con RUN_WORKER=false para
    // ejecutarlo en un proceso/servicio aparte)
    if (process.env.RUN_WORKER !== 'false') {
      startAnalysisWorker();
      startCalendarWorker();
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
    reportarError(error, { fase: 'arranque' });
    await vaciarSentry();
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
    await stopCalendarWorker();
    await detenerPuenteSSE();
    if (redisClient && redisClient.isReady) {
      await redisClient.quit();
    }
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    logger.info('[shutdown] Cierre completado');
    await vaciarSentry();
    process.exit(0);
  } catch (err) {
    logger.error('[shutdown] Error durante el cierre:', err);
    reportarError(err, { fase: 'cierre' });
    await vaciarSentry();
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Evitar crash silencioso por promesas no manejadas
process.on('unhandledRejection', (reason) => {
  logger.error('[process] Unhandled rejection:', reason);
  reportarError(reason, { tipo: 'unhandledRejection' });
});

// Ejecutar cuando este archivo es el entrypoint directo
if (require.main === module) {
  void initializeApp();
}

export default app;
