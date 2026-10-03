import {
  redactAnalisisPayload,
  respuestaAnalisis,
  CANDADO_PRO,
} from '../../services/billing/redactAnalisis';
import { seccionesBloqueablesDe } from '../../services/billing/gatingAnalisis';

// ─── Fixtures mínimos con la forma real de cada fila ──────────────────────────

const filaMercado = () => ({
  id: 'm1',
  viabilidad_score: 78,
  viabilidad_estado: 'VIABLE',
  viabilidad_factores: { demanda: 8, competencia: 6 },
  volumen_busquedas_mensual: 12000,
  tendencia_porcentaje: 14.5,
  total_competidores: 23,
  tendencias_data: { volumen_busquedas_mensual: 12000, datos_12_meses: [{ mes: 'ene', volumen: 900 }] },
  competencia_data: { total_competidores: 23, gap_detectado: 'nadie vende de noche', competidores: [{ nombre: 'ACME', url: 'https://acme.test' }] },
  densidad_data: { es_evaluable: true, competidores_km2: 3 },
  dafo_data: { fortalezas: ['marca'] },
  tam_data: { tam: 1000000 },
  alertas: [{ tipo: 'precio', mensaje: 'margen bajo' }],
  reporte_bi_data: { analisis_mercado: { gap_oportunidad: 'turno nocturno' } },
  payback_data: { meses: 7 },
  renta_zona_data: { origen: 'estimado' },
  estudio_area_data: { veredicto: 'rentar' },
});

const estrategia = (tipo: string, fit: number, recomendada: boolean) => ({
  tipo,
  nombre: `Estrategia ${tipo}`,
  tagline: 'tag',
  descripcion: 'desc',
  por_que: 'porque',
  precio_sugerido: 499,
  precio_rango: { min: 400, max: 600 },
  margen_rango: '45%-55%',
  publico_objetivo: 'NSE C+',
  edad_rango: '25-40',
  canales_principales: ['Instagram'],
  ventaja_competitiva: 'servicio',
  nivel_inversion: 'MEDIO',
  presupuesto_mensual_sugerido: 8000,
  tiempo_resultados: '3 meses',
  riesgo: 'BAJO',
  puntaje_fit: fit,
  roi: { alcance: '10k', leads: '120', descripcion: 'ok' },
  recomendada,
});

const publicacion = () => ({
  hora: '18:00',
  plataforma: 'Instagram',
  tipo_contenido: 'Reel',
  idea: 'detrás de cámaras',
  copy: 'texto',
  hashtags: ['#uno'],
  video_script: { hook: 'hook', valor: 'valor', cta: 'cta' },
  prompt_visual: 'foto cenital',
});

const filaMarketing = (seccionesGuardadas?: string[]) => ({
  id: 'mk1',
  estrategias_data: [
    estrategia('PREMIUM', 90, true),
    estrategia('VOLUMEN', 70, false),
    estrategia('ESPECIALIZADO', 60, false),
  ],
  copies_data: [{ tipo: 'PREMIUM', headline: 'h' }],
  reporte_ads_data: { gasto: 1000 },
  calendario_data: {
    estrategia_tipo: 'PREMIUM',
    tendencias: [{ plataforma: 'Instagram', tendencia: 'x', score: 80, hashtags: [], justificacion: 'y' }],
    sugerencia_visual_campana: 'tonos cálidos',
    semanas: [
      { numero: 1, dias: [{ dia: 'lunes', publicaciones: [publicacion()], sugerencia_engagement: 'responde DMs' }] },
      { numero: 2, dias: [{ dia: 'lunes', publicaciones: [publicacion()], sugerencia_engagement: 'encuesta' }] },
    ],
    ...(seccionesGuardadas ? { secciones_bloqueadas: seccionesGuardadas } : {}),
  },
});

const filaFinanzas = () => ({
  id: 'f1',
  inputs_data: { precio_venta: 100, costo_variable_unitario: 40, costos_fijos_mensuales: 5000 },
  breakeven_data: { unidades_equilibrio: 84, margen_contribucion: 60 },
  proyeccion_data: { meses: [{ mes: 1, ingresos: 10000 }] },
  resumen_data: { veredicto: 'rentable' },
  sensibilidad_data: { escenarios: [{ nombre: 'pesimista' }] },
  overrides_data: { precio_venta: 120 },
});

