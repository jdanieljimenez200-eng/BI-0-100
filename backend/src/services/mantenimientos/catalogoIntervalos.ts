import type { IntensidadUso, OrigenIntervalo } from '../../models/EquipoMantenimiento';

/**
 * Catálogo de «cada cuánto» por tipo de objeto.
 *
 * Es determinista y vive en el código a propósito: saber cada cuánto se le da
 * servicio a un refrigerador no necesita IA, y así el alta es instantánea,
 * gratis y consistente entre usuarios. La IA solo entra cuando el objeto no
 * está aquí (`services/mantenimientos/sugerenciaIaService.ts`).
 *
 * `intervalo_base_dias` corresponde a un uso NORMAL de negocio pequeño; la
 * intensidad lo ajusta: el refrigerador de una cocina que trabaja todo el día no
 * aguanta lo mismo que el de una oficina.
 *
 * Las notas son recomendaciones operativas, no obligaciones legales: si una
 * norma local o el fabricante exigen otra frecuencia, mandan ellos y el usuario
 * puede editar el intervalo a mano.
 */

export type CategoriaMantenimiento =
  | 'gas'
  | 'cocina'
  | 'frio'
  | 'clima'
  | 'agua'
  | 'energia'
  | 'herramienta'
  | 'higiene'
  | 'lavanderia'
  | 'vehiculo'
  | 'seguridad'
  | 'tecnologia';

export interface TipoMantenimiento {
  clave: string;
  label: string;
  emoji: string;
  categoria: CategoriaMantenimiento;
  /** Días entre servicios con uso normal. */
  intervalo_base_dias: number;
  /** Qué se hace en ese servicio, en una línea. */
  nota: string;
  /** Otras formas de nombrarlo (en minúsculas y sin acentos). */
  sinonimos: string[];
}

