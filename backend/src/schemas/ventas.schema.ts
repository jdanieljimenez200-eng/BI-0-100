import { z } from 'zod';

export const VentasAnalizarInputSchema = z.object({
  productos: z.array(z.object({
    id: z.string().uuid(),
    cantidad: z.number().int().positive(),
    precio_venta: z.number().positive(),
  })),
  notas: z.string().max(500).optional(),
});

export type VentasAnalizarInput = z.infer<typeof VentasAnalizarInputSchema>;

export const VentasAnalisSchema = z.object({
  id: z.string().uuid(),
  monto_total: z.number(),
  numero_items: z.number().int(),
  ganancia_total: z.number(),
  duracion_promedio_proceso: z.number(),
});

export type VentasAnalisis = z.infer<typeof VentasAnalisSchema>;

export const VentasAnalizarResponse = z.object({
  analisis_id: z.string().uuid(),
  estado: z.enum(['procesando', 'completado', 'error']),
  resultado_json: z.record(z.unknown()).optional(),
  tips_data: z.record(z.unknown()).optional(),
  historia_data: z.record(z.unknown()).optional(),
  perfil_cliente_data: z.record(z.unknown()).optional(),
});

export type VentasAnalizarResponseType = z.infer<typeof VentasAnalizarResponse>;

export const VentasResumenSchema = z.object({
  total_ventas: z.number(),
  total_ingresos: z.number(),
  promedio_venta: z.number(),
  mejores_productos: z.array(z.object({
    id: z.string(),
    nombre: z.string(),
    cantidad_vendida: z.number(),
    ingresos: z.number(),
  })),
});

export type VentasResumen = z.infer<typeof VentasResumenSchema>;