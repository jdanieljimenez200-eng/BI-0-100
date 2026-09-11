import {
  getLimites,
  canAddProducto,
  canRunAnalisis,
  canAddTrabajador,
  CAPABILITIES,
  isCapabilityKey,
  sanitizePermisos,
  PLAN_LIMITES,
} from '../../services/billing/planService';

describe('planService', () => {
  describe('getLimites', () => {
    it('retorna límites correctos para freemium', () => {
      const l = getLimites('freemium');
      expect(l.max_productos).toBe(1);
      expect(l.max_analisis_por_modulo).toBe(1);
      expect(l.ai_copy).toBe(false);
      expect(l.precio_mxn).toBe(0);
    });

    it('retorna límites correctos para pro', () => {
      const l = getLimites('pro');
      expect(l.max_productos).toBe(5);
      expect(l.max_analisis_por_modulo).toBe(-1);
      expect(l.ai_copy).toBe(true);
    });

    it('retorna límites correctos para business', () => {
      const l = getLimites('business');
      expect(l.max_productos).toBe(-1);
      expect(l.max_analisis_por_modulo).toBe(-1);
    });

    it('retorna límites correctos para enterprise', () => {
      const l = getLimites('enterprise');
      expect(l.max_productos).toBe(-1);
      expect(l.max_analisis_por_modulo).toBe(-1);
    });
  });

  describe('canAddProducto', () => {
    it('freemium con 0 productos puede agregar', () => {
      expect(canAddProducto('freemium', 0)).toBe(true);
    });

    it('freemium con 1 producto NO puede agregar', () => {
      expect(canAddProducto('freemium', 1)).toBe(false);
    });

    it('pro con 4 productos puede agregar', () => {
      expect(canAddProducto('pro', 4)).toBe(true);
    });

    it('pro con 5 productos NO puede agregar', () => {
      expect(canAddProducto('pro', 5)).toBe(false);
    });

    it('business con 9999 productos puede agregar (ilimitado)', () => {
      expect(canAddProducto('business', 9999)).toBe(true);
    });

    it('enterprise con 9999 productos puede agregar (ilimitado)', () => {
      expect(canAddProducto('enterprise', 9999)).toBe(true);
    });
  });

  describe('canRunAnalisis', () => {
    it('freemium con 0 análisis puede correr', () => {
      expect(canRunAnalisis('freemium', 0)).toBe(true);
    });

    it('freemium con 1 análisis NO puede correr', () => {
      expect(canRunAnalisis('freemium', 1)).toBe(false);
    });

    it('pro con 999 análisis puede correr (ilimitado)', () => {
      expect(canRunAnalisis('pro', 999)).toBe(true);
    });

    it('todos los planes tienen nombre y descripción', () => {
      for (const [, limites] of Object.entries(PLAN_LIMITES)) {
        expect(limites.nombre).toBeTruthy();
        expect(limites.descripcion).toBeTruthy();
      }
    });
  });

  describe('canAddTrabajador', () => {
    it('freemium no permite agregar trabajadores (max = 0)', () => {
      expect(canAddTrabajador('freemium', 0)).toBe(false);
    });

    it('pro permite agregar hasta 2 trabajadores', () => {
      expect(canAddTrabajador('pro', 0)).toBe(true);
      expect(canAddTrabajador('pro', 1)).toBe(true);
      expect(canAddTrabajador('pro', 2)).toBe(false);
    });

    it('business permite hasta 10 trabajadores', () => {
      expect(canAddTrabajador('business', 9)).toBe(true);
      expect(canAddTrabajador('business', 10)).toBe(false);
    });

    it('enterprise permite ilimitados trabajadores (-1)', () => {
      expect(canAddTrabajador('enterprise', 100)).toBe(true);
    });
  });

  describe('CAPABILITIES y ventas', () => {
    it('incluye ventas en el grupo analisis', () => {
      const capVentas = CAPABILITIES.find((c) => c.key === 'ventas');
      expect(capVentas).toBeDefined();
      expect(capVentas?.grupo).toBe('analisis');
      expect(capVentas?.sensible).toBe(false);
    });

    it('isCapabilityKey valida correctamente ventas y rechaza invalidos', () => {
      expect(isCapabilityKey('ventas')).toBe(true);
      expect(isCapabilityKey('mercado')).toBe(true);
      expect(isCapabilityKey('finanzas')).toBe(true);
      expect(isCapabilityKey('invalido_xyz')).toBe(false);
    });

    it('sanitizePermisos normaliza ventas correctamente', () => {
      const sanitized = sanitizePermisos({ ventas: true, fake: true, finanzas: false });
      expect(sanitized).toEqual({ ventas: true });
    });
  });
});
