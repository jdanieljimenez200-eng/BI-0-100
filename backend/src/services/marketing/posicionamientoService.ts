import {
  EstrategiaMarketing,
  MercadoContexto,
  ROIEstimado,
  TipoEstrategia,
  ReporteAdsProcesado,
  CanalCierre,
  NivelTraccion,
  RangoMargen,
  UnitEconomicsVentasPlus,
  ScriptWhatsAppVentasPlus,
  SecuenciaSeguimientoVentasPlus,
} from './types';
import { cpcDeReferencia } from './benchmarksPais';
import { getMoneda } from '../../utils/latam';

const CATEGORY_AFFINITY: Record<string, { premium: number; volumen: number; especializado: number }> = {
  'Tecnología y gadgets':        { premium: 80, volumen: 50, especializado: 70 },
  'Salud y bienestar':           { premium: 75, volumen: 55, especializado: 80 },
  'Educación y cursos':          { premium: 85, volumen: 45, especializado: 75 },
  'Servicios profesionales':     { premium: 90, volumen: 40, especializado: 70 },
  'Arte y manualidades':         { premium: 70, volumen: 45, especializado: 85 },
  'Mascotas':                    { premium: 65, volumen: 60, especializado: 85 },
  'Deportes y fitness':          { premium: 65, volumen: 65, especializado: 80 },
  'Belleza y cuidado personal':  { premium: 70, volumen: 70, especializado: 65 },
  'Ropa y moda':                 { premium: 65, volumen: 75, especializado: 60 },
  'Alimentos y bebidas':         { premium: 55, volumen: 80, especializado: 65 },
  'Hogar y decoración':          { premium: 60, volumen: 70, especializado: 65 },
  'Entretenimiento':             { premium: 55, volumen: 75, especializado: 60 },
  'Otro':                        { premium: 60, volumen: 60, especializado: 65 },
};

const ESTRATEGIA_CANALES: Record<TipoEstrategia, string[]> = {
  PREMIUM:       ['Instagram', 'LinkedIn', 'Google Ads', 'WhatsApp Business', 'Referidos'],
  VOLUMEN:       ['Facebook Ads', 'TikTok', 'Mercado Libre', 'Google Shopping', 'WhatsApp masivo'],
  ESPECIALIZADO: ['Comunidades nicho', 'Instagram', 'YouTube', 'Email marketing', 'Grupos Facebook'],
  SEGUIDORES:    ['TikTok', 'Instagram', 'YouTube', 'Threads'],
  RECONOCIMIENTO:['Instagram', 'LinkedIn', 'YouTube', 'Facebook'],
  VENTAS:        ['Facebook', 'Instagram', 'Google Ads', 'WhatsApp', 'TikTok'],
  VENTAS_PLUS:   ['WhatsApp', 'Instagram', 'Facebook', 'LinkedIn', 'Google Ads'],
};

// Tokeniza el canal de venta libre del usuario ('TikTok Shop, Instagram y tienda física')
// en canales individuales, separando por comas y la conjunción "y".
function parseCanalesUsuario(canalVenta?: string | null): string[] {
  if (!canalVenta) return [];
  return canalVenta
    .split(/,|\sy\s/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .slice(0, 5);
}

/** Canales que solo tienen sentido si el negocio le vende a empresas. */
const CANALES_B2B = new Set(['linkedin', 'linkedin ads']);

/**
 * Canales de una estrategia: primero los que el negocio ya usa y, de la tabla de
 * la estrategia, solo lo que haga falta para tener con qué empezar (uno si ya
 * usa dos o más; hasta completar tres si usa menos). Antes se rellenaba hasta 5
 * y a un puesto de tamales o a un taller le salían LinkedIn y Google Ads aunque
 * solo usaran Instagram y Facebook. LinkedIn solo se sugiere si vende a empresas.
 */
function combinarCanales(reales: string[], tabla: string[], clientesEmpresa = false): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const agregar = (canal: string) => {
    const key = canal.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    out.push(canal);
    return true;
  };
  for (const canal of reales) {
    if (out.length === 5) break;
    agregar(canal);
  }
  const tope = Math.min(5, out.length >= 2 ? out.length + 1 : 3);
  for (const canal of tabla) {
    if (out.length >= tope) break;
    if (!clientesEmpresa && CANALES_B2B.has(canal.toLowerCase())) continue;
    agregar(canal);
  }
  return out;
}