const filaLegal = () => ({
  id: 'l1',
  giro_detectado: 'Alimentos preparados',
  cumplimiento_global: 'amarillo',
  puntaje_cumplimiento: 62,
  resultado_data: { permisos: [{ nombre: 'Aviso de funcionamiento' }], checklist: ['RFC'] },
});

const filaBrief = () => ({
  id: 'b1',
  resultado_data: {
    brief_identidad: {
      adn: 'adn real',
      diferenciador_clave: 'dif',
      personalidad: ['Moderno', 'Confiable', 'Cercano'],
      voz_marca: 'cálida',
      slogan_principal: 'slogan',
      slogans_alternativos: ['alt1', 'alt2'],
    },
    identidad_visual: {
      paleta: {
        primario: { nombre: 'Azul', hex: '#0EA5E9', uso: 'fondos' },
        secundario: { nombre: 'Gris', hex: '#64748B', uso: 'texto' },
        acento: { nombre: 'Lima', hex: '#84CC16', uso: 'CTA' },
        neutro: { nombre: 'Hueso', hex: '#F8FAFC', uso: 'base' },
      },
      tipografias: { principal: 'Plus Jakarta Sans', secundaria: 'Inter' },
      concepto_logo: 'isotipo',
      descripcion_isotipo: 'hoja',
      estilo_grafico: 'minimalista',
    },
    diagnostico_estrategico: 'diagnóstico largo',
    score_marca: { coherencia: 7, diferenciacion: 6, claridad: 8, impacto_visual: 7, total: 7 },
    instrucciones_disenador: ['usar serif', 'logo en negativo'],
    resumen_tweet: 'marca premium para foodies',
    es_mock: false,
  },
});

// `secciones_bloqueadas` es una COLUMNA propia de la fila (no anidada como en
// marketing): se omite cuando se simula un análisis legacy anterior a la columna.
const filaVentas = (seccionesGuardadas?: string[]) => ({
  id: 'v1',
  tips_data: [
    { titulo: 'Ancla el precio alto', detalle: 'Menciona primero el paquete premium', categoria: 'negociacion' },
    { titulo: 'Cierra con escasez real', detalle: 'Solo 4 cupos esta semana', categoria: 'cierre' },
  ],
  historia_data: {
    fecha: '2026-08-30',
    nombre: 'Marta Ruiz',
    negocio: 'Panadería sin gluten',
    titular: 'De 3 clientes a 300 pedidos semanales',
    relato: 'Empezó vendiendo en un mercado local',
    leccion: 'La distribución vale más que el producto',
  },
  porque_fallan_data: {
    causas: [{ causa: 'Sin control de margen', porcentaje: 34, senal_temprana: 'ticket que baja' }],
    diagnostico_personalizado: 'tu ticket promedio no cubre el coste de adquisición',
    plan_prevencion: ['Recalcula el CAC cada mes'],
  },
  ...(seccionesGuardadas ? { secciones_bloqueadas: seccionesGuardadas } : {}),
});

// ─── Planes de pago: no hay recorte ──────────────────────────────────────────

describe('redactAnalisisPayload — planes con análisis completo', () => {
  it.each(['pro', 'pro_plus', 'business', 'enterprise'])('%s recibe la fila intacta', (plan) => {
    const fila = filaMercado();
    const { payload, secciones_bloqueadas } = redactAnalisisPayload('mercado', plan, fila);

    expect(payload).toBe(fila);
    expect(secciones_bloqueadas).toEqual([]);
  });

  it('respeta la lista persistida aunque el plan ya sea de pago (análisis incompleto permanente)', () => {
    const guardadas = ['marketing.copies', 'marketing.calendario_semana_2'];
    const { payload, secciones_bloqueadas } = redactAnalisisPayload('marketing', 'pro', filaMarketing(guardadas));

    expect(secciones_bloqueadas).toEqual(guardadas);
    // Lo que sí existe en la fila se muestra: no se vuelve a recortar.
    expect(payload.copies_data).not.toBeNull();
    expect(payload.estrategias_data.every((e) => e.nombre !== CANDADO_PRO)).toBe(true);
  });
});

