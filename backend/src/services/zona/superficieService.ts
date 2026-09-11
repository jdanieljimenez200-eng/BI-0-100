/**
 * superficieService.ts
 * Lectura 2 de las tres: cuántos m² necesita el negocio según su tipo de
 * operación, el personal y el volumen mensual proyectado. Función pura.
 *
 * Los coeficientes son supuestos operativos explícitos (ver ModeloEspacio),
 * no cifras de mercado. Si el usuario declara sus m², el modelo no interviene.
 */

import { redondearA } from '../../utils/curvas';
import { NivelConfianza } from '../../utils/confianza';
import { ModeloEspacio, SuperficieInput, SuperficieResult, TipoLocal } from './types';

export const MODELOS_ESPACIO: Record<Exclude<TipoLocal, 'sin_local'>, ModeloEspacio> = {
  produccion_alimentos: {
    etiqueta: 'Producción de alimentos (cocina / obrador)',
    m2_base: 18,
    m2_por_persona: 3,
    m2_por_1000_unidades_mes: 2.5,
    factor_circulacion: 0.30,
    m2_minimo: 20,
  },
  retail: {
    etiqueta: 'Venta al público con exhibición',
    m2_base: 12,
    m2_por_persona: 2,
    m2_por_1000_unidades_mes: 1.2,
    factor_circulacion: 0.35,
    m2_minimo: 15,
  },
  servicio_atencion: {
    etiqueta: 'Servicio con atención presencial (estaciones)',
    m2_base: 10,
    m2_por_persona: 4,
    m2_por_1000_unidades_mes: 0.8,
    factor_circulacion: 0.30,
    m2_minimo: 12,
  },
  oficina: {
    etiqueta: 'Oficina / trabajo administrativo',
    m2_base: 8,
    m2_por_persona: 6,
    m2_por_1000_unidades_mes: 0,
    factor_circulacion: 0.25,
    m2_minimo: 10,
  },
  taller: {
    etiqueta: 'Taller / manufactura ligera',
    m2_base: 20,
    m2_por_persona: 5,
    m2_por_1000_unidades_mes: 3,
    factor_circulacion: 0.25,
    m2_minimo: 25,
  },
  almacen: {
    etiqueta: 'Almacén / bodega',
    m2_base: 15,
    m2_por_persona: 2,
    m2_por_1000_unidades_mes: 4,
    factor_circulacion: 0.20,
    m2_minimo: 18,
  },
  ecommerce_bodega: {
    etiqueta: 'E-commerce con bodega de picking',
    m2_base: 10,
    m2_por_persona: 2,
    m2_por_1000_unidades_mes: 3.5,
    factor_circulacion: 0.20,
    m2_minimo: 12,
  },
  otro: {
    etiqueta: 'Otro tipo de local',
    m2_base: 12,
    m2_por_persona: 3,
    m2_por_1000_unidades_mes: 1.5,
    factor_circulacion: 0.28,
    m2_minimo: 14,
  },
};

/** Los locales se cotizan en tramos; 0.5 m² es el grano útil. */
const PASO_REDONDEO_M2 = 0.5;
const M2_MAXIMO = 100_000;
const PERSONAL_DEFAULT = 1;

function redondearM2(valor: number): number {
  // El epsilon evita que 37 (=74/2) se vaya a 37.5 por error binario.
  return Math.ceil(valor / PASO_REDONDEO_M2 - 1e-9) * PASO_REDONDEO_M2;
}

/** Números de entrada poco fiables (NaN, negativos, Infinity) → 0. */
function saneaNoNegativo(valor: number | undefined, maximo: number): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) return 0;
  return Math.min(valor, maximo);
}

function modeloDe(tipo: TipoLocal): ModeloEspacio {
  if (tipo === 'sin_local') return MODELOS_ESPACIO.otro;
  return MODELOS_ESPACIO[tipo] ?? MODELOS_ESPACIO.otro;
}

