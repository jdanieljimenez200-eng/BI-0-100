/**
 * tablaZonaEnv.ts
 * Infraestructura compartida por las fuentes de precio de zona (renta por m² y
 * venta por m²): la tabla que el OPERADOR de la plataforma carga por variable de
 * entorno, con búsqueda de la clave más específica disponible
 * (país|estado|zona → país|estado → país).
 *
 * Este módulo NO contiene ninguna cifra de mercado. Si la variable está vacía o
 * es inválida, no hay tabla, y aguas abajo eso significa "no hay dato", nunca un
 * número inventado.
 */

import { UbicacionConsulta } from './types';

export interface EntradaTablaZona {
  valor: number;
  moneda?: string;
}

export type EspecificidadZona = 'zona' | 'estado' | 'país';

export interface CoincidenciaZona {
  entrada: EntradaTablaZona;
  /** Nivel al que se encontró la clave: se reporta al usuario tal cual. */
  especificidad: EspecificidadZona;
}

export interface TablaZonaEnv {
  cargar(): Record<string, EntradaTablaZona>;
  buscar(consulta: UbicacionConsulta): CoincidenciaZona | null;
  /** Para tests: fuerza la relectura de la variable de entorno. */
  reset(): void;
}

/** Quita acentos, mayúsculas y espacios repetidos para que la clave sea estable. */
export function normalizarParte(valor?: string): string {
  return (valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Número usable como precio: finito, positivo y por debajo del techo del dominio. */
export function esNumeroUtil(valor: unknown, maximo: number): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 && valor <= maximo;
}

/**
 * Crea un lector cacheado de tabla de zona.
 *
 * Formato admitido en la variable de entorno (el nombre del campo numérico lo
 * decide cada dominio vía `campoValor`):
 *   { "MX|CDMX|Polanco": 1450, "MX|Jalisco": { "<campoValor>": 620, "moneda": "MXN" } }
 *
 * La caché se invalida sola cuando cambia el valor de la variable, de modo que
 * los tests puedan reasignarla sin fugas entre casos.
 */
export function crearTablaZonaEnv(opciones: {
  envVar: string;
  campoValor: string;
  maximo: number;
}): TablaZonaEnv {
  const { envVar, campoValor, maximo } = opciones;

  let cacheRaw: string | null = null;
  let cacheTabla: Record<string, EntradaTablaZona> = {};

  function cargar(): Record<string, EntradaTablaZona> {
    const raw = process.env[envVar] ?? '';
    if (raw === cacheRaw) return cacheTabla;

    cacheRaw = raw;
    cacheTabla = {};
    if (!raw.trim()) return cacheTabla;

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown> | null;
      for (const [clave, valor] of Object.entries(parsed ?? {})) {
        const partes = clave.split('|').map(normalizarParte).filter((p) => p.length > 0);
        if (partes.length === 0) continue;

        // Forma corta: la clave apunta directamente al número.
        if (esNumeroUtil(valor, maximo)) {
          cacheTabla[partes.join('|')] = { valor };
          continue;
        }

        // Forma larga: objeto con el campo del dominio y su moneda.
        if (valor && typeof valor === 'object') {
          const entrada = valor as Record<string, unknown>;
          const bruto = entrada[campoValor];
          if (esNumeroUtil(bruto, maximo)) {
            cacheTabla[partes.join('|')] = {
              valor: bruto,
              moneda: typeof entrada.moneda === 'string' ? entrada.moneda : undefined,
            };
          }
        }
      }
    } catch (err) {
      console.warn(`${envVar} no es JSON válido; se ignora la tabla de zona:`, err);
      cacheTabla = {};
    }
    return cacheTabla;
  }

  function buscar(consulta: UbicacionConsulta): CoincidenciaZona | null {
    const tabla = cargar();
    if (Object.keys(tabla).length === 0) return null;

    const pais = normalizarParte(consulta.pais);
    const estado = normalizarParte(consulta.estado);
    const zona = normalizarParte(consulta.zona);

    const candidatos: { clave: string[]; especificidad: EspecificidadZona }[] = [
      { clave: [pais, estado, zona], especificidad: 'zona' },
      { clave: [pais, estado], especificidad: 'estado' },
      { clave: [pais], especificidad: 'país' },
    ];

    for (const { clave, especificidad } of candidatos) {
      const partes = clave.filter((p) => p.length > 0);
      // Si falta alguna parte de la clave, esa especificidad no es consultable.
      if (partes.length !== clave.length) continue;
      const entrada = tabla[partes.join('|')];
      if (entrada) return { entrada, especificidad };
    }
    return null;
  }

  function reset(): void {
    cacheRaw = null;
    cacheTabla = {};
  }

  return { cargar, buscar, reset };
}