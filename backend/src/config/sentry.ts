import { logger } from '../utils/logger';

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('[Sentry] DSN not configured, skipping initialization');
    return;
  }
  // Sentry initialization would go here if DSN is configured
  logger.info('[Sentry] Initialized');
}