import { VerticalKey } from './verticalService';

/**
 * Definición declarativa de los campos de expediente por vertical.
 *
 * Estos campos NO son columnas de la tabla `clientes`: se guardan dentro de
 * `atributos_extra` (jsonb). El frontend renderiza `<CamposExpediente>` a partir
 * de este catálogo y el backend valida contra él en el PATCH de merge.
 *
 * Servicio PURO (sin DB, sin HTTP) — cubierto por unit tests, igual que
 * verticalService.
 */

export type TipoCampo = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'tel' | 'email';

export interface CampoExpediente {
  /** Clave dentro de atributos_extra (kebab/snake estable, nunca cambia). */
  key: string;
  /** Etiqueta visible en el formulario. */
  label: string;
  tipo: TipoCampo;
  /** Solo para tipo 'select'. */
  opciones?: readonly string[];
  /** Texto de ayuda opcional bajo el campo. */
  ayuda?: string;
  /** Marca visual de obligatorio (no bloquea el guardado parcial). */
  requerido?: boolean;
}

/**
 * Campos comunes a cualquier contacto, independientes del vertical.
 * Se anteponen a los específicos de cada profesión.
 */
const CAMPOS_COMUNES: readonly CampoExpediente[] = [
  { key: 'como_nos_conocio', label: 'Cómo nos conoció', tipo: 'select',
    opciones: ['Recomendación', 'Redes sociales', 'Búsqueda web', 'Publicidad', 'Otro'] },
  { key: 'fecha_alta', label: 'Fecha de alta', tipo: 'date' },
] as const;

/**
 * Catálogo específico por vertical. La key del vertical mapea a la lista de
 * campos que solo tienen sentido en esa profesión.
 */
const CATALOGO: Record<VerticalKey, readonly CampoExpediente[]> = {
  oftalmologo: [
    { key: 'num_expediente', label: 'Nº de expediente', tipo: 'text', requerido: true },
    { key: 'graduacion_od', label: 'Graduación OD (ojo derecho)', tipo: 'text',
      ayuda: 'Formato esfera/cilindro x eje, ej. -2.00 / -0.75 x 180' },
    { key: 'graduacion_oi', label: 'Graduación OI (ojo izquierdo)', tipo: 'text',
      ayuda: 'Formato esfera/cilindro x eje, ej. -1.75 / -0.50 x 175' },
    { key: 'ultima_revision', label: 'Última revisión', tipo: 'date' },
    { key: 'usa_lentes_contacto', label: 'Usa lentes de contacto', tipo: 'select',
      opciones: ['Sí', 'No'] },
  ],
  medico: [
    { key: 'num_expediente', label: 'Nº de expediente', tipo: 'text', requerido: true },
    { key: 'fecha_nacimiento', label: 'Fecha de nacimiento', tipo: 'date' },
    { key: 'tipo_sangre', label: 'Tipo de sangre', tipo: 'select',
      opciones: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Desconoce'] },
    { key: 'alergias', label: 'Alergias', tipo: 'textarea',
      ayuda: 'Medicamentos, alimentos u otras alergias relevantes.' },
    { key: 'padecimientos', label: 'Padecimientos crónicos', tipo: 'textarea' },
  ],
  quiropractico: [
    { key: 'num_expediente', label: 'Nº de expediente', tipo: 'text', requerido: true },
    { key: 'motivo_consulta', label: 'Motivo de consulta', tipo: 'textarea' },
    { key: 'zona_afectada', label: 'Zona afectada', tipo: 'select',
      opciones: ['Cervical', 'Dorsal', 'Lumbar', 'Sacro/coxis', 'Extremidades', 'Mixta'] },
    { key: 'nivel_dolor', label: 'Nivel de dolor (0-10)', tipo: 'number' },
    { key: 'ultima_sesion', label: 'Última sesión', tipo: 'date' },
  ],
  abogado: [
    { key: 'num_expediente', label: 'Nº de expediente', tipo: 'text', requerido: true },
    { key: 'materia', label: 'Materia', tipo: 'select',
      opciones: ['Civil', 'Penal', 'Laboral', 'Mercantil', 'Familiar', 'Fiscal', 'Administrativo'] },
    { key: 'numero_juicio', label: 'Nº de juicio / carpeta', tipo: 'text' },
    { key: 'juzgado', label: 'Juzgado / autoridad', tipo: 'text' },
    { key: 'estatus_caso', label: 'Estatus del caso', tipo: 'select',
      opciones: ['Consulta', 'En trámite', 'En litigio', 'Sentencia', 'Cerrado'] },
    { key: 'proxima_audiencia', label: 'Próxima audiencia', tipo: 'date' },
  ],
  pyme: [
    { key: 'rfc', label: 'RFC', tipo: 'text' },
    { key: 'razon_social', label: 'Razón social', tipo: 'text' },
    { key: 'giro', label: 'Giro / actividad', tipo: 'text' },
    { key: 'condiciones_pago', label: 'Condiciones de pago', tipo: 'select',
      opciones: ['Contado', '15 días', '30 días', '60 días', 'Otro'] },
    { key: 'limite_credito', label: 'Límite de crédito', tipo: 'number' },
  ],
};

/**
 * Devuelve la lista de campos de expediente para un vertical dado.
 * Si el vertical es null o desconocido, devuelve solo los campos comunes
 * (nunca lanza — el expediente siempre puede renderizarse).
 */
export function camposExpedientePorVertical(vertical: string | null): CampoExpediente[] {
  const especificos = vertical && vertical in CATALOGO
    ? CATALOGO[vertical as VerticalKey]
    : [];
  return [...CAMPOS_COMUNES, ...especificos];
}

/**
 * Normaliza el valor de un campo `number`. El frontend envía los inputs como
 * string, así que aquí se convierten a `number` real (o `null` si viene vacío
 * o no es numérico), para que atributos_extra guarde tipos consistentes.
 */
function normalizarNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Filtra un objeto de valores dejando SOLO las keys reconocidas para el
 * vertical. Descarta cualquier key no declarada (evita que el cliente
 * inyecte campos arbitrarios en atributos_extra vía el PATCH de merge) y
 * castea cada valor al tipo declarado (hoy: `number` → número o null).
 */
export function filtrarAtributosPermitidos(
  vertical: string | null,
  valores: Record<string, unknown>,
): Record<string, unknown> {
  const tipoPorKey = new Map(camposExpedientePorVertical(vertical).map((c) => [c.key, c.tipo]));
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valores)) {
    const tipo = tipoPorKey.get(k);
    if (tipo === undefined) continue;
    salida[k] = tipo === 'number' ? normalizarNumero(v) : v;
  }
  return salida;
}