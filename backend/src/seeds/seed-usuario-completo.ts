/**
 * Seed: Usuario COMPLETO simulando un usuario real de la plataforma.
 *
 * Crea un escenario realista con:
 *   - 1 Owner (plan business, "Valeria Torres") con datos de negocio
 *   - 2 Negocios (Studio Creativo y Sabor Artesanal)
 *   - 5 Productos/Servicios con niveles de completitud variados:
 *       • 1 COMPLETO (todos los módulos con análisis completados)
 *       • 1 SEMI-COMPLETO (algunos módulos completados, otros vacíos)
 *       • 3 VACÍOS (sin análisis, recién creados)
 *   - Kit de Marca completo (paleta, tipografía, logo_analysis, brief_data)
 *   - 4 Herramientas seleccionadas (POS, Inventario, Clientes, Cotizaciones)
 *   - 2 Trabajadores con asignaciones y permisos granulares
 *   - 3 Empleados (nómina)
 *
 * Ejecutar:  npx ts-node src/seeds/seed-usuario-completo.ts
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Reutiliza la misma lógica de conexión que database.ts: si DATABASE_URL está
// definida se usa directamente; si no, cae a las variables individuales.
const databaseUrl = process.env.DATABASE_URL;
const AppDataSource = databaseUrl
  ? new DataSource({ type: 'postgres', url: databaseUrl, synchronize: false, logging: false })
  : new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'bi0a100',
      synchronize: false,
      logging: false,
    });

// ═══════════════════════════════════════════════════════════════════════════════
// DATOS REALISTAS DE ANÁLISIS
// ═══════════════════════════════════════════════════════════════════════════════

const MERCADO_RESULTADO_COMPLETO = {
  viabilidad_score: 78,
  viabilidad_estado: 'viable',
  viabilidad_factores: {
    demanda: { score: 82, label: 'Alta demanda detectada' },
    competencia: { score: 65, label: 'Competencia moderada' },
    tendencia: { score: 88, label: 'Tendencia al alza sostenida' },
    barreras: { score: 72, label: 'Barreras de entrada medias' },
  },
  tendencias_data: {
    keyword: 'branding para pymes',
    volumen_mensual: 14800,
    tendencia_12m: 23.5,
    estacionalidad: [
      { mes: 'Ene', volumen: 12500 }, { mes: 'Feb', volumen: 13200 },
      { mes: 'Mar', volumen: 14100 }, { mes: 'Abr', volumen: 15800 },
      { mes: 'May', volumen: 16200 }, { mes: 'Jun', volumen: 14900 },
      { mes: 'Jul', volumen: 13800 }, { mes: 'Ago', volumen: 14500 },
      { mes: 'Sep', volumen: 15600 }, { mes: 'Oct', volumen: 16800 },
      { mes: 'Nov', volumen: 17200 }, { mes: 'Dic', volumen: 12800 },
    ],
    keywords_relacionadas: [
      { keyword: 'diseño de logo', volumen: 22000 },
      { keyword: 'identidad visual', volumen: 8900 },
      { keyword: 'manual de marca', volumen: 6200 },
      { keyword: 'branding empresarial', volumen: 11500 },
    ],
  },
  competencia_data: {
    total_competidores: 47,
    competidores_principales: [
      {
        nombre: 'BrandFactory MX',
        url: 'https://brandfactory.mx',
        precio_rango: '$15,000 - $45,000',
        fortalezas: ['Portfolio extenso', 'Clientes corporativos'],
        debilidades: ['Tiempos de entrega largos', 'Sin atención personalizada'],
      },
      {
        nombre: 'Creativa Studio',
        url: 'https://creativastudio.com',
        precio_rango: '$8,000 - $25,000',
        fortalezas: ['Diseño moderno', 'Rápido'],
        debilidades: ['Poca experiencia en FMCG', 'Sin estrategia de marca'],
      },
      {
        nombre: 'Imagina Branding',
        url: 'https://imaginabranding.mx',
        precio_rango: '$20,000 - $60,000',
        fortalezas: ['Estrategia completa', 'Equipo senior'],
        debilidades: ['Precio alto', 'Poca flexibilidad'],
      },
    ],
    densidad: {
      competidores_km2: 3.2,
      zona: 'CDMX - Roma/Condesa',
      es_evaluable: true,
    },
  },
  tam_data: {
    tam: 4800000000,
    sam: 720000000,
    som: 36000000,
    moneda: 'MXN',
    fuentes: ['Censo Económico INEGI 2024', 'AMAPRO', 'Statista'],
    metodologia: 'Bottom-up: PyMEs activas en CDMX × ticket promedio anual × penetración digital',
  },
  dafo_data: {
    fortalezas: [
      'Servicio personalizado y cercano al cliente',
      'Precios competitivos para el segmento PyME',
      'Proceso ágil con entregables en 2-3 semanas',
      'Conocimiento profundo del mercado mexicano',
    ],
    oportunidades: [
      'Crecimiento del 15% anual en digitalización de PyMEs',
      'Demanda creciente de presencia en redes sociales',
      'Pocos competidores especializados en el segmento micro-PyME',
      'Tendencia de e-commerce post-pandemia',
    ],
    debilidades: [
      'Equipo pequeño (4 personas)',
      'Sin portafolio de clientes grandes',
      'Dependencia de referidos como canal principal',
    ],
    amenazas: [
      'Herramientas de IA generativa (Canva AI, Midjourney)',
      'Freelancers con precios agresivos en Fiverr/Upwork',
      'Recesión económica que reduzca presupuestos de marketing',
    ],
  },
  alertas: [
    {
      tipo: 'oportunidad',
      titulo: 'Nicho desatendido',
      mensaje: 'Solo 12% de los competidores ofrecen paquetes mensuales de mantenimiento de marca.',
    },
    {
      tipo: 'precaucion',
      titulo: 'Saturación en zona centro',
      mensaje: 'La densidad de competidores en Roma-Condesa es 3.2/km². Considerar expansión digital.',
    },
  ],
};

const MARKETING_RESULTADO_COMPLETO = {
  estrategias_data: {
    estrategia_principal: 'Inbound Marketing + Social Selling',
    buyer_personas: [
      {
        nombre: 'Ana la Emprendedora',
        edad: '28-35',
        puesto: 'Fundadora / CEO',
        dolor_principal: 'Su negocio no se ve profesional en redes',
        motivacion: 'Quiere que su marca inspire confianza',
        canales_preferidos: ['Instagram', 'TikTok', 'WhatsApp'],
      },
      {
        nombre: 'Roberto el Directivo',
        edad: '40-55',
        puesto: 'Director General',
        dolor_principal: 'Su imagen de marca está desactualizada',
        motivacion: 'Necesita renovar la identidad antes de una ronda de inversión',
        canales_preferidos: ['LinkedIn', 'Email', 'Referidos'],
      },
    ],
    canales_recomendados: [
      { canal: 'Instagram', inversion_pct: 35, rol: 'Showcase de portafolio y social proof' },
      { canal: 'TikTok', inversion_pct: 25, rol: 'Educación rápida y behind-the-scenes' },
      { canal: 'LinkedIn', inversion_pct: 20, rol: 'Posicionamiento B2B y networking' },
      { canal: 'Google Ads', inversion_pct: 15, rol: 'Captura de demanda existente' },
      { canal: 'Email Marketing', inversion_pct: 5, rol: 'Nurturing y remarketing' },
    ],
    presupuesto_sugerido: {
      mensual: 25000,
      moneda: 'MXN',
      roi_estimado: '3.2x en 6 meses',
    },
  },
  copies_data: {
    tagline_principal: 'Tu marca merece verse como se siente.',
    taglines_alternativos: [
      'De la idea a la identidad, en 2 semanas.',
      'Branding que conecta. Diseño que convierte.',
    ],
    copy_redes: {
      instagram: '¿Tu marca habla por ti? 🎨 En Studio V transformamos ideas en identidades visuales que enamoran. Desde $12,000 MXN. Link en bio 👆',
      linkedin: 'El 78% de los consumidores confían más en marcas con identidad visual profesional. ¿La tuya ya transmite lo que vales? En Studio V diseñamos identidades que convierten. #Branding #PyMEs #México',
      tiktok: 'POV: Tu logo costó $500 en Fiverr y tus clientes no te toman en serio 😅 → Así transformamos marcas en 2 semanas 🔥',
    },
    emails: {
      asunto_bienvenida: '¡Bienvenido/a! Tu marca está a punto de transformarse',
      asunto_seguimiento: '¿Listo/a para que tu marca hable por ti?',
    },
  },
  calendario_data: {
    semana_1: [
      { dia: 'Lunes', plataforma: 'Instagram', tipo: 'Reel', tema: 'Before/After de proyecto reciente' },
      { dia: 'Miércoles', plataforma: 'LinkedIn', tipo: 'Post', tema: 'Tip de branding: La importancia del color' },
      { dia: 'Viernes', plataforma: 'TikTok', tipo: 'Video', tema: 'Proceso de diseño en 60 segundos' },
    ],
    semana_2: [
      { dia: 'Martes', plataforma: 'Instagram', tipo: 'Carrusel', tema: '5 errores de branding que cometen las PyMEs' },
      { dia: 'Jueves', plataforma: 'LinkedIn', tipo: 'Artículo', tema: 'Por qué tu logo no es tu marca' },
      { dia: 'Sábado', plataforma: 'Instagram', tipo: 'Story', tema: 'Encuesta: ¿Qué logo prefieres? A o B' },
    ],
  },
};

const FINANZAS_RESULTADO_COMPLETO = {
  inputs_data: {
    precio_venta: 18000,
    costo_variable_unitario: 4500,
    costos_fijos_mensuales: 85000,
    unidades_mes_inicial: 3,
    tasa_crecimiento_mensual: 8,
  },
  proyeccion_data: {
    meses: [
      { mes: 1, unidades: 3, ingresos: 54000, costos_variables: 13500, costos_fijos: 85000, utilidad_neta: -44500, acumulado: -44500 },
      { mes: 2, unidades: 3, ingresos: 54000, costos_variables: 13500, costos_fijos: 85000, utilidad_neta: -44500, acumulado: -89000 },
      { mes: 3, unidades: 4, ingresos: 72000, costos_variables: 18000, costos_fijos: 85000, utilidad_neta: -31000, acumulado: -120000 },
      { mes: 4, unidades: 4, ingresos: 72000, costos_variables: 18000, costos_fijos: 85000, utilidad_neta: -31000, acumulado: -151000 },
      { mes: 5, unidades: 5, ingresos: 90000, costos_variables: 22500, costos_fijos: 85000, utilidad_neta: -17500, acumulado: -168500 },
      { mes: 6, unidades: 5, ingresos: 90000, costos_variables: 22500, costos_fijos: 85000, utilidad_neta: -17500, acumulado: -186000 },
      { mes: 7, unidades: 6, ingresos: 108000, costos_variables: 27000, costos_fijos: 85000, utilidad_neta: -4000, acumulado: -190000 },
      { mes: 8, unidades: 7, ingresos: 126000, costos_variables: 31500, costos_fijos: 85000, utilidad_neta: 9500, acumulado: -180500 },
      { mes: 9, unidades: 8, ingresos: 144000, costos_variables: 36000, costos_fijos: 85000, utilidad_neta: 23000, acumulado: -157500 },
      { mes: 10, unidades: 8, ingresos: 144000, costos_variables: 36000, costos_fijos: 85000, utilidad_neta: 23000, acumulado: -134500 },
      { mes: 11, unidades: 9, ingresos: 162000, costos_variables: 40500, costos_fijos: 85000, utilidad_neta: 36500, acumulado: -98000 },
      { mes: 12, unidades: 10, ingresos: 180000, costos_variables: 45000, costos_fijos: 85000, utilidad_neta: 50000, acumulado: -48000 },
    ],
    total_12m: {
      ingresos: 1296000,
      costos_variables: 324000,
      costos_fijos: 1020000,
      utilidad_neta: -48000,
    },
  },
  breakeven_data: {
    punto_equilibrio_unidades: 7,
    punto_equilibrio_ingresos: 126000,
    margen_contribucion: 13500,
    margen_contribucion_pct: 75,
    mes_breakeven: 8,
    explicacion: 'Necesitas vender al menos 7 proyectos al mes para cubrir tus costos fijos de $85,000 MXN.',
  },
  resumen_data: {
    veredicto: 'viable_con_ajustes',
    puntaje: 72,
    resumen_ejecutivo: 'El negocio de branding muestra potencial viable con un margen bruto del 75%. El punto de equilibrio se alcanza en el mes 8, lo que implica que necesitarás capital de trabajo para los primeros 7 meses. Se recomienda reducir costos fijos iniciales o acelerar la captación de clientes para mejorar el flujo de caja.',
    recomendaciones: [
      'Considerar freelancers en lugar de equipo fijo para reducir costos fijos en un 30%',
      'Implementar paquetes de mantenimiento mensual para generar ingresos recurrentes',
      'Ofrecer un servicio básico de $8,000 como puerta de entrada al funnel',
    ],
    alertas: [
      { tipo: 'warning', mensaje: 'Los primeros 7 meses operarás con pérdidas. Asegura $190,000 MXN de capital de trabajo.' },
      { tipo: 'info', mensaje: 'El margen bruto de 75% es excelente para el sector servicios.' },
    ],
  },
};

const VENTAS_RESULTADO_COMPLETO = {
  tips_data: {
    tips: [
      {
        id: 'tip-1',
        titulo: 'Ofrece garantía de satisfacción',
        descripcion: 'Los clientes de branding temen pagar y no obtener lo que esperan. Ofrece una ronda extra de revisiones sin costo para eliminar la objeción de riesgo.',
        impacto: 'alto',
        categoria: 'cierre',
      },
      {
        id: 'tip-2',
        titulo: 'Usa social proof con números',
        descripcion: 'Menciona cuántos proyectos has completado y el NPS de tus clientes. Los datos concretos generan más confianza que los testimonios genéricos.',
        impacto: 'medio',
        categoria: 'confianza',
      },
      {
        id: 'tip-3',
        titulo: 'Crea urgencia con ediciones limitadas',
        descripcion: 'Limita tu capacidad mensual a 5 proyectos. La escasez genuina aumenta el valor percibido y reduce el tiempo de decisión.',
        impacto: 'alto',
        categoria: 'urgencia',
      },
    ],
  },
  historia_data: {
    titulo: 'La PyME que triplicó sus ventas con un rebranding',
    contenido: 'Una cafetería en la colonia Roma invirtió $15,000 en renovar su identidad visual. En 3 meses, su ticket promedio subió 40% y las menciones en redes crecieron 280%. La clave no fue solo el nuevo logo — fue la coherencia visual en cada punto de contacto.',
    moraleja: 'El branding no es un gasto, es la inversión más rentable que una PyME puede hacer.',
  },
  perfil_cliente_data: {
    nombre: 'Cliente Ideal: Ana la Emprendedora',
    segmento: 'PyMEs y startups en etapa temprana',
    edad: '28-38 años',
    genero: 'Femenino (65%) / Masculino (35%)',
    ingresos: '$25,000 - $60,000 MXN mensuales',
    ubicacion: 'CDMX, Guadalajara, Monterrey',
    dolor_principal: 'Su marca no refleja la calidad de su producto/servicio',
    motivacion_compra: 'Quiere profesionalizar su imagen para atraer mejores clientes',
    objeciones_comunes: ['Es muy caro', '¿Por qué no usar Canva?', 'No tengo tiempo para el proceso'],
    canales_contacto: ['Instagram DM', 'WhatsApp', 'Referidos'],
  },
};

const LEGAL_RESULTADO_COMPLETO = {
  giro_detectado: 'Servicios de diseño gráfico y comunicación visual',
  cumplimiento_global: 'amarillo',
  puntaje_cumplimiento: 68,
  resultado_data: {
    diagnostico: 'Tu estudio de branding opera como Persona Física con Actividad Empresarial (PFAE). Tienes obligaciones fiscales mensuales y anuales que debes cumplir. Se detectaron 3 áreas de mejora prioritarias.',
    obligaciones: [
      {
        area: 'Fiscal',
        status: 'parcial',
        items: [
          { nombre: 'Alta en SAT como PFAE', cumple: true, nota: 'RFC activo con obligaciones correctas' },
          { nombre: 'Declaraciones mensuales ISR/IVA', cumple: true, nota: 'Al corriente' },
          { nombre: 'Facturación CFDI 4.0', cumple: true, nota: 'Usa sistema de facturación certificado' },
          { nombre: 'Contabilidad electrónica', cumple: false, nota: 'No envía contabilidad electrónica al SAT. Multa potencial: $1,000-$10,000 MXN' },
        ],
      },
      {
        area: 'Contratos',
        status: 'incompleto',
        items: [
          { nombre: 'Contrato de prestación de servicios', cumple: false, nota: 'Opera sin contrato formal. Riesgo: disputas por alcance y pagos.' },
          { nombre: 'Cesión de derechos de autor', cumple: false, nota: 'Los diseños creados sin cesión formal pueden generar conflictos de propiedad intelectual.' },
          { nombre: 'Aviso de privacidad', cumple: true, nota: 'Publicado en sitio web' },
        ],
      },
      {
        area: 'Propiedad Intelectual',
        status: 'parcial',
        items: [
          { nombre: 'Registro de marca propia (IMPI)', cumple: false, nota: 'Tu marca "Studio V" no está registrada. Alguien más podría registrarla. Costo aproximado: $2,500 MXN + honorarios.' },
          { nombre: 'Licencias de software', cumple: true, nota: 'Adobe Creative Cloud con licencia vigente' },
        ],
      },
    ],
    recomendaciones_prioritarias: [
      'Registrar la marca "Studio V" ante el IMPI (urgente, toma 4-6 meses)',
      'Redactar contrato estándar de prestación de servicios con cláusula de cesión de derechos',
      'Iniciar envío de contabilidad electrónica al SAT',
    ],
    contratos_sugeridos: [
      'Contrato de prestación de servicios de diseño y branding',
      'Cláusula de cesión de derechos patrimoniales de autor',
      'Acuerdo de confidencialidad (NDA) para proyectos sensibles',
      'Términos y condiciones para servicios digitales',
    ],
  },
};

const BRIEF_RESULTADO_COMPLETO = {
  marca: 'Studio V',
  arquetipo: 'El Creador',
  descripcion_arquetipo: 'Marcas que inspiran innovación y expresión creativa. Valoran la originalidad, la imaginación y la libertad de crear.',
  personalidad: ['Creativo', 'Auténtico', 'Cercano', 'Profesional'],
  tono_voz: {
    principal: 'Cercano y profesional',
    descripcion: 'Habla como un amigo experto: sin tecnicismos innecesarios pero con autoridad. Inspira confianza sin ser corporativo.',
    ejemplos: {
      hacer: ['¡Tu marca va a volar!', 'Te cuento cómo lo lograremos juntos', 'Esto es lo que hace único a tu negocio'],
      evitar: ['Procedemos a informarle', 'Nuestros servicios enterprise-grade', 'Aplican restricciones'],
    },
  },
  paleta_sugerida: {
    primario: '#6C2BD9',
    secundario: '#F97316',
    acento: '#10B981',
    neutro_oscuro: '#1F2937',
    neutro_claro: '#F9FAFB',
    justificacion: 'Violeta transmite creatividad y premium; naranja aporta energía y cercanía; verde esmeralda equilibra con confianza y frescura.',
  },
  tipografia_sugerida: {
    titulos: 'Plus Jakarta Sans',
    cuerpo: 'Inter',
    justificacion: 'Plus Jakarta Sans tiene personalidad sin perder legibilidad. Inter es el estándar de lectura digital.',
  },
  diferenciacion: {
    nivel: 'alto',
    ventaja_competitiva: 'Proceso ágil de 2 semanas con entregables completos, a precio accesible para PyMEs.',
    posicionamiento: 'El estudio de branding que hace accesible el diseño profesional para PyMEs mexicanas.',
  },
  puntaje_brief: 85,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MARCA (KIT DE MARCA)
// ═══════════════════════════════════════════════════════════════════════════════

const MARCA_COMPLETA = {
  nombre: 'Studio V',
  slogan: 'Tu marca merece verse como se siente.',
  descripcion: 'Studio de branding y diseño visual enfocado en PyMEs y startups mexicanas. Transformamos ideas en identidades que conectan y convierten.',
  paleta_colores: {
    primario: '#6C2BD9',
    secundario: '#F97316',
    acento: '#10B981',
    neutro_oscuro: '#1F2937',
    neutro_claro: '#F9FAFB',
  },
  tipografia: 'Plus Jakarta Sans / Inter',
  brief_data: BRIEF_RESULTADO_COMPLETO,
  logo_analysis: {
    score: 82,
    tipo_detectado: 'Logotipo + símbolo',
    colores_detectados: ['#6C2BD9', '#FFFFFF'],
    legibilidad: 'alta',
    escalabilidad: 'buena',
    coherencia_con_sector: 'alta',
    sugerencias: [
      'El contraste violeta-blanco es excelente para aplicaciones digitales',
      'Considerar una versión simplificada del ícono para favicon y redes sociales',
      'La tipografía del logotipo es legible hasta 12px, apropiada para uso web',
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL DE SEED
// ═══════════════════════════════════════════════════════════════════════════════

async function seed() {
  await AppDataSource.initialize();
  console.log('✅ Conectado a la base de datos');

  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    // ─── 1. USUARIO OWNER ───────────────────────────────────────────────────
    const ownerEmail = 'valeria.torres@studiov.mx';
    const passwordHash = await bcrypt.hash('StudioV2024!', 12);

    await qr.query(
      `INSERT INTO usuarios
         (id, email, password_hash, nombre, plan, account_role,
          owner_id, analisis_disponibles, creditos_marketing, activo,
          datos_negocio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       ON CONFLICT (email) DO NOTHING`,
      [
        uuidv4(),
        ownerEmail,
        passwordHash,
        'Valeria Torres',
        'business',
        'owner',
        null,
        50,
        200,
        true,
        JSON.stringify({
          nombre_negocio: 'Studio V - Branding & Design',
          giro: 'Servicios creativos y diseño gráfico',
          sitio_web: 'https://studiov.mx',
          telefono: '+52 55 4321 8765',
          direccion: 'Col. Roma Norte, CDMX, México',
          redes: {
            instagram: '@studiov.mx',
            linkedin: 'studio-v-branding',
            tiktok: '@studiov',
          },
        }),
      ]
    );

    const ownerRow = await qr.query(`SELECT id FROM usuarios WHERE email = $1`, [ownerEmail]);
    const ownerId: string = ownerRow[0].id;
    console.log(`\n👤 Owner: Valeria Torres (${ownerId})`);

    // ─── 2. NEGOCIOS ────────────────────────────────────────────────────────
    const negocioStudioId = uuidv4();
    const negocioSaborId = uuidv4();

    await qr.query(
      `INSERT INTO negocios (id, usuario_id, nombre, emoji, descripcion) VALUES
         ($1, $2, 'Studio V Creativo', '🎨', 'Studio de branding, diseño y comunicación visual para PyMEs'),
         ($3, $2, 'Sabor Artesanal', '🍫', 'Marca de chocolates artesanales premium con cacao oaxaqueño')
       ON CONFLICT DO NOTHING`,
      [negocioStudioId, ownerId, negocioSaborId]
    );

    // Obtener IDs reales
    const negocios = await qr.query(
      `SELECT id, nombre FROM negocios WHERE usuario_id = $1`,
      [ownerId]
    );
    const negMap: Record<string, string> = {};
    for (const n of negocios) negMap[n.nombre] = n.id;
    const studioId = negMap['Studio V Creativo'];
    const saborId = negMap['Sabor Artesanal'];

    console.log(`📁 Negocios: Studio V Creativo (${studioId}) | Sabor Artesanal (${saborId})`);

    // ─── 3. PRODUCTOS ───────────────────────────────────────────────────────

    // Producto 1: COMPLETO — tiene todos los análisis completados
    const prod1_id = uuidv4();
    // Producto 2: SEMI-COMPLETO — tiene mercado y marketing, falta finanzas/legal/ventas
    const prod2_id = uuidv4();
    // Productos 3-5: VACÍOS — sin ningún análisis
    const prod3_id = uuidv4();
    const prod4_id = uuidv4();
    const prod5_id = uuidv4();

    const productos = [
      {
        id: prod1_id, usuario_id: ownerId, negocio_id: studioId,
        nombre: 'Paquete Identidad Visual Completa',
        descripcion: 'Diseño de logotipo, paleta de colores, tipografía, manual de marca de 20 páginas, plantillas para redes sociales (Instagram, Facebook, LinkedIn) y papelería corporativa digital.',
        categoria: 'Branding & Diseño',
        precio: 18000, pais: 'MX', nse: 'B/C+',
        status: 'activo',
      },
      {
        id: prod2_id, usuario_id: ownerId, negocio_id: studioId,
        nombre: 'Consultoría de Posicionamiento Digital',
        descripcion: 'Auditoría de presencia digital, estrategia de contenidos para 3 meses, optimización de perfiles en redes y recomendaciones de pauta pagada.',
        categoria: 'Consultoría Digital',
        precio: 12000, pais: 'MX', nse: 'B/C+',
        status: 'activo',
      },
      {
        id: prod3_id, usuario_id: ownerId, negocio_id: studioId,
        nombre: 'Diseño de Sitio Web Landing',
        descripcion: 'Diseño y desarrollo de landing page con formulario de contacto, integración con WhatsApp y optimización SEO básica.',
        categoria: 'Desarrollo Web',
        precio: 8500, pais: 'MX', nse: 'C+',
        status: 'activo',
      },
      {
        id: prod4_id, usuario_id: ownerId, negocio_id: saborId,
        nombre: 'Caja Degustación Premium',
        descripcion: 'Set de 12 trufas artesanales de cacao oaxaqueño en caja de madera con grabado láser. Sabores: tradicional, chile ancho, mezcal y café.',
        categoria: 'Chocolates Premium',
        precio: 890, pais: 'MX', nse: 'A/B',
        status: 'activo',
      },
      {
        id: prod5_id, usuario_id: ownerId, negocio_id: saborId,
        nombre: 'Tableta Cacao Ceremonial 72%',
        descripcion: 'Tableta de chocolate oscuro 72% cacao de origen único. Proceso bean-to-bar artesanal. Presentación de 80g con empaque biodegradable.',
        categoria: 'Chocolates',
        precio: 165, pais: 'MX', nse: 'B/C+',
        status: 'activo',
      },
    ];

    for (const p of productos) {
      await qr.query(
        `INSERT INTO productos
           (id, usuario_id, negocio_id, nombre, descripcion, categoria,
            precio, pais, nse, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          p.id, p.usuario_id, p.negocio_id, p.nombre, p.descripcion,
          p.categoria, p.precio, p.pais, p.nse, p.status,
        ]
      );
      console.log(`  📦 Producto: ${p.nombre}`);
    }

    // ─── 4. ANÁLISIS COMPLETO (Producto 1) ──────────────────────────────────
    const ahora = new Date();

    // 4a. Mercado — COMPLETADO
    await qr.query(
      `INSERT INTO analisis_mercado
         (id, producto_id, usuario_id, pais, estado_analisis,
          viabilidad_score, viabilidad_estado, viabilidad_factores,
          tendencias_data, competencia_data, tam_data, dafo_data, alertas,
          volumen_busquedas_mensual, tendencia_porcentaje, total_competidores,
          fecha_completado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,$17)`,
      [
        uuidv4(), prod1_id, ownerId, 'MX', 'completado',
        MERCADO_RESULTADO_COMPLETO.viabilidad_score,
        MERCADO_RESULTADO_COMPLETO.viabilidad_estado,
        JSON.stringify(MERCADO_RESULTADO_COMPLETO.viabilidad_factores),
        JSON.stringify(MERCADO_RESULTADO_COMPLETO.tendencias_data),
        JSON.stringify(MERCADO_RESULTADO_COMPLETO.competencia_data),
        JSON.stringify(MERCADO_RESULTADO_COMPLETO.tam_data),
        JSON.stringify(MERCADO_RESULTADO_COMPLETO.dafo_data),
        JSON.stringify(MERCADO_RESULTADO_COMPLETO.alertas),
        14800, 23.5, 47,
        ahora,
      ]
    );
    console.log('  ✅ Análisis Mercado: completado');

    // 4b. Marketing — COMPLETADO
    await qr.query(
      `INSERT INTO analisis_marketing
         (id, producto_id, usuario_id, estado_analisis,
          estrategias_data, copies_data, calendario_data,
          fecha_completado)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8)`,
      [
        uuidv4(), prod1_id, ownerId, 'completado',
        JSON.stringify(MARKETING_RESULTADO_COMPLETO.estrategias_data),
        JSON.stringify(MARKETING_RESULTADO_COMPLETO.copies_data),
        JSON.stringify(MARKETING_RESULTADO_COMPLETO.calendario_data),
        ahora,
      ]
    );
    console.log('  ✅ Análisis Marketing: completado');

    // 4c. Finanzas — COMPLETADO
    await qr.query(
      `INSERT INTO analisis_finanzas
         (id, producto_id, usuario_id, pais, estado_analisis,
          inputs_data, proyeccion_data, breakeven_data, resumen_data,
          fecha_completado)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10)`,
      [
        uuidv4(), prod1_id, ownerId, 'MX', 'completado',
        JSON.stringify(FINANZAS_RESULTADO_COMPLETO.inputs_data),
        JSON.stringify(FINANZAS_RESULTADO_COMPLETO.proyeccion_data),
        JSON.stringify(FINANZAS_RESULTADO_COMPLETO.breakeven_data),
        JSON.stringify(FINANZAS_RESULTADO_COMPLETO.resumen_data),
        ahora,
      ]
    );
    console.log('  ✅ Análisis Finanzas: completado');

    // 4d. Ventas — COMPLETADO
    await qr.query(
      `INSERT INTO analisis_ventas
         (id, producto_id, usuario_id, pais, estado_analisis,
          tipo_venta, canal_principal, ticket_promedio, nombre_producto,
          categoria, precio,
          tips_data, historia_data, perfil_cliente_data,
          fecha_completado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15)`,
      [
        uuidv4(), prod1_id, ownerId, 'MX', 'completado',
        'B2B_directo', 'directo', 18000, 'Paquete Identidad Visual Completa',
        'Branding & Diseño', 18000,
        JSON.stringify(VENTAS_RESULTADO_COMPLETO.tips_data),
        JSON.stringify(VENTAS_RESULTADO_COMPLETO.historia_data),
        JSON.stringify(VENTAS_RESULTADO_COMPLETO.perfil_cliente_data),
        ahora,
      ]
    );
    console.log('  ✅ Análisis Ventas: completado');

    // 4e. Legal — COMPLETADO
    await qr.query(
      `INSERT INTO analisis_legal
         (id, producto_id, usuario_id, pais, estado_analisis,
          forma_juridica, tiene_empleados, numero_empleados,
          vende_en_linea, giro_detectado, cumplimiento_global,
          puntaje_cumplimiento, resultado_data,
          fecha_completado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`,
      [
        uuidv4(), prod1_id, ownerId, 'MX', 'completado',
        'PFAE', true, 4,
        true, LEGAL_RESULTADO_COMPLETO.giro_detectado,
        LEGAL_RESULTADO_COMPLETO.cumplimiento_global,
        LEGAL_RESULTADO_COMPLETO.puntaje_cumplimiento,
        JSON.stringify(LEGAL_RESULTADO_COMPLETO.resultado_data),
        ahora,
      ]
    );
    console.log('  ✅ Análisis Legal: completado');

    // ─── 5. ANÁLISIS SEMI-COMPLETO (Producto 2) ────────────────────────────
    // Solo Mercado y Marketing completados. Finanzas, Legal y Ventas VACÍOS.

    await qr.query(
      `INSERT INTO analisis_mercado
         (id, producto_id, usuario_id, pais, estado_analisis,
          viabilidad_score, viabilidad_estado, viabilidad_factores,
          tendencias_data, competencia_data,
          volumen_busquedas_mensual, tendencia_porcentaje, total_competidores,
          fecha_completado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,$14)`,
      [
        uuidv4(), prod2_id, ownerId, 'MX', 'completado',
        71, 'viable',
        JSON.stringify({
          demanda: { score: 75, label: 'Demanda moderada-alta' },
          competencia: { score: 58, label: 'Alta competencia' },
          tendencia: { score: 82, label: 'Tendencia positiva' },
          barreras: { score: 68, label: 'Barreras bajas' },
        }),
        JSON.stringify({
          keyword: 'consultoria digital pymes',
          volumen_mensual: 8900,
          tendencia_12m: 18.2,
        }),
        JSON.stringify({
          total_competidores: 89,
          competidores_principales: [
            { nombre: 'Digitálika', url: 'https://digitalika.mx', precio_rango: '$10,000 - $30,000' },
            { nombre: 'Growth Hacking MX', url: 'https://growthhacking.mx', precio_rango: '$8,000 - $20,000' },
          ],
        }),
        8900, 18.2, 89,
        ahora,
      ]
    );
    console.log('  ⏳ Análisis Mercado (Prod 2): completado');

    await qr.query(
      `INSERT INTO analisis_marketing
         (id, producto_id, usuario_id, estado_analisis,
          estrategias_data, copies_data,
          fecha_completado)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
      [
        uuidv4(), prod2_id, ownerId, 'completado',
        JSON.stringify({
          estrategia_principal: 'Content Marketing + SEO Local',
          buyer_personas: [
            {
              nombre: 'Mariana la Dueña de Negocio',
              edad: '30-45',
              dolor_principal: 'No sabe cómo hacer crecer su negocio en digital',
            },
          ],
          canales_recomendados: [
            { canal: 'LinkedIn', inversion_pct: 40, rol: 'Captación B2B' },
            { canal: 'Google Ads', inversion_pct: 35, rol: 'Búsqueda activa' },
            { canal: 'Instagram', inversion_pct: 25, rol: 'Social proof' },
          ],
        }),
        JSON.stringify({
          tagline_principal: 'Tu negocio merece ser encontrado.',
          copy_redes: {
            linkedin: '¿Sabes cuántos clientes te pierdes por no estar en digital? Te ayudamos a construir tu presencia en 3 meses.',
          },
        }),
        ahora,
      ]
    );
    console.log('  ⏳ Análisis Marketing (Prod 2): completado');
    console.log('  ⬜ Finanzas, Legal y Ventas (Prod 2): SIN ANÁLISIS');

    // ─── Productos 3, 4 y 5 → SIN NINGÚN ANÁLISIS ──────────────────────────
    console.log('  ⬜ Productos 3, 4 y 5: SIN ANÁLISIS (vacíos)');

    // ─── 6. KIT DE MARCA ────────────────────────────────────────────────────
    await qr.query(
      `INSERT INTO marcas
         (id, usuario_id, producto_id, nombre, slogan, descripcion,
          paleta_colores, tipografia, brief_data, logo_analysis, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11)`,
      [
        uuidv4(), ownerId, prod1_id,
        MARCA_COMPLETA.nombre,
        MARCA_COMPLETA.slogan,
        MARCA_COMPLETA.descripcion,
        JSON.stringify(MARCA_COMPLETA.paleta_colores),
        MARCA_COMPLETA.tipografia,
        JSON.stringify(MARCA_COMPLETA.brief_data),
        JSON.stringify(MARCA_COMPLETA.logo_analysis),
        true,
      ]
    );
    console.log('  🎨 Kit de Marca: Studio V (completo con paleta, tipografía, brief y análisis de logo)');

    // ─── 7. HERRAMIENTAS SELECCIONADAS ──────────────────────────────────────
    const herramientas = ['pos', 'inventario', 'clientes', 'cotizaciones'];
    for (const key of herramientas) {
      await qr.query(
        `INSERT INTO herramientas_seleccionadas (id, usuario_id, herramienta_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (usuario_id, herramienta_key) DO NOTHING`,
        [uuidv4(), ownerId, key]
      );
    }
    console.log('  🔧 Herramientas: POS, Inventario, Clientes (CRM), Cotizaciones');

    // ─── 8. EQUIPO DE TRABAJO ───────────────────────────────────────────────
    const trabajadorHash = await bcrypt.hash('Equipo2024!', 12);

    // Trabajador 1: Diseñadora
    const trab1Email = 'sofia.ramos@studiov.mx';
    await qr.query(
      `INSERT INTO usuarios
         (id, email, password_hash, nombre, plan, account_role,
          owner_id, analisis_disponibles, creditos_marketing, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (email) DO NOTHING`,
      [
        uuidv4(), trab1Email, trabajadorHash,
        'Sofía Ramos', 'business', 'trabajador',
        ownerId, 0, 0, true,
      ]
    );
    const trab1Row = await qr.query(`SELECT id FROM usuarios WHERE email = $1`, [trab1Email]);
    const trab1Id: string = trab1Row[0].id;

    // Asignación: Sofía → Prod1 (Identidad Visual) con permisos de diseño
    await qr.query(
      `INSERT INTO asignaciones_trabajador
         (id, trabajador_id, cuenta_id, producto_id, permisos, activo)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (trabajador_id, producto_id) DO NOTHING`,
      [
        uuidv4(), trab1Id, ownerId, prod1_id,
        JSON.stringify({
          mercado: true,
          marketing: true,
          brief: true,
          finanzas: false,
          legal: false,
          pos: true,
          inventario: true,
          citas: true,
          clientes: true,
          cotizaciones: true,
          nomina: false,
          contabilidad: false,
        }),
        true,
      ]
    );
    // Sofía también ve Prod3 (Landing)
    await qr.query(
      `INSERT INTO asignaciones_trabajador
         (id, trabajador_id, cuenta_id, producto_id, permisos, activo)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (trabajador_id, producto_id) DO NOTHING`,
      [
        uuidv4(), trab1Id, ownerId, prod3_id,
        JSON.stringify({
          mercado: true,
          marketing: true,
          brief: true,
          finanzas: false,
          legal: false,
          pos: false,
          inventario: false,
          citas: false,
          clientes: false,
          cotizaciones: false,
          nomina: false,
          contabilidad: false,
        }),
        true,
      ]
    );
    console.log(`  🧑‍💼 Trabajadora: Sofía Ramos (${trab1Id}) → Prod 1 y Prod 3`);

    // Trabajador 2: Community Manager
    const trab2Email = 'diego.luna@studiov.mx';
    await qr.query(
      `INSERT INTO usuarios
         (id, email, password_hash, nombre, plan, account_role,
          owner_id, analisis_disponibles, creditos_marketing, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (email) DO NOTHING`,
      [
        uuidv4(), trab2Email, trabajadorHash,
        'Diego Luna', 'business', 'trabajador',
        ownerId, 0, 0, true,
      ]
    );
    const trab2Row = await qr.query(`SELECT id FROM usuarios WHERE email = $1`, [trab2Email]);
    const trab2Id: string = trab2Row[0].id;

    // Asignación: Diego → Prod2 (Consultoría Digital) con permisos de marketing
    await qr.query(
      `INSERT INTO asignaciones_trabajador
         (id, trabajador_id, cuenta_id, producto_id, permisos, activo)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (trabajador_id, producto_id) DO NOTHING`,
      [
        uuidv4(), trab2Id, ownerId, prod2_id,
        JSON.stringify({
          mercado: true,
          marketing: true,
          brief: true,
          finanzas: false,
          legal: false,
          pos: true,
          inventario: false,
          citas: true,
          clientes: true,
          cotizaciones: true,
          nomina: false,
          contabilidad: false,
        }),
        true,
      ]
    );
    console.log(`  🧑‍💼 Trabajador: Diego Luna (${trab2Id}) → Prod 2`);

    // ─── 9. EMPLEADOS (NÓMINA) ──────────────────────────────────────────────
    const empleados = [
      {
        nombre: 'Sofía Ramos García',
        cargo: 'Diseñadora Senior',
        salario: 22000,
        tipo_pago: 'quincenal',
        telefono: '+52 55 1234 5678',
        email: 'sofia.ramos@studiov.mx',
        fecha_inicio: '2024-03-15',
      },
      {
        nombre: 'Diego Luna Martínez',
        cargo: 'Community Manager',
        salario: 16000,
        tipo_pago: 'quincenal',
        telefono: '+52 55 8765 4321',
        email: 'diego.luna@studiov.mx',
        fecha_inicio: '2024-06-01',
      },
      {
        nombre: 'Andrea Molina Cruz',
        cargo: 'Asistente Administrativa',
        salario: 12000,
        tipo_pago: 'mensual',
        telefono: '+52 55 5555 1234',
        email: 'andrea.molina@studiov.mx',
        fecha_inicio: '2024-09-01',
      },
    ];

    for (const e of empleados) {
      await qr.query(
        `INSERT INTO empleados
           (id, usuario_id, nombre, cargo, salario, tipo_pago, moneda,
            telefono, email, fecha_inicio, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          uuidv4(), ownerId, e.nombre, e.cargo, e.salario, e.tipo_pago, 'MXN',
          e.telefono, e.email, e.fecha_inicio, true,
        ]
      );
      console.log(`  👷 Empleado: ${e.nombre} — ${e.cargo}`);
    }

    // ─── 10. CLIENTES (CRM) ─────────────────────────────────────────────────
    const clientes = [
      {
        nombre: 'María González',
        email: 'maria@tortasmex.com',
        telefono: '+52 55 1111 2222',
        empresa: 'Tortas Mexicanas SA',
        notas: 'Proyecto de branding completado en febrero. Pendiente: rediseño de menú.',
      },
      {
        nombre: 'Carlos Herrera',
        email: 'carlos@techstart.io',
        telefono: '+52 55 3333 4444',
        empresa: 'TechStart',
        notas: 'Interesado en identidad visual para su SaaS. Presupuesto aprobado para Q1 2025.',
      },
      {
        nombre: 'Lucía Fernández',
        email: 'lucia@cafeoriginmx.com',
        telefono: '+52 33 5555 6666',
        empresa: 'Café Origin MX',
        notas: 'Consultoría de posicionamiento en curso. Sesión de seguimiento programada.',
      },
    ];

    for (const c of clientes) {
      await qr.query(
        `INSERT INTO clientes
           (id, usuario_id, nombre, email, telefono, empresa, notas, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          uuidv4(), ownerId, c.nombre, c.email, c.telefono, c.empresa, c.notas, true,
        ]
      );
      console.log(`  🤝 Cliente: ${c.nombre} — ${c.empresa}`);
    }

    // ─── COMMIT ─────────────────────────────────────────────────────────────
    await qr.commitTransaction();

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 SEED COMPLETADO EXITOSAMENTE');
    console.log('═'.repeat(60));
    console.log('');
    console.log('┌─────────────────────────────────────────────────────┐');
    console.log('│  CREDENCIALES DE ACCESO                            │');
    console.log('├─────────────────────────────────────────────────────┤');
    console.log('│  👤 Owner (Valeria Torres)                         │');
    console.log('│     📧 valeria.torres@studiov.mx                   │');
    console.log('│     🔑 StudioV2024!                                │');
    console.log('│     💼 Plan: Business                              │');
    console.log('│                                                     │');
    console.log('│  🧑‍💼 Trabajadora (Sofía Ramos)                     │');
    console.log('│     📧 sofia.ramos@studiov.mx                      │');
    console.log('│     🔑 Equipo2024!                                 │');
    console.log('│     📦 Acceso: Prod 1 y Prod 3                     │');
    console.log('│                                                     │');
    console.log('│  🧑‍💼 Trabajador (Diego Luna)                       │');
    console.log('│     📧 diego.luna@studiov.mx                       │');
    console.log('│     🔑 Equipo2024!                                 │');
    console.log('│     📦 Acceso: Prod 2                              │');
    console.log('└─────────────────────────────────────────────────────┘');
    console.log('');
    console.log('📁 Negocios: Studio V Creativo | Sabor Artesanal');
    console.log('');
    console.log('📦 PRODUCTOS Y ESTADO DE ANÁLISIS:');
    console.log('  ✅ Paquete Identidad Visual Completa  → COMPLETO (5/5 módulos)');
    console.log('  ⏳ Consultoría Posicionamiento Digital → SEMI (2/5: Mercado + Marketing)');
    console.log('  ⬜ Diseño Sitio Web Landing            → VACÍO (0/5)');
    console.log('  ⬜ Caja Degustación Premium             → VACÍO (0/5)');
    console.log('  ⬜ Tableta Cacao Ceremonial 72%         → VACÍO (0/5)');
    console.log('');
    console.log('🎨 Kit de Marca: Studio V (paleta, tipografía, brief, logo analysis)');
    console.log('🔧 Herramientas: POS, Inventario, Clientes (CRM), Cotizaciones');
    console.log('👥 Equipo: 2 trabajadores + 3 empleados en nómina');
    console.log('🤝 Clientes CRM: 3 clientes registrados');
    console.log('');

  } catch (err) {
    await qr.rollbackTransaction();
    console.error('❌ Error en seed:', err);
    throw err;
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

seed().catch(console.error);