/**
 * Superficie necesaria en m².
 *
 * Prioridad:
 *  1. m² declarados por el usuario → se respetan tal cual (confianza alta).
 *  2. Modelo operativo: base + personal + volumen, más circulación (media).
 *  3. `sin_local` → no hay superficie que estimar (todo `null`).
 */
export function calcularSuperficie(input: SuperficieInput): SuperficieResult {
  const modelo = modeloDe(input.tipo_local);

  if (input.tipo_local === 'sin_local') {
    return {
      m2_operativos: null,
      m2_circulacion: null,
      m2_totales: null,
      fuente: 'no_aplica',
      nivel_confianza: 'alta',
      supuestos: [],
      nota: 'La operación se declaró sin local físico, así que no hay superficie que dimensionar.',
    };
  }

  const declarados = saneaNoNegativo(input.m2_declarados, M2_MAXIMO);
  if (declarados > 0) {
    const totales = redondearA(declarados, 2);
    const operativos = redondearA(totales / (1 + modelo.factor_circulacion), 2);
    const circulacion = redondearA(totales - operativos, 2);
    return {
      m2_operativos: operativos,
      m2_circulacion: circulacion,
      m2_totales: totales,
      fuente: 'declarada',
      nivel_confianza: 'alta',
      supuestos: [
        `Superficie declarada por ti: ${totales} m².`,
        `De ellos, ~${circulacion} m² se van en circulación y accesos (${Math.round(modelo.factor_circulacion * 100)}% típico en ${modelo.etiqueta.toLowerCase()}).`,
      ],
      nota: `Se usan tus ${totales} m² declarados; el modelo operativo no interviene.`,
    };
  }

  const personalBruto = input.personal;
  const personal =
    typeof personalBruto === 'number' && Number.isFinite(personalBruto) && personalBruto >= 0
      ? Math.min(Math.floor(personalBruto), 1000)
      : PERSONAL_DEFAULT;
  const unidades = saneaNoNegativo(input.unidades_mes, 10_000_000);

  const m2Personal = personal * modelo.m2_por_persona;
  const m2Volumen = (unidades / 1000) * modelo.m2_por_1000_unidades_mes;
  const bruto = modelo.m2_base + m2Personal + m2Volumen;

  const operativos = redondearM2(Math.min(Math.max(bruto, modelo.m2_minimo), M2_MAXIMO));
  const circulacion = redondearM2(operativos * modelo.factor_circulacion);
  const totales = redondearA(operativos + circulacion, 2);

  const supuestos = [
    `${modelo.etiqueta}: ${modelo.m2_base} m² de base para la función productiva.`,
    `${personal} ${personal === 1 ? 'persona' : 'personas'} en piso × ${modelo.m2_por_persona} m² = ${redondearA(m2Personal, 2)} m².`,
  ];
  if (modelo.m2_por_1000_unidades_mes > 0) {
    supuestos.push(
      `${unidades.toLocaleString('es-MX')} unidades/mes × ${modelo.m2_por_1000_unidades_mes} m² por cada 1.000 = ${redondearA(m2Volumen, 2)} m² de producción y stock en piso.`,
    );
  }
  supuestos.push(
    `+${Math.round(modelo.factor_circulacion * 100)}% de circulación, accesos y sanitarios = ${circulacion} m².`,
  );
  if (bruto < modelo.m2_minimo) {
    supuestos.push(
      `Se aplicó el mínimo operable de ${modelo.m2_minimo} m² (el cálculo daba ${redondearA(bruto, 2)} m²).`,
    );
  }

  const nivel_confianza: NivelConfianza = 'media';

  return {
    m2_operativos: operativos,
    m2_circulacion: circulacion,
    m2_totales: totales,
    fuente: 'modelo_operativo',
    nivel_confianza,
    supuestos,
    nota: `Estimación de ${totales} m² a partir de tu tipo de operación, personal y volumen. Si ya cotizaste un local, declara sus m² para sustituir esta estimación.`,
  };
}