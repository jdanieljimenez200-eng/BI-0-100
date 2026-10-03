import { generarResultadoMarketing } from './marketingOrchestrator';
import type { CasoPruebaMarketing } from '../ia/casosPruebaMarketing';

/**
 * Corre Marketing completo (estrategias, copies y calendario, como en el plan
 * más alto) sobre un caso de prueba, con las versiones de prompt ancladas en el
 * contexto. No toca la base ni cobra créditos.
 */
export async function probarCasoMarketing(caso: CasoPruebaMarketing) {
  const r = await generarResultadoMarketing({
    producto: { ...caso.producto, pais: caso.pais, perfil_negocio: caso.perfil },
    input: { ...caso.input, productoId: 'prueba-admin', usuarioId: 'prueba-admin' },
    conCopies: true,
    ctx: caso.ctx,
    icpVentas: caso.icpVentas,
  });
  return {
    estrategias: r.estrategias,
    copies: r.copies,
    calendario: r.calendario,
    meta_ia: r.meta_ia,
  };
}
