import {
  CATALOGO_MANTENIMIENTO,
  aplicarIntensidad,
  buscarTipo,
  diasDeAviso,
  estadoEquipo,
  normalizar,
  redondearIntervalo,
  sugerirIntervalo,
  sumarDias,
} from '../../services/mantenimientos/catalogoIntervalos';

/**
 * El «cada cuánto» de la herramienta Mantenimientos sale de aquí, sin IA: es lo
 * que ve el usuario al dar de alta un equipo y lo que decide el semáforo.
 */
describe('catálogo de intervalos', () => {
  it('no tiene claves repetidas y todas las entradas están completas', () => {
    const claves = CATALOGO_MANTENIMIENTO.map((t) => t.clave);
    expect(new Set(claves).size).toBe(claves.length);
    for (const tipo of CATALOGO_MANTENIMIENTO) {
      expect(tipo.label.length).toBeGreaterThan(2);
      expect(tipo.nota.length).toBeGreaterThan(10);
      expect(tipo.intervalo_base_dias).toBeGreaterThanOrEqual(7);
      expect(tipo.intervalo_base_dias).toBeLessThanOrEqual(365);
      expect(tipo.sinonimos.length).toBeGreaterThan(0);
      // Los sinónimos se comparan ya normalizados: si llevan acentos, nunca aciertan.
      for (const sinonimo of tipo.sinonimos) expect(sinonimo).toBe(normalizar(sinonimo));
    }
  });

  it('encuentra el tipo aunque el usuario escriba como habla', () => {
    expect(buscarTipo({ texto: 'Refri' })?.clave).toBe('refrigerador');
    expect(buscarTipo({ texto: 'refrigerador de la cocina' })?.clave).toBe('refrigerador');
    expect(buscarTipo({ texto: 'TANQUE DE GAS' })?.clave).toBe('tanque_gas_estacionario');
    expect(buscarTipo({ texto: 'tijeras' })?.clave).toBe('tijeras');
    expect(buscarTipo({ texto: 'mini split de la sala' })?.clave).toBe('minisplit');
  });

  it('prefiere la coincidencia más específica', () => {
    // "máquina de hielo" no debe caer en "máquina de corte de pelo".
    expect(buscarTipo({ texto: 'maquina de hielo' })?.clave).toBe('maquina_hielo');
    expect(buscarTipo({ texto: 'máquina de cortar pelo' })?.clave).toBe('maquina_corte_pelo');
  });

  it('la clave explícita manda sobre el texto', () => {
    expect(buscarTipo({ clave: 'freidora', texto: 'refrigerador' })?.clave).toBe('freidora');
    // Clave inexistente: cae al texto en vez de fallar.
    expect(buscarTipo({ clave: 'no_existe', texto: 'refrigerador' })?.clave).toBe('refrigerador');
  });

  it('devuelve null con lo que no reconoce (ahí entra la IA)', () => {
    expect(buscarTipo({ texto: 'máquina de humo' })).toBeNull();
    expect(sugerirIntervalo({ texto: 'artefacto raro' })).toBeNull();
    expect(buscarTipo({ texto: '   ' })).toBeNull();
  });

  it('el uso intenso acorta el intervalo y el poco uso lo alarga', () => {
    const intenso = sugerirIntervalo({ texto: 'refrigerador', intensidad: 'intenso' })!;
    const normal = sugerirIntervalo({ texto: 'refrigerador', intensidad: 'normal' })!;
    const bajo = sugerirIntervalo({ texto: 'refrigerador', intensidad: 'bajo' })!;

    expect(normal.intervalo_dias).toBe(180);
    expect(intenso.intervalo_dias).toBeLessThan(normal.intervalo_dias);
    expect(bajo.intervalo_dias).toBeGreaterThan(normal.intervalo_dias);
    expect(normal.origen).toBe('catalogo');
    expect(normal.nota).toContain('condensador');
  });

  it('redondea a números que una persona diría y respeta los topes', () => {
    expect(redondearIntervalo(182.4)).toBe(180);
    expect(redondearIntervalo(28.6)).toBe(29);
    expect(redondearIntervalo(1)).toBe(7);
    expect(redondearIntervalo(99_999)).toBe(3650);
    expect(aplicarIntensidad(15, 'intenso')).toBe(11);
  });
});

describe('semáforo de mantenimiento', () => {
  const HOY = '2026-09-15';

  it('sin fecha de último servicio no inventa un estado', () => {
    expect(estadoEquipo({ fecha_ultimo: null, intervalo_dias: 90 }, HOY)).toEqual({
      estado: 'sin_registro',
      proximo_en: null,
      dias_restantes: null,
    });
  });

  it('al día, próximo y vencido según los días que faltan', () => {
    // 90 días de intervalo → avisa con 14 de anticipación.
    expect(diasDeAviso(90)).toBe(14);

    const alDia = estadoEquipo({ fecha_ultimo: '2026-09-01', intervalo_dias: 90 }, HOY);
    expect(alDia).toMatchObject({ estado: 'al_dia', proximo_en: '2026-11-30', dias_restantes: 76 });

    const proximo = estadoEquipo({ fecha_ultimo: '2026-06-25', intervalo_dias: 90 }, HOY);
    expect(proximo.estado).toBe('proximo');
    expect(proximo.dias_restantes).toBe(8);

    const vencido = estadoEquipo({ fecha_ultimo: '2026-01-01', intervalo_dias: 90 }, HOY);
    expect(vencido.estado).toBe('vencido');
    expect(vencido.dias_restantes).toBeLessThan(0);
  });

  it('el día exacto del vencimiento todavía no está vencido', () => {
    const justo = estadoEquipo({ fecha_ultimo: '2026-06-17', intervalo_dias: 90 }, HOY);
    expect(justo.proximo_en).toBe(HOY);
    expect(justo.dias_restantes).toBe(0);
    expect(justo.estado).toBe('proximo');
  });

  it('intervalos cortos avisan con al menos 3 días', () => {
    expect(diasDeAviso(15)).toBe(3);
    const freidora = estadoEquipo({ fecha_ultimo: '2026-09-03', intervalo_dias: 15 }, HOY);
    expect(freidora).toMatchObject({ estado: 'proximo', proximo_en: '2026-09-18', dias_restantes: 3 });
  });

  it('las fechas no se desfasan por la zona horaria', () => {
    // Cruce de mes y de año, y año bisiesto.
    expect(sumarDias('2026-12-20', 30)).toBe('2027-01-19');
    expect(sumarDias('2024-02-28', 1)).toBe('2024-02-29');
    expect(sumarDias('2026-09-15', 0)).toBe('2026-09-15');
  });
});
