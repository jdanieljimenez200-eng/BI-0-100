import { AppDataSource } from '../../config/database';
import { Producto } from '../../models/Producto';
import { fusionarPerfil, type PerfilNegocio } from './perfilNegocio';

/**
 * Guarda el «Afina tu análisis» en el producto, fusionado con lo que ya había
 * (un módulo que no muestra una pregunta no borra la respuesta que se dio en
 * otro). Las rutas de análisis lo llaman antes de encolar.
 */
export async function guardarPerfilNegocio(producto: Pick<Producto, 'id' | 'perfil_negocio'>, nuevo?: PerfilNegocio): Promise<void> {
  if (!nuevo) return;
  await AppDataSource.getRepository(Producto).update(producto.id, {
    perfil_negocio: fusionarPerfil(producto.perfil_negocio, nuevo),
  });
}
