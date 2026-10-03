import { generarResultadoVentas, inputDeVentas } from './ventasOrchestrator';
import type { CasoPruebaVentas } from '../ia/casosPruebaVentas';

/** Fecha fija: la historia del día depende de ella y una prueba debe repetirse igual. */
const FECHA_PRUEBA = '2026-10-01';

/**
 * Corre el análisis de Ventas (tips, historia y perfil de cliente, como en el
 * plan más alto) sobre un caso de prueba, con las versiones de prompt ancladas
 * en el contexto. No toca la base ni cobra créditos.
 */
export async function probarCasoVentas(caso: CasoPruebaVentas) {
  const input = inputDeVentas(
    {
      ...caso.producto,
      pais: caso.pais,
      video_url: null,
      clientes_mes: null,
      perfil_negocio: caso.perfil,
    },
    caso.formulario
  );
  return generarResultadoVentas({ input, conIcp: true, fechaISO: FECHA_PRUEBA });
}
