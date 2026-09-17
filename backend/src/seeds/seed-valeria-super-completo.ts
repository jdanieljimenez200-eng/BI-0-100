/**
 * Seed Super Completo: Usuario Valeria Torres
 * Simula a Valeria Torres como usuaria real de la plataforma BI 0 A 100.
 *
 * Incluye:
 *   1. Eliminación limpia de todos los objetos anteriores de Valeria.
 *   2. Owner: Valeria Torres (valeria.torres@studiov.mx, Plan: business).
 *   3. 2 Negocios diferenciados:
 *       • Studio V Creativo (Servicios profesionales de diseño, branding y web)
 *       • Aura & Cacao Chocolatería (Productos físicos gourmet artesanales)
 *   4. 6 Productos y Servicios:
 *       • 1 Servicio COMPLETO (5/5 módulos + brief analizados)
 *       • 1 Producto Físico SEMI-COMPLETO (2/5 módulos: Mercado + Marketing, el resto vacíos)
 *       • 4 VACÍOS (2 servicios y 2 productos físicos sin análisis)
 *   5. Kit de Marca (Studio V) completo con paleta, tipografías, brief y análisis de logo.
 *   6. 7 Herramientas activadas y pobladas:
 *       • POS (10 items de catálogo, 8 ventas con tickets en Septiembre 2026 y detalle de items)
 *       • Calendario / Citas (6 citas en Septiembre 2026 vinculadas a clientes)
 *       • Inventario (5 insumos con stock y 8 movimientos de entradas y salidas)
 *       • Cotizaciones (3 cotizaciones: aceptada, enviada, borrador)
 *       • Clientes CRM (5 clientes categorizados con datos de contacto y notas)
 *       • Nómina (3 empleados formalmente registrados y pagos de nómina ejecutados)
 *       • Contabilidad (12 movimientos contables de ingresos y egresos categorizados)
 *       • Metas de Negocio (3 metas activas con progreso)
 *   7. Equipo de Trabajo:
 *       • 2 Trabajadores (Sofía Ramos y Diego Luna) con contraseñas conocidas y permisos granulares.
 *   8. Tema de usuario personalizado (Modo oscuro, violeta Studio V).
 *
 * Ejecutar:
 *   docker exec bi0a100-backend-1 npx ts-node src/seeds/seed-valeria-super-completo.ts
 */

import '../scripts/guardiaSeeds';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const databaseUrl = process.env.DATABASE_URL;
const AppDataSource = databaseUrl
  ? new DataSource({ type: 'postgres', url: databaseUrl, synchronize: false, logging: false })
  : new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'bi0a100_user',
      password: process.env.DB_PASSWORD || 'bi0a100_password',
      database: process.env.DB_NAME || 'bi0a100_db',
      synchronize: false,
      logging: false,
    });

// ═══════════════════════════════════════════════════════════════════════════════
// DATOS DE ANÁLISIS: SERVICIO COMPLETO (Paquete Identidad Visual & Branding 360°)
// ═══════════════════════════════════════════════════════════════════════════════

const MERCADO_COMPLETO = {
  viabilidad_score: 84,
  viabilidad_estado: 'viable',
  viabilidad_factores: {
    demanda: { score: 86, label: 'Alta demanda en PyMEs en proceso de digitalización' },
    competencia: { score: 68, label: 'Competencia activa pero dispersa' },
    tendencia: { score: 90, label: 'Tendencia al alza sostenida (+24% YoY)' },
    barreras: { score: 75, label: 'Barreras de entrada medias por especialización y portfolio' },
  },
  tendencias_data: {
    keyword: 'branding para pymes mexico',
    volumen_mensual: 18500,
    tendencia_12m: 24.2,
    estacionalidad: [
      { mes: 'Ene', volumen: 15400 }, { mes: 'Feb', volumen: 16800 },
      { mes: 'Mar', volumen: 17900 }, { mes: 'Abr', volumen: 19200 },
      { mes: 'May', volumen: 20100 }, { mes: 'Jun', volumen: 18400 },
      { mes: 'Jul', volumen: 17200 }, { mes: 'Ago', volumen: 18600 },
      { mes: 'Sep', volumen: 19800 }, { mes: 'Oct', volumen: 21500 },
      { mes: 'Nov', volumen: 22400 }, { mes: 'Dic', volumen: 16500 },
    ],
    keywords_relacionadas: [
      { keyword: 'diseño de identidad corporativa', volumen: 28000 },
      { keyword: 'manual de identidad visual precio', volumen: 11200 },
      { keyword: 'rediseño de logotipo empresa', volumen: 14600 },
      { keyword: 'agencia de branding cdmx', volumen: 9800 },
    ],
  },
  competencia_data: {
    total_competidores: 42,
    competidores_principales: [
      {
        nombre: 'BrandFactory MX',
        url: 'https://brandfactory.mx',
        precio_rango: '$20,000 - $55,000',
        fortalezas: ['Gran cartera corporativa', 'Presencia internacional'],
        debilidades: ['Atención burocrática', 'Tiempos de entrega mayores a 8 semanas'],
      },
      {
        nombre: 'Creativa Studio',
        url: 'https://creativastudio.com',
        precio_rango: '$10,000 - $28,000',
        fortalezas: ['Diseño estético actual', 'Buena presencia en Instagram'],
        debilidades: ['Sin estrategia de negocio ni manual de voz de marca', 'Falta de soporte post-entrega'],
      },
      {
        nombre: 'Imagina Branding Lab',
        url: 'https://imaginabranding.mx',
        precio_rango: '$25,000 - $70,000',
        fortalezas: ['Consultoría estratégica profunda', 'Equipo senior'],
        debilidades: ['Precios prohibitivos para micro y pequeñas empresas'],
      },
    ],
    densidad: {
      competidores_km2: 2.8,
      zona: 'CDMX - Corredor Roma / Condesa / Juárez',
      es_evaluable: true,
    },
  },
  tam_data: {
    tam: 5200000000,
    sam: 780000000,
    som: 42000000,
    moneda: 'MXN',
    fuentes: ['Directorio Estadístico Nacional de Unidades Económicas (DENUE - INEGI 2025)', 'AMAPRO', 'Statista'],
    metodologia: 'Bottom-up: PyMEs formales registradas en zonas metropolitanas × presupuesto anual en comunicación × penetración de diseño profesional',
  },
  dafo_data: {
    fortalezas: [
      'Atención directiva personalizada con trato de socio estratégico',
      'Entregables completos en 3 semanas con metodología ágil probada',
      'Ecuación costo-beneficio óptima para empresas que facturan entre $500k y $5M MXN anuales',
      'Integración nativa con activos digitales listos para web y redes sociales',
    ],
    oportunidades: [
      'Migración de más de 45,000 negocios tradicionales a canales omnicanal',
      'Creciente necesidad de profesionalización visual para levantar capital o créditos bancarios',
      'Venta cruzada con desarrollo de landing pages y gestión de campañas digitales',
    ],
    debilidades: [
      'Capacidad operativa limitada a 5 proyectos simultáneos por el tamaño del equipo',
      'Concentración geográfica inicial en zona centro del país',
    ],
    amenazas: [
      'Proliferación de servicios ultra-low-cost en plataformas freelance sin rigor estratégico',
      'Adopción no guiada de herramientas de IA generativa por dueños de negocio',
    ],
  },
  alertas: [
    {
      tipo: 'oportunidad',
      titulo: 'Servicio recurrente de acompañamiento',
      mensaje: 'El 68% de los clientes de branding buscan soporte mensual posterior para diseño de nuevos empaques y campañas.',
    },
    {
      tipo: 'estrategia',
      titulo: 'Especialización en sectores FMCG y gastronomía',
      mensaje: 'Las marcas de alimentos y productos gourmet presentan un retorno de inversión 40% más rápido en proyectos de branding.',
    },
  ],
};

const MARKETING_COMPLETO = {
  estrategias_data: {
    estrategia_principal: 'Inbound B2B de Alta Confianza + Social Proof en LinkedIn e Instagram',
    buyer_personas: [
      {
        nombre: 'Rodrigo Mendoza — Fundador de Startup / PyME',
        edad: '32-46',
        cargo: 'Director General / Co-Founder',
        dolor_principal: 'Su identidad actual parece amateur y siente que le hace perder clientes de mayor presupuesto frente a competidores más grandes.',
        motivacion: 'Proyectar solidez corporativa, subir precios y cerrar contratos B2B con confianza.',
      },
      {
        nombre: 'Valeria Guzmán — Dueña de Marca Gourmet / Retail',
        edad: '28-40',
        cargo: 'Fundadora',
        dolor_principal: 'Tiene un producto de calidad superior pero su empaque y comunicación no reflejan el valor real en el punto de venta.',
        motivacion: 'Estar en anaqueles de tiendas premium y vender directamente al consumidor final con margen alto.',
      },
    ],
    canales_recomendados: [
      { canal: 'LinkedIn', inversion_pct: 40, rol: 'Captación B2B directa y liderazgo de opinión' },
      { canal: 'Instagram & Portfolio Behance', inversion_pct: 35, rol: 'Social proof, vitrina visual y testimoniales' },
      { canal: 'Google Search Ads', inversion_pct: 25, rol: 'Captación con alta intención de compra ("agencia de branding cdmx")' },
    ],
    propuesta_valor_marketing: 'Diseño que no solo se ve bien: identidades visuales estratégicas diseñadas para vender más y cobrar mejor.',
  },
  copies_data: {
    taglines: [
      'Tu marca merece verse como se siente.',
      'El diseño profesional que tu empresa necesita para dar el siguiente salto.',
      'Construimos marcas memorables que convierten miradas en clientes.',
    ],
    copy_linkedin: '¿Sabías que el 75% de los clientes juzga la credibilidad de tu negocio únicamente por su identidad visual? En Studio V transformamos negocios sobresalientes en marcas imposibles de ignorar. Agenda tu diagnóstico inicial gratuito de 30 minutos.',
    copy_instagram: 'Un buen logotipo no es solo un dibujo bonito; es la firma que respalda cada uno de tus productos. Descubre cómo rediseñamos la identidad de @caféorigin y aumentamos su ticket promedio en un 35%. Desliza para ver el caso completo 👉',
  },
  calendario_data: {
    frecuencia_semanal: '4 posts por semana',
    semanas: [
      {
        semana: 1,
        tema: 'Autoridad & Diagnóstico',
        posts: [
          { dia: 'Lunes', formato: 'Carrusel LinkedIn', titulo: 'Los 5 errores que hacen que tu marca parezca novata' },
          { dia: 'Miércoles', formato: 'Reel Instagram', titulo: 'De boceto en papel a marca registrada: proceso creativo' },
          { dia: 'Viernes', formato: 'Caso de Estudio', titulo: 'Cómo rediseñamos la marca de un restaurante gourmet' },
        ],
      },
      {
        semana: 2,
        tema: 'Diferenciación & Valor',
        posts: [
          { dia: 'Martes', formato: 'Infografía', titulo: 'Psicología del color: por qué el morado transmite exclusividad y confianza' },
          { dia: 'Jueves', formato: 'Video corto', titulo: '¿Por qué un logo de $500 pesos te termina saliendo carísimo?' },
          { dia: 'Sábado', formato: 'Story interactiva', titulo: 'Q&A: Respondemos dudas sobre manuales de marca y registro de propiedad' },
        ],
      },
    ],
  },
};