function calcularPuntajesFit(
  categoria: string,
  precio: number,
  ctx?: MercadoContexto,
  reporteAds?: ReporteAdsProcesado
): { premium: number; volumen: number; especializado: number } {
  const affinity = CATEGORY_AFFINITY[categoria] ?? CATEGORY_AFFINITY['Otro'];
  let { premium, volumen, especializado } = affinity;

  if (ctx) {
    if (ctx.total_competidores <= 3) { premium += 10; especializado += 10; }
    else if (ctx.total_competidores >= 8) { volumen += 10; premium -= 5; }
    if (ctx.gap_detectado) especializado += 12;
    if (ctx.precio_mercado_promedio > 0) {
      const ratio = precio / ctx.precio_mercado_promedio;
      if (ratio > 1.3) premium += 10;
      if (ratio < 0.8) volumen += 10;
      if (ratio >= 0.9 && ratio <= 1.2) especializado += 8;
    }
    if (ctx.tendencia === 'CRECIENTE') premium += 8;
    if (ctx.tendencia === 'DECRECIENTE') volumen += 5;
  }

  // Retroalimentación Determinista de Reporte de Ads (delta acotado a ±10 puntos)
  if (reporteAds && reporteAds.totales) {
    const { totales, alertas } = reporteAds;
    const roas = totales.roas_promedio;
    const cpa = totales.cpa_promedio;
    const conv = totales.conversiones_total;

    // Si el ROAS histórico es alto (>= 3.0x), favorecer PREMIUM (+8)
    if (roas && roas >= 3.0) {
      premium += 8;
    }

    // Si el volumen de conversiones es alto con CPA controlado, favorecer VOLUMEN (+8)
    if (conv >= 50 && (!cpa || cpa <= 100)) {
      volumen += 8;
    }

    // Fugas graves de gasto sin conversión o CPA disparado (>= $250), penalizar VOLUMEN (-8) y apoyar ESPECIALIZADO (+6)
    const hayFugas = alertas?.some((a) => a.tipo === 'gasto_sin_conversion');
    if (hayFugas || (cpa && cpa >= 250)) {
      volumen -= 8;
      especializado += 6;
    }
  }

  return {
    premium:      Math.min(100, Math.max(0, premium)),
    volumen:      Math.min(100, Math.max(0, volumen)),
    especializado: Math.min(100, Math.max(0, especializado)),
  };
}

function buildPorQue(
  tipo: TipoEstrategia,
  nombre: string,
  categoria: string,
  scores: { premium: number; volumen: number; especializado: number },
  ctx?: MercadoContexto,
  puv?: string,
  reporteAds?: ReporteAdsProcesado
): string {
  const puvCtx = puv ? `La propuesta de valor declarada ("${puv}") refuerza este enfoque. ` : '';

  let reporteCtx = '';
  if (reporteAds?.totales) {
    const { totales, fuente } = reporteAds;
    const canalName =
      fuente === 'google_ads'
        ? 'Google Ads'
        : fuente === 'meta'
        ? 'Meta Ads'
        : fuente === 'tiktok'
        ? 'TikTok Ads'
        : fuente === 'linkedin'
        ? 'LinkedIn Ads'
        : 'campañas pagadas';

    reporteCtx = `Histórico en ${canalName}: ${totales.conversiones_total.toLocaleString()} conversiones con CPA de $${totales.cpa_promedio}${totales.roas_promedio ? ` y ROAS ${totales.roas_promedio}x` : ''}. `;
  }

  if (tipo === 'SEGUIDORES') {
    return `${nombre} tiene una oportunidad directa de crecimiento orgánico en ${categoria}. Los formatos cortos verticales (Reels y TikToks) premian el coeficiente viral (K-factor) atacando los errores más comunes de la industria. ${reporteCtx}${puvCtx}Construir audiencia antes de forzar la venta abarata el costo de adquisición futuro en más del 60%.`;
  }

  if (tipo === 'RECONOCIMIENTO') {
    const compCtx = ctx && ctx.total_competidores >= 5
      ? `Con ${ctx.total_competidores} competidores en el radar, la diferenciación narrativa es la única defensa contra la guerra de precios. `
      : '';
    return `En ${categoria}, la decisión de compra se basa en confianza y autoridad. ${compCtx}${reporteCtx}${puvCtx}Posicionar a ${nombre} como el estándar de referencia contra el 'antagonista de la industria' genera Top-of-Mind y multiplica las recomendaciones boca a boca.`;
  }

  if (tipo === 'VENTAS') {
    return `Estrategia de conversión directa y performance para ${nombre}. ${reporteCtx}${puvCtx}Ataca de forma quirúrgica el dolor agudo y el deseo inmediato del cliente con 3 ángulos creativos (Dolor, Aspiración, Lógica) y una distribución eficiente de pauta orientada a retorno de inversión en menos de 30 días.`;
  }

  if (tipo === 'VENTAS_PLUS') {
    return `La estrategia de mayor certeza comercial para ${nombre}. Combina ingeniería financiera de embudo (Unit Economics calculados), reversión total de riesgo mediante una Grand Slam Offer, guiones de cierre en 4 pasos para WhatsApp/DM y protocolo de rescate de prospectos en 5 días. Maximiza el valor de vida del cliente y el ROAS neto.`;
  }

  // Fallback legacy
  return `${nombre} cuenta con una sólida adecuación para ${tipo} en la categoría ${categoria}.`;
}

