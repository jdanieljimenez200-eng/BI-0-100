import type { Producto } from '../../models/Producto';
import type { LegalAnalisisInput } from '../legal/types';
import type { PerfilNegocio } from './perfilNegocio';

/**
 * Negocios ficticios para probar una versión de prompt antes de publicarla.
 *
 * Cubren países, formas jurídicas y banderas distintas a propósito: un prompt
 * que solo funciona para una taquería de la CDMX no está listo para LATAM. El
 * último caso no tiene ficha de país ni perfil: sirve para comprobar que el
 * modelo no inventa trámites y baja su confianza.
 */

export interface CasoPruebaLegal {
  id: string;
  titulo: string;
  pais: string;
  producto: Pick<Producto, 'nombre' | 'categoria' | 'descripcion' | 'precio'>;
  input: Omit<LegalAnalisisInput, 'productoId' | 'usuarioId' | 'trabajadorId'>;
  perfil: PerfilNegocio;
}

export const CASOS_LEGAL: CasoPruebaLegal[] = [
  {
    id: 'mx_taqueria',
    titulo: 'Taquería con 3 empleados en la CDMX, sin alta fiscal',
    pais: 'MX',
    producto: {
      nombre: 'Taquería El Fogón',
      categoria: 'Restaurante / comida',
      descripcion: 'Taquería de barrio con venta en mostrador y pedidos por WhatsApp.',
      precio: 25,
    },
    input: {
      forma_juridica: 'Persona Física con Actividad Empresarial',
      tiene_empleados: true,
      numero_empleados: 3,
      vende_en_linea: false,
      exporta_importa: false,
      giro_especifico: 'Taquería',
      estado_constitucion: 'Ciudad de México',
      anios_operando: '1-2',
    },
    perfil: {
      situacion_fiscal: 'no_registrado',
      local_fisico: 'local_rentado',
      sectores_regulados: ['alimentos_bebidas'],
      tipo_clientes: 'consumidor_final',
      marca: 'no',
    },
  },
  {
    id: 'co_ecommerce',
    titulo: 'SAS de moda con tienda en línea en Colombia',
    pais: 'CO',
    producto: {
      nombre: 'Moda Andina',
      categoria: 'Ropa y accesorios',
      descripcion: 'Tienda en línea de ropa de diseño local con envíos a todo el país.',
      precio: 120000,
    },
    input: {
      forma_juridica: 'SAS',
      tiene_empleados: true,
      numero_empleados: 2,
      vende_en_linea: true,
      exporta_importa: false,
      giro_especifico: 'Comercio electrónico de prendas de vestir',
      estado_constitucion: 'Antioquia',
      anios_operando: '1-2',
    },
    perfil: {
      situacion_fiscal: 'registrado',
      regimen_actual: 'Régimen simple de tributación',
      ingresos_anuales: 450000000,
      local_fisico: 'no',
      datos_sensibles: false,
      tipo_clientes: 'consumidor_final',
      marca: 'en_tramite',
    },
  },
  {
    id: 'pe_cafe',
    titulo: 'Exportador de café verde en Perú',
    pais: 'PE',
    producto: {
      nombre: 'Café Altura',
      categoria: 'Café de especialidad',
      descripcion: 'Acopio y exportación de café verde de especialidad a Estados Unidos y Europa.',
      precio: 45,
    },
    input: {
      forma_juridica: 'Sociedad Anónima Cerrada (SAC)',
      tiene_empleados: true,
      numero_empleados: 6,
      vende_en_linea: false,
      exporta_importa: true,
      giro_especifico: 'Exportación de café verde',
      estado_constitucion: 'Cajamarca',
      anios_operando: '3-5',
    },
    perfil: {
      situacion_fiscal: 'registrado',
      regimen_actual: 'Régimen MYPE Tributario',
      local_fisico: 'local_propio',
      sectores_regulados: ['alimentos_bebidas'],
      tipo_clientes: 'empresas',
      marca: 'no_se',
    },
  },
  {
    id: 'cl_dental',
    titulo: 'Clínica dental con 8 empleados en Chile',
    pais: 'CL',
    producto: {
      nombre: 'Clínica Sonrisa',
      categoria: 'Salud dental',
      descripcion: 'Clínica dental con tres sillones, atención particular y convenios.',
      precio: 35000,
    },
    input: {
      forma_juridica: 'Sociedad por Acciones (SpA)',
      tiene_empleados: true,
      numero_empleados: 8,
      vende_en_linea: false,
      exporta_importa: false,
      giro_especifico: 'Clínica dental',
      estado_constitucion: 'Región Metropolitana',
      anios_operando: '+5',
    },
    perfil: {
      situacion_fiscal: 'registrado',
      regimen_actual: 'Régimen Pro Pyme',
      local_fisico: 'local_rentado',
      sectores_regulados: ['salud'],
      datos_sensibles: true,
      tipo_clientes: 'consumidor_final',
      marca: 'registrada',
    },
  },
  {
    id: 'ar_servicios',
    titulo: 'Diseñador web monotributista en Argentina con clientes en el exterior',
    pais: 'AR',
    producto: {
      nombre: 'Estudio Pixel',
      categoria: 'Servicios profesionales',
      descripcion: 'Diseño gráfico y desarrollo web para pymes de Argentina y del exterior.',
      precio: 250000,
    },
    input: {
      forma_juridica: 'Monotributista',
      tiene_empleados: false,
      vende_en_linea: true,
      exporta_importa: true,
      giro_especifico: 'Diseño y desarrollo web (exportación de servicios)',
      estado_constitucion: 'Buenos Aires',
      anios_operando: '1-2',
    },
    perfil: {
      situacion_fiscal: 'registrado',
      regimen_actual: 'Monotributo',
      local_fisico: 'en_casa',
      tipo_clientes: 'empresas',
      marca: 'no',
    },
  },
  {
    // Un puesto en la calle: lo primero es el permiso de vía pública, no una
    // licencia de local; dentro del Metro no se puede vender.
    id: 'mx_tamales_via_publica',
    titulo: 'Puesto de tamales afuera del Metro Niños Héroes (CDMX), sin alta fiscal',
    pais: 'MX',
    producto: {
      nombre: 'Tamales Doña Lupe',
      categoria: 'Alimentos preparados',
      descripcion: 'Tamales, guajolotas y atole de 6:30 a 11:00 en la salida del Metro Niños Héroes.',
      precio: 25,
    },
    input: {
      forma_juridica: 'Persona Física',
      tiene_empleados: true,
      numero_empleados: 1,
      vende_en_linea: false,
      exporta_importa: false,
      giro_especifico: 'Venta de tamales y atole en la calle',
      estado_constitucion: 'Ciudad de México',
      anios_operando: '0',
    },
    perfil: {
      situacion_fiscal: 'no_registrado',
      local_fisico: 'via_publica',
      sectores_regulados: ['alimentos_bebidas'],
      tipo_clientes: 'consumidor_final',
      marca: 'no',
    },
  },
  {
    id: 'gt_tienda',
    titulo: 'Tienda de abarrotes en Guatemala (sin ficha de país ni perfil)',
    pais: 'GT',
    producto: {
      nombre: 'Abarrotería La Esquina',
      categoria: 'Abarrotes',
      descripcion: 'Tienda de abarrotes de barrio.',
      precio: 10,
    },
    input: {
      forma_juridica: 'Pequeño contribuyente',
      tiene_empleados: false,
      vende_en_linea: false,
      exporta_importa: false,
      giro_especifico: 'Tienda de abarrotes',
      estado_constitucion: 'Guatemala',
      anios_operando: '3-5',
    },
    perfil: {},
  },
];

/** El producto ficticio de un caso, en el país indicado (una ficha se prueba en su país). */
export function productoDeCaso(caso: CasoPruebaLegal, pais: string = caso.pais): Producto {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    usuario_id: '00000000-0000-4000-8000-000000000000',
    status: 'activo',
    ...caso.producto,
    pais,
    perfil_negocio: caso.perfil,
  } as Producto;
}