export const CATALOGO_MANTENIMIENTO: readonly TipoMantenimiento[] = [
  // ─── Gas ───────────────────────────────────────────────────────────────────
  {
    clave: 'tanque_gas_estacionario', label: 'Tanque de gas estacionario', emoji: '🛢️', categoria: 'gas',
    intervalo_base_dias: 365,
    nota: 'Revisión de fugas, válvula, regulador y manguera.',
    sinonimos: ['tanque de gas', 'tanque estacionario', 'gas estacionario', 'tanque', 'gas lp'],
  },
  {
    clave: 'cilindro_gas', label: 'Cilindro de gas portátil', emoji: '🔥', categoria: 'gas',
    intervalo_base_dias: 180,
    nota: 'Prueba de fugas con agua jabonosa; cambio de manguera y regulador si están resecos.',
    sinonimos: ['cilindro', 'cilindro de gas', 'tanque portatil', 'bombona'],
  },
  {
    clave: 'instalacion_gas', label: 'Instalación de gas', emoji: '🧯', categoria: 'gas',
    intervalo_base_dias: 365,
    nota: 'Revisión de tuberías, uniones y ventilación por un técnico certificado.',
    sinonimos: ['tuberia de gas', 'linea de gas', 'instalacion gas'],
  },

  // ─── Cocina ────────────────────────────────────────────────────────────────
  {
    clave: 'parrilla', label: 'Parrilla / plancha', emoji: '🍳', categoria: 'cocina',
    intervalo_base_dias: 30,
    nota: 'Limpieza profunda de quemadores, desengrase y revisión de perillas.',
    sinonimos: ['plancha', 'asador', 'comal', 'parrilla de gas', 'grill'],
  },
  {
    clave: 'freidora', label: 'Freidora', emoji: '🍟', categoria: 'cocina',
    intervalo_base_dias: 15,
    nota: 'Vaciado y filtrado de aceite, limpieza de resistencia y revisión del termostato.',
    sinonimos: ['freidor', 'freidora de papas'],
  },
  {
    clave: 'horno', label: 'Horno', emoji: '🥖', categoria: 'cocina',
    intervalo_base_dias: 90,
    nota: 'Calibración de temperatura, limpieza interior y revisión de empaques de la puerta.',
    sinonimos: ['horno de conveccion', 'horno industrial', 'horno de pizza'],
  },
  {
    clave: 'estufa', label: 'Estufa', emoji: '🔥', categoria: 'cocina',
    intervalo_base_dias: 60,
    nota: 'Limpieza de quemadores e inyectores y revisión de la flama (debe ser azul).',
    sinonimos: ['estufa industrial', 'hornilla', 'quemadores'],
  },
  {
    clave: 'campana_extractor', label: 'Campana / extractor', emoji: '💨', categoria: 'cocina',
    intervalo_base_dias: 60,
    nota: 'Desengrase de filtros y ducto: la grasa acumulada es el riesgo de incendio más común en cocinas.',
    sinonimos: ['extractor', 'campana', 'extraccion', 'filtro de grasa'],
  },
  {
    clave: 'microondas', label: 'Microondas', emoji: '📦', categoria: 'cocina',
    intervalo_base_dias: 180,
    nota: 'Limpieza interior y revisión del sello de la puerta.',
    sinonimos: ['micro', 'horno de microondas'],
  },
  {
    clave: 'licuadora_industrial', label: 'Licuadora industrial', emoji: '🥤', categoria: 'cocina',
    intervalo_base_dias: 90,
    nota: 'Revisión de cuchillas, retenes y carbones del motor.',
    sinonimos: ['licuadora', 'procesador de alimentos'],
  },
  {
    clave: 'batidora', label: 'Batidora / amasadora', emoji: '🎂', categoria: 'cocina',
    intervalo_base_dias: 120,
    nota: 'Engrase de la transmisión y revisión de bandas y aspas.',
    sinonimos: ['batidora industrial', 'mezcladora', 'amasadora', 'revolvedora'],
  },
  {
    clave: 'cafetera', label: 'Cafetera', emoji: '☕', categoria: 'cocina',
    intervalo_base_dias: 30,
    nota: 'Descalcificación y limpieza del grupo y las duchas.',
    sinonimos: ['cafetera espresso', 'maquina de cafe', 'expreso'],
  },
  {
    clave: 'plancha_sandwichera', label: 'Sandwichera / tostadora', emoji: '🥪', categoria: 'cocina',
    intervalo_base_dias: 60,
    nota: 'Desengrase de placas y revisión de resistencias.',
    sinonimos: ['sandwichera', 'tostador', 'waflera'],
  },
  {
    clave: 'lavatrastes', label: 'Lavavajillas', emoji: '🍽️', categoria: 'cocina',
    intervalo_base_dias: 120,
    nota: 'Descalcificación, limpieza de brazos aspersores y revisión del filtro.',
    sinonimos: ['lavavajillas', 'lavaloza', 'lavatrastos', 'maquina de lavar platos'],
  },

  // ─── Frío ──────────────────────────────────────────────────────────────────
  {
    clave: 'refrigerador', label: 'Refrigerador', emoji: '🧊', categoria: 'frio',
    intervalo_base_dias: 180,
    nota: 'Limpieza del condensador, revisión de empaques y de la temperatura real.',
    sinonimos: ['refri', 'nevera', 'heladera', 'frigorifico', 'refrigeracion'],
  },
  {
    clave: 'congelador', label: 'Congelador', emoji: '❄️', categoria: 'frio',
    intervalo_base_dias: 180,
    nota: 'Descongelado completo, limpieza del condensador y revisión de empaques.',
    sinonimos: ['freezer', 'congeladora', 'arcon'],
  },
  {
    clave: 'vitrina_refrigerada', label: 'Vitrina refrigerada', emoji: '🥗', categoria: 'frio',
    intervalo_base_dias: 120,
    nota: 'Limpieza del serpentín, revisión de ventiladores y del drenaje.',
    sinonimos: ['vitrina', 'exhibidor refrigerado', 'barra fria'],
  },
  {
    clave: 'cuarto_frio', label: 'Cuarto frío', emoji: '🏭', categoria: 'frio',
    intervalo_base_dias: 90,
    nota: 'Revisión de compresor, evaporador y sellos de puerta, con registro de temperatura.',
    sinonimos: ['camara fria', 'camara de refrigeracion', 'cuarto de refrigeracion'],
  },
  {
    clave: 'maquina_hielo', label: 'Máquina de hielo', emoji: '🧊', categoria: 'frio',
    intervalo_base_dias: 90,
    nota: 'Sanitización del depósito, limpieza del condensador y cambio del filtro de agua.',
    sinonimos: ['hielera', 'productora de hielo', 'fabricadora de hielo'],
  },

  // ─── Clima ─────────────────────────────────────────────────────────────────
  {
    clave: 'aire_acondicionado', label: 'Aire acondicionado', emoji: '🌬️', categoria: 'clima',
    intervalo_base_dias: 180,
    nota: 'Lavado de filtros y serpentines, revisión de gas y drenaje.',
    sinonimos: ['aire', 'clima', 'ac', 'aire acondicionado central'],
  },
  {
    clave: 'minisplit', label: 'Minisplit', emoji: '🌬️', categoria: 'clima',
    intervalo_base_dias: 180,
    nota: 'Lavado de filtros y evaporador, revisión de gas y de la manguera de drenaje.',
    sinonimos: ['mini split', 'split', 'inverter'],
  },
  {
    clave: 'ventilador_industrial', label: 'Ventilador industrial', emoji: '🪭', categoria: 'clima',
    intervalo_base_dias: 180,
    nota: 'Limpieza de aspas y engrase de baleros.',
    sinonimos: ['ventilador', 'abanico', 'extractor de aire'],
  },
  {
    clave: 'calefactor', label: 'Calefactor', emoji: '🔆', categoria: 'clima',
    intervalo_base_dias: 365,
    nota: 'Revisión antes de la temporada: resistencias, termostato y ventilación.',
    sinonimos: ['calefaccion', 'calentador de ambiente'],
  },

  // ─── Agua ──────────────────────────────────────────────────────────────────
  {
    clave: 'boiler', label: 'Boiler / calentador de agua', emoji: '🚿', categoria: 'agua',
    intervalo_base_dias: 365,
    nota: 'Purga de sedimentos y revisión del ánodo, el piloto o la resistencia.',
    sinonimos: ['calentador de agua', 'calentador', 'termo', 'calefon'],
  },
  {
    clave: 'bomba_agua', label: 'Bomba de agua', emoji: '💧', categoria: 'agua',
    intervalo_base_dias: 180,
    nota: 'Revisión de presión, sellos y capacitor.',
    sinonimos: ['bomba', 'hidroneumatico', 'presurizador'],
  },
  {
    clave: 'cisterna_tinaco', label: 'Cisterna / tinaco', emoji: '🪣', categoria: 'agua',
    intervalo_base_dias: 180,
    nota: 'Lavado y desinfección del depósito y revisión de tapa y flotador.',
    sinonimos: ['tinaco', 'cisterna', 'deposito de agua', 'aljibe'],
  },
  {
    clave: 'filtro_agua', label: 'Filtro / purificador de agua', emoji: '🚰', categoria: 'agua',
    intervalo_base_dias: 90,
    nota: 'Cambio de cartucho y revisión de fugas.',
    sinonimos: ['filtro', 'purificador de agua', 'osmosis'],
  },
  {
    clave: 'trampa_grasa', label: 'Trampa de grasa', emoji: '🛁', categoria: 'agua',
    intervalo_base_dias: 30,
    nota: 'Vaciado y limpieza: si se satura, se tapa el drenaje de toda la cocina.',
    sinonimos: ['trampa de grasas', 'registro de grasa'],
  },

  // ─── Energía ───────────────────────────────────────────────────────────────
  {
    clave: 'instalacion_electrica', label: 'Instalación eléctrica', emoji: '⚡', categoria: 'energia',
    intervalo_base_dias: 365,
    nota: 'Revisión del tablero, apriete de conexiones y prueba de tierra física.',
    sinonimos: ['electricidad', 'tablero electrico', 'centro de carga', 'cableado'],
  },
  {
    clave: 'planta_electrica', label: 'Planta de luz / generador', emoji: '🔌', categoria: 'energia',
    intervalo_base_dias: 180,
    nota: 'Cambio de aceite y filtros y prueba de arranque con carga.',
    sinonimos: ['generador', 'planta de luz', 'motogenerador'],
  },
  {
    clave: 'no_break', label: 'No-break / UPS', emoji: '🔋', categoria: 'energia',
    intervalo_base_dias: 365,
    nota: 'Prueba de respaldo y revisión del estado de la batería.',
    sinonimos: ['ups', 'nobreak', 'respaldo de energia'],
  },
  {
    clave: 'compresor', label: 'Compresor de aire', emoji: '🛠️', categoria: 'energia',
    intervalo_base_dias: 180,
    nota: 'Purga del tanque, cambio de aceite y revisión de mangueras.',
    sinonimos: ['compresora', 'compresor de aire'],
  },
  {
    clave: 'paneles_solares', label: 'Paneles solares', emoji: '☀️', categoria: 'energia',
    intervalo_base_dias: 180,
    nota: 'Lavado de paneles y revisión del inversor y sus conexiones.',
    sinonimos: ['panel solar', 'fotovoltaico', 'solar'],
  },

  // ─── Herramienta y equipo de trabajo ───────────────────────────────────────
  {
    clave: 'tijeras', label: 'Tijeras profesionales', emoji: '✂️', categoria: 'herramienta',
    intervalo_base_dias: 90,
    nota: 'Afilado, ajuste de tensión y lubricación del tornillo.',
    sinonimos: ['tijera', 'tijeras de corte', 'tijeras de peluqueria'],
  },
  {
    clave: 'maquina_corte_pelo', label: 'Máquina de corte de pelo', emoji: '💈', categoria: 'herramienta',
    intervalo_base_dias: 60,
    nota: 'Afilado o cambio de cuchillas, limpieza y aceitado.',
    sinonimos: ['maquina de cortar pelo', 'clipper', 'rasuradora', 'patillera'],
  },
  {
    clave: 'cuchillos', label: 'Cuchillos / navajas', emoji: '🔪', categoria: 'herramienta',
    intervalo_base_dias: 30,
    nota: 'Afilado y revisión del mango.',
    sinonimos: ['cuchillo', 'navaja', 'navajas', 'chaira'],
  },
  {
    clave: 'herramienta_electrica', label: 'Herramienta eléctrica', emoji: '🔧', categoria: 'herramienta',
    intervalo_base_dias: 180,
    nota: 'Limpieza y revisión de carbones, cable y baterías.',
    sinonimos: ['taladro', 'esmeriladora', 'sierra', 'pulidora', 'rotomartillo'],
  },
  {
    clave: 'maquina_coser', label: 'Máquina de coser', emoji: '🧵', categoria: 'herramienta',
    intervalo_base_dias: 120,
    nota: 'Limpieza de pelusa, aceitado y ajuste de tensión.',
    sinonimos: ['coser', 'overlock', 'recta', 'maquina de costura'],
  },

  // ─── Higiene y salud ───────────────────────────────────────────────────────
  {
    clave: 'autoclave', label: 'Autoclave / esterilizador', emoji: '🧪', categoria: 'higiene',
    intervalo_base_dias: 180,
    nota: 'Validación del ciclo, revisión de empaques y limpieza de la cámara.',
    sinonimos: ['esterilizador', 'autoclave dental'],
  },
  {
    clave: 'sillon_hidraulico', label: 'Sillón hidráulico', emoji: '💺', categoria: 'higiene',
    intervalo_base_dias: 365,
    nota: 'Revisión del pistón hidráulico, engrase y apriete de tornillería.',
    sinonimos: ['silla hidraulica', 'sillon de barberia', 'sillon dental'],
  },
  {
    clave: 'secadora_cabello', label: 'Secadora de cabello', emoji: '💇', categoria: 'higiene',
    intervalo_base_dias: 180,
    nota: 'Limpieza del filtro trasero y revisión del cable.',
    sinonimos: ['secadora de pelo', 'secador'],
  },

  // ─── Lavandería ────────────────────────────────────────────────────────────
  {
    clave: 'lavadora', label: 'Lavadora', emoji: '🧺', categoria: 'lavanderia',
    intervalo_base_dias: 180,
    nota: 'Limpieza de filtros, revisión de mangueras y descalcificación del tambor.',
    sinonimos: ['lavadora industrial', 'maquina de lavar'],
  },
  {
    clave: 'secadora_ropa', label: 'Secadora de ropa', emoji: '🌀', categoria: 'lavanderia',
    intervalo_base_dias: 180,
    nota: 'Limpieza del ducto y del filtro de pelusa: es la causa más común de incendio en lavanderías.',
    sinonimos: ['secadora', 'secadora industrial'],
  },

  // ─── Vehículos ─────────────────────────────────────────────────────────────
  {
    clave: 'vehiculo_reparto', label: 'Vehículo de reparto', emoji: '🚚', categoria: 'vehiculo',
    intervalo_base_dias: 90,
    nota: 'Servicio de aceite y filtros, frenos y llantas.',
    sinonimos: ['camioneta', 'auto', 'coche', 'carro', 'van', 'vehiculo'],
  },
  {
    clave: 'motocicleta', label: 'Motocicleta de reparto', emoji: '🛵', categoria: 'vehiculo',
    intervalo_base_dias: 60,
    nota: 'Cambio de aceite, ajuste de cadena y revisión de frenos.',
    sinonimos: ['moto', 'scooter', 'motoneta'],
  },

  // ─── Seguridad ─────────────────────────────────────────────────────────────
  {
    clave: 'extintor', label: 'Extintor', emoji: '🧯', categoria: 'seguridad',
    intervalo_base_dias: 365,
    nota: 'Verificación de carga y presión; recarga cuando corresponda.',
    sinonimos: ['extinguidor', 'extintores'],
  },
  {
    clave: 'camaras_seguridad', label: 'Cámaras / alarma', emoji: '📹', categoria: 'seguridad',
    intervalo_base_dias: 180,
    nota: 'Limpieza de lentes y revisión de la grabación y el espacio en disco.',
    sinonimos: ['camara', 'cctv', 'alarma', 'videovigilancia'],
  },
  {
    clave: 'botiquin', label: 'Botiquín', emoji: '🩹', categoria: 'seguridad',
    intervalo_base_dias: 180,
    nota: 'Revisión de caducidades y reposición de material.',
    sinonimos: ['primeros auxilios', 'botiquin de emergencia'],
  },
  {
    clave: 'cortina_metalica', label: 'Cortina metálica / puerta', emoji: '🚪', categoria: 'seguridad',
    intervalo_base_dias: 180,
    nota: 'Engrase de rieles y revisión de resortes y chapa.',
    sinonimos: ['cortina', 'puerta automatica', 'porton'],
  },

  // ─── Tecnología ────────────────────────────────────────────────────────────
  {
    clave: 'computadora', label: 'Computadora / punto de venta', emoji: '💻', categoria: 'tecnologia',
    intervalo_base_dias: 365,
    nota: 'Limpieza interna, respaldo de datos y actualización del sistema.',
    sinonimos: ['pc', 'laptop', 'caja registradora', 'computadora punto de venta'],
  },
  {
    clave: 'impresora_tickets', label: 'Impresora de tickets', emoji: '🧾', categoria: 'tecnologia',
    intervalo_base_dias: 180,
    nota: 'Limpieza del cabezal y del sensor de papel.',
    sinonimos: ['impresora', 'miniprinter', 'impresora termica'],
  },
  {
    clave: 'bascula', label: 'Báscula', emoji: '⚖️', categoria: 'tecnologia',
    intervalo_base_dias: 365,
    nota: 'Calibración con pesa patrón y limpieza del plato.',
    sinonimos: ['balanza', 'pesa', 'basculas'],
  },
];

