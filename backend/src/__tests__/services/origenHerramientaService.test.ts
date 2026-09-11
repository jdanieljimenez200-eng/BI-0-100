import { describe, it, expect } from '@jest/globals';
import { computeOrigenHerramienta } from '../../services/billing/origenHerramientaService';

describe('origenHerramientaService', () => {
  it('Retorna "pago" si herramienta está en seleccionadas', () => {
    const seleccionadas = ['pos', 'inventario', 'citas'];
    const resultado = computeOrigenHerramienta('pos', seleccionadas);
    expect(resultado).toBe('pago');
  });

  it('Retorna "incluida" si herramienta NO está en seleccionadas', () => {
    const seleccionadas = ['pos', 'inventario'];
    const resultado = computeOrigenHerramienta('citas', seleccionadas);
    expect(resultado).toBe('incluida');
  });

  it('Maneja array vacío de seleccionadas', () => {
    const resultado = computeOrigenHerramienta('pos', []);
    expect(resultado).toBe('incluida');
  });

  it('Es case-sensitive', () => {
    const seleccionadas = ['pos'];
    const resultado = computeOrigenHerramienta('POS', seleccionadas);
    expect(resultado).toBe('incluida'); // 'POS' !== 'pos'
  });
});