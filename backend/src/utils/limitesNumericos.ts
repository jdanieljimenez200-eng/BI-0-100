import { z } from 'zod';

/**
 * Máximos de las columnas `numeric` de las herramientas. Un valor mayor no cabe
 * y Postgres responde con error: antes eso salía como 500 (p. ej. vender a un
 * precio de 1e12); validando aquí es un 400 con mensaje claro.
 */
export const MAX_DINERO = 9_999_999_999.99; // numeric(12,2)
export const MAX_CANTIDAD = 999_999_999.999; // numeric(12,3)
export const MAX_COSTO_UNITARIO = 99_999_999.9999; // numeric(12,4)
export const MAX_ENTERO = 2_147_483_647; // integer

export const dinero = (campo: string) =>
  z.number({ invalid_type_error: `${campo} debe ser numérico` }).finite().min(0, `${campo} no puede ser negativo`).max(MAX_DINERO, `${campo} es demasiado grande`);

export const cantidad = (campo: string) =>
  z.number({ invalid_type_error: `${campo} debe ser numérico` }).finite().min(0, `${campo} no puede ser negativa`).max(MAX_CANTIDAD, `${campo} es demasiado grande`);

export const costoUnitario = (campo: string) =>
  z.number({ invalid_type_error: `${campo} debe ser numérico` }).finite().min(0, `${campo} no puede ser negativo`).max(MAX_COSTO_UNITARIO, `${campo} es demasiado grande`);
