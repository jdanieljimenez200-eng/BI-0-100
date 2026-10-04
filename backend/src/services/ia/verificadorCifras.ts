/**
 * Verificador de cifras: qué números escribió la IA que no salen ni de lo que
 * dijo el usuario ni de lo que calculó la app.
 *
 * No decide si la cifra es falsa (puede ser una cuenta correcta que la IA hizo
 * por su lado, como «36 clientes al día»): la marca para que la pantalla no la
 * presente con la misma autoridad que un dato o un cálculo. Los modos ya le
 * prohíben a la IA inventar cifras; esto es la red por si lo hace.
 *
 * Uso: `cifrasSinRespaldo(textosDeLaIA, numerosDe(datos, calculos))` y, si
 * devuelve algo, `supuestoCifras(...)` va a la transparencia del análisis.
 */

/** Un número dentro de un texto, con o sin «%». */
export interface Cifra {
  valor: number;
  porcentaje: boolean;
  /** Tal como aparece en el texto, para mostrarlo sin reformatear. */
  texto: string;
}

// Enteros con separador de miles (1,234 · 12.500) o sin él, decimales opcionales
// (1.5 · 1,5 · 1.250,50) y un «%» opcional. No toma números pegados a letras
// (CFDI4, NOM-251) ni partes de otro número.
const NUMERO = /(?<![\p{L}\d.,]|\p{L}-)(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?![\p{L}\d])(\s?%)?/gu;

export function extraerCifras(texto: string): Cifra[] {
  const cifras: Cifra[] = [];
  for (const m of texto.matchAll(NUMERO)) {
    const entero = m[1].replace(/[.,]/g, '');
    const valor = Number(m[2] ? `${entero}.${m[2]}` : entero);
    if (!Number.isFinite(valor)) continue;
    cifras.push({ valor, porcentaje: Boolean(m[3]), texto: m[0].trim() });
  }
  return cifras;
}

/**
 * Cifras que no hace falta respaldar: conteos chicos («3 pasos», «6 meses»),
 * años y los porcentajes redondos que son forma de hablar («el 100 %»).
 */
function esTrivial(c: Cifra): boolean {
  if (c.porcentaje) return c.valor === 0 || c.valor === 100;
  if (c.valor <= 12) return true;
  if (Number.isInteger(c.valor) && c.valor >= 1990 && c.valor <= 2100) return true;
  return false;
}

/** Todos los números finitos de unos objetos (datos del usuario y cálculos), recorridos a fondo. */
export function numerosDe(...fuentes: unknown[]): number[] {
  const out: number[] = [];
  const visitar = (v: unknown, profundidad: number) => {
    if (profundidad > 6 || v === null || v === undefined) return;
    if (typeof v === 'number') {
      if (Number.isFinite(v)) out.push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) visitar(x, profundidad + 1);
      return;
    }
    if (typeof v === 'object') {
      for (const x of Object.values(v as Record<string, unknown>)) visitar(x, profundidad + 1);
    }
  };
  for (const f of fuentes) visitar(f, 0);
  return out;
}

/** Una cifra coincide con una conocida si difiere menos del 2 % (o de medio punto en cifras chicas). */
function coincide(valor: number, conocida: number): boolean {
  return Math.abs(valor - conocida) <= Math.max(0.5, Math.abs(conocida) * 0.02);
}

/** Cifras de los textos de la IA que no están entre las conocidas. Sin repetir, en orden de aparición. */
export function cifrasSinRespaldo(textos: (string | null | undefined)[], conocidas: number[]): Cifra[] {
  const vistas = new Set<string>();
  const sueltas: Cifra[] = [];
  for (const texto of textos) {
    if (!texto) continue;
    for (const c of extraerCifras(texto)) {
      if (esTrivial(c)) continue;
      if (conocidas.some((k) => coincide(c.valor, k))) continue;
      const clave = `${c.valor}${c.porcentaje ? '%' : ''}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      sueltas.push(c);
    }
  }
  return sueltas;
}

/** El supuesto que va a la transparencia cuando la IA usó cifras propias. */
export function supuestoCifras(sueltas: Cifra[], max = 5): string | null {
  if (!sueltas.length) return null;
  const lista = sueltas.slice(0, max).map((c) => c.texto).join(', ');
  const resto = sueltas.length > max ? ` y ${sueltas.length - max} más` : '';
  return `Cifras que la IA calculó o estimó por su cuenta (no salen de tus datos ni del cálculo de la app): ${lista}${resto}. Tómalas como aproximación.`;
}
