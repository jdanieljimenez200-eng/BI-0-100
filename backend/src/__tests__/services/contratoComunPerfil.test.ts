import { ContratoComunSchema, aplicarContratoComun } from '../../services/ia/contratoComun';
import {
  PerfilNegocioSchema,
  camposSinResponder,
  fusionarPerfil,
  leerPerfil,
  textoPerfil,
} from '../../services/ia/perfilNegocio';
import { errorSeccionesOcultas, SeccionesExtraSchema } from '../../services/ia/seccionesCatalogo';

describe('contrato común de transparencia', () => {
  it('lo que falte o venga mal no hace fallar el análisis: se vacía', () => {
    const salida = ContratoComunSchema.parse({
      supuestos: 'no es un array',
      informacion_faltante: [{ dato: 1 }],
      nivel_confianza: 'altísimo',
      secciones_extra: null,
    });
    expect(salida).toEqual({
      supuestos: [],
      informacion_faltante: [],
      nivel_confianza: undefined,
      motivo_confianza: undefined,
      secciones_extra: [],
    });
  });

  it('la confianza nunca supera el tope que fija el código', () => {
    const salida = ContratoComunSchema.parse({ nivel_confianza: 'ALTO', motivo_confianza: 'Datos completos.' });
    const { transparencia } = aplicarContratoComun(salida, {
      seccionesExtra: [],
      confianzaMaxima: 'bajo',
      motivoTope: 'País sin ficha.',
    });
    expect(transparencia.nivel_confianza).toBe('bajo');
    expect(transparencia.motivo_confianza).toBe('País sin ficha. Datos completos.');
  });

  it('solo acepta las secciones extra que definió el admin, en su orden y con su título', () => {
    const salida = ContratoComunSchema.parse({
      secciones_extra: [
        { slug: 'inventada', resumen: 'No la pidió nadie.', puntos: [] },
        { slug: 'b', titulo: 'Título del modelo', resumen: 'Resumen B.', puntos: ['p1'] },
        { slug: 'a', resumen: 'Resumen A.', puntos: ['p2'] },
      ],
    });
    const { secciones_extra } = aplicarContratoComun(salida, {
      seccionesExtra: [
        { slug: 'a', titulo: 'Sección A', instrucciones: 'x'.repeat(10) },
        { slug: 'b', titulo: 'Sección B', instrucciones: 'x'.repeat(10) },
      ],
    });
    expect(secciones_extra.map((s) => [s.slug, s.titulo])).toEqual([
      ['a', 'Sección A'],
      ['b', 'Sección B'],
    ]);
  });
});

describe('perfil ampliado del negocio', () => {
  it('rechaza claves que no conoce', () => {
    expect(PerfilNegocioSchema.safeParse({ inventado: true }).success).toBe(false);
  });

  it('fusionar no borra lo que otro módulo ya guardó; null sí vacía', () => {
    const guardado = { situacion_fiscal: 'registrado', regimen_actual: 'RESICO', marca: 'no' };
    const r = fusionarPerfil(guardado, { marca: 'registrada', regimen_actual: null });
    expect(r).toEqual({ situacion_fiscal: 'registrado', regimen_actual: null, marca: 'registrada' });
  });

  it('lo guardado que no valida se descarta al leer', () => {
    expect(leerPerfil({ tipo_clientes: 'marcianos' })).toEqual({});
    expect(leerPerfil(null)).toEqual({});
  });

  it('en el prompt, lo no respondido es «no declarado», nunca «no»', () => {
    const texto = textoPerfil({ datos_sensibles: false }, 'MXN');
    expect(texto).toContain('maneja_datos_sensibles (salud, biométricos, financieros): no');
    expect(texto).toContain('situacion_fiscal: no declarado');
    expect(texto.split('\n')).toHaveLength(8);
    expect(camposSinResponder({ datos_sensibles: false, sectores_regulados: [] })).not.toContain('datos_sensibles');
    expect(camposSinResponder({ sectores_regulados: [] })).toContain('sectores_regulados');
  });
});

describe('secciones configurables', () => {
  it('no deja ocultar lo que sostiene el resultado', () => {
    expect(errorSeccionesOcultas('legal', ['legal.checklist'])).toBeNull();
    expect(errorSeccionesOcultas('legal', ['legal.resumen_ejecutivo'])).toMatch(/no se pueden ocultar/);
  });

  it('valida identificador y duplicados de las secciones extra', () => {
    const buena = { slug: 'riesgos_temporada', titulo: 'Riesgos', instrucciones: 'Analiza la estacionalidad.' };
    expect(SeccionesExtraSchema.safeParse([buena]).success).toBe(true);
    expect(SeccionesExtraSchema.safeParse([{ ...buena, slug: 'Con Espacios' }]).success).toBe(false);
    expect(SeccionesExtraSchema.safeParse([buena, buena]).success).toBe(false);
  });
});
