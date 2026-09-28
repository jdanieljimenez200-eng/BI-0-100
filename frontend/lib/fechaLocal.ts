/**
 * Fechas `YYYY-MM-DD` en el día LOCAL del navegador.
 *
 * `new Date().toISOString().slice(0, 10)` da el día en UTC: en México, desde las
 * 18:00 ya es «mañana». Así un pago de nómina hecho el 30 por la tarde quedaba
 * con fecha del 1 (otro mes en Contabilidad) y registrar un mantenimiento a esa
 * hora fallaba porque el backend —que sí usa el día local— lo veía «futuro».
 * Es el equivalente de `hoyDePeticion()` del backend.
 */
export function fechaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function hoyLocal(): string {
  return fechaLocal(new Date());
}
