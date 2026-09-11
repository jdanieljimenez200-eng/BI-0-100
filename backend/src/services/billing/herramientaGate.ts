import { CapabilityKey, computePermisosEfectivos } from './planService';
import { esHerramientaContratable, HerramientaKey } from './serviciosCatalogo';
import { PermisosTrabajador } from '../../models/AsignacionTrabajador';

/**
 * Estado de una herramienta para una cuenta+usuario, pensado para que la UI
 * pinte cada card: activa / incluida / de pago no contratada / sin permiso.
 */
export type EstadoHerramienta =
  | 'abrible'          // cuenta la tiene activada Y el usuario tiene permiso
  | 'sin_permiso'      // cuenta la tiene, pero el trabajador no tiene el permiso
  | 'no_contratada';   // la cuenta no la ha activado (mostrar CTA de contratar)

export interface HerramientaResuelta {
  herramienta: HerramientaKey;
  estado: EstadoHerramienta;
  origen: 'incluida' | 'pago' | null; // null si no está contratada
}

/**
 * Función pura (testeable, sin DB). Cruza:
 *  - herramientas que la cuenta tiene desbloqueadas por su PLAN (HERRAMIENTAS_POR_PLAN)
 *  - permisos EFECTIVOS del usuario (owner → todo; trabajador → unión de asignaciones)
 *
 * @param herramientas       catálogo a evaluar (las keys de grupo 'herramientas')
 * @param activadas          herramientas que la cuenta tiene activas, con su origen
 * @param accountRole        'owner' | 'trabajador'
 * @param asignaciones       permisos de las asignaciones activas del trabajador (ignorado para owner)
 */
export function computeHerramientasAbribles(
  herramientas: ReadonlyArray<HerramientaKey>,
  activadas: ReadonlyArray<{ herramienta: string; origen: 'incluida' | 'pago' }>,
  accountRole: string,
  asignaciones: ReadonlyArray<PermisosTrabajador | null | undefined> = [],
): HerramientaResuelta[] {
  const permisos = computePermisosEfectivos(accountRole, asignaciones);

  const origenPorClave = new Map<string, 'incluida' | 'pago'>();
  for (const a of activadas) {
    if (esHerramientaContratable(a.herramienta)) origenPorClave.set(a.herramienta, a.origen);
  }

  return herramientas.map((h) => {
    const origen = origenPorClave.get(h) ?? null;
    if (origen === null) {
      return { herramienta: h, estado: 'no_contratada', origen: null };
    }
    const tienePermiso = permisos[h as CapabilityKey] === true;
    return {
      herramienta: h,
      estado: tienePermiso ? 'abrible' : 'sin_permiso',
      origen,
    };
  });
}
