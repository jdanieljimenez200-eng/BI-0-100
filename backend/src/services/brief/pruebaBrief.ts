import { generarResultadoBrief } from './briefOrchestrator';
import type { CasoPruebaBrief } from '../ia/casosPruebaBrief';

/**
 * Corre el Brief completo (identidad, puntaje y transparencia) sobre un caso de
 * prueba, con las versiones de prompt ancladas en el contexto. No toca la base
 * ni cobra créditos.
 */
export async function probarCasoBrief(caso: CasoPruebaBrief) {
  return generarResultadoBrief({
    producto: { ...caso.producto, pais: caso.pais, perfil_negocio: caso.perfil },
    input: { ...caso.input, productoId: 'prueba-admin', usuarioId: 'prueba-admin' },
  });
}