const FINANZAS_COMPLETO = {
  inputs_data: {
    precio_venta: 18500,
    costo_variable_unitario: 3200,
    costos_fijos_mensuales: 38000,
    volumen_mensual_estimado: 5,
    moneda: 'MXN',
  },
  proyeccion_data: {
    meses: [
      { mes: 1, ingresos: 74000, costos_variables: 12800, costos_fijos: 38000, margen_neto: 23200 },
      { mes: 2, ingresos: 92500, costos_variables: 16000, costos_fijos: 38000, margen_neto: 38500 },
      { mes: 3, ingresos: 92500, costos_variables: 16000, costos_fijos: 38000, margen_neto: 38500 },
      { mes: 4, ingresos: 111000, costos_variables: 19200, costos_fijos: 39500, margen_neto: 52300 },
      { mes: 5, ingresos: 111000, costos_variables: 19200, costos_fijos: 39500, margen_neto: 52300 },
      { mes: 6, ingresos: 129500, costos_variables: 22400, costos_fijos: 40000, margen_neto: 67100 },
      { mes: 7, ingresos: 129500, costos_variables: 22400, costos_fijos: 40000, margen_neto: 67100 },
      { mes: 8, ingresos: 148000, costos_variables: 25600, costos_fijos: 41000, margen_neto: 81400 },
      { mes: 9, ingresos: 148000, costos_variables: 25600, costos_fijos: 41000, margen_neto: 81400 },
      { mes: 10, ingresos: 166500, costos_variables: 28800, costos_fijos: 42000, margen_neto: 95700 },
      { mes: 11, ingresos: 166500, costos_variables: 28800, costos_fijos: 42000, margen_neto: 95700 },
      { mes: 12, ingresos: 185000, costos_variables: 32000, costos_fijos: 43000, margen_neto: 110000 },
    ],
    ingresos_anuales_estimados: 1554000,
    utilidad_neta_anual_estimada: 790700,
  },
  breakeven_data: {
    unidades_equilibrio: 2.48,
    monto_equilibrio_mxn: 45947.71,
    margen_contribucion_unitario: 15300,
    margen_contribucion_pct: 82.7,
  },
  resumen_data: {
    margen_bruto_pct: 82.7,
    margen_neto_promedio_pct: 50.8,
    retorno_inversion_meses: 2.1,
    nivel_salud_financiera: 'Excelente',
  },
};

const VENTAS_COMPLETO = {
  tips_data: [
    {
      titulo: 'No vendas logotipos, vende el resultado comercial',
      descripcion: 'En la llamada inicial no discutas colores; pregunta cuánto vale para el cliente cerrar una cuenta grande y cómo su imagen actual le está costando oportunidades.',
    },
    {
      titulo: 'Presentación en vivo con Mockups reales',
      descripcion: 'Nunca envíes un archivo PDF suelto por correo. Presenta en llamada mostrando cómo luce la marca en empaques, pantallas, fachadas y tarjetas.',
    },
    {
      titulo: 'Estructura de cobro 50% anticipo y 50% contra entrega',
      descripcion: 'Garantiza el flujo de caja operativo cobrando el 50% antes de iniciar la etapa de descubrimiento creativo.',
    },
  ],
  historia_data: {
    gancho: 'Un negocio con producto premium no puede comunicarse con diseño genérico.',
    conflicto: 'Muchos dueños intentan crear su identidad ellos mismos en Canva o contratan servicios rápidos de $30 USD, terminando frustrados porque sus clientes desconfían de sus precios.',
    resolucion: 'Studio V creó un método de diseño estratégico en 3 semanas que traduce la propuesta de valor del cliente en activos visuales de impacto inmediato.',
  },
  perfil_cliente_data: {
    icp: 'PyMEs consolidadas de servicios, alimentos gourmet, retail o consultoría que facturan más de $600,000 MXN al año y buscan posicionarse en el segmento medio-alto.',
    criterios_calificacion: [
      'Tiene al menos 1 año operando o capital de lanzamiento asegurado',
      'Valora el diseño como un activo comercial y no como un gasto estético',
      'Presupuesto validado mayor a $15,000 MXN',
    ],
  },
  rebatidas_objeciones_data: [
    {
      objecion: 'Se sale de mi presupuesto, en internet vi opciones de $2,000 pesos.',
      respuesta: 'Completamente comprensible. La diferencia es que esas opciones son plantillas prediseñadas que usan cientos de negocios. Nuestro proceso crea activos propietarios, listos para registro legal en el IMPI y orientados a justificar que cobres más por lo que haces.',
    },
    {
      objecion: '¿Por qué tarda 3 semanas? Me urge tenerlo esta semana.',
      respuesta: 'Podríamos entregarte un dibujo mañana, pero no resolvería tu negocio. Las 3 semanas incluyen diagnóstico de competencia, pruebas cromáticas, manual de uso y entrega de archivos finales vectoriales en todos los formatos.',
    },
  ],
};

const LEGAL_COMPLETO = {
  giro_detectado: 'Servicios de Diseño Gráfico, Branding y Comunicación Digital',
  cumplimiento_global: 'óptimo',
  puntaje_cumplimiento: 92,
  resultado_data: {
    regimen_sugerido: 'Persona Física con Actividad Empresarial (PFAE) / RESICO si califica por ingresos',
    obligaciones_principales: [
      {
        nombre: 'Contrato de Prestación de Servicios y Cesión de Derechos Patrimoniales',
        estado: 'cumplido',
        nota: 'Protege a Studio V estableciendo número máximo de rondas de revisión (2) y formaliza la cesión de derechos al cliente únicamente tras liquidar el 100% del pago.',
      },
      {
        nombre: 'Registro de Marca ante el IMPI (Clase 35 y 42)',
        estado: 'en_tramite',
        nota: 'Solicitud de registro de la marca y logotipo de Studio V ante el Instituto Mexicano de la Propiedad Industrial.',
      },
      {
        nombre: 'Aviso de Privacidad Integral (LFPDPPP)',
        estado: 'cumplido',
        nota: 'Publicado en sitio web para tratamiento de datos personales de clientes y prospectos comerciales.',
      },
      {
        nombre: 'Facturación Electrónica SAT (CFDI 4.0)',
        estado: 'cumplido',
        nota: 'Emisión de facturas con clave de producto/servicio SAT 82101504 (Servicios de diseño de publicidad).',
      },
    ],
  },
};

