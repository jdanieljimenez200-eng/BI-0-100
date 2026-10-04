import type { PerfilNegocio } from './perfilNegocio';
import type { BriefAnalisisInput } from '../brief/types';
import type { ProductoBrief } from '../brief/transparenciaBrief';

/**
 * Negocios ficticios para probar el modo del Brief de marca antes de publicarlo.
 *
 * Cubren un negocio que conserva nombre y logo, una marca nueva de producto,
 * un servicio a empresas, un puesto en la calle y un caso casi sin datos (el
 * brief debe decir qué le falta y no inventar historia ni cifras).
 */
export interface CasoPruebaBrief {
  id: string;
  titulo: string;
  pais: string;
  producto: Omit<ProductoBrief, 'pais'>;
  input: Omit<BriefAnalisisInput, 'productoId' | 'usuarioId'>;
  perfil: PerfilNegocio;
}

export const CASOS_BRIEF: CasoPruebaBrief[] = [
  {
    id: 'mx_cafeteria_conserva_logo',
    titulo: 'Cafetería de especialidad en Guadalajara que quiere conservar su nombre y su logo',
    pais: 'MX',
    producto: {
      nombre: 'Café Tlaquepaque',
      categoria: 'Cafetería',
      descripcion: 'Café de especialidad de productores de Chiapas y Veracruz, con pan dulce del día.',
      puv: 'Café de un solo origen tostado en el local cada semana',
      cliente_ideal: 'Oficinistas y estudiantes de la zona que trabajan desde la cafetería',
    },
    input: {
      percepcion: ['Cercano', 'Artesanal'],
      emocion: 'Pertenencia',
      anti_valores: ['Lujoso'],
      estilo_visual: 'Artesanal/Handmade',
      paleta_elegida: 'A',
      tipo_logo: 'Imagotipo (texto+ícono separados)',
      simbolo_representativo: 'La taza de barro',
      resultado_cliente: 'Un lugar para trabajar con buen café sin pagar precios de cadena',
      tono_comunicacion: 'Cercano y cálido',
      posicionamiento: 'Especialista (nicho específico)',
      nivel_diferenciacion: 'Medio (algunas diferencias)',
      marcas_admiradas: 'Cafeterías de barrio con identidad hecha a mano',
      marcas_evitar: 'Cadenas grandes de café',
      elementos_conservar: 'El nombre y la taza de barro del logo actual',
      usos_marca: ['local_letrero', 'empaque', 'redes_sociales'],
    },
    perfil: { tipo_clientes: 'consumidor_final', local_fisico: 'local_rentado' },
  },
  {
    id: 'co_ropa_marca_nueva',
    titulo: 'Marca nueva de ropa deportiva en Medellín, vende por Instagram',
    pais: 'CO',
    producto: {
      nombre: 'Andina Active',
      categoria: 'Ropa deportiva',
      descripcion: 'Leggings y tops con telas recicladas, hechos en Medellín.',
      puv: 'Telas recicladas con tallas reales de mujer colombiana',
      cliente_ideal: 'Mujeres de 25 a 40 años que entrenan en casa o en el parque',
    },
    input: {
      percepcion: ['Atrevido', 'Natural'],
      emocion: 'Aspiración',
      anti_valores: ['Clásico'],
      estilo_visual: 'Bold/Impactante',
      paleta_elegida: 'B',
      tipo_logo: 'Logotipo (solo texto)',
      simbolo_representativo: '',
      resultado_cliente: 'Sentirse cómoda y segura entrenando',
      tono_comunicacion: 'Inspirador y aspiracional',
      posicionamiento: 'Innovador (primero en su tipo)',
      nivel_diferenciacion: 'Alto (claramente distinto)',
      usos_marca: ['redes_sociales', 'empaque', 'sitio_web'],
    },
    perfil: { tipo_clientes: 'consumidor_final', local_fisico: 'en_casa' },
  },
  {
    id: 'pe_consultora_b2b',
    titulo: 'Consultora de seguridad y salud en el trabajo para empresas en Lima',
    pais: 'PE',
    producto: {
      nombre: 'Prevenir SST',
      categoria: 'Servicios profesionales',
      descripcion: 'Planes de seguridad y salud en el trabajo y capacitaciones para empresas medianas.',
      puv: null,
      cliente_ideal: 'Gerentes de operaciones de empresas industriales de 50 a 300 trabajadores',
    },
    input: {
      percepcion: ['Confiable', 'Moderno'],
      emocion: 'Seguridad',
      anti_valores: ['Divertido'],
      estilo_visual: 'Minimalista',
      paleta_elegida: 'C',
      tipo_logo: 'Isologo (texto+ícono juntos)',
      simbolo_representativo: 'Un escudo',
      resultado_cliente: 'Cumplir la normativa sin parar la operación',
      tono_comunicacion: 'Profesional y serio',
      posicionamiento: 'Confiable (el de siempre)',
      nivel_diferenciacion: 'Bajo (similar a competencia)',
      usos_marca: ['impresos', 'uniformes', 'sitio_web'],
    },
    perfil: { tipo_clientes: 'empresas', local_fisico: 'local_rentado' },
  },
  {
    id: 'mx_tamales_via_publica',
    titulo: 'Puesto de tamales afuera del Metro Niños Héroes (CDMX)',
    pais: 'MX',
    producto: {
      nombre: 'Tamales Doña Lupe',
      categoria: 'Alimentos preparados',
      descripcion: 'Tamales, guajolotas y atole de 6:30 a 11:00 en la salida del Metro Niños Héroes.',
      puv: 'Receta de la abuela y atole hecho en el momento',
      cliente_ideal: 'Oficinistas y gente que va a los juzgados de la colonia Doctores y desayuna de camino',
    },
    input: {
      percepcion: ['Cercano', 'Tradicional'],
      emocion: 'Nostalgia',
      anti_valores: ['Lujoso'],
      estilo_visual: 'Artesanal/Handmade',
      paleta_elegida: 'A',
      tipo_logo: 'Logotipo (solo texto)',
      simbolo_representativo: 'La olla tamalera',
      resultado_cliente: 'Un desayuno caliente y rápido como el de casa',
      tono_comunicacion: 'Cercano y cálido',
      posicionamiento: 'Confiable (el de siempre)',
      nivel_diferenciacion: 'Medio (algunas diferencias)',
      elementos_conservar: 'El nombre «Doña Lupe», que ya conocen los clientes',
      usos_marca: ['local_letrero', 'uniformes', 'empaque'],
    },
    perfil: { tipo_clientes: 'consumidor_final', local_fisico: 'via_publica' },
  },
  {
    id: 'cl_panaderia_sin_datos',
    titulo: 'Panadería en Valparaíso casi sin datos (el brief debe decir qué falta)',
    pais: 'CL',
    producto: {
      nombre: 'Panadería El Puerto',
      categoria: 'Panadería',
      descripcion: null,
      puv: null,
      cliente_ideal: null,
    },
    input: {
      percepcion: ['Clásico'],
      emocion: 'Confianza',
      anti_valores: [],
      estilo_visual: 'Minimalista',
      paleta_elegida: 'A',
      tipo_logo: 'Logotipo (solo texto)',
      simbolo_representativo: '',
      resultado_cliente: '',
      tono_comunicacion: 'Cercano y cálido',
      posicionamiento: 'Confiable (el de siempre)',
      nivel_diferenciacion: 'Bajo (similar a competencia)',
    },
    perfil: {},
  },
];
