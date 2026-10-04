import type { PerfilNegocio } from './perfilNegocio';
import type { MarketingAnalisisInput, MercadoContexto } from '../marketing/types';
import type { ProductoMarketing } from '../marketing/marketingOrchestrator';

/**
 * Negocios ficticios para probar el modo de Marketing antes de publicarlo.
 *
 * Cubren lanzamiento y crecimiento, producto y servicio, B2C y B2B, con y sin
 * contexto de mercado, y un caso que ya probó anuncios sin resultado (el plan
 * no debe recomendar lo mismo).
 */
export interface CasoPruebaMarketing {
  id: string;
  titulo: string;
  pais: string;
  producto: Omit<ProductoMarketing, 'pais' | 'perfil_negocio'>;
  input: Omit<MarketingAnalisisInput, 'productoId' | 'usuarioId'>;
  /** Contexto de un análisis de Mercado previo (sin él, el caso prueba la falta de contexto). */
  ctx?: MercadoContexto;
  /** Resumen del ICP de Ventas, si el negocio tiene uno. */
  icpVentas?: string;
  perfil: PerfilNegocio;
}

export const CASOS_MARKETING: CasoPruebaMarketing[] = [
  {
    // Puesto en la calle que solo usa Instagram y Facebook: el plan no debe
    // sugerir LinkedIn ni Google Ads, ni ofrecer garantías que el dueño no dio.
    id: 'mx_tamales_via_publica',
    titulo: 'Puesto de tamales afuera del Metro Niños Héroes (CDMX)',
    pais: 'MX',
    producto: {
      nombre: 'Tamales Doña Lupe',
      categoria: 'Alimentos preparados',
      descripcion: 'Tamales, guajolotas y atole de 6:30 a 11:00 en la salida del Metro Niños Héroes.',
      precio: 25,
      tipo_actividad: 'producto',
    },
    input: {
      vozMarca: 'Empático',
      presupuestoMensual: 800,
      metaCampana: 'Lanzamiento',
      plataformas: ['Instagram', 'Facebook'],
      capacidadContenido: '1-2/semana',
      canalCierre: 'tienda_fisica',
      nivelTraccion: 'desde_cero',
      activos: ['fotos_propias', 'local_visible'],
      zonaClientes: 'Colonia Doctores, salida del Metro Niños Héroes',
      clienteIdeal: 'Oficinistas y gente que va a los juzgados de la colonia Doctores y desayuna de camino',
    },
    perfil: { tipo_clientes: 'consumidor_final', local_fisico: 'via_publica' },
  },
  {
    id: 'mx_reposteria_lanzamiento',
    titulo: 'Lanzamiento de repostería por pedido en Querétaro',
    pais: 'MX',
    producto: {
      nombre: 'Dulce Merced',
      categoria: 'Repostería',
      descripcion: 'Pasteles personalizados por pedido con 48 h de anticipación.',
      precio: 650,
      tipo_actividad: 'producto',
      puv: 'Diseños personalizados con boceto gratis antes de pagar',
    },
    input: {
      vozMarca: 'Divertido',
      presupuestoMensual: 2500,
      metaCampana: 'Lanzamiento',
      plataformas: ['Instagram', 'WhatsApp'],
      capacidadContenido: '3-4/semana',
      canalCierre: 'whatsapp_dm',
      nivelTraccion: 'desde_cero',
      activos: ['fotos_propias', 'lista_clientes'],
      zonaClientes: 'Querétaro capital',
    },
    ctx: { viabilidad_score: 68, total_competidores: 14, precio_mercado_promedio: 580, tendencia: 'CRECIENTE', gap_detectado: 'Nadie ofrece boceto previo' },
    perfil: { tipo_clientes: 'consumidor_final', local_fisico: 'en_casa' },
  },
  {
    id: 'co_contabilidad_b2b',
    titulo: 'Firma contable para pymes en Cali que crece en LinkedIn',
    pais: 'CO',
    producto: {
      nombre: 'Balance Claro',
      categoria: 'Servicios contables',
      descripcion: 'Contabilidad y declaraciones para pymes de 5 a 50 empleados.',
      precio: 900000,
      tipo_actividad: 'servicio',
      puv: 'Respuesta en 24 horas y reporte mensual en lenguaje simple',
    },
    input: {
      vozMarca: 'Profesional',
      presupuestoMensual: 1500000,
      metaCampana: 'Crecimiento',
      plataformas: ['LinkedIn', 'Facebook'],
      capacidadContenido: '1-2/semana',
      canalCierre: 'llamada',
      nivelTraccion: 'en_marcha',
      margenEstimado: 'alto_50_70',
      yaProbado: 'Anuncios en Facebook para todo Colombia: muchos clics, cero llamadas',
      activos: ['testimonios'],
      zonaClientes: 'Valle del Cauca',
    },
    icpVentas: 'Cliente ideal (de Ventas): 35-55 años, dueños de pymes de comercio y servicios en Cali. Le preocupa: multas de la DIAN, perder tiempo. Objeciones frecuentes: ya tengo contador; es caro.',
    perfil: { tipo_clientes: 'empresas' },
  },
  {
    id: 'pe_gimnasio_crecimiento',
    titulo: 'Gimnasio de barrio en Lima con reporte de anuncios',
    pais: 'PE',
    producto: {
      nombre: 'Fuerza Barranco',
      categoria: 'Gimnasio',
      descripcion: 'Gimnasio con clases grupales y entrenamiento funcional.',
      precio: 120,
      tipo_actividad: 'servicio',
      puv: 'Primera semana gratis con plan de entrenamiento',
    },
    input: {
      vozMarca: 'Urgente',
      presupuestoMensual: 900,
      metaCampana: 'Crecimiento',
      plataformas: ['Instagram', 'TikTok', 'WhatsApp'],
      capacidadContenido: 'diario',
      canalCierre: 'whatsapp_dm',
      nivelTraccion: 'en_marcha',
      activos: ['videos_propios', 'seguidores', 'local_visible'],
      zonaClientes: 'Barranco y Chorrillos',
    },
    ctx: { viabilidad_score: 61, total_competidores: 9, precio_mercado_promedio: 140, tendencia: 'ESTABLE', gap_detectado: null },
    perfil: { tipo_clientes: 'consumidor_final', local_fisico: 'local_rentado' },
  },
  {
    id: 'cl_tienda_online_cosmetica',
    titulo: 'Tienda online de cosmética natural en Concepción',
    pais: 'CL',
    producto: {
      nombre: 'Raíz Austral',
      categoria: 'Belleza y cuidado personal',
      descripcion: 'Cremas y jabones con ingredientes nativos, venta online.',
      precio: 12990,
      tipo_actividad: 'producto',
      puv: null,
    },
    input: {
      vozMarca: 'Empático',
      presupuestoMensual: 150000,
      metaCampana: 'Crecimiento',
      plataformas: ['Instagram', 'Facebook'],
      capacidadContenido: '3-4/semana',
      canalCierre: 'ecommerce_web',
      nivelTraccion: 'escalando',
      margenEstimado: 'premium_70_plus',
      clienteIdeal: 'Mujeres de 25 a 45 años que buscan cosmética natural',
    },
    perfil: { tipo_clientes: 'consumidor_final', sectores_regulados: ['farmacia_cosmeticos'] },
  },
  {
    id: 'ar_idea_sin_contexto',
    titulo: 'Idea de clases de cerámica en Mendoza, sin contexto previo',
    pais: 'AR',
    producto: {
      nombre: 'Barro Vivo',
      categoria: 'Talleres y cursos',
      descripcion: null,
      precio: 30000,
      tipo_actividad: 'servicio',
      puv: null,
    },
    input: {
      vozMarca: 'Profesional',
      presupuestoMensual: 50000,
      metaCampana: 'Lanzamiento',
      plataformas: ['Instagram'],
      capacidadContenido: '1-2/semana',
    },
    perfil: {},
  },
];
