// Servicio puro de branding — sin DB ni HTTP. Decide qué marca aplicar en las
// superficies white-label (POS, tickets, cotizaciones) según el plan del dueño.
// Las rutas/orchestrators cargan la Marca desde DB y le pasan el objeto a esto.

import { Plan } from '../../models/Usuario';
import { planHasFeature } from '../billing/planService';

// Marca de plataforma por defecto (cuando no hay white-label activo o sin config).
export const MARCA_PLATAFORMA: MarcaResuelta = {
  nombre: 'BI 0 A 100',
  logo_url: null,
  color_primario: '#2563eb',
  dominio: null,
  white_label: false,
};

export interface MarcaResuelta {
  nombre: string;
  logo_url: string | null;
  color_primario: string;
  dominio: string | null;
  white_label: boolean; // true = se está usando la marca del negocio
}

// Forma mínima de la Marca de DB que este servicio consume (evita acoplar al
// modelo TypeORM completo; facilita el testing con objetos planos).
export interface MarcaInput {
  nombre?: string | null;
  logo_url?: string | null;
  paleta_colores?: Record<string, unknown> | null;
  dominio?: string | null;
  activo?: boolean;
}

/**
 * Extrae el color primario de la paleta jsonb con varias claves posibles
 * ("primario", "primary", "principal") y valida que sea un hex razonable.
 */
function extraerColorPrimario(paleta?: Record<string, unknown> | null): string | null {
  if (!paleta || typeof paleta !== 'object') return null;
  const candidatos = ['primario', 'primary', 'principal'];
  for (const clave of candidatos) {
    const valor = paleta[clave];
    if (typeof valor === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(valor.trim())) {
      return valor.trim();
    }
  }
  return null;
}

/**
 * Decide la marca efectiva a aplicar.
 *
 * @param marca Marca del negocio (de DB) o null si no configuró ninguna.
 * @param plan  Plan del dueño de la cuenta.
 * @returns MarcaResuelta lista para pintar en POS/tickets/cotizaciones.
 *
 * Reglas:
 *  - Si el plan NO tiene white_label → siempre marca de plataforma.
 *  - Si lo tiene pero no hay Marca activa/configurada → marca de plataforma.
 *  - Si lo tiene y hay Marca → marca del negocio, con fallback campo a campo.
 */
export function resolveMarca(marca: MarcaInput | null | undefined, plan: Plan): MarcaResuelta {
  if (!planHasFeature(plan, 'white_label')) {
    return { ...MARCA_PLATAFORMA };
  }

  if (!marca || marca.activo === false) {
    return { ...MARCA_PLATAFORMA };
  }

  const nombre = typeof marca.nombre === 'string' && marca.nombre.trim() ? marca.nombre.trim() : null;
  // Sin al menos un nombre propio no tiene sentido "activar" la marca del negocio.
  if (!nombre) {
    return { ...MARCA_PLATAFORMA };
  }

  const colorPrimario = extraerColorPrimario(marca.paleta_colores) ?? MARCA_PLATAFORMA.color_primario;
  const logo = typeof marca.logo_url === 'string' && marca.logo_url.trim() ? marca.logo_url.trim() : null;
  const dominio = typeof marca.dominio === 'string' && marca.dominio.trim() ? marca.dominio.trim() : null;

  return {
    nombre,
    logo_url: logo,
    color_primario: colorPrimario,
    dominio,
    white_label: true,
  };
}