// ─── Mercado ─────────────────────────────────────────────────────────────────

describe('redactAnalisisPayload — mercado en gratuito', () => {
  const { payload, secciones_bloqueadas } = redactAnalisisPayload('mercado', 'freemium', filaMercado());

  it('deja visible el gancho: el estudio de viabilidad', () => {
    expect(payload.viabilidad_score).toBe(78);
    expect(payload.viabilidad_estado).toBe('VIABLE');
    expect(payload.viabilidad_factores).toEqual({ demanda: 8, competencia: 6 });
  });

  it('vacía cada bloque con clave declarada', () => {
    expect(payload.tendencias_data).toBeNull();
    expect(payload.competencia_data).toBeNull();
    expect(payload.dafo_data).toBeNull();
    expect(payload.tam_data).toBeNull();
    expect(payload.reporte_bi_data).toBeNull();
  });

  it('vacía los escalares de acceso rápido junto a su bloque', () => {
    expect(payload.volumen_busquedas_mensual).toBeNull();
    expect(payload.tendencia_porcentaje).toBeNull();
    expect(payload.total_competidores).toBeNull();
  });

  it('no toca campos sin clave declarada (el front no los envuelve en candado)', () => {
    expect(payload.densidad_data).toEqual({ es_evaluable: true, competidores_km2: 3 });
    expect(payload.payback_data).toEqual({ meses: 7 });
    expect(payload.renta_zona_data).toEqual({ origen: 'estimado' });
    expect(payload.estudio_area_data).toEqual({ veredicto: 'rentar' });
    expect(payload.alertas).toHaveLength(1);
  });

  it('reporta la lista declarada en gatingAnalisis', () => {
    expect(secciones_bloqueadas).toEqual(seccionesBloqueablesDe('mercado'));
  });

  it('con el reporte BI bloqueado vacía las secciones extra, pero deja la transparencia', () => {
    const meta_ia = {
      transparencia: { supuestos: ['x'], informacion_faltante: [], nivel_confianza: 'medio', motivo_confianza: 'm' },
      secciones_extra: [{ slug: 'temporada', titulo: 'Temporadas', resumen: 'r', puntos: [] }],
      secciones_ocultas: [],
    };
    const { payload: p } = redactAnalisisPayload('mercado', 'freemium', { ...filaMercado(), meta_ia });
    expect(p.meta_ia.secciones_extra).toEqual([]);
    expect(p.meta_ia.transparencia).toEqual(meta_ia.transparencia);
  });

  it('no filtra el gap ni los nombres de competidores por ninguna vía', () => {
    expect(JSON.stringify(payload)).not.toContain('nadie vende de noche');
    expect(JSON.stringify(payload)).not.toContain('ACME');
    expect(JSON.stringify(payload)).not.toContain('turno nocturno');
  });
});

// ─── Marketing ───────────────────────────────────────────────────────────────

