import { PAIS_LATAM } from '../../../utils/latam';
import { PAISES, textoFichaPais } from '../../legal/fichasPais';
import { LEGAL_MODO } from './legal.modo';
import { MERCADO_MODO } from './mercado.modo';
import { FINANZAS_MODO } from './finanzas.modo';
import { VENTAS_MODO } from './ventas.modo';
import { MARKETING_MODO } from './marketing.modo';
import { BRIEF_MODO } from './brief.modo';

/**
 * Catálogo de lo que el admin puede editar y sus textos por defecto.
 *
 * El texto por defecto vive en el repositorio y se usa mientras la clave no
 * tenga una versión publicada (o si la base no responde): la IA nunca se queda
 * sin prompt. Un módulo entra aquí cuando su prompt se migra al esquema de
 * modos; hasta entonces sigue con su prompt de siempre, en su servicio.
 */

export type ModuloPrompt = 'legal' | 'mercado' | 'finanzas' | 'ventas' | 'marketing' | 'brief';

export interface ClavePrompt {
  clave: string;
  modulo: ModuloPrompt;
  tipo: 'modo' | 'ficha_pais';
  titulo: string;
}

const MODOS: Record<string, { modulo: ModuloPrompt; titulo: string; texto: string }> = {
  'legal.modo': { modulo: 'legal', titulo: 'Legal — modo de comportamiento', texto: LEGAL_MODO },
  'mercado.modo': { modulo: 'mercado', titulo: 'Mercado — modo de comportamiento', texto: MERCADO_MODO },
  'finanzas.modo': { modulo: 'finanzas', titulo: 'Finanzas — modo de comportamiento', texto: FINANZAS_MODO },
  'ventas.modo': { modulo: 'ventas', titulo: 'Ventas — modo de comportamiento', texto: VENTAS_MODO },
  'marketing.modo': { modulo: 'marketing', titulo: 'Marketing — modo de comportamiento', texto: MARKETING_MODO },
  'brief.modo': { modulo: 'brief', titulo: 'Brief de marca — modo de comportamiento', texto: BRIEF_MODO },
};

const RE_FICHA_LEGAL = /^legal\.pais\.([A-Z]{2})$/;

/** Países con ficha editable en Legal: los de LATAM más España. */
export function paisesConFichaEditable(): string[] {
  return [...new Set([...Object.keys(PAIS_LATAM), ...Object.keys(PAISES)])].sort();
}

/** ¿Es una clave que el panel puede editar? */
export function esClaveValida(clave: string): boolean {
  if (MODOS[clave]) return true;
  const m = RE_FICHA_LEGAL.exec(clave);
  return Boolean(m && paisesConFichaEditable().includes(m[1]));
}

export function infoClave(clave: string): ClavePrompt | null {
  const modo = MODOS[clave];
  if (modo) return { clave, modulo: modo.modulo, tipo: 'modo', titulo: modo.titulo };
  const m = RE_FICHA_LEGAL.exec(clave);
  if (m && esClaveValida(clave)) {
    const nombre = PAISES[m[1]]?.nombre ?? PAIS_LATAM[m[1]]?.nombre ?? m[1];
    return { clave, modulo: 'legal', tipo: 'ficha_pais', titulo: `Legal — ficha de ${nombre}` };
  }
  return null;
}

/** Todas las claves editables, en el orden en que las muestra el panel. */
export function catalogoClaves(): ClavePrompt[] {
  const claves = [...Object.keys(MODOS), ...paisesConFichaEditable().map((iso) => `legal.pais.${iso}`)];
  return claves.map(infoClave).filter((c): c is ClavePrompt => c !== null);
}

/** Texto del repositorio para la clave, o `null` si no hay (p. ej. un país sin ficha). */
export function textoPorDefecto(clave: string): string | null {
  const modo = MODOS[clave];
  if (modo) return modo.texto;
  const m = RE_FICHA_LEGAL.exec(clave);
  if (m) return textoFichaPais(m[1]);
  return null;
}

/**
 * Claves que usa un análisis de ese módulo, en el orden del prompt. El worker
 * las ancla al empezar para que publicar una versión no cambie un análisis en curso.
 */
export function clavesDeModulo(modulo: string, pais?: string | null): string[] {
  if (modulo === 'legal') {
    const iso = (pais || 'MX').trim().toUpperCase();
    return ['legal.modo', `legal.pais.${iso}`];
  }
  // Mercado no tiene fichas de país: su contexto por país sale de datos (moneda, NSE, cobertura).
  if (modulo === 'mercado') return ['mercado.modo'];
  // Finanzas tampoco: la moneda y el impuesto al consumo salen de utils/taxConfig.ts.
  if (modulo === 'finanzas') return ['finanzas.modo'];
  if (modulo === 'ventas') return ['ventas.modo'];
  if (modulo === 'marketing') return ['marketing.modo'];
  if (modulo === 'brief') return ['brief.modo'];
  return [];
}
