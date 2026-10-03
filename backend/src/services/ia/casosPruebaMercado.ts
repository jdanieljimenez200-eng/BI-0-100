import type {
  CompetenciaResult,
  Competidor,
  MercadoAnalisisInput,
  TendenciasResult,
} from '../mercado/types';
import type { PerfilNegocio } from './perfilNegocio';

/**
 * Negocios ficticios para probar el modo de Mercado antes de publicarlo.
 *
 * Los datos de demanda y competencia son FIJOS (no se consulta ninguna fuente
 * externa: probar no gasta búsquedas ni depende de que la fuente responda).
 * Cubren idea y negocio en marcha, producto y servicio, local y nacional, y un
 * caso sin fuentes para comprobar que el modelo no inventa competencia.
 */

interface CompetenciaFija {
  fuente: 'google_maps' | 'mercadolibre' | null;
  precio_promedio: number;
  gap: string | null;
  competidores: [nombre: string, precio: number, rating: number][];
}

export interface CasoPruebaMercado {
  id: string;
  titulo: string;
  pais: string;
  producto: {
    nombre: string;
    categoria: string;
    descripcion: string;
    precio: number;
    puv: string | null;
    cliente_ideal: string | null;
    canal_venta: string | null;
    tipo_actividad: 'producto' | 'servicio';
    estatus_proyecto: 'nueva_idea' | 'negocio_en_marcha';
    inversion_inicial: number;
    costos_fijos: number;
  };
  input: MercadoAnalisisInput;
  perfil: PerfilNegocio;
  /** `null` = sin fuente de tendencias. */
  tendencia: { volumen: number; crecimiento: number; tendencia: TendenciasResult['tendencia'] } | null;
  competencia: CompetenciaFija;
}

export const CASOS_MERCADO: CasoPruebaMercado[] = [
  {
    id: 'mx_cafeteria_idea',
    titulo: 'Idea de cafetería de especialidad en Guadalajara',
    pais: 'MX',
    producto: {
      nombre: 'Café Origen',
      categoria: 'Cafetería',
      descripcion: 'Cafetería de especialidad con granos de productores de Chiapas y Veracruz.',
      precio: 65,
      puv: 'Café de origen trazable con precio de cafetería de barrio',
      cliente_ideal: 'Oficinistas y estudiantes de 20 a 40 años de la zona',
      canal_venta: 'Local propio y pedidos por WhatsApp',
      tipo_actividad: 'producto',
      estatus_proyecto: 'nueva_idea',
      inversion_inicial: 350000,
      costos_fijos: 45000,
    },
    input: {
      pais: 'MX',
      scope: 'local',
      estado: 'Jalisco',
      ciudad: 'Guadalajara',
      forma_cobro: 'Pago Único',
      nse_target: 'C / C- (Medio)',
      competidores_conocidos: 'Dos cafeterías de cadena a dos cuadras',
    } as MercadoAnalisisInput,
    perfil: { tipo_clientes: 'consumidor_final', local_fisico: 'local_rentado' },
    tendencia: { volumen: 5400, crecimiento: 12, tendencia: 'CRECIENTE' },
    competencia: {
      fuente: 'google_maps',
      precio_promedio: 58,
      gap: 'Pocas opciones de café de especialidad a precio medio en la zona',
      competidores: [
        ['Cafetería A (ficticia)', 55, 4.4],
        ['Cafetería B (ficticia)', 70, 4.6],
        ['Cafetería C (ficticia)', 48, 4.1],
      ],
    },
  },
  {
    id: 'co_ropa_en_marcha',
    titulo: 'Tienda en línea de ropa deportiva en Colombia, ya vende',
    pais: 'CO',
    producto: {
      nombre: 'Andes Fit',
      categoria: 'Ropa deportiva',
      descripcion: 'Ropa deportiva fabricada en Medellín, venta en línea a todo el país.',
      precio: 95000,
      puv: 'Tallas latinas reales y envío en 48 horas',
      cliente_ideal: 'Mujeres de 25 a 45 años que entrenan en casa o en gimnasio',
      canal_venta: 'Tienda en línea e Instagram',
      tipo_actividad: 'producto',
      estatus_proyecto: 'negocio_en_marcha',
      inversion_inicial: 40000000,
      costos_fijos: 9000000,
    },
    input: {
      pais: 'CO',
      scope: 'nacional',
      forma_cobro: 'Pago Único',
      nse_target: 'Estrato 3-4',
      clientes_mes: 120,
      tasa_repeticion: 25,
      canal_adquisicion: 'Instagram',
    } as MercadoAnalisisInput,
    perfil: { tipo_clientes: 'consumidor_final', local_fisico: 'no', ingresos_anuales: 136800000 },
    tendencia: { volumen: 22000, crecimiento: 2, tendencia: 'ESTABLE' },
    competencia: {
      fuente: 'mercadolibre',
      precio_promedio: 82000,
      gap: null,
      competidores: [
        ['Marca deportiva A (ficticia)', 89000, 4.5],
        ['Marca deportiva B (ficticia)', 75000, 4.2],
        ['Marca deportiva C (ficticia)', 110000, 4.7],
      ],
    },
  },
  {
    id: 'pe_contabilidad_b2b',
    titulo: 'Servicio de contabilidad para pymes en Lima (le vende a empresas)',
    pais: 'PE',
    producto: {
      nombre: 'Cuentas Claras',
      categoria: 'Servicios contables',
      descripcion: 'Contabilidad mensual y declaraciones para pequeñas empresas.',
      precio: 450,
      puv: 'Tarifa fija mensual y reporte en lenguaje simple',
      cliente_ideal: 'Pymes de 3 a 20 empleados en Lima',
      canal_venta: 'Recomendación y LinkedIn',
      tipo_actividad: 'servicio',
      estatus_proyecto: 'nueva_idea',
      inversion_inicial: 15000,
      costos_fijos: 6000,
    },
    input: {
      pais: 'PE',
      scope: 'local',
      estado: 'Lima',
      forma_cobro: 'Suscripción',
      recurrencia_meses: 1,
      nse_target: 'B',
    } as MercadoAnalisisInput,
    perfil: { tipo_clientes: 'empresas', local_fisico: 'en_casa' },
    tendencia: { volumen: 3600, crecimiento: 5, tendencia: 'CRECIENTE' },
    competencia: {
      fuente: 'google_maps',
      precio_promedio: 520,
      gap: 'Los estudios contables cobran por hora y no explican los reportes',
      competidores: [
        ['Estudio contable A (ficticio)', 600, 4.3],
        ['Estudio contable B (ficticio)', 450, 4.0],
        ['Estudio contable C (ficticio)', 500, 4.6],
      ],
    },
  },
  {
    id: 'cl_suscripcion_snacks',
    titulo: 'Cajas de snacks saludables por suscripción en Chile, demanda a la baja',
    pais: 'CL',
    producto: {
      nombre: 'Caja Verde',
      categoria: 'Alimentos saludables',
      descripcion: 'Caja mensual de snacks saludables de productores chilenos.',
      precio: 18990,
      puv: 'Snacks de productores locales sin azúcar añadida',
      cliente_ideal: 'Profesionales de 28 a 45 años que cuidan su alimentación',
      canal_venta: 'Tienda en línea',
      tipo_actividad: 'producto',
      estatus_proyecto: 'negocio_en_marcha',
      inversion_inicial: 8000000,
      costos_fijos: 2500000,
    },
    input: {
      pais: 'CL',
      scope: 'nacional',
      forma_cobro: 'Suscripción',
      recurrencia_meses: 1,
      nse_target: 'ABC1',
      clientes_mes: 60,
      tasa_repeticion: 55,
      canal_adquisicion: 'Instagram y referidos',
    } as MercadoAnalisisInput,
    perfil: { tipo_clientes: 'consumidor_final', sectores_regulados: ['alimentos_bebidas'] },
    tendencia: { volumen: 2900, crecimiento: -8, tendencia: 'DECRECIENTE' },
    competencia: {
      fuente: 'mercadolibre',
      precio_promedio: 16500,
      gap: null,
      competidores: [
        ['Caja saludable A (ficticia)', 15990, 4.4],
        ['Caja saludable B (ficticia)', 17500, 4.1],
      ],
    },
  },
  {
    id: 'ar_sin_fuentes',
    titulo: 'Taller de bicicletas en Córdoba sin datos de fuentes externas',
    pais: 'AR',
    producto: {
      nombre: 'Rueda Libre',
      categoria: 'Reparación de bicicletas',
      descripcion: 'Taller de reparación y mantenimiento de bicicletas.',
      precio: 0,
      puv: null,
      cliente_ideal: null,
      canal_venta: null,
      tipo_actividad: 'servicio',
      estatus_proyecto: 'nueva_idea',
      inversion_inicial: 0,
      costos_fijos: 0,
    },
    input: {
      pais: 'AR',
      scope: 'local',
      estado: 'Córdoba',
      forma_cobro: 'Pago Único',
      nse_target: 'Medio',
    } as MercadoAnalisisInput,
    perfil: {},
    tendencia: null,
    competencia: { fuente: null, precio_promedio: 0, gap: null, competidores: [] },
  },
];

