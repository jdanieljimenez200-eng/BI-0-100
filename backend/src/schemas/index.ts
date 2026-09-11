// Nota: los schemas de mercado/marketing/legal/finanzas/brief que vivían aquí
// eran código muerto — nunca se aplicaban en las rutas y ni siquiera coincidían
// con el payload real que envía cada formulario. La validación real de esos 5
// módulos ahora vive inline en cada archivo de ruta (backend/src/routes/*.ts),
// junto con `validateBody` de `middleware/validate.ts` — mismo patrón ya usado
// en cotizaciones.ts, nomina.ts, pos.ts y contabilidad.ts.
//
// `ventas.schema.ts` se deja igual (fuera de este alcance): Ventas ya recibió
// su propia validación real en `services/ventas/ventasService.ts` en una
// pasada anterior; este archivo viejo solo se mantiene porque
// `middleware/validate.ts` todavía importa su tipo.
export {
  VentasAnalizarInputSchema,
  VentasAnalisSchema,
  VentasAnalizarResponse,
  VentasResumenSchema,
} from './ventas.schema';
export type { VentasAnalizarInput, VentasAnalisis, VentasResumen } from './ventas.schema';

export { ProductoInputSchema } from './productos.schema';
export type { ProductoInput } from './productos.schema';