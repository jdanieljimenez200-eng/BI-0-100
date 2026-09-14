import {
  computePermisosEfectivos,
  CAPABILITIES,
  canAddTrabajador,
  isCapabilityKey,
} from '../../services/billing/planService';
import type { PermisosTrabajador } from '../../models/AsignacionTrabajador';

describe('Equipo Business Logic & Security Tests', () => {
  describe('Capacidades y Permisos Efectivos', () => {
    it('el catálogo contiene todas las capacidades de análisis incluyendo ventas', () => {
      const capsAnalisis = CAPABILITIES.filter((c) => c.grupo === 'analisis').map((c) => c.key);
      expect(capsAnalisis).toContain('mercado');
      expect(capsAnalisis).toContain('marketing');
      expect(capsAnalisis).toContain('ventas');
      expect(capsAnalisis).toContain('brief');
      expect(capsAnalisis).toContain('finanzas');
      expect(capsAnalisis).toContain('legal');
    });

    it('un owner siempre obtiene todas las capacidades en true (incluyendo ventas)', () => {
      const permisos = computePermisosEfectivos('owner');
      expect(permisos.ventas).toBe(true);
      expect(permisos.mercado).toBe(true);
      expect(permisos.finanzas).toBe(true);
      expect(permisos.pos).toBe(true);
    });

    it('un trabajador arranca con ventas en false a menos que una asignación activa lo conceda', () => {
      const sinVentas = computePermisosEfectivos('trabajador', [{ mercado: true }]);
      expect(sinVentas.mercado).toBe(true);
      expect(sinVentas.ventas).toBe(false);

      const conVentas = computePermisosEfectivos('trabajador', [{ mercado: true }, { ventas: true }]);
      expect(conVentas.mercado).toBe(true);
      expect(conVentas.ventas).toBe(true);
    });
  });

  describe('Merge Granular de Permisos (evita sobrescritura destructiva)', () => {
    function mergePermisos(
      actual: PermisosTrabajador,
      patch: Record<string, unknown>,
    ): PermisosTrabajador {
      const resultado = { ...actual };
      for (const [key, val] of Object.entries(patch)) {
        if (isCapabilityKey(key)) {
          if (val === true) {
            resultado[key] = true;
          } else if (val === false) {
            delete resultado[key];
          }
        }
      }
      return resultado;
    }

    it('agrega una capacidad sin borrar las anteriores', () => {
      const base: PermisosTrabajador = { mercado: true, marketing: true };
      const patched = mergePermisos(base, { ventas: true });
      expect(patched).toEqual({ mercado: true, marketing: true, ventas: true });
    });

    it('apaga una capacidad específica sin afectar otras', () => {
      const base: PermisosTrabajador = { mercado: true, marketing: true, finanzas: true };
      const patched = mergePermisos(base, { finanzas: false });
      expect(patched).toEqual({ mercado: true, marketing: true });
    });

    it('ignora claves no reconocidas para evitar inyección de campos arbitrarios', () => {
      const base: PermisosTrabajador = { pos: true };
      const patched = mergePermisos(base, { admin_privilege: true, pos: true });
      expect(patched).toEqual({ pos: true });
    });
  });

  describe('Control de Cuotas con Invitaciones Pendientes', () => {
    it('impide agregar trabajadores si las invitaciones pendientes saturan el cupo', () => {
      const plan = 'pro_plus'; // max_trabajadores = 5
      const trabajadoresActuales = 4;
      const invitacionesPendientes = 1;

      // 4 trabajadores activos + 1 invitación vigente = 5 ocupados
      expect(canAddTrabajador(plan, trabajadoresActuales + invitacionesPendientes)).toBe(false);
    });

    it('permite agregar si el total de trabajadores e invitaciones no excede el cupo', () => {
      const plan = 'pro_plus'; // max_trabajadores = 5
      const trabajadoresActuales = 1;
      const invitacionesPendientes = 0;

      expect(canAddTrabajador(plan, trabajadoresActuales + invitacionesPendientes)).toBe(true);
    });
  });
});
