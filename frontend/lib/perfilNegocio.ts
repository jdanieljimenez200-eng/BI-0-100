import { PAISES_LATAM } from '@/lib/latam';

/**
 * Perfil ampliado del negocio («Afina tu análisis»).
 *
 * Gemelo de `backend/src/services/ia/perfilNegocio.ts`: se mueven juntos. Se
 * guarda en el producto y lo reutilizan todos los módulos; todo es opcional.
 */

export const SECTORES_REGULADOS = [
  { value: 'alimentos_bebidas', label: 'Alimentos y bebidas' },
  { value: 'bebidas_alcoholicas', label: 'Bebidas alcohólicas' },
  { value: 'salud', label: 'Salud' },
  { value: 'farmacia_cosmeticos', label: 'Farmacia y cosméticos' },
  { value: 'educacion', label: 'Educación' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'construccion', label: 'Construcción' },
  { value: 'financiero', label: 'Servicios financieros' },
  { value: 'turismo_hospedaje', label: 'Turismo y hospedaje' },
  { value: 'armas_seguridad', label: 'Seguridad privada' },
  { value: 'ninguno', label: 'Ninguno de estos' },
] as const;

export type SectorRegulado = (typeof SECTORES_REGULADOS)[number]['value'];

export interface PerfilNegocio {
  situacion_fiscal?: 'registrado' | 'no_registrado' | 'no_se' | null;
  regimen_actual?: string | null;
  ingresos_anuales?: number | null;
  local_fisico?: 'no' | 'en_casa' | 'local_rentado' | 'local_propio' | 'via_publica' | null;
  sectores_regulados?: SectorRegulado[] | null;
  datos_sensibles?: boolean | null;
  tipo_clientes?: 'consumidor_final' | 'empresas' | 'gobierno' | 'mixto' | null;
  marca?: 'registrada' | 'en_tramite' | 'no' | 'no_se' | null;
  // Cómo cobra y paga el negocio (Finanzas; ver CAMPOS_FINANCIEROS en el backend).
  precio_incluye_impuesto?: boolean | null;
  comision_venta_pct?: number | null;
  dias_cobro?: number | null;
  dias_pago?: number | null;
  pago_deuda_mensual?: number | null;
  /** % de lo que se prepara o compra que no se vende (comida y perecederos). */
  merma_pct?: number | null;
}

export const OPCIONES = {
  situacion_fiscal: [
    { value: 'registrado', label: 'Sí, ya estoy dado de alta' },
    { value: 'no_registrado', label: 'Todavía no' },
    { value: 'no_se', label: 'No lo sé' },
  ],
  local_fisico: [
    { value: 'no', label: 'Sin local (en línea o a domicilio)' },
    { value: 'en_casa', label: 'Desde mi casa' },
    { value: 'local_rentado', label: 'Local rentado' },
    { value: 'local_propio', label: 'Local propio' },
    { value: 'via_publica', label: 'Puesto en la calle (fijo, semifijo o ambulante)' },
  ],
  tipo_clientes: [
    { value: 'consumidor_final', label: 'Personas (consumidor final)' },
    { value: 'empresas', label: 'Empresas' },
    { value: 'gobierno', label: 'Gobierno' },
    { value: 'mixto', label: 'Varios de estos' },
  ],
  marca: [
    { value: 'registrada', label: 'Registrada' },
    { value: 'en_tramite', label: 'En trámite' },
    { value: 'no', label: 'No registrada' },
    { value: 'no_se', label: 'No lo sé' },
  ],
} as const;

export function monedaDePais(pais?: string | null): string {
  return PAISES_LATAM.find((p) => p.code === pais)?.moneda ?? '';
}

/** Lo guardado en el producto, sin fiarse de su forma. */
export function leerPerfil(valor: unknown): PerfilNegocio {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as PerfilNegocio) : {};
}

/**
 * Lo que se manda: lo contestado y los `null` (respuesta quitada, que el backend
 * borra). `undefined` si no hay nada que mandar.
 */
export function perfilParaEnviar(perfil: PerfilNegocio): PerfilNegocio | undefined {
  const limpio: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(perfil)) {
    if (valor === undefined || valor === '') continue;
    if (Array.isArray(valor) && valor.length === 0) continue;
    limpio[clave] = valor;
  }
  return Object.keys(limpio).length ? (limpio as PerfilNegocio) : undefined;
}