function buildROI(
  tipo: TipoEstrategia,
  presupuesto: number,
  precio: number = 1000
): ROIEstimado {
  if (tipo === 'SEGUIDORES') {
    const alcance = Math.round(presupuesto * 8.5);
    const segEst = Math.round(presupuesto / 18);
    return {
      alcance: `~${alcance.toLocaleString()} visualizaciones orgánicas y pauta/mes`,
      leads: `+${segEst.toLocaleString()} nuevos seguidores cualificados/mes`,
      descripcion: `Distribución de contenido viral en Reels y TikTok. Convierte visitas al perfil en seguidores activos con una tasa esperada del 12-18%.`,
    };
  }

  if (tipo === 'RECONOCIMIENTO') {
    const alcance = Math.round(presupuesto * 5.5);
    const interacciones = Math.round(presupuesto * 0.45);
    return {
      alcance: `~${alcance.toLocaleString()} impresiones de alta frecuencia/mes`,
      leads: `${interacciones.toLocaleString()} guardados y compartidos/mes`,
      descripcion: `Posicionamiento de marca y autoridad. Crea familiaridad y confianza para que los prospectos busquen directamente tu marca.`,
    };
  }

  if (tipo === 'VENTAS') {
    const clics = Math.round(presupuesto / 2.5);
    const leadsMin = Math.round(clics * 0.04);
    const leadsMax = Math.round(clics * 0.08);
    return {
      alcance: `~${clics.toLocaleString()} clics de alta intención/mes`,
      leads: `${leadsMin}-${leadsMax} prospectos listos para comprar/mes`,
      descripcion: `Campañas de performance directo. Genera conversaciones y compras inmediatas con un CPA proyectado competitivo.`,
    };
  }

  // VENTAS_PLUS
  const clics = Math.round((presupuesto * 0.70) / 2.6);
  const leads = Math.round(clics * 0.055);
  const ventas = Math.max(1, Math.round(leads * 0.20));
  const ingreso = ventas * Math.round(precio * 1.25);
  const roas = Number((ingreso / Math.max(1, presupuesto)).toFixed(1));

  return {
    alcance: `~${clics.toLocaleString()} prospectos hiper-segmentados`,
    leads: `${leads} conversaciones de venta calificadas (${ventas} cierres proyectados)`,
    descripcion: `Embudo quirúrgico con cierre por WhatsApp/DM. ROAS proyectado de ~${roas}x con ticket optimizado vía Order Bump y garantía de riesgo cero.`,
  };
}

