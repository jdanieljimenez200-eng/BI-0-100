import type { PerfilNegocio } from './perfilNegocio';

/**
 * Negocios ficticios para probar el modo de Ventas antes de publicarlo.
 *
 * Cubren venta directa por WhatsApp, B2B con comité, servicios, marketplace y
 * un caso sin datos del embudo (debe declarar los supuestos y no inventar
 * testimonios ni cifras de clientes).
 */
export interface CasoPruebaVentas {
  id: string;
  titulo: string;
  pais: string;
  producto: {
    nombre: string;
    categoria: string;
    descripcion: string | null;
    precio: number;
    puv: string | null;
    cliente_ideal: string | null;
    tipo_actividad: 'producto' | 'servicio';
    estatus_proyecto: 'nueva_idea' | 'negocio_en_marcha';
  };
  /** Lo que llega del formulario (incluido el embudo). */
  formulario: Record<string, unknown>;
  perfil: PerfilNegocio;
}

export const CASOS_VENTAS: CasoPruebaVentas[] = [
  {
    id: 'mx_ropa_whatsapp',
    titulo: 'Ropa deportiva por WhatsApp en Puebla',
    pais: 'MX',
    producto: {
      nombre: 'Ritmo Activo',
      categoria: 'Ropa deportiva',
      descripcion: 'Leggings y tops de tela compresiva hechos en Puebla, tallas de la CH a la 3XL.',
      precio: 489,
      puv: 'Tallas grandes reales y cambio de talla gratis',
      cliente_ideal: 'Mujeres de 25 a 45 años que entrenan en casa o en gimnasios de barrio',
      tipo_actividad: 'producto',
      estatus_proyecto: 'negocio_en_marcha',
    },
    formulario: {
      tipo_venta: 'B2C_directo',
      canal_principal: 'redes_sociales',
      ticket_promedio: 720,
      tamano_equipo: 'solo_tu',
      objetivo_ventas: 'Pasar de 60 a 100 pedidos al mes',
      contactos_mes: 240,
      tasa_cierre_pct: 25,
      ciclo_venta: 'dias',
      objeciones_frecuentes: 'Me queda la duda de la talla; está caro comparado con el tianguis',
    },
    perfil: { tipo_clientes: 'consumidor_final', local_fisico: 'en_casa' },
  },
  {
    id: 'co_software_b2b',
    titulo: 'Software de inventarios para ferreterías en Bogotá',
    pais: 'CO',
    producto: {
      nombre: 'StockFácil',
      categoria: 'Software para negocios',
      descripcion: 'Sistema de inventario y facturación para ferreterías medianas, con soporte local.',
      precio: 390000,
      puv: 'Implementación en una semana y soporte por WhatsApp',
      cliente_ideal: 'Ferreterías con 2 a 10 empleados',
      tipo_actividad: 'servicio',
      estatus_proyecto: 'negocio_en_marcha',
    },
    formulario: {
      tipo_venta: 'B2B',
      canal_principal: 'telefono',
      ticket_promedio: 390000,
      tamano_equipo: '1_2_personas',
      objetivo_ventas: 'Cerrar 8 ferreterías nuevas por trimestre',
      contactos_mes: 30,
      tasa_cierre_pct: 10,
      ciclo_venta: 'semanas',
      quien_decide: 'dueno_empresa',
      objeciones_frecuentes: 'Ya usamos Excel; me da miedo migrar los datos',
    },
    perfil: { tipo_clientes: 'empresas' },
  },
  {
    id: 'pe_dental_servicios',
    titulo: 'Clínica dental de barrio en Arequipa',
    pais: 'PE',
    producto: {
      nombre: 'Sonrisa Clara',
      categoria: 'Salud dental',
      descripcion: 'Limpiezas, resinas y ortodoncia con pago en cuotas.',
      precio: 180,
      puv: 'Ortodoncia en cuotas sin intereses',
      cliente_ideal: 'Familias del distrito y jóvenes que quieren ortodoncia',
      tipo_actividad: 'servicio',
      estatus_proyecto: 'negocio_en_marcha',
    },
    formulario: {
      tipo_venta: 'servicios',
      canal_principal: 'combinado',
      ticket_promedio: 180,
      tamano_equipo: '3_mas_personas',
      contactos_mes: 90,
      tasa_cierre_pct: 40,
      ciclo_venta: 'dias',
      quien_decide: 'pareja_familia',
    },
    perfil: { tipo_clientes: 'consumidor_final', sectores_regulados: ['salud'], datos_sensibles: true },
  },
  {
    id: 'cl_marketplace_hogar',
    titulo: 'Artículos de cocina en marketplace en Santiago',
    pais: 'CL',
    producto: {
      nombre: 'Cocina Austral',
      categoria: 'Hogar y cocina',
      descripcion: 'Utensilios de madera nativa y cerámica hecha a mano.',
      precio: 14990,
      puv: null,
      cliente_ideal: null,
      tipo_actividad: 'producto',
      estatus_proyecto: 'negocio_en_marcha',
    },
    formulario: {
      tipo_venta: 'B2C_directo',
      canal_principal: 'marketplace',
      ticket_promedio: 18500,
      tamano_equipo: '1_2_personas',
      objetivo_ventas: 'Subir el ticket promedio con packs',
      tasa_cierre_pct: 3,
    },
    perfil: { tipo_clientes: 'consumidor_final' },
  },
  {
    id: 'ar_idea_sin_embudo',
    titulo: 'Idea de clases de guitarra online en Rosario, sin datos del embudo',
    pais: 'AR',
    producto: {
      nombre: 'Seis Cuerdas',
      categoria: 'Educación',
      descripcion: null,
      precio: 25000,
      puv: null,
      cliente_ideal: null,
      tipo_actividad: 'servicio',
      estatus_proyecto: 'nueva_idea',
    },
    formulario: {
      tipo_venta: 'servicios',
      canal_principal: 'redes_sociales',
      ticket_promedio: 25000,
      tamano_equipo: 'solo_tu',
    },
    perfil: {},
  },
];
