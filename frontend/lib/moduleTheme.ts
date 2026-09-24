/**
 * Tema visual de los cinco módulos de análisis.
 *
 * Única fuente de verdad para color, títulos y copys de módulo. La consumen
 * tanto las pantallas índice (`/dashboard/{modulo}`, vía `ModuloIndex`) como el
 * detalle de producto (`/dashboard/producto/[productoId]`), para que un módulo
 * se vea igual en cualquier sitio donde aparezca.
 *
 * `hex`  → acento en #RRGGBB (se le concatenan alfas hex: `${hex}1F`).
 * `rgb`  → mismo color como triplete "R G B" para usarlo en CSS moderno:
 *          rgb(var(--pd-rgb) / 0.12). Evita clases dinámicas de Tailwind.
 *
 * Paleta elegida con tonos separados y una misma luminosidad (familia 400 de
 * Tailwind) para que combinen entre sí sobre el lienzo oscuro:
 * cian · rosa · naranja · esmeralda · violeta.
 */

export type ModuloSlug = 'mercado' | 'marketing' | 'ventas' | 'finanzas' | 'legal';

export interface ModuloTheme {
  /** Acento en formato #RRGGBB. */
  hex: string;
  /** Acento como triplete "R G B" (sin comas) para `rgb(... / alpha)`. */
  rgb: string;
  /** Título largo del módulo. */
  titulo: string;
  /** Título corto, para frases y etiquetas. */
  short: string;
  /** Descripción larga (encabezado de la pantalla índice). */
  descripcion: string;
  /** Descripción de una línea (tarjetas del detalle de producto). */
  descripcionCorta: string;
  /** Nombre del análisis en minúscula y masculino, para insertar en frases. */
  nombreAnalisis: string;
}

export const MODULE_THEME: Record<ModuloSlug, ModuloTheme> = {
  mercado: {
    hex: '#22D3EE',
    rgb: '34 211 238',
    titulo: 'Inteligencia de Mercado',
    short: 'Mercado',
    descripcion:
      'Viabilidad, demanda y competencia de tus productos. Revisa el resumen antes de abrir cada informe completo.',
    descripcionCorta: 'Tamaño de mercado, demanda y análisis competitivo',
    nombreAnalisis: 'análisis de mercado',
  },
  marketing: {
    hex: '#F472B6',
    rgb: '244 114 182',
    titulo: 'Estrategia de Marketing',
    short: 'Marketing',
    descripcion:
      'Canales, posicionamiento y estrategias de adquisición para hacer crecer tu marca.',
    descripcionCorta: 'Canales de adquisición y posicionamiento de marca',
    nombreAnalisis: 'análisis de marketing',
  },
  ventas: {
    hex: '#FB923C',
    rgb: '251 146 60',
    titulo: 'Estrategia de Ventas',
    short: 'Ventas',
    descripcion:
      'Proyecciones, funnels y estrategias de conversión para maximizar tus ingresos.',
    descripcionCorta: 'Proyecciones, funnels y conversión',
    nombreAnalisis: 'análisis de ventas',
  },
  finanzas: {
    hex: '#34D399',
    rgb: '52 211 153',
    titulo: 'Análisis Financiero',
    short: 'Finanzas',
    descripcion:
      'Proyecciones financieras, punto de equilibrio y rentabilidad de tu negocio.',
    descripcionCorta: 'Punto de equilibrio, flujo de caja y rentabilidad',
    nombreAnalisis: 'análisis financiero',
  },
  legal: {
    hex: '#A78BFA',
    rgb: '167 139 250',
    titulo: 'Marco Legal',
    short: 'Legal',
    descripcion:
      'Estructura jurídica, registro y cumplimiento normativo para operar con seguridad.',
    descripcionCorta: 'Estructura jurídica y cumplimiento normativo',
    nombreAnalisis: 'análisis legal',
  },
};

/** Orden canónico de los módulos en la interfaz. */
export const ORDEN_MODULOS: ModuloSlug[] = [
  'mercado',
  'marketing',
  'ventas',
  'finanzas',
  'legal',
];