describe('redactAnalisisPayload — marketing en gratuito', () => {
  const { payload } = redactAnalisisPayload('marketing', 'freemium', filaMarketing());

  it('conserva solo la estrategia recomendada con datos reales', () => {
    const visibles = payload.estrategias_data.filter((e) => e.nombre !== CANDADO_PRO);
    expect(visibles).toHaveLength(1);
    expect(visibles[0].tipo).toBe('PREMIUM');
    expect(visibles[0].recomendada).toBe(true);
  });

  it('preserva la longitud del array para que el upsell siga funcionando', () => {
    expect(payload.estrategias_data).toHaveLength(3);
    expect(payload.estrategias_data.map((e) => e.tipo)).toEqual(['PREMIUM', 'VOLUMEN', 'ESPECIALIZADO']);
  });

  it('mantiene la forma de las estrategias bloqueadas (sin null ni undefined)', () => {
    const bloqueada = payload.estrategias_data[1];
    expect(bloqueada.precio_rango).toEqual({ min: 0, max: 0 });
    expect(bloqueada.roi).toEqual({ alcance: '', leads: '', descripcion: '' });
    expect(Array.isArray(bloqueada.canales_principales)).toBe(true);
    expect(typeof bloqueada.puntaje_fit).toBe('number');
    expect(bloqueada.recomendada).toBe(false);
  });

  it('elimina copies, tendencias y reporte de ads', () => {
    expect(payload.copies_data).toBeNull();
    expect(payload.reporte_ads_data).toBeNull();
    expect(payload.calendario_data.tendencias).toEqual([]);
  });

  it('conserva la cadencia (día + plataforma) y recorta el contenido de cada publicación', () => {
    expect(payload.calendario_data.semanas).toHaveLength(2);
    for (const semana of payload.calendario_data.semanas) {
      for (const dia of semana.dias) {
        // NO se vacía el array: un día sin publicaciones lo pinta el front como
        // "Descanso", y eso sería falso — ese día sí toca publicar.
        expect(dia.publicaciones).toHaveLength(1);
        const pub = dia.publicaciones[0];
        expect(typeof pub.plataforma).toBe('string');
        expect(pub.plataforma.length).toBeGreaterThan(0);
        expect(pub.hora).toBe('');
        expect(pub.tipo_contenido).toBe('');
        expect(pub.idea).toBe('');
        expect(pub.copy).toBe('');
        expect(pub.hashtags).toEqual([]);
        expect(pub.video_script).toBeUndefined();
        expect(pub.prompt_visual).toBeUndefined();
        expect(dia.sugerencia_engagement).toBe('');
      }
    }
    expect(JSON.stringify(payload)).not.toContain('detrás de cámaras');
    expect(JSON.stringify(payload)).not.toContain('foto cenital');
  });
});

describe('redactAnalisisPayload — marketing recortado con lista persistida ajena', () => {
  // Regresión: un análisis generado en plan de pago persiste
  // `secciones_bloqueadas: []` (array VACÍO, no ausente). Si la cuenta baja a
  // gratuito, el payload se recorta con la lista freemium, así que reportar la
  // persistida tal cual dejaría al front con datos vacíos y SIN candados: el
  // gate de la página evalúa `secciones_bloqueadas.includes(...)`.
  it('reporta las claves con las que realmente se recortó, no el array vacío persistido', () => {
    const { payload, secciones_bloqueadas } = redactAnalisisPayload(
      'marketing',
      'freemium',
      filaMarketing([]),
    );

    expect(secciones_bloqueadas).toEqual(
      expect.arrayContaining(seccionesBloqueablesDe('marketing')),
    );
    // El recorte y la lista reportada describen el mismo payload.
    expect(payload.copies_data).toBeNull();
    expect(secciones_bloqueadas).toContain('marketing.copies');
    expect(payload.calendario_data.tendencias).toEqual([]);
    expect(secciones_bloqueadas).toContain('marketing.tendencias');
  });

  it('no pierde claves persistidas que este build ya no declara', () => {
    const { secciones_bloqueadas } = redactAnalisisPayload(
      'marketing',
      'freemium',
      filaMarketing(['marketing.seccion_legacy']),
    );

    expect(secciones_bloqueadas).toContain('marketing.seccion_legacy');
    expect(secciones_bloqueadas).toEqual(
      expect.arrayContaining(seccionesBloqueablesDe('marketing')),
    );
  });

  it('no duplica claves cuando la persistida y la del gate coinciden', () => {
    const { secciones_bloqueadas } = redactAnalisisPayload(
      'marketing',
      'freemium',
      filaMarketing(['marketing.copies', 'marketing.tendencias']),
    );

    expect(new Set(secciones_bloqueadas).size).toBe(secciones_bloqueadas.length);
  });
});

// ─── Finanzas ────────────────────────────────────────────────────────────────

describe('redactAnalisisPayload — finanzas en gratuito', () => {
  const { payload } = redactAnalisisPayload('finanzas', 'freemium', filaFinanzas());

  it('deja visible el gancho: punto de equilibrio e inputs del usuario', () => {
    expect(payload.breakeven_data).toEqual({ unidades_equilibrio: 84, margen_contribucion: 60 });
    expect(payload.inputs_data).not.toBeNull();
  });

  it('ya no envía el resto del payload (antes el candado era solo visual)', () => {
    expect(payload.proyeccion_data).toBeNull();
    expect(payload.resumen_data).toBeNull();
    expect(payload.sensibilidad_data).toBeNull();
    expect(payload.overrides_data).toBeNull();
  });
});

