/**
 * rentaZonaService.ts
 * Lectura 1 de las tres: la renta mensual del local sale de m² × precio por m²,
 * en lugar de pedírsela al usuario a ciegas. Si el usuario YA declaró su renta,
 * la suya manda y el modelo solo se usa para avisarle si está muy fuera de la
 * zona. Si no hay precio por m² de ninguna fuente, no hay renta: `null`.
 */

import { calcularSuperficie } from './superficieService';
import { obtenerPrecioM2 } from './precioM2Service';
import { RentaZonaInput, RentaZonaResult } from './types';
import { combinarConfianza } from '../../utils/confianza';
import { redondearA } from '../../utils/curvas';

/** Desvío a partir del cual avisamos de que la renta declarada no cuadra con la zona. */
const UMBRAL_DESVIO = 0.40;

export async function calcularRentaZona(input: RentaZonaInput): Promise<RentaZonaResult> {
  const superficie = calcularSuperficie({
    tipo_local: input.tipo_local,
    unidades_mes: input.unidades_mes,
    personal: input.personal,
    m2_declarados: input.m2_declarados,
  });

  const declarada =
    typeof input.renta_declarada === 'number' &&
    Number.isFinite(input.renta_declarada) &&
    input.renta_declarada > 0
      ? redondearA(input.renta_declarada, 2)
      : null;

  // Sin local no hay renta que estimar, y eso SÍ es una conclusión: 0.
  if (input.tipo_local === 'sin_local') {
    return {
      renta_mensual: declarada ?? 0,
      origen: declarada !== null ? 'declarada' : 'sin_local',
      m2_totales: null,
      precio_m2_mes: null,
      moneda: input.moneda ?? null,
      renta_estimada_m2: null,
      nivel_confianza: 'alta',
      advertencias: declarada !== null
        ? ['Declaraste operar sin local físico pero también una renta mensual; revisa si corresponde a coworking o bodega.']
        : [],
      nota: declarada !== null
        ? 'Se usa la renta que declaraste.'
        : 'Operación sin local físico: renta de local = 0.',
    };
  }

  const precio = await obtenerPrecioM2({
    precio_m2_mes_declarado: input.precio_m2_mes_declarado,
    pais: input.pais,
    estado: input.estado,
    zona: input.zona,
    moneda: input.moneda,
  });

  const renta_estimada_m2 =
    superficie.m2_totales !== null && precio.precio_m2_mes !== null
      ? Math.round(superficie.m2_totales * precio.precio_m2_mes)
      : null;

  const advertencias: string[] = [];

  if (declarada !== null) {
    if (renta_estimada_m2 !== null && renta_estimada_m2 > 0) {
      const desvio = (declarada - renta_estimada_m2) / renta_estimada_m2;
      if (Math.abs(desvio) >= UMBRAL_DESVIO) {
        const pct = Math.abs(Math.round(desvio * 100));
        advertencias.push(
          desvio > 0
            ? `Tu renta declarada está ${pct}% por encima de la que implican ${superficie.m2_totales} m² a ${precio.precio_m2_mes} por m² en ${precio.zona_consultada} (${renta_estimada_m2}). Verifica si incluye servicios o mantenimiento.`
            : `Tu renta declarada está ${pct}% por debajo de la que implican ${superficie.m2_totales} m² a ${precio.precio_m2_mes} por m² en ${precio.zona_consultada} (${renta_estimada_m2}). Confirma que el contrato sea vigente y no una renta antigua.`,
        );
      }
    }

    return {
      renta_mensual: declarada,
      origen: 'declarada',
      m2_totales: superficie.m2_totales,
      precio_m2_mes: precio.precio_m2_mes,
      moneda: precio.moneda,
      renta_estimada_m2,
      nivel_confianza: 'alta',
      advertencias,
      nota: 'Se usa la renta mensual que declaraste; el cálculo por m² solo sirve de contraste.',
    };
  }

  if (renta_estimada_m2 !== null) {
    if (superficie.fuente === 'modelo_operativo') {
      advertencias.push(
        `Los ${superficie.m2_totales} m² son una estimación por tipo de operación, no una medición: la renta hereda ese margen de error.`,
      );
    }
    if (precio.fuente === 'tabla_operador') {
      advertencias.push(
        `El precio por m² es una referencia de ${precio.zona_consultada}, no una cotización de tu local.`,
      );
    }

    return {
      renta_mensual: renta_estimada_m2,
      origen: 'derivada_m2',
      m2_totales: superficie.m2_totales,
      precio_m2_mes: precio.precio_m2_mes,
      moneda: precio.moneda,
      renta_estimada_m2,
      nivel_confianza: combinarConfianza(superficie.nivel_confianza, precio.nivel_confianza),
      advertencias,
      nota: `${superficie.m2_totales} m² × ${precio.precio_m2_mes} por m²/mes = ${renta_estimada_m2} de renta mensual.`,
    };
  }

  // Sin precio por m² no hay renta. Se dice qué falta en vez de rellenarlo.
  return {
    renta_mensual: null,
    origen: 'no_disponible',
    m2_totales: superficie.m2_totales,
    precio_m2_mes: null,
    moneda: precio.moneda,
    renta_estimada_m2: null,
    nivel_confianza: 'baja',
    advertencias: [precio.nota],
    nota: superficie.m2_totales !== null
      ? `Se dimensionaron ${superficie.m2_totales} m², pero falta el precio por m² para convertirlos en renta mensual.`
      : 'Faltan superficie y precio por m² para estimar la renta.',
  };
}