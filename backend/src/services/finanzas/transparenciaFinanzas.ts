import type { BreakevenData, FinanzasInput, ProyeccionAnual } from './types';
import type { EstatusProyecto } from '../../utils/estatusProyecto';
import { getTaxConfig } from '../../utils/taxConfig';
import { camposSinResponder, type PerfilNegocio } from '../ia/perfilNegocio';
import {
  aplicarContratoComun,
  combinarTransparencia,
  type InformacionFaltante,
  type NivelConfianza,
  type TransparenciaIA,
} from '../ia/contratoComun';
import { origenDe, type MetaIaAnalisis } from '../ia/metaAnalisis';
import type { VersionResuelta } from '../ia/registroPrompts';
import type { ResultadoRiesgos } from './riesgosService';
import { formatoDinero } from './economiaUnitaria';

/**
 * Forma del resultado de Finanzas.
 *  - finanzas@1: sin impuesto incluido, comisiones, plazos, deuda ni transparencia.
 *  - finanzas@2: + economía unitaria, flujo de caja con plazos y deuda, y meta_ia.
 */
export const CONTRATO_FINANZAS = 'finanzas@2';

export interface DatosTransparenciaFinanzas {
  input: FinanzasInput;
  proyeccion: ProyeccionAnual;
  breakeven: BreakevenData;
  /** Los números salieron de la contabilidad del sistema o los tecleó el dueño. */
  origenDatos: 'contabilidad' | 'declarado';
  estatus: EstatusProyecto;
  perfil: PerfilNegocio;
}

const sinDato = (v: unknown) => v === null || v === undefined;

/**
 * Lo que el código sabe con certeza: qué dato no se declaró y qué supuso el
 * cálculo en su lugar. La confianza la fija esto, no la opinión del modelo.
 */
export function transparenciaBaseFinanzas(d: DatosTransparenciaFinanzas): TransparenciaIA {
  const { input } = d;
  const impuesto = getTaxConfig(input.pais).consumo.nombre;
  const supuestos: string[] = ['La utilidad es antes de impuestos sobre la renta y de cuotas de seguridad social.'];
  const faltante: InformacionFaltante[] = [];

  if (!(Number(input.inversion_inicial) > 0)) {
    faltante.push({
      dato: 'Cuánto invertiste (o vas a invertir) para arrancar',
      por_que_importa: 'Sin ella no se puede calcular cuándo recuperas tu dinero ni el retorno real.',
    });
  }
  if (sinDato(input.precio_incluye_impuesto)) {
    supuestos.push(`Se asumió que tu precio no incluye ${impuesto}; si lo incluye, tu margen real es menor.`);
    faltante.push({
      dato: `Si tu precio ya incluye el ${impuesto}`,
      por_que_importa: `Si lo incluye, una parte de cada venta es del fisco y el margen baja.`,
    });
  }
  if (sinDato(input.comision_venta_pct)) {
    supuestos.push('Se asumió que no pagas comisiones por venta (pasarela de pago, marketplace o app de reparto).');
    faltante.push({
      dato: 'Qué porcentaje de cada venta se quedan las plataformas o pasarelas',
      por_que_importa: 'Las comisiones pueden comerse la mitad del margen sin que se note en el precio.',
    });
  }
  if (sinDato(input.dias_cobro) && sinDato(input.dias_pago)) {
    supuestos.push('Se asumió que cobras y pagas de contado.');
    faltante.push({
      dato: 'En cuántos días te pagan tus clientes y en cuántos pagas a tus proveedores',
      por_que_importa: 'Vender a crédito necesita caja extra aunque el negocio sea rentable.',
    });
  }
  if (sinDato(input.pago_deuda_mensual)) {
    supuestos.push('Se asumió que el negocio no paga deudas.');
    faltante.push({
      dato: 'Cuánto pagas al mes de préstamos o créditos del negocio',
      por_que_importa: 'La cuota sale de la caja cada mes y cambia cuánto dinero necesitas.',
    });
  }
  if (sinDato(input.sueldo_dueno_mensual)) {
    supuestos.push('Se asumió que tu sueldo como dueño ya está dentro de los costos fijos (o que no te pagas uno).');
  }
  const crecimiento = Number(input.tasa_crecimiento_mensual) || 0;
  if (crecimiento > 15) {
    const factor = Math.round(Math.pow(1 + crecimiento / 100, 11) * 10) / 10;
    supuestos.push(
      `El crecimiento declarado de ${crecimiento}% mensual multiplica las ventas por ${factor} en un año: es el supuesto más frágil del cálculo.`
    );
  }
  const deuda = Number(input.pago_deuda_mensual) || 0;
  if (deuda > 0 && Number(input.inversion_inicial) > 0) {
    supuestos.push('La caja necesaria cuenta la inversión inicial y la cuota de la deuda: si la deuda pagó esa inversión, revisa que no la estés contando dos veces.');
  }

  // Cinco datos cambian el cálculo; la inversión, el impuesto y las comisiones son los que más.
  const claves = faltante.length;
  let nivel: NivelConfianza = claves >= 3 ? 'bajo' : 'medio';
  if (d.origenDatos === 'contabilidad' && claves <= 1) nivel = 'alto';
  if (crecimiento > 25) nivel = 'bajo';

  const origen = d.origenDatos === 'contabilidad' ? 'Números tomados de tu contabilidad' : 'Números declarados por ti';
  const motivo =
    `${origen}; ` +
    (claves ? `faltan ${claves} de 5 datos que cambian el cálculo.` : 'están todos los datos que cambian el cálculo.') +
    (crecimiento > 25 ? ` Un crecimiento de ${crecimiento}% mensual es muy optimista.` : '');

  return {
    supuestos: supuestos.slice(0, 8),
    informacion_faltante: faltante.slice(0, 6),
    nivel_confianza: nivel,
    motivo_confianza: motivo,
  };
}

