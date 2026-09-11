import {
  computePermisosEfectivos,
  CAPABILITIES,
  CapabilityKey,
} from '../../services/billing/planService';
import { PermisosTrabajador } from '../../models/AsignacionTrabajador';

const ALL_KEYS = CAPABILITIES.map((c) => c.key);

describe('computePermisosEfectivos', () => {
  it('devuelve siempre todas las claves del catálogo', () => {
    const permisos = computePermisosEfectivos('trabajador', []);
    expect(Object.keys(permisos).sort()).toEqual([...ALL_KEYS].sort());
  });

  it('owner: todas las capacidades en true (ignora asignaciones)', () => {
    const permisos = computePermisosEfectivos('owner');
    for (const key of ALL_KEYS) {
      expect(permisos[key]).toBe(true);
    }
  });

  it('owner: sigue dando todo aunque se pasen asignaciones vacías', () => {
    const permisos = computePermisosEfectivos('owner', [{}]);
    expect(ALL_KEYS.every((k) => permisos[k] === true)).toBe(true);
  });

  it('trabajador sin asignaciones: todo en false', () => {
    const permisos = computePermisosEfectivos('trabajador', []);
    for (const key of ALL_KEYS) {
      expect(permisos[key]).toBe(false);
    }
  });

  it('trabajador: una capacidad concedida en una asignación queda en true', () => {
    const asignaciones: PermisosTrabajador[] = [{ mercado: true }];
    const permisos = computePermisosEfectivos('trabajador', asignaciones);
    expect(permisos.mercado).toBe(true);
    expect(permisos.finanzas).toBe(false);
  });

  it('trabajador: unión sobre múltiples asignaciones (productos distintos)', () => {
    const asignaciones: PermisosTrabajador[] = [
      { mercado: true, pos: true },
      { inventario: true, mercado: false },
    ];
    const permisos = computePermisosEfectivos('trabajador', asignaciones);
    expect(permisos.mercado).toBe(true); // true en la primera
    expect(permisos.pos).toBe(true);
    expect(permisos.inventario).toBe(true); // true en la segunda
    expect(permisos.contabilidad).toBe(false);
  });

  it('trabajador: capacidad en false en todas las asignaciones permanece false', () => {
    const asignaciones: PermisosTrabajador[] = [
      { finanzas: false },
      { finanzas: false, mercado: true },
    ];
    const permisos = computePermisosEfectivos('trabajador', asignaciones);
    expect(permisos.finanzas).toBe(false);
    expect(permisos.mercado).toBe(true);
  });

  it('trabajador: tolera asignaciones null/undefined sin romper', () => {
    const asignaciones = [null, undefined, { citas: true }] as Array<
      PermisosTrabajador | null | undefined
    >;
    const permisos = computePermisosEfectivos('trabajador', asignaciones);
    expect(permisos.citas).toBe(true);
  });

  it('capacidades sensibles arrancan en false para trabajador sin concesión', () => {
    const sensibles = CAPABILITIES.filter((c) => c.sensible).map((c) => c.key);
    const permisos = computePermisosEfectivos('trabajador', [{ mercado: true }]);
    for (const key of sensibles as CapabilityKey[]) {
      expect(permisos[key]).toBe(false);
    }
  });
});