/** Demanda y competencia del caso, con la forma que producen los servicios reales. */
export function insumosDeCasoMercado(caso: CasoPruebaMercado): {
  tendencias: TendenciasResult;
  competencia: CompetenciaResult;
} {
  const t = caso.tendencia;
  const tendencias: TendenciasResult = {
    palabra_clave: caso.producto.categoria,
    ubicacion: caso.input.estado ?? caso.pais,
    volumen_busquedas_mensual: t?.volumen ?? 0,
    datos_12_meses: [],
    proyeccion_6_meses: [],
    crecimiento_porcentaje: t?.crecimiento ?? 0,
    crecimiento_descripcion: t ? `${t.crecimiento > 0 ? '+' : ''}${t.crecimiento}% en 12 meses` : 'Sin datos',
    picos_estacionales: {},
    tendencia: t?.tendencia ?? 'ESTABLE',
    es_mock: !t,
    fuente_disponible: Boolean(t),
  };

  const c = caso.competencia;
  const competidores: Competidor[] = c.competidores.map(([nombre, precio, rating], i) => ({
    ranking: i + 1,
    nombre,
    url: '',
    ubicacion: caso.input.estado ?? caso.pais,
    distancia_km: null,
    precio_minimo: precio,
    precio_maximo: precio,
    precio_promedio: precio,
    rating,
    numero_resenas: 0,
    fortalezas: [],
    debilidades: [],
    tiempo_en_mercado: '',
    fuente: c.fuente ?? 'mock',
  }));
  const competencia = {
    total_competidores: competidores.length,
    competidores,
    gap_detectado: c.gap,
    precio_mercado_promedio: c.precio_promedio,
    es_mock: !c.fuente,
    fuente_disponible: Boolean(c.fuente),
  } as CompetenciaResult;

  return { tendencias, competencia };
}