const BRIEF_COMPLETO = {
  percepcion: ['Profesionalismo', 'Innovación', 'Exclusividad', 'Accesibilidad'],
  emocion: 'Confianza, dinamismo y empoderamiento emprendedor',
  anti_valores: ['Amateurismo', 'Banalidad', 'Improvisación', 'Burocracia'],
  estilo_visual: 'Minimalista Contemporáneo con Toques Bold',
  paleta_elegida: 'Acento Violeta (#6C2BD9) con Contrastes Energéticos',
  tipo_logo: 'Isologo (Símbolo abstracto de vector + tipografía legible)',
  simbolo_representativo: 'Monograma V estilizado con ángulo ascendente que proyecta crecimiento comercial',
  resultado_cliente: 'Una identidad visual reconocible que permite aumentar precios y captar clientes corporativos.',
  tono_comunicacion: 'Experto, inspirador, directo y profesional',
  posicionamiento: 'El estudio boutique de diseño estratégico preferido por las PyMEs mexicanas de alto crecimiento.',
  nivel_diferenciacion: 'Muy Alto',
  resultado_data: {
    score_coherencia: 94,
    resumen_ejecutivo: 'La marca Studio V sintetiza visión de negocio con estética de clase mundial, posicionándose en el cuadrante de alta diferenciación y accesibilidad estratégica.',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// DATOS DE ANÁLISIS: PRODUCTO SEMI-COMPLETO (Caja Degustación Chocolates 12pz)
// ═══════════════════════════════════════════════════════════════════════════════

const MERCADO_SEMI = {
  viabilidad_score: 76,
  viabilidad_estado: 'viable',
  viabilidad_factores: {
    demanda: { score: 79, label: 'Demanda creciente en segmento de repostería fina y regalos premium' },
    competencia: { score: 62, label: 'Competencia local artesanal y chocolaterías boutique' },
    tendencia: { score: 85, label: 'Tendencia al alza en consumo de cacao bean-to-bar de origen único' },
    barreras: { score: 70, label: 'Barreras por cadena de frío y empaque de alta gama' },
  },
  tendencias_data: {
    keyword: 'chocolates artesanales de regalo cdmx',
    volumen_mensual: 12400,
    tendencia_12m: 19.8,
  },
  competencia_data: {
    total_competidores: 28,
    competidores_principales: [
      { nombre: 'Cacao Magno', url: 'https://cacaomagno.com', precio_rango: '$650 - $1,200' },
      { nombre: 'Chocolatería Qué Bo!', url: 'https://quebo.com.mx', precio_rango: '$750 - $1,500' },
    ],
  },
  tam_data: {
    tam: 3400000000,
    sam: 410000000,
    som: 22000000,
    moneda: 'MXN',
  },
  dafo_data: {
    fortalezas: ['Cacao criollo 100% de origen oaxaqueño', 'Caja de madera grabada de impacto visual inmediato'],
    oportunidades: ['Regalos corporativos de fin de año', 'Venta en hoteles boutique'],
    debilidades: ['Vida de anaquel de 45 días por frescura sin conservadores'],
    amenazas: ['Variación en el precio internacional del grano de cacao'],
  },
  alertas: [
    {
      tipo: 'oportunidad',
      titulo: 'Temporada alta corporativa en Q4',
      mensaje: 'Las empresas reservan presupuestos para canastas y regalos corporativos desde septiembre.',
    },
  ],
};

const MARKETING_SEMI = {
  estrategias_data: {
    estrategia_principal: 'Marketing Sensorial + Alianzas Corporativas B2B',
    buyer_personas: [
      {
        nombre: 'Sofía Carvajal — Compradora de Regalos Corporativos',
        edad: '30-50',
        dolor_principal: 'Cansada de regalar las típicas botellas de vino genéricas a clientes importantes.',
        motivacion: 'Entregar un detalle artesanal mexicano que genere recordación y admiración.',
      },
    ],
    canales_recomendados: [
      { canal: 'Instagram', inversion_pct: 50, rol: 'Fotografía gastronómica y videos de elaboración' },
      { canal: 'LinkedIn & Venta Directa', inversion_pct: 35, rol: 'Catálogo a directores de RRHH y Marketing' },
      { canal: 'Mercados Gourmet & Pop-ups', inversion_pct: 15, rol: 'Degustaciones presenciales' },
    ],
  },
  copies_data: {
    tagline_principal: 'El auténtico sabor del cacao de origen en cada bocado.',
    copy_redes: 'No es solo chocolate; es una experiencia sensorial de 12 trufas hechas a mano con cacao oaxaqueño. El regalo perfecto para quien sabe apreciar lo extraordinario.',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// KIT DE MARCA COMPLETO
// ═══════════════════════════════════════════════════════════════════════════════

const MARCA_VALERIA = {
  nombre: 'Studio V',
  slogan: 'Tu marca merece verse como se siente.',
  descripcion: 'Studio de diseño y branding estratégico enfocado en transformar negocios mexicanos en marcas memorables y altamente rentables.',
  paleta_colores: {
    primario: '#6C2BD9',
    secundario: '#F97316',
    acento: '#10B981',
    neutro_oscuro: '#0F172A',
    neutro_claro: '#F8FAFC',
  },
  tipografia: 'Plus Jakarta Sans / Inter',
  brief_data: BRIEF_COMPLETO,
  logo_analysis: {
    score: 88,
    tipo_detectado: 'Logotipo + Símbolo Monograma',
    colores_detectados: ['#6C2BD9', '#F97316', '#FFFFFF'],
    legibilidad: 'óptima',
    escalabilidad: 'excelente',
    coherencia_con_sector: 'muy alta',
    sugerencias: [
      'Excelente contraste visual para aplicaciones digitales y fondos oscuros',
      'La estructura vectorial permite reproducción nítida desde 16px hasta gran formato',
      'La paleta violeta y naranja crea balance entre elegancia y vitalidad',
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL DE SEED
// ═══════════════════════════════════════════════════════════════════════════════

async function runSeed() {
  console.log('🚀 Iniciando conexión a la base de datos...');
  await AppDataSource.initialize();
  console.log('✅ Conexión establecida con éxito');

  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    const ownerEmail = 'valeria.torres@studiov.mx';

    // ─── 1. BUSCAR USUARIO EXISTENTE O GENERAR NUEVO ID ───────────────────────
    const existingUser = await qr.query(
      `SELECT id FROM usuarios WHERE email = $1`,
      [ownerEmail]
    );

    let ownerId: string;
    if (existingUser.length > 0) {
      ownerId = existingUser[0].id;
      console.log(`\n🔍 Usuario encontrado: Valeria Torres (${ownerId})`);
    } else {
      ownerId = uuidv4();
      console.log(`\n✨ Generando nuevo ID para Valeria Torres: ${ownerId}`);
    }

    // ─── 2. ELIMINAR TODOS LOS OBJETOS ANTERIORES DE VALERIA ─────────────────
    console.log('\n🧹 Limpiando todos los datos previos asociados a Valeria...');

    // Detalle de ventas
    await qr.query(
      `DELETE FROM venta_items WHERE venta_id IN (SELECT id FROM ventas WHERE usuario_id = $1)`,
      [ownerId]
    );
    // Relaciones POS-Insumos
    await qr.query(`DELETE FROM item_pos_insumos WHERE usuario_id = $1`, [ownerId]);
    // Ventas
    await qr.query(`DELETE FROM ventas WHERE usuario_id = $1`, [ownerId]);
    // Catálogo POS
    await qr.query(`DELETE FROM items_pos WHERE usuario_id = $1`, [ownerId]);
    // Movimientos de inventario
    await qr.query(`DELETE FROM movimientos_inventario WHERE usuario_id = $1`, [ownerId]);
    // Insumos
    await qr.query(`DELETE FROM insumos_inventario WHERE usuario_id = $1`, [ownerId]);
    // Cotizaciones
    await qr.query(`DELETE FROM cotizaciones WHERE usuario_id = $1`, [ownerId]);
    // Calendario / Citas
    await qr.query(`DELETE FROM citas WHERE usuario_id = $1`, [ownerId]);
    // Nómina
    await qr.query(`DELETE FROM pagos_nomina WHERE usuario_id = $1`, [ownerId]);
    await qr.query(`DELETE FROM empleados WHERE usuario_id = $1`, [ownerId]);
    // Contabilidad
    await qr.query(`DELETE FROM movimientos_contables WHERE usuario_id = $1`, [ownerId]);
    // Metas de negocio
    await qr.query(`DELETE FROM metas_negocio WHERE usuario_id = $1`, [ownerId]);
    // Clientes CRM
    await qr.query(`DELETE FROM clientes WHERE usuario_id = $1`, [ownerId]);
    // Kit de marca
    await qr.query(`DELETE FROM marcas WHERE usuario_id = $1`, [ownerId]);
    // Herramientas seleccionadas
    await qr.query(`DELETE FROM herramientas_seleccionadas WHERE usuario_id = $1`, [ownerId]);
    // Auditoría y perfiles
    await qr.query(`DELETE FROM auditoria_herramientas WHERE usuario_id = $1`, [ownerId]);
    await qr.query(`DELETE FROM perfiles_analiticos WHERE usuario_id = $1`, [ownerId]);
    await qr.query(`DELETE FROM perfil_videos WHERE usuario_id = $1`, [ownerId]);
    await qr.query(`DELETE FROM temas_usuario WHERE usuario_id = $1`, [ownerId]);

    // Módulos de Análisis
    await qr.query(`DELETE FROM analisis_mercado WHERE usuario_id = $1`, [ownerId]);
    await qr.query(`DELETE FROM analisis_marketing WHERE usuario_id = $1`, [ownerId]);
    await qr.query(`DELETE FROM analisis_finanzas WHERE usuario_id = $1`, [ownerId]);
    await qr.query(`DELETE FROM analisis_ventas WHERE usuario_id = $1`, [ownerId]);
    await qr.query(`DELETE FROM analisis_legal WHERE usuario_id = $1`, [ownerId]);
    await qr.query(`DELETE FROM analisis_brief WHERE usuario_id = $1`, [ownerId]);

    // Trabajadores asignados al owner
    await qr.query(
      `DELETE FROM asignaciones_trabajador WHERE cuenta_id = $1 OR trabajador_id IN (SELECT id FROM usuarios WHERE owner_id = $1)`,
      [ownerId]
    );
    await qr.query(`DELETE FROM invitaciones_trabajador WHERE cuenta_id = $1`, [ownerId]);
    await qr.query(`DELETE FROM usuarios WHERE owner_id = $1`, [ownerId]);

    // Productos y Negocios
    await qr.query(`DELETE FROM productos WHERE usuario_id = $1`, [ownerId]);
    await qr.query(`DELETE FROM negocios WHERE usuario_id = $1`, [ownerId]);

    console.log('✅ Limpieza de datos antiguos completada al 100%');

    // ─── 3. CREAR / ACTUALIZAR USUARIO OWNER (VALERIA TORRES) ────────────────
    const passwordHash = await bcrypt.hash('StudioV2024!', 12);
    const datosNegocio = JSON.stringify({
      nombre_negocio: 'Studio V Creativo & Aura Cacao',
      giro: 'Servicios Profesionales de Diseño, Branding y Chocolatería Fina Artesanal',
      sitio_web: 'https://studiov.mx',
      telefono: '+52 55 4321 8765',
      direccion: 'Col. Roma Norte, Cuauhtémoc, CDMX, México',
      redes: {
        instagram: '@studiov.mx',
        linkedin: 'studio-v-branding',
        tiktok: '@studiov',
      },
    });

    if (existingUser.length > 0) {
      await qr.query(
        `UPDATE usuarios
         SET password_hash = $1, nombre = $2, plan = $3, account_role = $4,
             owner_id = NULL, analisis_disponibles = $5, creditos_marketing = $6,
             activo = true, datos_negocio = $7::jsonb
         WHERE id = $8`,
        [
          passwordHash,
          'Valeria Torres',
          'business',
          'owner',
          100,
          500,
          datosNegocio,
          ownerId,
        ]
      );
    } else {
      await qr.query(
        `INSERT INTO usuarios
           (id, email, password_hash, nombre, plan, account_role,
            owner_id, analisis_disponibles, creditos_marketing, activo, datos_negocio)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, true, $9::jsonb)`,
        [
          ownerId,
          ownerEmail,
          passwordHash,
          'Valeria Torres',
          'business',
          'owner',
          100,
          500,
          datosNegocio,
        ]
      );
    }
    console.log(`👤 Usuario Owner configurado: Valeria Torres (${ownerEmail}) con Plan Business.`);

    // ─── 4. CREAR NEGOCIOS (SERVICIOS + PRODUCTOS) ───────────────────────────
    const negocioStudioId = uuidv4();
    const negocioChocoId = uuidv4();

    await qr.query(
      `INSERT INTO negocios (id, usuario_id, nombre, emoji, descripcion) VALUES
         ($1, $2, 'Studio V Creativo', '🎨', 'Estudio boutique de diseño estratégico, branding 360°, desarrollo web y posicionamiento de marca para PyMEs.'),
         ($3, $2, 'Aura & Cacao Chocolatería', '🍫', 'Chocolatería fina artesanal mexicana. Tabletas de cacao criollo 72% de origen único oaxaqueño y trufas gourmet.')`,
      [negocioStudioId, ownerId, negocioChocoId]
    );
    console.log(`📁 2 Negocios creados: Studio V Creativo (Servicios) y Aura & Cacao (Productos Físicos).`);

    // ─── 5. CREAR PRODUCTOS Y SERVICIOS ───────────────────────────────────────
    // 1 Servicio Completo
    const serv1Id = uuidv4();
    // 1 Producto Físico Semi-Completo
    const prod2Id = uuidv4();
    // 4 Vacíos (2 Servicios y 2 Productos Físicos)
    const serv3Id = uuidv4();
    const serv4Id = uuidv4();
    const prod5Id = uuidv4();
    const prod6Id = uuidv4();

    const itemsCatalogo = [
      {
        id: serv1Id,
        negocio_id: negocioStudioId,
        nombre: 'Paquete Identidad Visual & Branding 360°',
        descripcion: 'Servicio integral de branding que incluye diagnóstico de mercado, naming, logotipo principal y secundario, paleta cromática, tipografías corporativas, manual de identidad de 25 páginas, plantillas editables para redes sociales y papelería institucional.',
        categoria: 'Branding & Diseño',
        precio: 18500,
        pais: 'MX',
        nse: 'B/C+',
        status: 'activo',
      },
      {
        id: prod2Id,
        negocio_id: negocioChocoId,
        nombre: 'Caja Degustación Chocolates de Origen 12pz',
        descripcion: 'Caja artesanal de madera grabada con 12 trufas y bombones rellenos de mezcal espadín, flor de sal, maracuyá y café de especialidad de Chiapas, elaboradas con 72% cacao oaxaqueño de origen único.',
        categoria: 'Alimentos Gourmet',
        precio: 890,
        pais: 'MX',
        nse: 'A/B',
        status: 'activo',
      },
      {
        id: serv3Id,
        negocio_id: negocioStudioId,
        nombre: 'Diseño & Desarrollo de Landing Page Web',
        descripcion: 'Página de aterrizaje responsiva de alta conversión construida en Next.js y Tailwind CSS, integrada con formulario hacia WhatsApp y CRM, con SEO técnico on-page configurado.',
        categoria: 'Desarrollo Web',
        precio: 9200,
        pais: 'MX',
        nse: 'B/C+',
        status: 'activo',
      },
      {
        id: serv4Id,
        negocio_id: negocioStudioId,
        nombre: 'Consultoría Estratégica & Auditoría de Marca',
        descripcion: 'Sesión directiva de 3 horas para analizar posicionamiento, propuesta de valor y funnel de captación. Incluye entrega de diagnóstico por escrito y plan táctico de 90 días.',
        categoria: 'Consultoría',
        precio: 4500,
        pais: 'MX',
        nse: 'B/C+',
        status: 'activo',
      },
      {
        id: prod5Id,
        negocio_id: negocioChocoId,
        nombre: 'Tableta Cacao Ceremonial 72% Orgánica',
        descripcion: 'Tableta de 80g de chocolate oscuro elaborada con cacao fino de aroma de Finca La Candelaria, Oaxaca. Proceso bean-to-bar artesanal con azúcar mascabado orgánico.',
        categoria: 'Chocolates & Cacao',
        precio: 175,
        pais: 'MX',
        nse: 'B/C+',
        status: 'activo',
      },
      {
        id: prod6Id,
        negocio_id: negocioChocoId,
        nombre: 'Set de Regalo Corporativo Artesanal',
        descripcion: 'Set de regalo premium personalizable con el logotipo del cliente corporativo: incluye 2 tabletas 72%, caja de 6 trufas surtidas, libreta de corcho ecológico y tarjeta institucional.',
        categoria: 'Regalos & Canastas',
        precio: 1450,
        pais: 'MX',
        nse: 'A/B',
        status: 'activo',
      },
    ];

    for (const item of itemsCatalogo) {
      await qr.query(
        `INSERT INTO productos
           (id, usuario_id, negocio_id, nombre, descripcion, categoria, precio, pais, nse, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          item.id, ownerId, item.negocio_id, item.nombre, item.descripcion,
          item.categoria, item.precio, item.pais, item.nse, item.status,
        ]
      );
      console.log(`  📦 Registrado: [${item.categoria}] ${item.nombre} ($${item.precio} MXN)`);
    }

    // ─── 6. INSERTAR ANÁLISIS: SERVICIO 1 (COMPLETO - 6 MÓDULOS) ─────────────
    const ahora = new Date();

    // 6a. Mercado
    await qr.query(
      `INSERT INTO analisis_mercado
         (id, producto_id, usuario_id, pais, estado_analisis,
          viabilidad_score, viabilidad_estado, viabilidad_factores,
          tendencias_data, competencia_data, tam_data, dafo_data, alertas,
          volumen_busquedas_mensual, tendencia_porcentaje, total_competidores,
          fecha_completado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,$17)`,
      [
        uuidv4(), serv1Id, ownerId, 'MX', 'completado',
        MERCADO_COMPLETO.viabilidad_score,
        MERCADO_COMPLETO.viabilidad_estado,
        JSON.stringify(MERCADO_COMPLETO.viabilidad_factores),
        JSON.stringify(MERCADO_COMPLETO.tendencias_data),
        JSON.stringify(MERCADO_COMPLETO.competencia_data),
        JSON.stringify(MERCADO_COMPLETO.tam_data),
        JSON.stringify(MERCADO_COMPLETO.dafo_data),
        JSON.stringify(MERCADO_COMPLETO.alertas),
        18500, 24.2, 42, ahora,
      ]
    );

    // 6b. Marketing
    await qr.query(
      `INSERT INTO analisis_marketing
         (id, producto_id, usuario_id, estado_analisis,
          estrategias_data, copies_data, calendario_data, fecha_completado)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8)`,
      [
        uuidv4(), serv1Id, ownerId, 'completado',
        JSON.stringify(MARKETING_COMPLETO.estrategias_data),
        JSON.stringify(MARKETING_COMPLETO.copies_data),
        JSON.stringify(MARKETING_COMPLETO.calendario_data),
        ahora,
      ]
    );

    // 6c. Finanzas
    await qr.query(
      `INSERT INTO analisis_finanzas
         (id, producto_id, usuario_id, pais, estado_analisis,
          inputs_data, proyeccion_data, breakeven_data, resumen_data, fecha_completado)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10)`,
      [
        uuidv4(), serv1Id, ownerId, 'MX', 'completado',
        JSON.stringify(FINANZAS_COMPLETO.inputs_data),
        JSON.stringify(FINANZAS_COMPLETO.proyeccion_data),
        JSON.stringify(FINANZAS_COMPLETO.breakeven_data),
        JSON.stringify(FINANZAS_COMPLETO.resumen_data),
        ahora,
      ]
    );

    // 6d. Ventas
    await qr.query(
      `INSERT INTO analisis_ventas
         (id, producto_id, usuario_id, pais, estado_analisis,
          tipo_venta, canal_principal, ticket_promedio, nombre_producto,
          categoria, precio, tips_data, historia_data, perfil_cliente_data,
          rebatidas_objeciones_data, fecha_completado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16)`,
      [
        uuidv4(), serv1Id, ownerId, 'MX', 'completado',
        'B2B_directo', 'directo', 18500,
        'Paquete Identidad Visual & Branding 360°', 'Branding & Diseño', 18500,
        JSON.stringify(VENTAS_COMPLETO.tips_data),
        JSON.stringify(VENTAS_COMPLETO.historia_data),
        JSON.stringify(VENTAS_COMPLETO.perfil_cliente_data),
        JSON.stringify(VENTAS_COMPLETO.rebatidas_objeciones_data),
        ahora,
      ]
    );

    // 6e. Legal
    await qr.query(
      `INSERT INTO analisis_legal
         (id, producto_id, usuario_id, pais, estado_analisis,
          forma_juridica, tiene_empleados, numero_empleados, vende_en_linea,
          giro_detectado, cumplimiento_global, puntaje_cumplimiento, resultado_data,
          fecha_completado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`,
      [
        uuidv4(), serv1Id, ownerId, 'MX', 'completado',
        'PFAE', true, 3, true,
        LEGAL_COMPLETO.giro_detectado,
        LEGAL_COMPLETO.cumplimiento_global,
        LEGAL_COMPLETO.puntaje_cumplimiento,
        JSON.stringify(LEGAL_COMPLETO.resultado_data),
        ahora,
      ]
    );

    // 6f. Brief
    await qr.query(
      `INSERT INTO analisis_brief
         (id, producto_id, usuario_id, percepcion, emocion, anti_valores,
          estilo_visual, paleta_elegida, tipo_logo, simbolo_representativo,
          resultado_cliente, tono_comunicacion, posicionamiento, nivel_diferenciacion,
          estado_analisis, resultado_data, fecha_completado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)`,
      [
        uuidv4(), serv1Id, ownerId,
        JSON.stringify(BRIEF_COMPLETO.percepcion),
        BRIEF_COMPLETO.emocion,
        JSON.stringify(BRIEF_COMPLETO.anti_valores),
        BRIEF_COMPLETO.estilo_visual,
        BRIEF_COMPLETO.paleta_elegida,
        BRIEF_COMPLETO.tipo_logo,
        BRIEF_COMPLETO.simbolo_representativo,
        BRIEF_COMPLETO.resultado_cliente,
        BRIEF_COMPLETO.tono_comunicacion,
        BRIEF_COMPLETO.posicionamiento,
        BRIEF_COMPLETO.nivel_diferenciacion,
        'completado',
        JSON.stringify(BRIEF_COMPLETO.resultado_data),
        ahora,
      ]
    );
    console.log(`  ✅ Servicio 1: Paquete Identidad Visual → 100% COMPLETO (6/6 módulos analizados).`);

    // ─── 7. INSERTAR ANÁLISIS: PRODUCTO 2 (SEMI-COMPLETO - 2 MÓDULOS) ─────────
    // 7a. Mercado
    await qr.query(
      `INSERT INTO analisis_mercado
         (id, producto_id, usuario_id, pais, estado_analisis,
          viabilidad_score, viabilidad_estado, viabilidad_factores,
          tendencias_data, competencia_data, tam_data, dafo_data, alertas,
          volumen_busquedas_mensual, tendencia_porcentaje, total_competidores,
          fecha_completado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,$17)`,
      [
        uuidv4(), prod2Id, ownerId, 'MX', 'completado',
        MERCADO_SEMI.viabilidad_score,
        MERCADO_SEMI.viabilidad_estado,
        JSON.stringify(MERCADO_SEMI.viabilidad_factores),
        JSON.stringify(MERCADO_SEMI.tendencias_data),
        JSON.stringify(MERCADO_SEMI.competencia_data),
        JSON.stringify(MERCADO_SEMI.tam_data),
        JSON.stringify(MERCADO_SEMI.dafo_data),
        JSON.stringify(MERCADO_SEMI.alertas),
        12400, 19.8, 28, ahora,
      ]
    );

    // 7b. Marketing
    await qr.query(
      `INSERT INTO analisis_marketing
         (id, producto_id, usuario_id, estado_analisis,
          estrategias_data, copies_data, fecha_completado)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
      [
        uuidv4(), prod2Id, ownerId, 'completado',
        JSON.stringify(MARKETING_SEMI.estrategias_data),
        JSON.stringify(MARKETING_SEMI.copies_data),
        ahora,
      ]
    );
    console.log(`  ⏳ Producto 2: Caja Degustación → SEMI-COMPLETO (Mercado + Marketing completados; Finanzas, Ventas y Legal vacíos).`);
    console.log(`  ⬜ Productos 3, 4, 5 y 6: VACÍOS (0 análisis realizados).`);

    // ─── 8. KIT DE MARCA ─────────────────────────────────────────────────────
    await qr.query(
      `INSERT INTO marcas
         (id, usuario_id, producto_id, nombre, slogan, descripcion,
          paleta_colores, tipografia, brief_data, logo_analysis, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::jsonb, true)`,
      [
        uuidv4(), ownerId, serv1Id,
        MARCA_VALERIA.nombre,
        MARCA_VALERIA.slogan,
        MARCA_VALERIA.descripcion,
        JSON.stringify(MARCA_VALERIA.paleta_colores),
        MARCA_VALERIA.tipografia,
        JSON.stringify(MARCA_VALERIA.brief_data),
        JSON.stringify(MARCA_VALERIA.logo_analysis),
      ]
    );
    console.log(`🎨 Kit de Marca Studio V creado exitosamente.`);

    // ─── 9. HERRAMIENTAS SELECCIONADAS (LAS 7 HABILITADAS) ────────────────────
    const todasHerramientas = ['pos', 'inventario', 'clientes', 'citas', 'cotizaciones', 'nomina', 'contabilidad'];
    for (const h of todasHerramientas) {
      await qr.query(
        `INSERT INTO herramientas_seleccionadas (id, usuario_id, herramienta_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (usuario_id, herramienta_key) DO NOTHING`,
        [uuidv4(), ownerId, h]
      );
    }
    console.log(`🔧 7 Herramientas activadas para la cuenta: POS, Inventario, Clientes, Citas, Cotizaciones, Nómina, Contabilidad.`);

    // ─── 10. CLIENTES CRM ────────────────────────────────────────────────────
    const clientesData = [
      {
        id: uuidv4(),
        nombre: 'María González Morales',
        empresa: 'Tortas Mexicanas & Antojos Gourmet SA',
        email: 'maria@tortasmex.com',
        telefono: '+52 55 1122 3344',
        categoria: 'VIP',
        estado: 'cliente',
        negocio_id: negocioStudioId,
        notas: 'Proyecto de identidad visual completado en febrero. Actualmente solicitó cotización para rediseño de empaques y menú digital.',
      },
      {
        id: uuidv4(),
        nombre: 'Carlos Herrera Rivas',
        empresa: 'TechStart Software MX',
        email: 'carlos@techstart.io',
        telefono: '+52 55 3344 5566',
        categoria: 'Lead Calificado',
        estado: 'lead',
        negocio_id: negocioStudioId,
        notas: 'Cotización COT-000001 aceptada. En espera de llamada de kickoff de branding e interfaz web.',
      },
      {
        id: uuidv4(),
        nombre: 'Lucía Fernández Serna',
        empresa: 'Café Origin MX',
        email: 'lucia@cafeoriginmx.com',
        telefono: '+52 33 5566 7788',
        categoria: 'Cliente Activo',
        estado: 'cliente',
        negocio_id: negocioStudioId,
        notas: 'Consultoría en curso. Programada sesión fotográfica y entrega de empaques para bolsas de café.',
      },
      {
        id: uuidv4(),
        nombre: 'Roberto Méndez Silva',
        empresa: 'Gimnasio Fuerza Total CDMX',
        email: 'roberto@fuerzatotal.mx',
        telefono: '+52 55 7788 9900',
        categoria: 'Lead Calificado',
        estado: 'lead',
        negocio_id: negocioStudioId,
        notas: 'Interesado en identidad y sitio web. Cita de asesoría programada para hoy.',
      },
      {
        id: uuidv4(),
        nombre: 'Ana Sofía Castillo',
        empresa: 'Soluciones Corporativas Nexo',
        email: 'ana.castillo@nexo.mx',
        telefono: '+52 55 8899 0011',
        categoria: 'VIP',
        estado: 'cliente',
        negocio_id: negocioChocoId,
        notas: 'Compradora habitual de cajas de regalo gourmet para eventos ejecutivos y directores.',
      },
    ];

    const cliMap: Record<string, string> = {};
    for (const c of clientesData) {
      await qr.query(
        `INSERT INTO clientes
           (id, usuario_id, negocio_id, producto_id, nombre, empresa, email,
            telefono, tipo_contacto, categoria, estado, notas, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'cliente', $9, $10, $11, true)`,
        [
          c.id, ownerId, c.negocio_id, serv1Id, c.nombre, c.empresa,
          c.email, c.telefono, c.categoria, c.estado, c.notas,
        ]
      );
      cliMap[c.nombre] = c.id;
      console.log(`  🤝 Cliente CRM: ${c.nombre} (${c.empresa}) — ${c.categoria}`);
    }

    // ─── 11. ITEMS POS (CATÁLOGO DE SERVICIOS Y PRODUCTOS) ───────────────────
    const itemsPosData = [
      // Servicios - Studio V
      { nombre: 'Diseño de Logotipo & Guía Rápida', descripcion: 'Logo profesional con 3 propuestas, ajustes y paleta de color', precio: 5500, categoria: 'Servicios', emoji: '🎨', negocio_id: negocioStudioId, orden: 1 },
      { nombre: 'Manual de Identidad de Marca', descripcion: 'Guía técnica de 25 páginas con tipografía, retícula y usos correctos', precio: 8000, categoria: 'Servicios', emoji: '📖', negocio_id: negocioStudioId, orden: 2 },
      { nombre: 'Pack Gráfico para Redes Sociales', descripcion: '12 plantillas editables en Figma/Canva para Instagram y LinkedIn', precio: 3500, categoria: 'Digital', emoji: '📱', negocio_id: negocioStudioId, orden: 3 },
      { nombre: 'Sesión de Consultoría Estratégica (2h)', descripcion: 'Asesoría ejecutiva personalizada sobre diferenciación y posicionamiento', precio: 2500, categoria: 'Consultoría', emoji: '💡', negocio_id: negocioStudioId, orden: 4 },
      { nombre: 'Diseño + Impresión Papelería Corporativa', descripcion: 'Tarjetas opalina 300g (500pz) + hojas membretadas digitales', precio: 1800, categoria: 'Impresión', emoji: '💳', negocio_id: negocioStudioId, orden: 5 },
      // Productos Físicos - Aura Cacao
      { nombre: 'Caja Degustación Trufas 12pz', descripcion: 'Caja de madera artesanal con 12 trufas de mezcal, café y maracuyá', precio: 890, categoria: 'Chocolates', emoji: '🍫', negocio_id: negocioChocoId, orden: 6 },
      { nombre: 'Tableta Cacao Ceremonial 72% (80g)', descripcion: 'Tableta artesanal bean-to-bar de cacao criollo oaxaqueño', precio: 175, categoria: 'Tabletas', emoji: '🍫', negocio_id: negocioChocoId, orden: 7 },
      { nombre: 'Kit Regalo Corporativo Premium', descripcion: '2 tabletas 72% + caja 6 trufas + libreta ecológica + tarjeta', precio: 1450, categoria: 'Regalos', emoji: '🎁', negocio_id: negocioChocoId, orden: 8 },
      { nombre: 'Bolsa Grano Cacao Garapiñado (150g)', descripcion: 'Granos de cacao caramelizados con canela y azúcar orgánica', precio: 140, categoria: 'Snacks', emoji: '🫘', negocio_id: negocioChocoId, orden: 9 },
      { nombre: 'Infusión Cáscara de Cacao Orgánica (100g)', descripcion: 'Té de cacao antioxidante con notas aromáticas a vainilla y frutos secos', precio: 120, categoria: 'Infusiones', emoji: '☕', negocio_id: negocioChocoId, orden: 10 },
    ];

    const itemPosMap: Record<string, string> = {};
    for (const item of itemsPosData) {
      const id = uuidv4();
      await qr.query(
        `INSERT INTO items_pos
           (id, usuario_id, negocio_id, nombre, descripcion, precio, categoria, emoji, activo, orden)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)`,
        [id, ownerId, item.negocio_id, item.nombre, item.descripcion, item.precio, item.categoria, item.emoji, item.orden]
      );
      itemPosMap[item.nombre] = id;
    }
    console.log(`🏪 10 Items POS registrados en el catálogo.`);

    // ─── 12. VENTAS POS (TICKETS Y LÍNEAS EN SEPTIEMBRE 2026) ────────────────
    const ventasData = [
      {
        numero_ticket: 'POS-000001',
        fecha: '2026-09-01',
        metodo_pago: 'transferencia',
        cliente_nombre: 'María González Morales',
        cliente_telefono: '+52 55 1122 3344',
        negocio_id: negocioStudioId,
        producto_id: serv1Id,
        items: [
          { nombre: 'Diseño de Logotipo & Guía Rápida', precio: 5500, cantidad: 1 },
          { nombre: 'Manual de Identidad de Marca', precio: 8000, cantidad: 1 },
          { nombre: 'Diseño + Impresión Papelería Corporativa', precio: 1800, cantidad: 1 },
        ],
        notas: 'Proyecto de branding formal para Tortas Mexicanas SA. Pagado por SPEI.',
      },
      {
        numero_ticket: 'POS-000002',
        fecha: '2026-09-02',
        metodo_pago: 'tarjeta',
        cliente_nombre: 'Carlos Herrera Rivas',
        cliente_telefono: '+52 55 3344 5566',
        negocio_id: negocioStudioId,
        producto_id: serv1Id,
        items: [
          { nombre: 'Sesión de Consultoría Estratégica (2h)', precio: 2500, cantidad: 2 },
          { nombre: 'Pack Gráfico para Redes Sociales', precio: 3500, cantidad: 1 },
        ],
        notas: 'Asesoría de lanzamiento y templates para TechStart.',
      },
      {
        numero_ticket: 'POS-000003',
        fecha: '2026-09-04',
        metodo_pago: 'transferencia',
        cliente_nombre: 'Ana Sofía Castillo',
        cliente_telefono: '+52 55 8899 0011',
        negocio_id: negocioChocoId,
        producto_id: prod2Id,
        items: [
          { nombre: 'Caja Degustación Trufas 12pz', precio: 890, cantidad: 5 },
          { nombre: 'Tableta Cacao Ceremonial 72% (80g)', precio: 175, cantidad: 10 },
        ],
        notas: 'Pedido de regalos gourmet para mesa directiva de Nexo.',
      },
      {
        numero_ticket: 'POS-000004',
        fecha: '2026-09-05',
        metodo_pago: 'efectivo',
        cliente_nombre: 'Mostrador Público',
        cliente_telefono: null,
        negocio_id: negocioChocoId,
        producto_id: prod5Id,
        items: [
          { nombre: 'Tableta Cacao Ceremonial 72% (80g)', precio: 175, cantidad: 3 },
          { nombre: 'Bolsa Grano Cacao Garapiñado (150g)', precio: 140, cantidad: 2 },
        ],
        notas: 'Venta de mostrador en tienda de fin de semana.',
      },
      {
        numero_ticket: 'POS-000005',
        fecha: '2026-09-07',
        metodo_pago: 'tarjeta',
        cliente_nombre: 'Lucía Fernández Serna',
        cliente_telefono: '+52 33 5566 7788',
        negocio_id: negocioStudioId,
        producto_id: serv1Id,
        items: [
          { nombre: 'Diseño de Logotipo & Guía Rápida', precio: 5500, cantidad: 1 },
          { nombre: 'Pack Gráfico para Redes Sociales', precio: 3500, cantidad: 1 },
        ],
        notas: 'Activos de marca digital para Café Origin.',
      },
      {
        numero_ticket: 'POS-000006',
        fecha: '2026-09-08',
        metodo_pago: 'tarjeta',
        cliente_nombre: 'Pedro Morales',
        cliente_telefono: '+52 55 4455 6677',
        negocio_id: negocioChocoId,
        producto_id: prod6Id,
        items: [
          { nombre: 'Kit Regalo Corporativo Premium', precio: 1450, cantidad: 3 },
          { nombre: 'Caja Degustación Trufas 12pz', precio: 890, cantidad: 2 },
        ],
        notas: 'Regalos corporativos para clientes de consultoría.',
      },
      {
        numero_ticket: 'POS-000007',
        fecha: '2026-09-09',
        metodo_pago: 'efectivo',
        cliente_nombre: 'Mostrador Público',
        cliente_telefono: null,
        negocio_id: negocioChocoId,
        producto_id: prod5Id,
        items: [
          { nombre: 'Infusión Cáscara de Cacao Orgánica (100g)', precio: 120, cantidad: 2 },
          { nombre: 'Tableta Cacao Ceremonial 72% (80g)', precio: 175, cantidad: 2 },
        ],
        notas: 'Compra en taller de degustación.',
      },
      {
        numero_ticket: 'POS-000008',
        fecha: '2026-09-10',
        metodo_pago: 'transferencia',
        cliente_nombre: 'Roberto Méndez Silva',
        cliente_telefono: '+52 55 7788 9900',
        negocio_id: negocioStudioId,
        producto_id: serv4Id,
        items: [
          { nombre: 'Sesión de Consultoría Estratégica (2h)', precio: 2500, cantidad: 1 },
        ],
        notas: 'Anticipo de sesión diagnóstica agendada para hoy.',
      },
    ];

    for (const v of ventasData) {
      const subtotal = v.items.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
      const impuestoTasa = 0.16;
      const impuestoMonto = Math.round(subtotal * impuestoTasa * 100) / 100;
      const total = Math.round((subtotal + impuestoMonto) * 100) / 100;

      const ventaId = uuidv4();
      await qr.query(
        `INSERT INTO ventas
           (id, usuario_id, producto_id, negocio_id, numero_ticket, fecha,
            subtotal, impuesto_monto, impuesto_tasa, impuesto_nombre, moneda,
            total, metodo_pago, cliente_nombre, cliente_telefono, notas, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'completada')`,
        [
          ventaId, ownerId, v.producto_id, v.negocio_id, v.numero_ticket, v.fecha,
          subtotal, impuestoMonto, impuestoTasa, 'IVA', 'MXN',
          total, v.metodo_pago, v.cliente_nombre, v.cliente_telefono, v.notas,
        ]
      );

      for (const item of v.items) {
        const subtotalLinea = item.precio * item.cantidad;
        await qr.query(
          `INSERT INTO venta_items
             (id, venta_id, item_pos_id, nombre_snapshot, precio_unitario, cantidad, subtotal_linea)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            uuidv4(), ventaId, itemPosMap[item.nombre] || null,
            item.nombre, item.precio, item.cantidad, subtotalLinea,
          ]
        );
      }
      console.log(`  🧾 Ticket ${v.numero_ticket}: $${total.toLocaleString('es-MX')} MXN — ${v.items.length} partidas (${v.metodo_pago})`);
    }

    // ─── 13. CALENDARIO / CITAS (SEPTIEMBRE 2026) ─────────────────────────────
    const citasData = [
      {
        titulo: 'Kickoff de Diagnóstico de Marca',
        fecha: '2026-09-02',
        hora_inicio: '10:00:00',
        hora_fin: '11:30:00',
        cliente_id: cliMap['Carlos Herrera Rivas'],
        cliente_nombre: 'Carlos Herrera Rivas',
        cliente_telefono: '+52 55 3344 5566',
        cliente_email: 'carlos@techstart.io',
        estado: 'completada',
        color: '#10B981',
        negocio_id: negocioStudioId,
        producto_id: serv1Id,
        notas: 'Sesión inicial completada con éxito. Se acordó la paleta cromática principal y objetivos de captación.',
      },
      {
        titulo: 'Entrega de Bocetos de Identidad Visual',
        fecha: '2026-09-07',
        hora_inicio: '16:00:00',
        hora_fin: '17:00:00',
        cliente_id: cliMap['Lucía Fernández Serna'],
        cliente_nombre: 'Lucía Fernández Serna',
        cliente_telefono: '+52 33 5566 7788',
        cliente_email: 'lucia@cafeoriginmx.com',
        estado: 'completada',
        color: '#6366F1',
        negocio_id: negocioStudioId,
        producto_id: serv1Id,
        notas: 'Se presentaron 3 rutas creativas. Lucía eligió la opción de empaques con tonos terracota y verde bosque.',
      },
      {
        titulo: 'Sesión Consultoría de Posicionamiento',
        fecha: '2026-09-10', // HOY
        hora_inicio: '11:00:00',
        hora_fin: '12:30:00',
        cliente_id: cliMap['Roberto Méndez Silva'],
        cliente_nombre: 'Roberto Méndez Silva',
        cliente_telefono: '+52 55 7788 9900',
        cliente_email: 'roberto@fuerzatotal.mx',
        estado: 'confirmada',
        color: '#3B82F6',
        negocio_id: negocioStudioId,
        producto_id: serv4Id,
        notas: 'Reunión en curso para revisar la estrategia de marca del gimnasio y definir lanzamiento de preventa.',
      },
      {
        titulo: 'Presentación de Muestras de Packaging de Cacao',
        fecha: '2026-09-12',
        hora_inicio: '15:00:00',
        hora_fin: '16:00:00',
        cliente_id: cliMap['Ana Sofía Castillo'],
        cliente_nombre: 'Ana Sofía Castillo',
        cliente_telefono: '+52 55 8899 0011',
        cliente_email: 'ana.castillo@nexo.mx',
        estado: 'confirmada',
        color: '#8B5CF6',
        negocio_id: negocioChocoId,
        producto_id: prod2Id,
        notas: 'Revisión física en estudio de las cajas de pino grabadas con láser para 50 regalos navideños.',
      },
      {
        titulo: 'Revisión de Avance Rediseño Web Landing',
        fecha: '2026-09-16',
        hora_inicio: '10:00:00',
        hora_fin: '11:00:00',
        cliente_id: cliMap['Carlos Herrera Rivas'],
        cliente_nombre: 'Carlos Herrera Rivas',
        cliente_telefono: '+52 55 3344 5566',
        cliente_email: 'carlos@techstart.io',
        estado: 'pendiente',
        color: '#EC4899',
        negocio_id: negocioStudioId,
        producto_id: serv3Id,
        notas: 'Presentación del prototipo interactivo en Figma de la landing page con formularios integrados.',
      },
      {
        titulo: 'Entrega Final de Manual de Marca & Archivos Maestros',
        fecha: '2026-09-22',
        hora_inicio: '12:00:00',
        hora_fin: '13:00:00',
        cliente_id: cliMap['Lucía Fernández Serna'],
        cliente_nombre: 'Lucía Fernández Serna',
        cliente_telefono: '+52 33 5566 7788',
        cliente_email: 'lucia@cafeoriginmx.com',
        estado: 'pendiente',
        color: '#F59E0B',
        negocio_id: negocioStudioId,
        producto_id: serv1Id,
        notas: 'Entrega de carpeta en la nube con vectores en .AI, .SVG, guías de estilo, fuentes y firma de cesión.',
      },
    ];

    for (const c of citasData) {
      await qr.query(
        `INSERT INTO citas
           (id, usuario_id, creado_por_id, negocio_id, producto_id, cliente_id,
            titulo, fecha, hora_inicio, hora_fin, cliente_nombre,
            cliente_telefono, cliente_email, estado, notas, color)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          uuidv4(), ownerId, c.negocio_id, c.producto_id, c.cliente_id,
          c.titulo, c.fecha, c.hora_inicio, c.hora_fin, c.cliente_nombre,
          c.cliente_telefono, c.cliente_email, c.estado, c.notas, c.color,
        ]
      );
      console.log(`  📅 Cita agendada: ${c.fecha} [${c.hora_inicio.slice(0,5)}] "${c.titulo}" — ${c.estado}`);
    }

    // ─── 14. INVENTARIO (INSUMOS Y MOVIMIENTOS) ──────────────────────────────
    const insumosData = [
      {
        nombre: 'Cacao Criollo en Grano Oaxaqueño',
        categoria: 'Materia Prima',
        unidad: 'kg',
        stock_actual: 42.5,
        stock_minimo: 10,
        costo_promedio: 290,
        proveedor: 'Cooperativa Unión de Cacaoteros de Oaxaca',
        emoji: '🫘',
        negocio_id: negocioChocoId,
      },
      {
        nombre: 'Manteca de Cacao Pura Prensada',
        categoria: 'Materia Prima',
        unidad: 'kg',
        stock_actual: 14.8,
        stock_minimo: 5,
        costo_promedio: 460,
        proveedor: 'Cooperativa Unión de Cacaoteros de Oaxaca',
        emoji: '🧈',
        negocio_id: negocioChocoId,
      },
      {
        nombre: 'Azúcar Mascabado Orgánico de Caña',
        categoria: 'Materia Prima',
        unidad: 'kg',
        stock_actual: 28.0,
        stock_minimo: 8,
        costo_promedio: 68,
        proveedor: 'Comercializadora Agroecológica San Juan',
        emoji: '🍬',
        negocio_id: negocioChocoId,
      },
      {
        nombre: 'Cajas de Madera de Pino Grabadas Láser',
        categoria: 'Empaque',
        unidad: 'pieza',
        stock_actual: 45,
        stock_minimo: 20,
        costo_promedio: 92,
        proveedor: 'Maderas Finas Don Manuel',
        emoji: '📦',
        negocio_id: negocioChocoId,
      },
      {
        nombre: 'Papel Opalina y Couché 300g (Resma 500 h)',
        categoria: 'Papelería',
        unidad: 'pieza',
        stock_actual: 12,
        stock_minimo: 4,
        costo_promedio: 340,
        proveedor: 'Distribuidora Papelera del Centro CDMX',
        emoji: '📄',
        negocio_id: negocioStudioId,
      },
    ];

    const insumoMap: Record<string, string> = {};
    for (const ins of insumosData) {
      const id = uuidv4();
      await qr.query(
        `INSERT INTO insumos_inventario
           (id, usuario_id, negocio_id, nombre, categoria, unidad,
            stock_actual, stock_minimo, costo_promedio, proveedor_default, emoji, activo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)`,
        [
          id, ownerId, ins.negocio_id, ins.nombre, ins.categoria, ins.unidad,
          ins.stock_actual, ins.stock_minimo, ins.costo_promedio, ins.proveedor, ins.emoji,
        ]
      );
      insumoMap[ins.nombre] = id;
      console.log(`  📦 Insumo: ${ins.emoji} ${ins.nombre} — Stock: ${ins.stock_actual} ${ins.unidad}`);
    }

    const movimientosData = [
      // Entradas
      { insumo: 'Cacao Criollo en Grano Oaxaqueño', tipo: 'entrada', cantidad: 50, costo: 290, fecha: '2026-08-15', motivo: 'Compra de cosecha de temporal', proveedor: 'Cooperativa Oaxaca', stock_resultante: 50 },
      { insumo: 'Manteca de Cacao Pura Prensada', tipo: 'entrada', cantidad: 18, costo: 460, fecha: '2026-08-15', motivo: 'Suministro mensual', proveedor: 'Cooperativa Oaxaca', stock_resultante: 18 },
      { insumo: 'Azúcar Mascabado Orgánico de Caña', tipo: 'entrada', cantidad: 35, costo: 68, fecha: '2026-08-20', motivo: 'Compra mayorista', proveedor: 'Agroecológica San Juan', stock_resultante: 35 },
      { insumo: 'Cajas de Madera de Pino Grabadas Láser', tipo: 'entrada', cantidad: 60, costo: 92, fecha: '2026-08-25', motivo: 'Pedido de 60 cajas grabadas', proveedor: 'Maderas Finas Don Manuel', stock_resultante: 60 },
      // Salidas
      { insumo: 'Cacao Criollo en Grano Oaxaqueño', tipo: 'salida', cantidad: 7.5, costo: 290, fecha: '2026-09-02', motivo: 'Producción de 50 tabletas 72%', proveedor: null, stock_resultante: 42.5 },
      { insumo: 'Manteca de Cacao Pura Prensada', tipo: 'salida', cantidad: 3.2, costo: 460, fecha: '2026-09-02', motivo: 'Producción de lote de tabletas', proveedor: null, stock_resultante: 14.8 },
      { insumo: 'Azúcar Mascabado Orgánico de Caña', tipo: 'salida', cantidad: 7.0, costo: 68, fecha: '2026-09-02', motivo: 'Elaboración de tabletas y garapiñados', proveedor: null, stock_resultante: 28.0 },
      { insumo: 'Cajas de Madera de Pino Grabadas Láser', tipo: 'salida', cantidad: 15, costo: 92, fecha: '2026-09-04', motivo: 'Empaque de pedido corporativo Nexo', proveedor: null, stock_resultante: 45 },
    ];

    for (const m of movimientosData) {
      const costoTotal = Math.round(m.cantidad * m.costo * 100) / 100;
      await qr.query(
        `INSERT INTO movimientos_inventario
           (id, usuario_id, insumo_id, tipo, cantidad, costo_unitario, costo_total,
            stock_resultante, fecha, motivo, proveedor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          uuidv4(), ownerId, insumoMap[m.insumo], m.tipo, m.cantidad,
          m.costo, costoTotal, m.stock_resultante, m.fecha, m.motivo, m.proveedor,
        ]
      );
    }
    console.log(`📥📤 8 Movimientos de inventario registrados (compras y consumos).`);

    // ─── 15. COTIZACIONES ────────────────────────────────────────────────────
    const cotizacionesData = [
      {
        numero: 'COT-000001',
        estado: 'aceptada',
        cliente_nombre: 'Carlos Herrera Rivas',
        cliente_empresa: 'TechStart Software MX',
        cliente_email: 'carlos@techstart.io',
        cliente_telefono: '+52 55 3344 5566',
        negocio_id: negocioStudioId,
        producto_id: serv1Id,
        items: [
          { descripcion: 'Identidad Visual Completa (Logotipo + Manual de Marca 25 págs)', cantidad: 1, precio_unitario: 13500, subtotal: 13500 },
          { descripcion: 'Diseño de Plantillas Editables en Figma para Producto & Redes', cantidad: 1, precio_unitario: 3500, subtotal: 3500 },
          { descripcion: 'Papelería Corporativa Digital e Impresión de 500 Tarjetas', cantidad: 1, precio_unitario: 2000, subtotal: 2000 },
        ],
        descuento_pct: 0,
        fecha_vencimiento: '2026-09-30',
        notas: 'Aprobada por Carlos Herrera. Entrega estimada: 3 semanas. Condiciones: 50% anticipo y 50% contra entrega.',
      },
      {
        numero: 'COT-000002',
        estado: 'enviada',
        cliente_nombre: 'Lucía Fernández Serna',
        cliente_empresa: 'Café Origin MX',
        cliente_email: 'lucia@cafeoriginmx.com',
        cliente_telefono: '+52 33 5566 7788',
        negocio_id: negocioStudioId,
        producto_id: serv1Id,
        items: [
          { descripcion: 'Rediseño de Logotipo y Sistema Visual de Empaque', cantidad: 1, precio_unitario: 9500, subtotal: 9500 },
          { descripcion: 'Diseño de Etiquetas para Bolsas de Café de Especialidad (3 variedades)', cantidad: 3, precio_unitario: 2500, subtotal: 7500 },
          { descripcion: 'Sesión Fotográfica Profesional de Producto (4 horas en estudio)', cantidad: 1, precio_unitario: 4500, subtotal: 4500 },
        ],
        descuento_pct: 10,
        fecha_vencimiento: '2026-10-10',
        notas: 'Propuesta enviada tras revisión de muestras. Descuento comercial del 10% por paquete completo aplicado.',
      },
      {
        numero: 'COT-000003',
        estado: 'borrador',
        cliente_nombre: 'Roberto Méndez Silva',
        cliente_empresa: 'Gimnasio Fuerza Total CDMX',
        cliente_email: 'roberto@fuerzatotal.mx',
        cliente_telefono: '+52 55 7788 9900',
        negocio_id: negocioStudioId,
        producto_id: serv1Id,
        items: [
          { descripcion: 'Paquete Identidad Visual & Branding 360°', cantidad: 1, precio_unitario: 18500, subtotal: 18500 },
          { descripcion: 'Diseño & Desarrollo de Landing Page Web de Conversión', cantidad: 1, precio_unitario: 9200, subtotal: 9200 },
          { descripcion: 'Sesión Consultoría de Estrategia de Lanzamiento', cantidad: 1, precio_unitario: 2500, subtotal: 2500 },
        ],
        descuento_pct: 5,
        fecha_vencimiento: '2026-10-15',
        notas: 'Borrador para presentar en la sesión de consultoría. Roberto solicitó facilidades en 3 parcialidades.',
      },
    ];

    for (const c of cotizacionesData) {
      const subtotal = c.items.reduce((acc, i) => acc + i.subtotal, 0);
      const descuentoMonto = Math.round(subtotal * (c.descuento_pct / 100) * 100) / 100;
      const baseGravable = subtotal - descuentoMonto;
      const impuestoTasa = 16;
      const impuestoMonto = Math.round(baseGravable * (impuestoTasa / 100) * 100) / 100;
      const total = Math.round((baseGravable + impuestoMonto) * 100) / 100;

      await qr.query(
        `INSERT INTO cotizaciones
           (id, usuario_id, negocio_id, producto_id, numero,
            cliente_nombre, cliente_empresa, cliente_email, cliente_telefono,
            items, subtotal, descuento_pct, descuento_monto,
            impuesto_tasa, impuesto_nombre, impuesto_monto, total, moneda,
            estado, fecha_vencimiento, notas, marca_nombre, marca_color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [
          uuidv4(), ownerId, c.negocio_id, c.producto_id, c.numero,
          c.cliente_nombre, c.cliente_empresa, c.cliente_email, c.cliente_telefono,
          JSON.stringify(c.items), subtotal, c.descuento_pct, descuentoMonto,
          impuestoTasa, 'IVA', impuestoMonto, total, 'MXN',
          c.estado, c.fecha_vencimiento, c.notas,
          'Studio V', '#6C2BD9',
        ]
      );
      console.log(`  📋 Cotización ${c.numero} [${c.estado}]: $${total.toLocaleString('es-MX')} MXN para ${c.cliente_nombre}`);
    }

    // ─── 16. EQUIPO DE TRABAJO (TRABAJADORES Y ASIGNACIONES) ─────────────────
    const trabajadorHash = await bcrypt.hash('Equipo2024!', 12);

    // Trabajadora 1: Sofía Ramos (Diseñadora Senior)
    const trab1Email = 'sofia.ramos@studiov.mx';
    const trab1Id = uuidv4();
    await qr.query(
      `INSERT INTO usuarios
         (id, email, password_hash, nombre, plan, account_role,
          owner_id, analisis_disponibles, creditos_marketing, activo)
       VALUES ($1, $2, $3, $4, 'business', 'trabajador', $5, 0, 0, true)`,
      [trab1Id, trab1Email, trabajadorHash, 'Sofía Ramos', ownerId]
    );

    // Asignación Sofía → Servicio 1 (Identidad Visual)
    await qr.query(
      `INSERT INTO asignaciones_trabajador
         (id, trabajador_id, cuenta_id, producto_id, permisos, activo)
       VALUES ($1, $2, $3, $4, $5::jsonb, true)`,
      [
        uuidv4(), trab1Id, ownerId, serv1Id,
        JSON.stringify({
          mercado: true, marketing: true, brief: true, finanzas: false, legal: false,
          pos: true, inventario: true, citas: true, clientes: true, cotizaciones: true,
          nomina: false, contabilidad: false,
        }),
      ]
    );

    // Asignación Sofía → Servicio 3 (Landing Web)
    await qr.query(
      `INSERT INTO asignaciones_trabajador
         (id, trabajador_id, cuenta_id, producto_id, permisos, activo)
       VALUES ($1, $2, $3, $4, $5::jsonb, true)`,
      [
        uuidv4(), trab1Id, ownerId, serv3Id,
        JSON.stringify({
          mercado: true, marketing: true, brief: true, finanzas: false, legal: false,
          pos: true, inventario: false, citas: true, clientes: true, cotizaciones: false,
          nomina: false, contabilidad: false,
        }),
      ]
    );
    console.log(`  🧑‍💼 Trabajadora: Sofía Ramos (${trab1Email}) → Asignada a Servicio 1 y Servicio 3`);

    // Trabajador 2: Diego Luna (Community & Sales)
    const trab2Email = 'diego.luna@studiov.mx';
    const trab2Id = uuidv4();
    await qr.query(
      `INSERT INTO usuarios
         (id, email, password_hash, nombre, plan, account_role,
          owner_id, analisis_disponibles, creditos_marketing, activo)
       VALUES ($1, $2, $3, $4, 'business', 'trabajador', $5, 0, 0, true)`,
      [trab2Id, trab2Email, trabajadorHash, 'Diego Luna', ownerId]
    );

    // Asignación Diego → Producto 2 (Chocolatería)
    await qr.query(
      `INSERT INTO asignaciones_trabajador
         (id, trabajador_id, cuenta_id, producto_id, permisos, activo)
       VALUES ($1, $2, $3, $4, $5::jsonb, true)`,
      [
        uuidv4(), trab2Id, ownerId, prod2Id,
        JSON.stringify({
          mercado: true, marketing: true, brief: false, finanzas: false, legal: false,
          pos: true, inventario: true, citas: true, clientes: true, cotizaciones: true,
          nomina: false, contabilidad: false,
        }),
      ]
    );
    console.log(`  🧑‍💼 Trabajador: Diego Luna (${trab2Email}) → Asignado a Producto 2 (Chocolates)`);

    // ─── 17. NÓMINA (EMPLEADOS Y PAGOS EJECUTADOS) ───────────────────────────
    const empleadosData = [
      {
        id: uuidv4(),
        nombre: 'Sofía Ramos García',
        cargo: 'Diseñadora Senior Brand & UI',
        salario: 24000,
        tipo_pago: 'quincenal',
        telefono: '+52 55 1234 5678',
        email: 'sofia.ramos@studiov.mx',
        fecha_inicio: '2024-03-15',
      },
      {
        id: uuidv4(),
        nombre: 'Diego Luna Martínez',
        cargo: 'Community & Content Specialist',
        salario: 17000,
        tipo_pago: 'quincenal',
        telefono: '+52 55 8765 4321',
        email: 'diego.luna@studiov.mx',
        fecha_inicio: '2024-06-01',
      },
      {
        id: uuidv4(),
        nombre: 'Andrea Molina Cruz',
        cargo: 'Coordinadora de Operaciones & Logística',
        salario: 14000,
        tipo_pago: 'mensual',
        telefono: '+52 55 5555 1234',
        email: 'andrea.molina@studiov.mx',
        fecha_inicio: '2024-09-01',
      },
    ];

    for (const e of empleadosData) {
      await qr.query(
        `INSERT INTO empleados
           (id, usuario_id, nombre, cargo, salario, tipo_pago, moneda,
            telefono, email, fecha_inicio, activo)
         VALUES ($1,$2,$3,$4,$5,$6,'MXN',$7,$8,$9,true)`,
        [e.id, ownerId, e.nombre, e.cargo, e.salario, e.tipo_pago, e.telefono, e.email, e.fecha_inicio]
      );
      console.log(`  👷 Empleado en nómina: ${e.nombre} (${e.cargo}) — $${e.salario.toLocaleString('es-MX')} MXN`);

      // Pago de nómina fin de agosto
      await qr.query(
        `INSERT INTO pagos_nomina
           (id, usuario_id, empleado_id, empleado_nombre, monto, moneda,
            periodo_inicio, periodo_fin, fecha_pago, notas)
         VALUES ($1,$2,$3,$4,$5,'MXN',$6,$7,$8,$9)`,
        [
          uuidv4(), ownerId, e.id, e.nombre,
          e.tipo_pago === 'quincenal' ? e.salario / 2 : e.salario,
          '2026-08-16', '2026-08-31', '2026-08-31',
          `Pago de nómina ordinaria período quincenal/mensual`,
        ]
      );
    }
    console.log(`💰 3 Recibos de nómina emitidos y vinculados.`);

    // ─── 18. CONTABILIDAD (MOVIMIENTOS CONTABLES) ────────────────────
    const movimientosContablesData = [
      { tipo: 'ingreso', desc: 'Anticipo 50% Proyecto TechStart (COT-000001)', cat: 'Ventas', monto: 11020, fecha: '2026-09-02' },
      { tipo: 'ingreso', desc: 'Venta POS-000001 Branding Tortas Mexicanas', cat: 'Ventas', monto: 17748, fecha: '2026-09-01' },
      { tipo: 'ingreso', desc: 'Venta POS-000003 Cajas Regalo Corporativo Nexo', cat: 'Ventas', monto: 7192, fecha: '2026-09-04' },
      { tipo: 'ingreso', desc: 'Venta POS-000005 Activos de Marca Café Origin', cat: 'Ventas', monto: 10440, fecha: '2026-09-07' },
      { tipo: 'ingreso', desc: 'Ventas mostrador fin de semana chocolatería', cat: 'Ventas', monto: 8044.60, fecha: '2026-09-09' },
      { tipo: 'egreso', desc: 'Pago nómina quincenal equipo creativo', cat: 'Sueldos', monto: 20500, fecha: '2026-08-31' },
      { tipo: 'egreso', desc: 'Renta estudio creativo Col. Roma Norte', cat: 'Renta', monto: 18000, fecha: '2026-09-01' },
      { tipo: 'egreso', desc: 'Compra de 50kg Cacao Criollo Finca Oaxaca', cat: 'Insumos', monto: 14500, fecha: '2026-08-15' },
      { tipo: 'egreso', desc: 'Lote de 60 cajas de pino grabadas láser', cat: 'Materiales', monto: 5520, fecha: '2026-08-25' },
      { tipo: 'egreso', desc: 'Suscripción Adobe Creative Cloud + Figma Org', cat: 'Software', monto: 2650, fecha: '2026-09-03' },
      { tipo: 'egreso', desc: 'Pauta publicitaria Google Ads & Meta', cat: 'Marketing', monto: 4500, fecha: '2026-09-05' },
      { tipo: 'egreso', desc: 'Servicios básicos (Internet fibra simétrica + Luz)', cat: 'Servicios', monto: 2150, fecha: '2026-09-06' },
    ];

    for (const mc of movimientosContablesData) {
      await qr.query(
        `INSERT INTO movimientos_contables
           (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual')`,
        [uuidv4(), ownerId, serv1Id, mc.tipo, mc.desc, mc.cat, mc.monto, mc.fecha]
      );
    }
    console.log(`📊 12 Movimientos contables registrados (ingresos y egresos).`);

    // ─── 19. METAS DE NEGOCIO ────────────────────────────────────────────────
    const metasData = [
      {
        nombre: 'Facturación Mensual Septiembre - Studio V',
        tipo: 'ingresos',
        objetivo: 95000,
        avance: 68500,
        periodo_inicio: '2026-09-01',
        periodo_fin: '2026-09-30',
        notas: 'Meta de ingresos por servicios de branding y diseño web en septiembre.',
        negocio_id: negocioStudioId,
      },
      {
        nombre: 'Venta de Cajas Degustación - Aura Cacao',
        tipo: 'ventas',
        objetivo: 30,
        avance: 18,
        periodo_inicio: '2026-09-01',
        periodo_fin: '2026-09-30',
        notas: 'Venta de 30 cajas gourmet de 12pz a clientes corporativos.',
        negocio_id: negocioChocoId,
      },
      {
        nombre: 'Cierre de Nuevos Clientes Corporativos Q4',
        tipo: 'personalizada',
        objetivo: 8,
        avance: 4,
        periodo_inicio: '2026-09-01',
        periodo_fin: '2026-12-31',
        notas: 'Captación de 8 empresas con contratos mayores a $15,000 MXN para el último trimestre.',
        negocio_id: null,
      },
    ];

    for (const m of metasData) {
      await qr.query(
        `INSERT INTO metas_negocio
           (id, usuario_id, negocio_id, nombre, tipo, objetivo, avance_manual,
            periodo_inicio, periodo_fin, notas, activa)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
        [
          uuidv4(), ownerId, m.negocio_id, m.nombre, m.tipo, m.objetivo,
          m.avance, m.periodo_inicio, m.periodo_fin, m.notas,
        ]
      );
      console.log(`  🎯 Meta: ${m.nombre} [${m.avance} / ${m.objetivo}]`);
    }

    // ─── 20. TEMA PERSONALIZADO DEL USUARIO ──────────────────────────────────
    await qr.query(
      `INSERT INTO temas_usuario
         (id, usuario_id, tema_preset, color_acento, nombre_sistema, wallpaper_overlay)
       VALUES ($1, $2, 'dark', '#7C3AED', 'Studio V Workspace', 50)
       ON CONFLICT (usuario_id) DO UPDATE
       SET tema_preset = 'dark', color_acento = '#7C3AED', nombre_sistema = 'Studio V Workspace'`,
      [uuidv4(), ownerId]
    );
    console.log(`🎨 Tema personalizado configurado para Valeria (Modo oscuro, violeta Studio V).`);

    // ─── COMMIT DE LA TRANSACCIÓN ────────────────────────────────────────────
    await qr.commitTransaction();

    console.log('\n' + '═'.repeat(70));
    console.log('🎉 PROCESO COMPLETADO EXITOSAMENTE — CUENTA DE VALERIA POBLADA AL 100%');
    console.log('═'.repeat(70));
    console.log(`
┌──────────────────────────────────────────────────────────────────┐
│  CREDENCIALES DE ACCESO                                          │
├──────────────────────────────────────────────────────────────────┤
│  👤 OWNER: Valeria Torres                                        │
│     📧 valeria.torres@studiov.mx                                 │
│     🔑 StudioV2024!                                              │
│     💼 Plan: Business (Acceso total e ilimitado)                 │
│                                                                  │
│  🧑‍💼 TRABAJADORA: Sofía Ramos (Diseñadora Senior)                 │
│     📧 sofia.ramos@studiov.mx                                    │
│     🔑 Equipo2024!                                               │
│     📦 Asignaciones: Servicio 1 e Identidad Web                  │
│                                                                  │
│  🧑‍💼 TRABAJADOR: Diego Luna (Community & Marketing)               │
│     📧 diego.luna@studiov.mx                                     │
│     🔑 Equipo2024!                                               │
│     📦 Asignaciones: Producto 2 (Chocolates)                     │
└──────────────────────────────────────────────────────────────────┘

📁 NEGOCIOS CREADOS:
  1. 🎨 Studio V Creativo (Servicios Profesionales de Diseño y Branding)
  2. 🍫 Aura & Cacao Chocolatería (Productos Físicos Gourmet)

📦 PRODUCTOS Y SERVICIOS:
  ✅ [SERVICIO 1 - COMPLETO] Paquete Identidad Visual & Branding 360° ($18,500 MXN)
     • 6/6 Módulos completados (Mercado, Marketing, Finanzas, Ventas, Legal, Brief)
  ⏳ [PRODUCTO 2 - SEMI]    Caja Degustación Chocolates de Origen 12pz ($890 MXN)
     • 2/5 Módulos completados (Mercado y Marketing; Finanzas, Ventas y Legal vacíos)
  ⬜ [SERVICIO 3 - VACÍO]   Diseño & Desarrollo de Landing Page Web ($9,200 MXN)
  ⬜ [SERVICIO 4 - VACÍO]   Consultoría Estratégica & Auditoría de Marca ($4,500 MXN)
  ⬜ [PRODUCTO 5 - VACÍO]   Tableta Cacao Ceremonial 72% Orgánica ($175 MXN)
  ⬜ [PRODUCTO 6 - VACÍO]   Set de Regalo Corporativo Artesanal ($1,450 MXN)

🔧 HERRAMIENTAS POBLADAS:
  • 🏪 POS: Catálogo de 10 items + 8 ventas con tickets en Septiembre 2026
  • 📅 Calendario: 6 citas en Septiembre 2026 vinculadas a clientes reales
  • 📦 Inventario: 5 insumos con stock + 8 movimientos (entradas y salidas)
  • 📋 Cotizaciones: 3 cotizaciones (1 aceptada, 1 enviada, 1 borrador)
  • 🤝 Clientes CRM: 5 clientes registrados con notas y categorías (VIP/Lead/Activo)
  • 💰 Nómina: 3 empleados formales y pagos ejecutados
  • 📊 Contabilidad: 12 movimientos de ingresos y egresos
  • 🎯 Metas: 3 metas activas con progreso en tiempo real
  • 🎨 Kit de Marca: Studio V configurado con paleta, tipografías, brief y análisis de logo
`);

  } catch (error) {
    await qr.rollbackTransaction();
    console.error('❌ Error durante la ejecución del seed:', error);
    throw error;
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

runSeed().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
