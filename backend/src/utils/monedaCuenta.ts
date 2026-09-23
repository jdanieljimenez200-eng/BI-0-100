import { AppDataSource } from '../config/database';
import { Producto } from '../models/Producto';
import { getTaxConfig } from './taxConfig';

/**
 * Moneda por defecto de la cuenta, deducida del país del producto.
 *
 * Empleados y cotizaciones nacían en `'USD'` aunque el negocio fuera mexicano:
 * el usuario veía sueldos y cotizaciones en dólares y tenía que corregir la
 * moneda a mano cada vez (y si no se daba cuenta, el documento salía al cliente
 * en la moneda equivocada).
 *
 * Con `productoId` usa el país de ese producto; sin él, el del producto más
 * antiguo de la cuenta, que es el que define el negocio. Sin productos, MXN
 * (mismo respaldo que `getTaxConfig`).
 */
export async function monedaDeCuenta(usuarioId: string, productoId?: string | null): Promise<string> {
  const repo = AppDataSource.getRepository(Producto);
  const producto = productoId
    ? await repo.findOne({ where: { id: productoId, usuario_id: usuarioId }, select: ['pais'] })
    : await repo.findOne({
        where: { usuario_id: usuarioId },
        select: ['pais'],
        order: { fecha_creacion: 'ASC' },
      });
  return getTaxConfig(producto?.pais).moneda;
}
