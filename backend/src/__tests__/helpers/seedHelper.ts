import { AppDataSource } from '../../config/database';
import { Producto } from '../../models/Producto';

/** Inserta un producto mínimo válido, propiedad del usuario dado. */
export async function crearProductoDeUsuario(
  usuarioId: string,
  overrides: Partial<Producto> = {}
): Promise<Producto> {
  const repo = AppDataSource.getRepository(Producto);
  const producto = repo.create({
    usuario_id: usuarioId,
    nombre: 'Producto de prueba',
    pais: 'MX',
    status: 'activo',
    ...overrides,
  });
  return repo.save(producto);
}
