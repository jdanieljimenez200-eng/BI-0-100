import { evaluarAlertas } from '../../services/alertas/alertasService';

describe('evaluarAlertas', () => {
  describe('stock', () => {
    it('marca rojo cuando un artículo está agotado', () => {
      const alertas = evaluarAlertas({
        stock: [{ nombre: 'Playera M', stock_actual: 0, stock_minimo: 5 }],
      });
      expect(alertas).toHaveLength(1);
      expect(alertas[0].nivel).toBe('rojo');
      expect(alertas[0].tipo).toBe('stock');
    });

    it('marca amarillo cuando está en o bajo el mínimo pero no agotado', () => {
      const alertas = evaluarAlertas({
        stock: [{ nombre: 'Insumo X', stock_actual: 5, stock_minimo: 5 }],
      });
      expect(alertas[0].nivel).toBe('amarillo');
    });

    it('no alerta cuando el stock está por encima del mínimo', () => {
      const alertas = evaluarAlertas({
        stock: [{ nombre: 'Insumo X', stock_actual: 50, stock_minimo: 5 }],
      });
      expect(alertas).toHaveLength(0);
    });

    it('ignora el nivel amarillo si stock_minimo no está configurado (<= 0)', () => {
      const alertas = evaluarAlertas({
        stock: [{ nombre: 'Sin umbral', stock_actual: 3, stock_minimo: 0 }],
      });
      expect(alertas).toHaveLength(0);
    });

    it('coacciona decimales que llegan como string (TypeORM)', () => {
      const alertas = evaluarAlertas({
        stock: [{ nombre: 'Decimal', stock_actual: '2.500', stock_minimo: '5.000' }],
      });
      expect(alertas[0].nivel).toBe('amarillo');
      expect(alertas[0].mensaje).toContain('2.5');
    });
  });

  describe('ingresos', () => {
    it('marca rojo cuando la caída supera el umbral por defecto (20%)', () => {
      const alertas = evaluarAlertas({
        ingresos: { ingreso_actual: 700, ingreso_anterior: 1000 }, // -30%
      });
      expect(alertas[0].nivel).toBe('rojo');
      expect(alertas[0].mensaje).toContain('30%');
    });

    it('no alerta cuando la caída está por debajo del umbral', () => {
      const alertas = evaluarAlertas({
        ingresos: { ingreso_actual: 900, ingreso_anterior: 1000 }, // -10%
      });
      expect(alertas).toHaveLength(0);
    });

    it('respeta un umbral personalizado', () => {
      const alertas = evaluarAlertas({
        ingresos: { ingreso_actual: 900, ingreso_anterior: 1000 },
        umbralCaidaIngresos: 0.05, // 5%
      });
      expect(alertas[0].nivel).toBe('rojo');
    });

    it('no alerta si el periodo anterior fue 0 (no hay base de comparación)', () => {
      const alertas = evaluarAlertas({
        ingresos: { ingreso_actual: 0, ingreso_anterior: 0 },
      });
      expect(alertas).toHaveLength(0);
    });

    it('no alerta cuando los ingresos suben', () => {
      const alertas = evaluarAlertas({
        ingresos: { ingreso_actual: 1500, ingreso_anterior: 1000 },
      });
      expect(alertas).toHaveLength(0);
    });
  });

  describe('metas', () => {
    it('marca verde cuando la meta se cumple', () => {
      const alertas = evaluarAlertas({
        metas: [{ nombre: 'Ventas Q1', objetivo: 100, actual: 120 }],
      });
      expect(alertas[0].nivel).toBe('verde');
    });

    it('marca amarillo con el % de avance cuando queda corta', () => {
      const alertas = evaluarAlertas({
        metas: [{ nombre: 'Ventas Q1', objetivo: 100, actual: 40 }],
      });
      expect(alertas[0].nivel).toBe('amarillo');
      expect(alertas[0].mensaje).toContain('40%');
    });

    it('ignora metas sin objetivo configurado (<= 0)', () => {
      const alertas = evaluarAlertas({
        metas: [{ nombre: 'Sin meta', objetivo: 0, actual: 10 }],
      });
      expect(alertas).toHaveLength(0);
    });
  });

  describe('orquestación', () => {
    it('devuelve [] cuando no hay datos', () => {
      expect(evaluarAlertas({})).toEqual([]);
    });

    it('ordena por severidad: rojo → amarillo → verde', () => {
      const alertas = evaluarAlertas({
        metas: [
          { nombre: 'Cumplida', objetivo: 10, actual: 10 }, // verde
          { nombre: 'Corta', objetivo: 100, actual: 20 },   // amarillo
        ],
        stock: [{ nombre: 'Agotado', stock_actual: 0, stock_minimo: 5 }], // rojo
      });
      expect(alertas.map((a) => a.nivel)).toEqual(['rojo', 'amarillo', 'verde']);
    });

    it('combina las tres fuentes de alerta', () => {
      const alertas = evaluarAlertas({
        stock: [{ nombre: 'A', stock_actual: 0, stock_minimo: 1 }],
        ingresos: { ingreso_actual: 500, ingreso_anterior: 1000 },
        metas: [{ nombre: 'M', objetivo: 100, actual: 50 }],
      });
      expect(alertas).toHaveLength(3);
      expect(alertas.some((a) => a.tipo === 'stock')).toBe(true);
      expect(alertas.some((a) => a.tipo === 'ingresos')).toBe(true);
      expect(alertas.some((a) => a.tipo === 'meta')).toBe(true);
    });
  });
});