/** Intervalo por defecto de lo que no está en el catálogo. */
export const INTERVALO_GENERICO_DIAS = 180;

/** Cuánto acorta o alarga el intervalo la intensidad de uso. */
export const FACTOR_INTENSIDAD: Record<IntensidadUso, number> = {
  bajo: 1.35,
  normal: 1,
  intenso: 0.7,
};

export const INTENSIDADES: readonly { valor: IntensidadUso; label: string; ayuda: string }[] = [
  { valor: 'bajo', label: 'Poco uso', ayuda: 'Se usa de vez en cuando o solo en temporada.' },
  { valor: 'normal', label: 'Uso normal', ayuda: 'Se usa la jornada habitual del negocio.' },
  { valor: 'intenso', label: 'Uso intenso', ayuda: 'Trabaja todo el día o varios turnos.' },
];

export interface Sugerencia {
  clave: string;
  label: string;
  emoji: string;
  intervalo_dias: number;
  intervalo_base_dias: number;
  origen: OrigenIntervalo;
  nota: string;
}

/** Minúsculas, sin acentos y sin espacios de más: así «Refrí» encuentra «refri». */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const POR_CLAVE = new Map(CATALOGO_MANTENIMIENTO.map((t) => [t.clave, t]));

export function tipoPorClave(clave: string): TipoMantenimiento | null {
  return POR_CLAVE.get(clave) ?? null;
}

