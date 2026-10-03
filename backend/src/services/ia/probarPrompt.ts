import type { PromptIA } from '../../models/PromptIA';
import { conSeguimientoIA } from '../../utils/seguimientoIA';
import { clavesDeModulo, infoClave, type ModuloPrompt } from './prompts';
import { versionesAAnclar } from './registroPrompts';
import { CASOS_LEGAL, productoDeCaso } from './casosPrueba';
import { CASOS_MERCADO } from './casosPruebaMercado';
import { generarAnalisisLegal } from '../legal/legalService';
import { probarCasoMercado } from '../mercado/pruebaMercado';

/**
 * «Probar» del panel de prompts: corre la parte de IA de un módulo sobre un
 * caso ficticio con la versión en prueba anclada (y lo publicado para el resto
 * de claves). No crea análisis ni cobra créditos; el gasto queda en `uso_ia`
 * con el módulo `admin_prueba`.
 */

export interface CasoResumen {
  id: string;
  titulo: string;
  pais: string;
}

export function casosDeModulo(modulo: ModuloPrompt): CasoResumen[] {
  const lista = modulo === 'mercado' ? CASOS_MERCADO : CASOS_LEGAL;
  return lista.map((c) => ({ id: c.id, titulo: c.titulo, pais: c.pais }));
}

export class ErrorPrueba extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

export async function probarVersion(
  version: Pick<PromptIA, 'id' | 'clave'>,
  casoId: string,
  usuarioId: string
): Promise<{ caso: CasoResumen; resultado: unknown }> {
  const info = infoClave(version.clave);
  if (!info) throw new ErrorPrueba(400, 'Clave de prompt desconocida');

  if (info.modulo === 'mercado') {
    const caso = CASOS_MERCADO.find((c) => c.id === casoId);
    if (!caso) throw new ErrorPrueba(404, 'Caso de prueba no encontrado');
    const versiones = await versionesAAnclar(clavesDeModulo('mercado', caso.pais));
    versiones[version.clave] = version.id;
    const resultado = await conSeguimientoIA(() => probarCasoMercado(caso), {
      usuarioId,
      modulo: 'admin_prueba',
      versionesPrompt: versiones,
    });
    return { caso: { id: caso.id, titulo: caso.titulo, pais: caso.pais }, resultado };
  }

  const caso = CASOS_LEGAL.find((c) => c.id === casoId);
  if (!caso) throw new ErrorPrueba(404, 'Caso de prueba no encontrado');
  // Una ficha se prueba en su país; un modo, en el país del caso.
  const pais = /^legal\.pais\.([A-Z]{2})$/.exec(version.clave)?.[1] ?? caso.pais;
  const versiones = await versionesAAnclar(clavesDeModulo('legal', pais));
  versiones[version.clave] = version.id;
  const resultado = await conSeguimientoIA(
    () => generarAnalisisLegal(productoDeCaso(caso, pais), { ...caso.input, productoId: 'prueba-admin', usuarioId }),
    { usuarioId, modulo: 'admin_prueba', versionesPrompt: versiones }
  );
  return { caso: { id: caso.id, titulo: caso.titulo, pais }, resultado };
}
