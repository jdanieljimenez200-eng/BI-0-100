import {
  camposExpedientePorVertical,
  filtrarAtributosPermitidos,
} from '../../services/vertical/camposExpediente';

describe('camposExpedientePorVertical', () => {
  it('devuelve solo los campos comunes cuando el vertical es null', () => {
    const campos = camposExpedientePorVertical(null);
    expect(campos.map(c => c.key)).toEqual(['como_nos_conocio', 'fecha_alta']);
  });

  it('devuelve solo los campos comunes cuando el vertical es desconocido', () => {
    const campos = camposExpedientePorVertical('no_existe');
    expect(campos.map(c => c.key)).toEqual(['como_nos_conocio', 'fecha_alta']);
  });

  it('antepone los campos comunes a los específicos del vertical', () => {
    const keys = camposExpedientePorVertical('quiropractico').map(c => c.key);
    expect(keys.slice(0, 2)).toEqual(['como_nos_conocio', 'fecha_alta']);
    expect(keys).toContain('nivel_dolor');
  });
});

describe('filtrarAtributosPermitidos', () => {
  describe('casteo de campos number', () => {
    it('convierte un string numérico a number real', () => {
      const out = filtrarAtributosPermitidos('quiropractico', { nivel_dolor: '7' });
      expect(out.nivel_dolor).toBe(7);
    });

    it('acepta un number ya tipado sin alterarlo', () => {
      const out = filtrarAtributosPermitidos('pyme', { limite_credito: 50000 });
      expect(out.limite_credito).toBe(50000);
    });

    it('convierte decimales correctamente', () => {
      const out = filtrarAtributosPermitidos('quiropractico', { nivel_dolor: '3.5' });
      expect(out.nivel_dolor).toBe(3.5);
    });

    it('string vacío se normaliza a null', () => {
      const out = filtrarAtributosPermitidos('quiropractico', { nivel_dolor: '' });
      expect(out.nivel_dolor).toBeNull();
    });

    it('valor no numérico se normaliza a null', () => {
      const out = filtrarAtributosPermitidos('quiropractico', { nivel_dolor: 'mucho' });
      expect(out.nivel_dolor).toBeNull();
    });

    it('null explícito se conserva como null', () => {
      const out = filtrarAtributosPermitidos('pyme', { limite_credito: null });
      expect(out.limite_credito).toBeNull();
    });
  });

  describe('filtrado de keys', () => {
    it('descarta keys no declaradas para el vertical', () => {
      const out = filtrarAtributosPermitidos('oftalmologo', {
        num_expediente: 'EXP-001',
        inyectada: 'hackeo',
        rol: 'admin',
      });
      expect(out).toEqual({ num_expediente: 'EXP-001' });
    });

    it('descarta un campo de otro vertical', () => {
      const out = filtrarAtributosPermitidos('quiropractico', {
        nivel_dolor: '5',
        limite_credito: '99999',
      });
      expect(out).toEqual({ nivel_dolor: 5 });
    });

    it('acepta campos comunes junto a los específicos del vertical', () => {
      const out = filtrarAtributosPermitidos('medico', {
        fecha_alta: '2026-07-08',
        tipo_sangre: 'O+',
      });
      expect(out).toEqual({ fecha_alta: '2026-07-08', tipo_sangre: 'O+' });
    });

    it('los campos text NO se castean (conservan el string)', () => {
      const out = filtrarAtributosPermitidos('oftalmologo', { num_expediente: '00123' });
      expect(out.num_expediente).toBe('00123');
    });

    it('devuelve objeto vacío cuando ninguna key es válida', () => {
      const out = filtrarAtributosPermitidos('pyme', { foo: 1, bar: 2 });
      expect(out).toEqual({});
    });
  });
});