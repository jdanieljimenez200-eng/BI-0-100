import { z, ZodType } from 'zod';
import { VentasAnalizarInputSchema } from '../schemas/index';
import { Request, Response, NextFunction } from 'express';

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