/**
 * Busca el tipo por clave exacta o por texto libre. El texto acierta si coincide
 * con el nombre o con un sinónimo, o si alguno aparece como palabra dentro de lo
 * que escribió el usuario («refrigerador de la cocina» → refrigerador).
 */
export function buscarTipo(entrada: { clave?: string | null; texto?: string | null }): TipoMantenimiento | null {
  if (entrada.clave) {
    const porClave = POR_CLAVE.get(entrada.clave);
    if (porClave) return porClave;
  }
  const texto = normalizar(entrada.texto ?? '');
  if (!texto) return null;

  let mejor: { tipo: TipoMantenimiento; largo: number } | null = null;
  for (const tipo of CATALOGO_MANTENIMIENTO) {
    const candidatos = [normalizar(tipo.label), tipo.clave.replace(/_/g, ' '), ...tipo.sinonimos.map(normalizar)];
    for (const candidato of candidatos) {
      if (!candidato) continue;
      const coincide = texto === candidato || new RegExp(`(^|\\s)${candidato}(\\s|$)`).test(texto);
      // Gana la coincidencia más larga: «máquina de hielo» antes que «máquina».
      if (coincide && (!mejor || candidato.length > mejor.largo)) {
        mejor = { tipo, largo: candidato.length };
      }
    }
  }
  return mejor?.tipo ?? null;
}

