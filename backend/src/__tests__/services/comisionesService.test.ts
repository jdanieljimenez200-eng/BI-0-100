import {
  calcularDesgloseComision,
  calcularPrecioObjetivo,
  PRESETS_CANALES_DEFAULT,
} from '../../services/contabilidad/comisionesService';

describe('comisionesService', () => {
  describe('calcularDesgloseComision', () => {
    it('calcula correctamente la comisión de Clip (3.6% + IVA)', () => {
      const clipPreset = PRESETS_CANALES_DEFAULT.find((c) => c.institucion === 'Clip')!;
      expect(clipPreset).toBeDefined();

      const resultado = calcularDesgloseComision(1000, clipPreset, 0.16);

      // Bruto = 1000
      // Comision base = 1000 * 0.036 = 36.00
      // IVA comision = 36.00 * 0.16 = 5.76
      // Total deducciones = 41.76
      // Neto a banco = 958.24
      expect(resultado.montoBruto).toBe(1000);
      expect(resultado.comisionBase).toBe(36.00);
      expect(resultado.comisionIva).toBe(5.76);
      expect(resultado.retencionIsr).toBe(0);
      expect(resultado.retencionIva).toBe(0);
      expect(resultado.totalDeducciones).toBe(41.76);
      expect(resultado.montoNeto).toBe(958.24);
      expect(resultado.tasaEfectivaPorcentaje).toBe(4.18);
    });

    it('calcula correctamente Mercado Pago con tarifa fija ($4 MXN) + porcentaje (3.5%)', () => {
      const mpPreset = PRESETS_CANALES_DEFAULT.find((c) => c.institucion === 'Mercado Pago')!;
      expect(mpPreset).toBeDefined();

      const resultado = calcularDesgloseComision(500, mpPreset, 0.16);

      // Comision base = (500 * 0.035) + 4 = 17.5 + 4 = 21.50
      // IVA comision = 21.50 * 0.16 = 3.44
      // Total deducciones = 24.94
      // Neto = 475.06
      expect(resultado.comisionBase).toBe(21.50);
      expect(resultado.comisionIva).toBe(3.44);
      expect(resultado.totalDeducciones).toBe(24.94);
      expect(resultado.montoNeto).toBe(475.06);
    });

    it('calcula correctamente Uber Eats con 30% comision + IVA y retenciones fiscales de plataformas', () => {
      const uberPreset = PRESETS_CANALES_DEFAULT.find((c) => c.institucion === 'Uber Eats')!;
      expect(uberPreset).toBeDefined();

      const resultado = calcularDesgloseComision(1000, uberPreset, 0.16);

      // Comision base = 1000 * 0.30 = 300.00
      // IVA comision = 300.00 * 0.16 = 48.00
      // Retencion ISR = 1000 * 0.01 = 10.00
      // Retencion IVA = 1000 * 0.08 = 80.00
      // Total deducciones = 300 + 48 + 10 + 80 = 438.00
      // Neto = 562.00
      expect(resultado.comisionBase).toBe(300.00);
      expect(resultado.comisionIva).toBe(48.00);
      expect(resultado.retencionIsr).toBe(10.00);
      expect(resultado.retencionIva).toBe(80.00);
      expect(resultado.totalDeducciones).toBe(438.00);
      expect(resultado.montoNeto).toBe(562.00);
      expect(resultado.tasaEfectivaPorcentaje).toBe(43.8);
    });

    it('maneja valores 0 o negativos de forma segura', () => {
      const resultado = calcularDesgloseComision(0, {
        institucion: 'Test',
        comision_porcentaje: 0.05,
        comision_fija: 0,
        aplica_iva_comision: true,
      });

      expect(resultado.montoBruto).toBe(0);
      expect(resultado.montoNeto).toBe(0);
      expect(resultado.totalDeducciones).toBe(0);
    });
  });

  describe('calcularPrecioObjetivo (Simulador de Markup Inverso)', () => {
    it('calcula el precio que se debe cobrar para recibir exactamente $1,000 netos con Clip', () => {
      const clipPreset = PRESETS_CANALES_DEFAULT.find((c) => c.institucion === 'Clip')!;
      const { precioSugerido, desglose } = calcularPrecioObjetivo(1000, clipPreset, 0.16);

      // Tasa total = 0.036 * 1.16 = 0.04176
      // Precio sugerido = 1000 / (1 - 0.04176) = 1000 / 0.95824 ≈ 1043.58
      expect(precioSugerido).toBeCloseTo(1043.58, 1);
      // Al cobrar precioSugerido, el neto resultante debe ser prácticamente $1,000
      expect(desglose.montoNeto).toBeCloseTo(1000, 0);
    });

    it('calcula el precio que se debe cobrar para recibir exactamente $500 netos en Uber Eats', () => {
      const uberPreset = PRESETS_CANALES_DEFAULT.find((c) => c.institucion === 'Uber Eats')!;
      const { precioSugerido, desglose } = calcularPrecioObjetivo(500, uberPreset, 0.16);

      // Tasa total = 0.30 * 1.16 + 0.01 + 0.08 = 0.348 + 0.09 = 0.438
      // Precio sugerido = 500 / (1 - 0.438) = 500 / 0.562 ≈ 889.68
      expect(precioSugerido).toBeCloseTo(889.68, 1);
      expect(desglose.montoNeto).toBeCloseTo(500, 0);
    });
  });
});
