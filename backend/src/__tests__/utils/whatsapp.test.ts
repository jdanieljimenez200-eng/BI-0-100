import { enlaceWhatsApp, telefonoWhatsApp } from '../../utils/whatsapp';

describe('telefonoWhatsApp', () => {
  it('antepone la lada del país a un número nacional', () => {
    expect(telefonoWhatsApp('33 1234 5678', 'MX')).toBe('523312345678');
    expect(telefonoWhatsApp('(55) 1234-5678', null)).toBe('525512345678'); // sin país, México
    expect(telefonoWhatsApp('300 123 4567', 'CO')).toBe('573001234567');
    expect(telefonoWhatsApp('9 8765 4321', 'CL')).toBe('56987654321');
    expect(telefonoWhatsApp('099 123 456', 'UY')).toBe('59899123456'); // quita el 0 troncal
    expect(telefonoWhatsApp('11 2345 6789', 'AR')).toBe('5491123456789'); // celular argentino: 549
  });

  it('respeta un número que ya viene en formato internacional', () => {
    expect(telefonoWhatsApp('+52 33 1234 5678', 'MX')).toBe('523312345678');
    expect(telefonoWhatsApp('+1 415 555 0100', 'MX')).toBe('14155550100');
    expect(telefonoWhatsApp('0057 300 123 4567', 'MX')).toBe('573001234567');
    expect(telefonoWhatsApp('523312345678', 'MX')).toBe('523312345678');
    expect(telefonoWhatsApp('5491123456789', 'AR')).toBe('5491123456789');
  });

  it('un número de CDMX que empieza por 52 no se toma como si ya tuviera lada', () => {
    expect(telefonoWhatsApp('5212345678', 'MX')).toBe('525212345678');
  });

  it('sin teléfono devuelve vacío y lo irreconocible se deja como está', () => {
    expect(telefonoWhatsApp(null, 'MX')).toBe('');
    expect(telefonoWhatsApp('  ', 'MX')).toBe('');
    expect(telefonoWhatsApp('12345', 'MX')).toBe('12345');
  });

  it('arma el enlace con el mensaje codificado', () => {
    expect(enlaceWhatsApp('3312345678', 'MX', 'Hola, ya es tu turno')).toBe('https://wa.me/523312345678?text=Hola%2C%20ya%20es%20tu%20turno');
    expect(enlaceWhatsApp(null, 'MX', 'Hola')).toBe('https://wa.me/?text=Hola');
  });
});