export function generarEstrategias(
  nombre: string,
  categoria: string,
  tipo: string,
  precio: number,
  presupuesto: number,
  ctx?: MercadoContexto,
  puv?: string,
  canalVenta?: string,
  buyerPersonas?: any[],
  reporteAds?: ReporteAdsProcesado,
  canalCierre?: CanalCierre,
  nivelTraccion?: NivelTraccion,
  margenEstimado?: RangoMargen,
  pais?: string | null,
  opciones: {
    /** Le vende a empresas o gobierno: solo entonces se sugiere LinkedIn. */
    clientesEmpresa?: boolean;
    /** Cliente ideal declarado (o el de Ventas): es el público de la estrategia, no un arquetipo. */
    clienteIdeal?: string;
  } = {}
): EstrategiaMarketing[] {
  const scores = calcularPuntajesFit(categoria, precio, ctx, reporteAds);
  const esServicio = tipo === 'servicio';
  const basePrecio = precio > 0 ? precio : 1500;
  const basePresupuesto = presupuesto > 0 ? presupuesto : 3000;
  const canalesUsuario = parseCanalesUsuario(canalVenta);
  const empresa = Boolean(opciones.clientesEmpresa);
  const clienteIdeal = opciones.clienteIdeal?.trim().slice(0, 200) || null;
  /** Público de la estrategia: el cliente que declaró el dueño o, si no lo dijo, una descripción que lo pide. */
  const publico = (arquetipo: string) => clienteIdeal ?? `${arquetipo} (describe a tu cliente ideal para afinarlo)`;

  // ── Cálculo Matemático de Unit Economics para Ventas+ ──────────────────────
  let margenRatio = 0.45;
  let margenTexto = '40% – 50%';
  if (margenEstimado === 'bajo_30') {
    margenRatio = 0.25;
    margenTexto = '< 30%';
  } else if (margenEstimado === 'medio_30_50') {
    margenRatio = 0.40;
    margenTexto = '30% – 50%';
  } else if (margenEstimado === 'alto_50_70') {
    margenRatio = 0.60;
    margenTexto = '50% – 70%';
  } else if (margenEstimado === 'premium_70_plus') {
    margenRatio = 0.75;
    margenTexto = '> 70%';
  } else if (esServicio) {
    margenRatio = 0.65;
    margenTexto = '60% – 70%';
  }

  // El CPC del reporte de ads del usuario manda; si no lo ha subido, se usa el
  // supuesto del país EN SU MONEDA (antes era 2.6 para los 18 países).
  const cpcHistorico = reporteAds?.totales?.cpc_promedio;
  const usaDatosPropios = Boolean(cpcHistorico && cpcHistorico > 0);
  const cpcPromedio = usaDatosPropios ? cpcHistorico! : cpcDeReferencia(pais).cpc;
  const clicsEstimados = Math.max(25, Math.round((basePresupuesto * 0.70) / cpcPromedio));

  const tasaConvProspecto = canalCierre === 'whatsapp_dm' ? 5.5 : canalCierre === 'llamada' ? 4.2 : 3.2;
  const leadsConversaciones = Math.max(2, Math.round(clicsEstimados * (tasaConvProspecto / 100)));

  const tasaCierre = canalCierre === 'whatsapp_dm' ? 22 : canalCierre === 'llamada' ? 25 : canalCierre === 'tienda_fisica' ? 30 : 3.5;
  const ventasCerradas = Math.max(1, Math.round(leadsConversaciones * (tasaCierre / 100)));

  const ticketConBump = Math.round(basePrecio * 1.25);
  const ingresoProyectado = ventasCerradas * ticketConBump;
  const roasEstimado = Number((ingresoProyectado / basePresupuesto).toFixed(2));
  const cacMaximoTolerable = Math.round(ticketConBump * margenRatio);
  // En la moneda del país del negocio: antes «$… MXN» para los 18 países.
  const dinero = (n: number) => `${Math.round(n).toLocaleString('es-MX')} ${getMoneda(pais || 'MX')}`;
  // El extra vale lo que sube el ticket (25 %), no 490 o 290 MXN fijos.
  const precioBump = ticketConBump - Math.round(basePrecio);
  const puntoEquilibrioUnidades = Math.ceil(basePresupuesto / Math.max(1, (ticketConBump * margenRatio)));

  const unitEconomics: UnitEconomicsVentasPlus = {
    presupuesto_simulado: basePresupuesto,
    clics_estimados: clicsEstimados,
    cpc_promedio: cpcPromedio,
    leads_o_conversaciones: leadsConversaciones,
    tasa_conversion_prospecto: tasaConvProspecto,
    ventas_cerradas: ventasCerradas,
    tasa_cierre: tasaCierre,
    ingreso_proyectado: ingresoProyectado,
    // Sin piso: `Math.max(1.2, …)` garantizaba que la simulación JAMÁS mostrara
    // una campaña que pierde dinero, que es justo lo que el dueño necesita ver
    // antes de gastar.
    roas_estimado: roasEstimado,
    rentable: roasEstimado >= 1,
    origen_supuestos: usaDatosPropios ? 'tus_datos' : 'benchmark',
    cac_maximo_tolerable: cacMaximoTolerable,
    ticket_promedio_con_bump: ticketConBump,
    punto_equilibrio_unidades: puntoEquilibrioUnidades,
  };

  const scriptWhatsApp: ScriptWhatsAppVentasPlus = {
    paso1_filtro: {
      objetivo: 'Filtrar mirones y calificar la necesidad real en menos de 60 segundos.',
      pregunta: `¡Hola! Qué gusto saludarte. Para darte la recomendación exacta sobre ${nombre}: ¿buscas resolver esto para uso personal o para tu negocio/proyecto?`,
    },
    paso2_diagnostico: {
      objetivo: 'Hacer visible el costo de inacción y agudizar la urgencia de compra.',
      mensaje: `Excelente. Muchos clientes nos escriben porque están cansados de opciones en ${categoria.toLowerCase()} que no cumplen lo que prometen y terminan gastando el doble. ¿Es ese tu caso principal hoy?`,
    },
    paso3_presentacion: {
      objetivo: 'Presentación personalizada de la solución sin enviar PDFs largos que nadie lee.',
      audio_o_texto: `Justo para eso creamos ${nombre}. Te entrega resultado visible desde los primeros días, con garantía por escrito. El paquete completo queda en ${dinero(ticketConBump)}. [Si tienes una promoción real, dila con su fecha de fin; un «precio normal» inventado es publicidad engañosa.]`,
    },
    paso4_cierre_objeciones: {
      objecion_precio: 'Te entiendo totalmente. Si dejamos de lado el precio por un momento, ¿es esta la solución exacta que necesitas para resolver tu problema?',
      objecion_pensarlo: 'Claro que sí, es una decisión importante. Normalmente cuando alguien lo piensa es por presupuesto o porque quedó alguna duda técnica. ¿Cuál de las dos es en tu caso?',
      objecion_consultarlo: 'Perfecto que lo consultes. Para que no tengas que explicar todo desde cero, ¿te preparo una ficha de 3 puntos con la garantía y los números para que lo evalúen juntos?',
    },
  };

  const secuenciaSeguimiento: SecuenciaSeguimientoVentasPlus = {
    dia1_caso_exito: `Hola 👋 Me quedé pensando en lo que platicamos sobre ${nombre}. Te comparto rápido el caso de [un cliente real tuyo que tenía la misma duda] y lo que logró. ¿Pudiste revisar el mensaje anterior?`,
    dia3_beneficio_clave: `Hola 👋 Un detalle clave que olvidé mencionarte sobre ${nombre}: [tu garantía o beneficio real, si lo tienes]. [Si de verdad tienes cupo limitado, dilo con el número real.] ¿Te aparto uno?`,
    dia5_despedida_urgencia: `Hola 👋 Como no supe de ti supongo que tus prioridades cambiaron o ya lo resolviste por otro lado, lo cual está excelente 🙌. Solo te escribo para liberar el cupo reservado. Si decides retomarlo después avísame. ¡Mucho éxito!`,
  };

  // Ofertas que el dueño tiene que poder cumplir: se proponen como hueco para
  // llenar, no como promesa. Antes salía «reembolso del 100 % en 30 días» y una
  // «Auditoría Express 1-a-1» igual para un taller mecánico que para tamales.
  const garantia = esServicio
    ? `[Solo si puedes cumplirla] Si el servicio de ${nombre} no queda como lo acordamos, lo corregimos sin costo.`
    : `[Solo si puedes cumplirla] Si tu compra de ${nombre} llega mal o no es lo que pediste, te la reponemos sin costo.`;
  const orderBump = esServicio
    ? `[Un servicio rápido que complemente el principal] por ${dinero(precioBump)} adicionales`
    : `[Un complemento de tu catálogo que se lleve junto: bebida, accesorio o porción extra] por ${dinero(precioBump)} adicionales`;

  // ── Construcción de los 4 Pilares de Agencia ──────────────────────────────
  const estrategias: EstrategiaMarketing[] = [
    {
      tipo: 'SEGUIDORES',
      pilar: 'SEGUIDORES',
      nombre: 'Crecimiento de Audiencia y Tracción Viral',
      tagline: 'Masa crítica, hooks virales y retención en perfil',
      descripcion: `Estrategia TOFU (Top of Funnel) para ${nombre}. Convierte la atención de redes sociales en una comunidad cualificada mediante video corto de alto impacto.`,
      por_que: buildPorQue('SEGUIDORES', nombre, categoria, scores, ctx, puv, reporteAds),
      precio_sugerido: Math.round(basePrecio * 0.9),
      precio_rango: { min: Math.round(basePrecio * 0.8), max: basePrecio },
      margen_rango: margenTexto,
      publico_objetivo: publico(`Personas interesadas en ${categoria.toLowerCase()} que aún no te conocen`),
      edad_rango: '18-45',
      canales_principales: combinarCanales(canalesUsuario, ESTRATEGIA_CANALES.SEGUIDORES, empresa),
      ventaja_competitiva: 'Ganchos visuales irresistibles + bio optimizada para convertir visitas en seguidores',
      nivel_inversion: 'BAJO',
      presupuesto_mensual_sugerido: Math.round(basePresupuesto * 0.3),
      tiempo_resultados: '15-30 días',
      riesgo: 'BAJO',
      puntaje_fit: 88,
      roi: buildROI('SEGUIDORES', basePresupuesto, basePrecio),
      recomendada: false,
      kpis_reales: {
        metrica_norte: 'Crecimiento neto semanal de seguidores y visitas al perfil',
        benchmark_industria: 'Engagement Rate > 3.8% en video vertical; ratio seguidor/visita > 15%',
        frecuencia_revision: 'Semanal',
      },
      plan_accion_paso_a_paso: [
        '1. Optimizar biografía con la fórmula: [A quién ayudas] + [Resultado tangible] + [Enlace con recurso magnético gratuito].',
        '2. Publicar 3 a 5 piezas de video corto semanales atacando los 3 errores más comunes de la industria.',
        '3. Ejecutar protocolo de engagement comentando en 10 cuentas afines 20 minutos antes y después de cada publicación.',
        '4. Usar llamadas a la acción que incentiven guardar el video o comentar una palabra clave para recibir información por DM.',
      ],
    },
    {
      tipo: 'RECONOCIMIENTO',
      pilar: 'RECONOCIMIENTO',
      nombre: 'Autoridad de Mercado y Confianza',
      tagline: 'El estándar de referencia contra el antagonista del sector',
      descripcion: `Posiciona a "${nombre}" como la opción indiscutible por prestigio, credibilidad y prueba social irrefutable.`,
      por_que: buildPorQue('RECONOCIMIENTO', nombre, categoria, scores, ctx, puv, reporteAds),
      precio_sugerido: Math.round(basePrecio * 1.3),
      precio_rango: { min: basePrecio, max: Math.round(basePrecio * 1.5) },
      margen_rango: margenTexto,
      publico_objetivo: publico(`Compradores de ${categoria.toLowerCase()} que eligen por confianza y reputación`),
      edad_rango: '28-55',
      canales_principales: combinarCanales(canalesUsuario, ESTRATEGIA_CANALES.RECONOCIMIENTO, empresa),
      ventaja_competitiva: 'Narrativa de autoridad de marca + testimonios y casos de éxito reales',
      nivel_inversion: 'MEDIO',
      presupuesto_mensual_sugerido: Math.round(basePresupuesto * 0.4),
      tiempo_resultados: '30-60 días',
      riesgo: 'BAJO',
      puntaje_fit: 89,
      roi: buildROI('RECONOCIMIENTO', basePresupuesto, basePrecio),
      recomendada: false,
      kpis_reales: {
        metrica_norte: 'Guardados, compartidos y búsquedas orgánicas de marca',
        benchmark_industria: 'Tasa de guardados > 2.5%; incremento mensual en búsquedas de nombre de marca',
        frecuencia_revision: 'Quincenal',
      },
      plan_accion_paso_a_paso: [
        '1. Documentar la narrativa de marca contra la mala práctica más común del sector.',
        '2. Publicar 1 caso de estudio semanal con la estructura: Situación inicial -> Obstáculo -> Solución -> Métrica lograda.',
        '3. Lanzar carruseles educativos en LinkedIn e Instagram desmontando mitos de la industria.',
        '4. Gestionar 2 alianzas o colaboraciones mensuales con micro-referentes del nicho.',
      ],
    },
    {
      tipo: 'VENTAS',
      pilar: 'VENTAS',
      nombre: 'Conversión Directa y Performance',
      tagline: 'Oferta directa, dolor agudo y retorno de pauta predecible',
      descripcion: `Enfocada en generar flujo de caja inmediato mediante campañas de respuesta directa y optimización de punto de venta.`,
      por_que: buildPorQue('VENTAS', nombre, categoria, scores, ctx, puv, reporteAds),
      precio_sugerido: basePrecio,
      precio_rango: { min: Math.round(basePrecio * 0.9), max: Math.round(basePrecio * 1.15) },
      margen_rango: margenTexto,
      publico_objetivo: publico(`Personas que ya buscan ${categoria.toLowerCase()} y están por comprar`),
      edad_rango: '24-50',
      canales_principales: combinarCanales(canalesUsuario, ESTRATEGIA_CANALES.VENTAS, empresa),
      ventaja_competitiva: 'Oferta atractiva con urgencia real + canal de contacto ágil',
      nivel_inversion: 'MEDIO',
      presupuesto_mensual_sugerido: basePresupuesto,
      tiempo_resultados: '15-30 días',
      riesgo: 'MEDIO',
      puntaje_fit: 91,
      roi: buildROI('VENTAS', basePresupuesto, basePrecio),
      recomendada: false,
      kpis_reales: {
        metrica_norte: 'Costo por Adquisición (CPA) y Retorno sobre Inversión Publicitaria (ROAS)',
        benchmark_industria: 'CTR de anuncio > 1.4%; tasa de conversión de prospecto a cliente > 12%',
        frecuencia_revision: 'Semanal',
      },
      plan_accion_paso_a_paso: [
        '1. Crear anuncios en 3 ángulos psicológicos: Dolor/Urgencia, Aspiración/Estatus y Rentabilidad.',
        '2. Distribuir el presupuesto: 70% prospección fría y 30% retargeting de personas que interactuaron.',
        '3. Reducir el tiempo de respuesta en canal de cierre a menos de 5 minutos.',
        '4. Ofrecer un incentivo de compra rápida con fecha límite real de caducidad.',
      ],
    },
    {
      tipo: 'VENTAS_PLUS',
      pilar: 'VENTAS_PLUS',
      nombre: 'Ventas + (Motor Quirúrgico de Conversión)',
      tagline: 'Matemática de embudo, Grand Slam Offer y scripts de cierre',
      descripcion: `La joya de la corona con IA de alto rendimiento. Mapea la matemática unitaria de tu negocio, diseña una oferta irresistible con garantía y provee guiones de cierre y seguimiento listos para copiar.`,
      por_que: buildPorQue('VENTAS_PLUS', nombre, categoria, scores, ctx, puv, reporteAds),
      precio_sugerido: ticketConBump,
      precio_rango: { min: basePrecio, max: Math.round(ticketConBump * 1.25) },
      margen_rango: margenTexto,
      publico_objetivo: publico(`Personas que ya te contactaron o te buscan para comprar ${categoria.toLowerCase()}`),
      edad_rango: '25-55',
      canales_principales: combinarCanales(canalesUsuario, ESTRATEGIA_CANALES.VENTAS_PLUS, empresa),
      ventaja_competitiva: 'Oferta clara con una garantía que puedas cumplir + guiones de WhatsApp y seguimiento',
      nivel_inversion: 'ALTO',
      presupuesto_mensual_sugerido: basePresupuesto,
      tiempo_resultados: '15-30 días',
      riesgo: 'BAJO',
      puntaje_fit: 98,
      roi: buildROI('VENTAS_PLUS', basePresupuesto, basePrecio),
      recomendada: true,
      unit_economics: unitEconomics,
      script_cierre: scriptWhatsApp,
      secuencia_seguimiento: secuenciaSeguimiento,
      garantia_irresistible: garantia,
      order_bump_sugerido: orderBump,
      kpis_reales: {
        metrica_norte: 'ROAS Neto y Margen de Contribución por Cliente Adquirido',
        benchmark_industria: 'ROAS > 3.0x; recuperación de prospectos en follow-up > 25%; CAC < margen bruto',
        frecuencia_revision: 'Diaria en tiempo real',
      },
      plan_accion_paso_a_paso: [
        '1. Implementar la Grand Slam Offer con la garantía incondicional y el Order Bump de ticket alto.',
        '2. Entrenar a quien atienda WhatsApp/DM en el script de 4 pasos (Filtro -> Diagnóstico -> Solución -> Manejo de objeciones).',
        '3. Programar la secuencia de seguimiento de 5 días para quien no compra en el primer mensaje.',
        `4. Monitorear los Unit Economics: mantener el CAC por debajo de ${dinero(cacMaximoTolerable)} para asegurar rentabilidad.`,
      ],
    },
  ];

  return estrategias;
}