/**
 * `meta_ia` de un análisis de Finanzas: transparencia (lo del código más lo
 * que aporta la IA de riesgos, con la confianza más prudente), secciones extra,
 * secciones ocultas y versiones de prompt usadas.
 */
export function construirMetaIaFinanzas(p: {
  datos: DatosTransparenciaFinanzas;
  riesgos: ResultadoRiesgos | null;
  modo: VersionResuelta;
  ocultas: ReadonlySet<string>;
  tipoActividad?: string;
}): MetaIaAnalisis {
  const base = transparenciaBaseFinanzas(p.datos);
  const deIA = p.riesgos?.contrato
    ? aplicarContratoComun(p.riesgos.contrato, {
        seccionesExtra: p.riesgos.sistema?.seccionesExtra ?? [],
        confianzaMaxima: base.nivel_confianza,
      })
    : null;
  const { input, proyeccion } = p.datos;
  const eco = proyeccion.economia_unitaria;
  const sinResponder = camposSinResponder(p.datos.perfil);
  return {
    transparencia: combinarTransparencia(base, deIA?.transparencia),
    secciones_extra: deIA?.secciones_extra ?? [],
    secciones_ocultas: [...p.ocultas],
    meta: {
      contrato: CONTRATO_FINANZAS,
      // Lo demás lo calcula el código: el origen solo habla de la parte de IA.
      origen: origenDe(p.riesgos ? [{ es_mock: p.riesgos.es_mock }] : []),
      versiones_prompt: p.riesgos?.sistema?.versiones ?? {
        [p.modo.clave]: { id: p.modo.id, version: p.modo.version, origen: p.modo.origen },
      },
      contexto_usado: {
        estatus: p.datos.estatus,
        tipo_actividad: p.tipoActividad,
        origen_datos: p.datos.origenDatos,
        moneda: getTaxConfig(input.pais).moneda,
        precio_sin_impuesto: eco.precio_neto,
        comision_por_venta: eco.comision_unitaria,
        margen_por_venta: eco.margen_unitario,
        costos_fijos_con_sueldo: eco.costos_fijos_efectivos,
        caja_necesaria: formatoDinero(proyeccion.caja_necesaria, input.pais),
        perfil_respondido: Object.keys(p.datos.perfil).filter((c) => !sinResponder.includes(c as keyof PerfilNegocio)),
      },
    },
  };
}
