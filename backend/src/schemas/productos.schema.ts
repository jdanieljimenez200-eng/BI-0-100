import { z } from 'zod';

export const ProductoInputSchema = z.object({
  nombre: z.string().min(1).max(255),
  descripcion: z.string().optional(),
  categoria: z.string().optional(),
  precio: z.number().positive().optional(),
  stock: z.number().int().min(0).optional(),
  pais: z.string().length(2).optional(),
});

export type ProductoInput = z.infer<typeof ProductoInputSchema>;