/** Redondea a algo que una persona diría: días exactos abajo, múltiplos de 5 arriba. */
export function redondearIntervalo(dias: number): number {
  const acotado = Math.min(3650, Math.max(7, Math.round(dias)));
  return acotado <= 30 ? acotado : Math.round(acotado / 5) * 5;
}

export function aplicarIntensidad(baseDias: number, intensidad: IntensidadUso): number {
  return redondearIntervalo(baseDias * (FACTOR_INTENSIDAD[intensidad] ?? 1));
}

/**
 * Intervalo sugerido para un objeto. `null` si no se reconoce: ahí es donde la
 * pantalla ofrece estimarlo con IA (1 crédito) o escribirlo a mano.
 */
export function sugerirIntervalo(entrada: {
  clave?: string | null;
  texto?: string | null;
  intensidad?: IntensidadUso;
}): Sugerencia | null {
  const tipo = buscarTipo(entrada);
  if (!tipo) return null;
  const intensidad = entrada.intensidad ?? 'normal';
  return {
    clave: tipo.clave,
    label: tipo.label,
    emoji: tipo.emoji,
    intervalo_base_dias: tipo.intervalo_base_dias,
    intervalo_dias: aplicarIntensidad(tipo.intervalo_base_dias, intensidad),
    origen: 'catalogo',
    nota: tipo.nota,
  };
}

