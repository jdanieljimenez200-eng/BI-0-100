import {
  getPlanGate,
  seccionesBloqueablesDe,
  planRecibeAnalisisCompleto,
} from '../../services/billing/gatingAnalisis';
import type { SeccionBloqueable } from '../../services/billing/gatingAnalisis';

// Planes que reciben el análisis completo, tal cual los declara el servicio.
const PLANES_PAGO = ['pro', 'pro_plus', 'business', 'enterprise'] as const;

// Secciones del módulo ventas que SÍ deben generarse en gratuito (el gancho).
// No son claves declaradas en BLOQUEADAS_FREEMIUM: se comprueba que `permite()`
// las deje pasar precisamente porque no están en la lista.
const GANCHO_GRATUITO = ['ventas.tips', 'ventas.historia'] as unknown as SeccionBloqueable[];

describe('gatingAnalisis — módulo ventas', () => {
  describe('plan gratuito', () => {
    it('bloquea las secciones de pago de ventas', () => {
      const gate = getPlanGate('freemium', 'ventas');
      expect(gate.completo).toBe(false);
      expect([...gate.bloqueadas]).toEqual([...seccionesBloqueablesDe('ventas')]);
    });

    it('permite generar tips e historia diaria (gancho de conversión)', () => {
      const gate = getPlanGate('freemium', 'ventas');
      for (const seccion of GANCHO_GRATUITO) {
        expect(gate.permite(seccion)).toBe(true);
      }
    });

    it('permite() rechaza la sección de pago', () => {
      const gate = getPlanGate('freemium', 'ventas');
      expect(gate.permite('ventas.porque_fallan')).toBe(false);
    });

    it('no bloquea el módulo completo: siempre queda contenido visible', () => {
      const gate = getPlanGate('freemium', 'ventas');
      expect(gate.bloqueadas).not.toContain('ventas.completo');
      expect(gate.bloqueadas.length).toBeLessThan(10);
    });
  });

  describe('planes de pago', () => {
    it.each(PLANES_PAGO)('%s recibe el análisis de ventas completo', (plan) => {
      const gate = getPlanGate(plan, 'ventas');
      expect(gate.completo).toBe(true);
      expect(gate.bloqueadas).toHaveLength(0);
      expect(gate.permite('ventas.porque_fallan')).toBe(true);
    });

    it('planRecibeAnalisisCompleto coincide con el gate por módulo', () => {
      for (const plan of PLANES_PAGO) {
        expect(planRecibeAnalisisCompleto(plan)).toBe(true);
        expect(getPlanGate(plan, 'ventas').completo).toBe(true);
      }
    });
  });

  describe('planes ausentes o desconocidos → se tratan como gratuito', () => {
    // Un plan nulo llega cuando la fila de usuario es antigua o el JWT no lo
    // trae; degradar a gratuito evita regalar contenido de pago por un dato
    // faltante.
    it.each([null, undefined, '', 'freemium', 'free', 'plan_inventado', 'PRO'])(
      'plan %p no desbloquea porque_fallan',
      (plan) => {
        const gate = getPlanGate(plan as string | null | undefined, 'ventas');
        expect(gate.completo).toBe(false);
        expect(gate.permite('ventas.porque_fallan')).toBe(false);
      },
    );
  });

  describe('seccionesBloqueablesDe("ventas")', () => {
    it('devuelve la lista declarada, sin depender del plan', () => {
      expect([...seccionesBloqueablesDe('ventas')]).toEqual([
        'ventas.porque_fallan',
        'ventas.perfil_cliente',
        'ventas.script_scorer',
        'ventas.competitor_intel',
      ]);
    });

    it('todas sus claves usan el prefijo del módulo', () => {
      for (const clave of seccionesBloqueablesDe('ventas')) {
        expect(clave.startsWith('ventas.')).toBe(true);
      }
    });

    it('ningún otro módulo declara claves de ventas', () => {
      const otros = ['mercado', 'marketing', 'finanzas', 'legal', 'brief'] as const;
      for (const modulo of otros) {
        for (const clave of seccionesBloqueablesDe(modulo)) {
          expect(clave.startsWith('ventas.')).toBe(false);
        }
      }
    });

    it('coincide con lo que expone el gate en gratuito', () => {
      expect([...getPlanGate('freemium', 'ventas').bloqueadas]).toEqual([
        ...seccionesBloqueablesDe('ventas'),
      ]);
    });
  });

  describe('aislamiento entre invocaciones', () => {
    it('dos gates independientes no comparten estado mutable', () => {
      const a = getPlanGate('freemium', 'ventas');
      const b = getPlanGate('pro', 'ventas');
      expect(a.permite('ventas.porque_fallan')).toBe(false);
      expect(b.permite('ventas.porque_fallan')).toBe(true);
      // El gratuito no se contamina tras crear el de pago.
      expect(a.bloqueadas).toHaveLength(4);
    });
  });
});