/**
 * Producto o servicio: lo que declaró el dueño en el alta
 * (`productos.tipo_actividad`). La categoría solo es el respaldo para productos
 * antiguos: antes era lo único y fallaba en cuanto la categoría no llevaba la
 * palabra «servicio».
 */
export function tipoActividadDe(declarado: string | null | undefined, categoria: string): 'Producto' | 'Servicio' {
  const d = (declarado ?? '').trim().toLowerCase();
  if (d === 'servicio') return 'Servicio';
  if (d === 'producto') return 'Producto';
  return /servici/i.test(categoria) ? 'Servicio' : 'Producto';
}