// ─── Legal ───────────────────────────────────────────────────────────────────

describe('redactAnalisisPayload — legal en gratuito', () => {
  const { payload, secciones_bloqueadas } = redactAnalisisPayload('legal', 'freemium', filaLegal());

  it('no envía resultado_data', () => {
    expect(payload.resultado_data).toBeNull();
    expect(JSON.stringify(payload)).not.toContain('Aviso de funcionamiento');
  });

  it('conserva los escalares del semáforo, que ya son públicos en el listado', () => {
    expect(payload.giro_detectado).toBe('Alimentos preparados');
    expect(payload.cumplimiento_global).toBe('amarillo');
    expect(payload.puntaje_cumplimiento).toBe(62);
  });

  it('reporta legal.completo', () => {
    expect(secciones_bloqueadas).toEqual(['legal.completo']);
  });
});

// ─── Brief ───────────────────────────────────────────────────────────────────

describe('redactAnalisisPayload — brief en gratuito', () => {
  const { payload } = redactAnalisisPayload('brief', 'freemium', filaBrief());
  const data = payload.resultado_data;

  it('deja visible el gancho: score_marca (objeto /10) y resumen_tweet', () => {
    expect(data.score_marca).toEqual({
      coherencia: 7,
      diferenciacion: 6,
      claridad: 8,
      impacto_visual: 7,
      total: 7,
    });
    expect(data.resumen_tweet).toBe('marca premium para foodies');
  });

  it('tapa el desarrollo de la identidad', () => {
    expect(data.brief_identidad.adn).toBe(CANDADO_PRO);
    expect(data.brief_identidad.personalidad).toEqual([]);
    expect(data.diagnostico_estrategico).toBe(CANDADO_PRO);
    expect(data.instrucciones_disenador).toEqual([]);
    const serializado = JSON.stringify(payload);
    expect(serializado).not.toContain('adn real');
    expect(serializado).not.toContain('diagnóstico largo');
    expect(serializado).not.toContain('#0EA5E9');
  });

  it('preserva la forma anidada de identidad_visual: el front lee paleta.primario.hex antes del candado', () => {
    expect(data.identidad_visual).not.toBeNull();
    // `as const` en lugar de string[]: indexar la paleta con un `string` suelto
    // da TS7053 en `npx tsc --noEmit` (el proyecto es strict; jest.config.js
    // relaja `strict` solo para ts-jest, así que el test compila en los dos).
    const tokens = ['primario', 'secundario', 'acento', 'neutro'] as const;
    for (const token of tokens) {
      expect(data.identidad_visual.paleta[token].hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(typeof data.identidad_visual.paleta[token].uso).toBe('string');
    }
    expect(typeof data.identidad_visual.tipografias.principal).toBe('string');
  });
});

// ─── Ventas ──────────────────────────────────────────────────────────────────

describe('redactAnalisisPayload — ventas en gratuito', () => {
  const { payload, secciones_bloqueadas } = redactAnalisisPayload('ventas', 'freemium', filaVentas());

  it('deja visible el gancho: tips de negociación e historia diaria', () => {
    expect(payload.tips_data).toHaveLength(2);
    expect(payload.tips_data[0].titulo).toBe('Ancla el precio alto');
    expect(payload.historia_data).not.toBeNull();
    expect(payload.historia_data.titular).toBe('De 3 clientes a 300 pedidos semanales');
  });

  it('no envía "por qué fallan" ni su contenido por ninguna vía', () => {
    expect(payload.porque_fallan_data).toBeNull();
    const serializado = JSON.stringify(payload);
    expect(serializado).not.toContain('Sin control de margen');
    expect(serializado).not.toContain('coste de adquisición');
    expect(serializado).not.toContain('Recalcula el CAC');
  });

  it('reporta las claves declaradas del módulo', () => {
    expect(secciones_bloqueadas).toEqual(seccionesBloqueablesDe('ventas'));
  });

  it('no duplica la clave cuando además viene persistida en la columna', () => {
    const { secciones_bloqueadas: lista } = redactAnalisisPayload(
      'ventas',
      'freemium',
      filaVentas(['ventas.porque_fallan']),
    );

    expect(lista).toEqual(seccionesBloqueablesDe('ventas'));
  });
});

describe('redactAnalisisPayload — ventas: la columna persistida manda en planes de pago', () => {
  // Regresión: `leerBloqueadasPersistidas` solo leía el contenedor de marketing
  // y devolvía null para ventas, así que un análisis GENERADO en gratuito (con
  // porque_fallan_data ya vacío en BD, porque el orquestador no lo genera) se
  // servía a una cuenta Pro con `secciones_bloqueadas: []`. El front pintaba el
  // hueco como bloque vacío en vez de candado: parecía un bug, no un muro.
  it('sigue reportando la clave aunque el plan ya sea de pago', () => {
    const fila = { ...filaVentas(['ventas.porque_fallan']), porque_fallan_data: null };
    const { payload, secciones_bloqueadas } = redactAnalisisPayload('ventas', 'pro', fila);

    expect(secciones_bloqueadas).toEqual(['ventas.porque_fallan']);
    expect(payload.porque_fallan_data).toBeNull();
  });

  it('no inventa candados si el análisis se generó completo (columna vacía)', () => {
    const { payload, secciones_bloqueadas } = redactAnalisisPayload('ventas', 'pro', filaVentas([]));

    expect(secciones_bloqueadas).toEqual([]);
    expect(payload.porque_fallan_data).not.toBeNull();
  });

  it('no inventa candados en filas legacy sin la columna', () => {
    const { secciones_bloqueadas } = redactAnalisisPayload('ventas', 'pro', filaVentas());
    expect(secciones_bloqueadas).toEqual([]);
  });

  it('descarta cadenas vacías de la columna (simple-array serializa "" como [""])', () => {
    const { secciones_bloqueadas } = redactAnalisisPayload('ventas', 'pro', filaVentas(['']));
    expect(secciones_bloqueadas).toEqual([]);
  });

  it('respuestaAnalisis expone la clave sin que la columna de la fila la sobrescriba', () => {
    const body = respuestaAnalisis('ventas', 'pro', filaVentas(['ventas.porque_fallan']));

    expect(body.id).toBe('v1');
    expect(body.secciones_bloqueadas).toEqual(['ventas.porque_fallan']);
  });
});

// ─── Contrato general ────────────────────────────────────────────────────────

describe('contrato del helper', () => {
  it('nunca muta la fila original', () => {
    const fila = filaMercado();
    const copia = JSON.parse(JSON.stringify(fila));
    redactAnalisisPayload('mercado', 'freemium', fila);
    expect(fila).toEqual(copia);
  });

  it('trata un plan desconocido, null o undefined como gratuito (fail closed)', () => {
    for (const plan of [null, undefined, '', 'plan_inventado']) {
      const { payload } = redactAnalisisPayload('legal', plan, filaLegal());
      expect(payload.resultado_data).toBeNull();
    }
  });

  it('es idempotente: aplicarlo dos veces da el mismo resultado', () => {
    const una = redactAnalisisPayload('marketing', 'freemium', filaMarketing()).payload;
    const dos = redactAnalisisPayload('marketing', 'freemium', una).payload;
    expect(dos).toEqual(una);
  });

  it('tolera filas con los bloques ya vacíos (análisis generado con gate)', () => {
    const fila = { id: 'x', tendencias_data: null, competencia_data: null, dafo_data: null };
    expect(() => redactAnalisisPayload('mercado', 'freemium', fila)).not.toThrow();
  });

  it('respuestaAnalisis devuelve el cuerpo listo para res.json', () => {
    const body = respuestaAnalisis('legal', 'freemium', filaLegal());
    expect(body.id).toBe('l1');
    expect(body.resultado_data).toBeNull();
    expect(body.secciones_bloqueadas).toEqual(['legal.completo']);
  });
});