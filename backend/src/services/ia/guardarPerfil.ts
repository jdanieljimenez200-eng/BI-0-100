import { AppDataSource } from '../../config/database';
import { Producto } from '../../models/Producto';
import { fusionarPerfil, leerPerfil, type PerfilNegocio } from './perfilNegocio';

/**
 * Guarda el «Afina tu análisis» en el producto, fusionado con lo que ya había
 * (un módulo que no muestra una pregunta no borra la respuesta que se dio en
 * otro). Las rutas de análisis lo llaman antes de encolar. Devuelve el perfil
 * resultante (el guardado si no llegó nada nuevo).
 */
export async function guardarPerfilNegocio(
  producto: Pick<Producto, 'id' | 'perfil_negocio'>,
  nuevo?: PerfilNegocio
): Promise<PerfilNegocio> {
  if (!nuevo) return leerPerfil(producto.perfil_negocio);
  const perfil = fusionarPerfil(producto.perfil_negocio, nuevo);
  await AppDataSource.getRepository(Producto).update(producto.id, { perfil_negocio: perfil });
  return perfil;
}