// ─── Semáforo ────────────────────────────────────────────────────────────────

export type EstadoMantenimiento = 'sin_registro' | 'al_dia' | 'proximo' | 'vencido';

export interface EstadoCalculado {
  estado: EstadoMantenimiento;
  /** Fecha del próximo servicio (ISO corto). Null si nunca se registró uno. */
  proximo_en: string | null;
  /** Días que faltan; negativo = días de retraso. Null sin registro. */
  dias_restantes: number | null;
}

/** Fecha ISO corta en UTC: evita el desfase de un día al usar la hora local. */
export function aISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function sumarDias(fechaISO: string, dias: number): string {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return aISO(new Date(Date.UTC(anio, (mes ?? 1) - 1, (dia ?? 1) + dias)));
}

export function diasEntre(desdeISO: string, hastaISO: string): number {
  const ms = Date.parse(`${hastaISO}T00:00:00Z`) - Date.parse(`${desdeISO}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Se avisa con un 15 % del intervalo de anticipación, nunca menos de 3 días. */
export function diasDeAviso(intervaloDias: number): number {
  return Math.max(3, Math.round(intervaloDias * 0.15));
}

export function estadoEquipo(
  equipo: { fecha_ultimo: string | null; intervalo_dias: number },
  hoyISO: string = aISO(new Date())
): EstadoCalculado {
  if (!equipo.fecha_ultimo) {
    return { estado: 'sin_registro', proximo_en: null, dias_restantes: null };
  }
  const proximo = sumarDias(equipo.fecha_ultimo, equipo.intervalo_dias);
  const restantes = diasEntre(hoyISO, proximo);
  const estado: EstadoMantenimiento =
    restantes < 0 ? 'vencido' : restantes <= diasDeAviso(equipo.intervalo_dias) ? 'proximo' : 'al_dia';
  return { estado, proximo_en: proximo, dias_restantes: restantes };
}
