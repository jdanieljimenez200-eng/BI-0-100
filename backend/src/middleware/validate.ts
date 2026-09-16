import { z, ZodType } from 'zod';
import { VentasAnalizarInputSchema } from '../schemas/index';
import { Request, Response, NextFunction, Router } from 'express';

/** Mismo formato que acepta Postgres para `uuid` (sin exigir versión). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID_RE.test(valor);
}

/**
 * Exige que esos parámetros de ruta sean UUID en todas las rutas del router.
 *
 * Sin esto, `GET /api/mercado/abc` llegaba a Postgres, que rechaza el valor con
 * `invalid input syntax for type uuid` (22P02) y la API respondía 500: ruido en
 * logs y alertas por algo que es un 400. Se ejecuta después de los `router.use`
 * previos (autenticación), así que sin sesión se sigue respondiendo 401.
 */
export function exigirUuid(router: Router, ...parametros: string[]): void {
  for (const nombre of parametros) {
    router.param(nombre, (_req: Request, res: Response, next: NextFunction, valor: string) => {
      if (esUuid(valor)) {
        next();
        return;
      }
      res.status(400).json({ error: `El parámetro ${nombre} no es un identificador válido` });
    });
  }
}

/**
 * Extrae y parsea JSON de output de LLM.
 * Si se pasa un schema Zod, valida y devuelve el tipo inferido;
 * si no, devuelve `unknown` (el llamador debe tipar/castear).
 */
export function parseLLMJson<T = unknown>(text: string, schema?: ZodType<T>): T {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in LLM response');
  }
  const raw: unknown = JSON.parse(jsonMatch[0]);
  return schema ? schema.parse(raw) : (raw as T);
}

/**
 * Valida input de ventas
 */
export function validateVentasInput(data: unknown): z.infer<typeof VentasAnalizarInputSchema> {
  return VentasAnalizarInputSchema.parse(data);
}

/**
 * Middlewares para validar request body, query y params contra schemas Zod.
 */
export const validateBody = (schema: z.ZodSchema) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.errors[0]?.message || 'Datos de entrada inválidos en el cuerpo de la petición',
        errors: error.errors,
      });
    }
    res.status(500).json({ error: 'Error interno de validación' });
  }
};

export const validateQuery = (schema: z.ZodSchema) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    req.query = schema.parse(req.query) as typeof req.query;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.errors[0]?.message || 'Parámetros de consulta inválidos',
        errors: error.errors,
      });
    }
    res.status(500).json({ error: 'Error interno de validación' });
  }
};

export const validateParams = (schema: z.ZodSchema) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    req.params = schema.parse(req.params) as typeof req.params;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.errors[0]?.message || 'Parámetros de ruta inválidos',
        errors: error.errors,
      });
    }
    res.status(500).json({ error: 'Error interno de validación' });
  }
};

export const validate = validateBody;