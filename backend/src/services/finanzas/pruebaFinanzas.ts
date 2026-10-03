import { generarResultadoFinanzas } from './finanzasOrchestrator';
import type { CasoPruebaFinanzas } from '../ia/casosPruebaFinanzas';

/**
 * Corre Finanzas completo (cálculo, riesgos con IA y transparencia) sobre un
 * caso de prueba, con las versiones de prompt ancladas en el contexto. No toca
 * la base ni cobra créditos.
 */
export async function probarCasoFinanzas(caso: CasoPruebaFinanzas) {
  const r = await generarResultadoFinanzas({
    input: { ...caso.input, productoId: 'prueba-admin', usuarioId: 'prueba-admin' },
    producto: { ...caso.producto, pais: caso.pais },
    perfil: caso.perfil,
    origenDatos: caso.origen_datos,
  });
  return {
    resumen: r.resumen,
    breakeven: r.breakeven,
    proyeccion: {
      totales: r.proyeccion.totales,
      caja_necesaria: r.proyeccion.caja_necesaria,
      mes_valle: r.proyeccion.mes_valle,
      capital_de_trabajo: r.proyeccion.capital_de_trabajo,
      cobertura_deuda: r.proyeccion.cobertura_deuda,
      economia_unitaria: r.proyeccion.economia_unitaria,
    },
    riesgos: r.riesgos,
    meta_ia: r.meta_ia,
  };
}
