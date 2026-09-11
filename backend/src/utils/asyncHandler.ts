import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async Express route handler so unhandled rejections are forwarded
 * to the global error handler (next(err)) instead of crashing the process.
 * Required for Express 4 — Express 5 handles this natively.
 *
 * Usage:  router.get('/', ah(async (req, res) => { ... }))
 */
export function ah(
  fn: (req: Request | any, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
