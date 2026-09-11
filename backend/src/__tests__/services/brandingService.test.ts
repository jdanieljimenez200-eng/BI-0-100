import { resolveMarca, MARCA_PLATAFORMA, MarcaInput } from '../../services/branding/brandingService';

describe('brandingService', () => {
  const marcaCompleta: MarcaInput = {
    nombre: 'Tacos El Güero',
    logo_url: 'https://cdn.ejemplo.com/logo.png',
    paleta_colores: { primario: '#ff6600' },
    dominio: 'ventas.elguero.com',
    activo: true,
  };

  describe('planes SIN white_label → marca de plataforma', () => {
    it('freemium siempre usa la marca de plataforma aunque tenga Marca configurada', () => {
      const r = resolveMarca(marcaCompleta, 'freemium');
      expect(r).toEqual(MARCA_PLATAFORMA);
      expect(r.white_label).toBe(false);
    });

    it('pro tampoco tiene white_label', () => {
      const r = resolveMarca(marcaCompleta, 'pro');
      expect(r.white_label).toBe(false);
      expect(r.nombre).toBe('BI 0 A 100');
    });
  });

  describe('planes CON white_label', () => {
    it('enterprise con Marca completa usa la marca del negocio', () => {
      const r = resolveMarca(marcaCompleta, 'enterprise');
      expect(r.white_label).toBe(true);
      expect(r.nombre).toBe('Tacos El Güero');
      expect(r.logo_url).toBe('https://cdn.ejemplo.com/logo.png');
      expect(r.color_primario).toBe('#ff6600');
      expect(r.dominio).toBe('ventas.elguero.com');
    });

    it('business con white_label usa la marca del negocio', () => {
      const r = resolveMarca(marcaCompleta, 'business');
      expect(r.white_label).toBe(true);
      expect(r.nombre).toBe('Tacos El Güero');
    });

    it('cae a plataforma si no hay Marca configurada (null)', () => {
      const r = resolveMarca(null, 'enterprise');
      expect(r).toEqual(MARCA_PLATAFORMA);
    });

    it('cae a plataforma si la Marca está inactiva', () => {
      const r = resolveMarca({ ...marcaCompleta, activo: false }, 'enterprise');
      expect(r).toEqual(MARCA_PLATAFORMA);
    });

    it('cae a plataforma si la Marca no tiene nombre', () => {
      const r = resolveMarca({ ...marcaCompleta, nombre: '   ' }, 'enterprise');
      expect(r).toEqual(MARCA_PLATAFORMA);
    });

    it('usa color de plataforma como fallback si la paleta no trae hex válido', () => {
      const r = resolveMarca({ ...marcaCompleta, paleta_colores: { primario: 'naranja' } }, 'enterprise');
      expect(r.color_primario).toBe(MARCA_PLATAFORMA.color_primario);
      expect(r.white_label).toBe(true);
    });

    it('acepta la clave "primary" en la paleta', () => {
      const r = resolveMarca({ ...marcaCompleta, paleta_colores: { primary: '#00ff00' } }, 'enterprise');
      expect(r.color_primario).toBe('#00ff00');
    });

    it('logo y dominio quedan null si vienen vacíos', () => {
      const r = resolveMarca({ nombre: 'Solo Nombre', activo: true }, 'enterprise');
      expect(r.white_label).toBe(true);
      expect(r.logo_url).toBeNull();
      expect(r.dominio).toBeNull();
    });
  });
});