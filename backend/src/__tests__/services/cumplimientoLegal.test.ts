import { aceptoExpresamente, versionesDesfasadas } from '../../services/cumplimiento/aceptaciones';
import { DIAS_EJECUCION, DIAS_RESPUESTA, fechasPorEstado, formatoFolio, SolicitudArcoSchema } from '../../services/cumplimiento/arco';
import { textoCargoRecurrente, textoImporte, textoPeriodicidad } from '../../services/billing/stripeService';

/**
 * Reglas puras del cumplimiento legal (docs/legal/): consentimiento expreso,
 * plazos ARCO y el texto del cargo recurrente que se muestra antes de pagar.
 */
describe('Consentimiento expreso', () => {
  it('solo un «sí» explícito cuenta como aceptación', () => {
    expect(aceptoExpresamente(true)).toBe(true);
    expect(aceptoExpresamente('true')).toBe(true);
    for (const v of [undefined, null, false, 'false', '', 0, 1, 'on', {}]) expect(aceptoExpresamente(v)).toBe(false);
  });

  it('detecta un formulario que mostró otra versión, y no exige versión a quien no la manda', () => {
    expect(versionesDesfasadas({})).toEqual([]);
    expect(versionesDesfasadas(undefined)).toEqual([]);
    expect(versionesDesfasadas({ version_terminos: '1.0', version_privacidad: '1.0' })).toEqual([]);
    expect(versionesDesfasadas({ version_terminos: '0.9' })).toEqual(['terminos']);
    expect(versionesDesfasadas({ version_privacidad: 1 })).toEqual(['privacidad']);
  });
});

describe('Plazos ARCO', () => {
  const recepcion = new Date('2026-10-15T12:00:00Z');

  it('folio legible y ordenable', () => {
    expect(formatoFolio(2026, 7)).toBe('ARCO-2026-0007');
    expect(formatoFolio(2026, 12345)).toBe('ARCO-2026-12345');
  });

  it('al responder corre el plazo de ejecución de 15 días; al ejecutar se anota la fecha', () => {
    const vacia = { fecha_respuesta: null, fecha_limite_ejecucion: null, fecha_ejecucion: null };
    const respondida = fechasPorEstado(vacia, 'respondida', recepcion);
    expect(respondida.fecha_respuesta).toEqual(recepcion);
    expect(respondida.fecha_limite_ejecucion!.getTime() - recepcion.getTime()).toBe(DIAS_EJECUCION * 86_400_000);

    const ejecutada = fechasPorEstado({ ...vacia, ...respondida } as never, 'ejecutada', new Date('2026-10-20T00:00:00Z'));
    expect(ejecutada).toEqual({ fecha_ejecucion: new Date('2026-10-20T00:00:00Z') });
  });

  it('no pisa fechas ya registradas ni corre plazos sin cambio de estado', () => {
    const previa = new Date('2026-10-01T00:00:00Z');
    const yaRespondida = { fecha_respuesta: previa, fecha_limite_ejecucion: new Date('2026-10-16T00:00:00Z'), fecha_ejecucion: null };
    expect(fechasPorEstado(yaRespondida, 'respondida', recepcion)).toEqual({});
    expect(fechasPorEstado(yaRespondida, undefined, recepcion)).toEqual({});
    // Una improcedente se responde, pero no hay nada que ejecutar.
    expect(fechasPorEstado({ fecha_respuesta: null, fecha_limite_ejecucion: null, fecha_ejecucion: null }, 'improcedente', recepcion))
      .toEqual({ fecha_respuesta: recepcion });
  });

  it('el formulario pide lo mínimo y rechaza lo que no sirve para atender la solicitud', () => {
    const ok = SolicitudArcoSchema.safeParse({
      nombre: 'Ana López',
      email: ' ANA@Example.com ',
      tipo: 'cancelacion',
      descripcion: 'Quiero que borren mi cuenta y mis datos.',
    });
    expect(ok.success && ok.data).toMatchObject({ email: 'ana@example.com', relacion: 'titular' });
    expect(SolicitudArcoSchema.safeParse({ nombre: 'A', email: 'x', tipo: 'otro', descripcion: 'corta' }).success).toBe(false);
    expect(DIAS_RESPUESTA).toBe(20);
  });
});

describe('Texto del cargo recurrente', () => {
  it('dice importe, moneda, periodicidad, aviso previo y cómo cancelar', () => {
    const texto = textoCargoRecurrente({
      priceId: 'price_x',
      montoMinimo: 119900,
      moneda: 'MXN',
      intervalo: 'month',
      intervaloCantidad: 1,
    });
    expect(texto).toContain('$1,199.00 MXN cada mes');
    expect(texto).toContain('5 días antes');
    expect(texto).toMatch(/cancelar en cualquier momento/);
    expect(texto.length).toBeLessThanOrEqual(1200); // límite de custom_text de Stripe
  });

  it('periodicidades y montos sin dato', () => {
    expect(textoPeriodicidad('year', 1)).toBe('cada año');
    expect(textoPeriodicidad('month', 3)).toBe('cada 3 meses');
    expect(textoPeriodicidad(null, null)).toBe('cada periodo');
    expect(textoImporte(null, 'USD')).toBe('el importe indicado en USD');
    expect(textoImporte(44900, 'MXN')).toBe('$449.00 MXN');
  });
});
