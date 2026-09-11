/**
 * googleLocalService.ts
 * Busca competidores locales de SERVICIOS en Google Maps / búsqueda local.
 * Para servicios: usa SerpAPI engine=google_maps si está disponible.
 * Si no hay SerpAPI: genera un mock inteligente basado en benchmarks por sector de servicio.
 */

import { CompetenciaResult, Competidor } from './types';
import { getPaisInfo } from '../../utils/latam';

// ─── Benchmarks por categoría de servicio ─────────────────────────────────────
// Competidores típicos, rango de precios, y fortalezas/debilidades comunes
// basados en el mercado mexicano de servicios

interface SectorBenchmark {
  nombres: string[];        // Nombres genéricos de competidores por sector
  precio_mult: [number, number]; // Multiplicador sobre el precio del usuario [min, max]
  fortalezas_comunes: string[];
  debilidades_comunes: string[];
  n_competidores_local: [number, number]; // Rango típico de competidores [min, max]
  n_competidores_nacional: [number, number];
  gap_frecuente: string | null;
}

const BENCHMARKS_SERVICIO: Record<string, SectorBenchmark> = {
  'servicios profesionales': {
    nombres: ['ConsultoraMX', 'AsesoresEmpresariales', 'ProServicios', 'ExpertiseMX', 'SolucionesB2B', 'GestoríaLocal'],
    precio_mult: [0.65, 1.35],
    fortalezas_comunes: ['Experiencia establecida', 'Red de contactos', 'Reconocimiento local'],
    debilidades_comunes: ['Sin presencia digital', 'Sin especialización en nicho', 'Atención impersonal'],
    n_competidores_local: [3, 8],
    n_competidores_nacional: [15, 40],
    gap_frecuente: 'Pocos competidores ofrecen servicio digitalizado con seguimiento en línea',
  },
  'educación y cursos': {
    nombres: ['AcademiaLocal', 'CentroCapacitación', 'InstitutoMX', 'EduPro', 'AprendeYa', 'ClasesExpert'],
    precio_mult: [0.70, 1.30],
    fortalezas_comunes: ['Trayectoria reconocida', 'Instalaciones físicas', 'Certificaciones'],
    debilidades_comunes: ['Sin modalidad en línea', 'Grupos grandes, poca personalización', 'Sin seguimiento post-curso'],
    n_competidores_local: [4, 10],
    n_competidores_nacional: [20, 80],
    gap_frecuente: 'Falta de cursos especializados con mentoría 1:1 en la región',
  },
  'salud y belleza': {
    nombres: ['SalonPremium', 'EstéticaLocal', 'SpaMX', 'BellezaExpress', 'CentroEstético', 'GlamourStudio'],
    precio_mult: [0.60, 1.50],
    fortalezas_comunes: ['Clientela fija establecida', 'Ubicación céntrica', 'Personal con experiencia'],
    debilidades_comunes: ['Sin reservas en línea', 'Sin programa de lealtad', 'Horarios limitados'],
    n_competidores_local: [5, 15],
    n_competidores_nacional: [30, 100],
    gap_frecuente: 'Sin opciones de reserva digital ni atención a domicilio en la zona',
  },
  'deportes y fitness': {
    nombres: ['GimnadioFit', 'SportCenter', 'FitnessMX', 'EntrenadorPro', 'ZonaActiva', 'PowerGym'],
    precio_mult: [0.65, 1.40],
    fortalezas_comunes: ['Equipamiento completo', 'Clases grupales', 'Ubicación accesible'],
    debilidades_comunes: ['Sin entrenamiento personalizado', 'Sin app de seguimiento', 'Contratos inflexibles'],
    n_competidores_local: [3, 9],
    n_competidores_nacional: [20, 60],
    gap_frecuente: 'Escasez de entrenamientos personalizados con seguimiento nutricional integrado',
  },
  'arte y manualidades': {
    nombres: ['TallerCreativo', 'ArteMX', 'EstudioArtístico', 'CreativeSpace', 'ManualidadesPlus', 'TallerDelArte'],
    precio_mult: [0.70, 1.30],
    fortalezas_comunes: ['Ambiente creativo consolidado', 'Base de estudiantes fija'],
    debilidades_comunes: ['Sin modalidad virtual', 'Poca difusión digital', 'Materiales no incluidos'],
    n_competidores_local: [2, 6],
    n_competidores_nacional: [10, 30],
    gap_frecuente: `Sin talleres que incluyan materiales + comunidad de práctica digital`,
  },
  'hogar y decoración': {
    nombres: ['RemodelaciónPro', 'InterioresMX', 'CasaBella', 'DecoradorLocal', 'ServiciosHogar', 'ArquitectoMX'],
    precio_mult: [0.60, 1.60],
    fortalezas_comunes: ['Cartera de clientes', 'Proveedores establecidos', 'Portafolio de proyectos'],
    debilidades_comunes: ['Sin presupuestos digitales', 'Tiempos de entrega variables', 'Sin garantía post-servicio'],
    n_competidores_local: [4, 12],
    n_competidores_nacional: [25, 70],
    gap_frecuente: 'Falta de servicio con visualización 3D digital y garantía escrita de entregables',
  },
  'mascotas': {
    nombres: ['VeterinariaLocal', 'PetCareMax', 'ClínicaVet', 'AnimalPro', 'PetHotel', 'GuauYMiau'],
    precio_mult: [0.70, 1.30],
    fortalezas_comunes: ['Confianza del cliente', 'Equipamiento médico', 'Urgencias disponibles'],
    debilidades_comunes: ['Sin app de citas', 'Sin servicio a domicilio', 'Lista de espera larga'],
    n_competidores_local: [3, 8],
    n_competidores_nacional: [20, 50],
    gap_frecuente: 'Sin servicio integral: veterinaria + grooming + hospedaje en un solo lugar',
  },
  'automotriz': {
    nombres: ['TallerMecánico', 'AutoServicioMX', 'MecánicaExpress', 'AutoCarePro', 'ServicioCar', 'TallerMulti'],
    precio_mult: [0.65, 1.35],
    fortalezas_comunes: ['Equipo técnico calificado', 'Refacciones disponibles', 'Clientela recurrente'],
    debilidades_comunes: ['Sin presupuesto digital previo', 'Sin rastreo de estado del vehículo', 'Horarios limitados'],
    n_competidores_local: [4, 12],
    n_competidores_nacional: [20, 60],
    gap_frecuente: 'Sin diagnóstico digital previo ni estatus de reparación en tiempo real',
  },
  'otro': {
    nombres: ['ServicioLocal1', 'Proveedor2', 'ExpertoEnTema', 'SolucionMX', 'ServicePro', 'LocalBusiness'],
    precio_mult: [0.70, 1.30],
    fortalezas_comunes: ['Experiencia en el sector', 'Red de referidos'],
    debilidades_comunes: ['Sin digitalización', 'Poca diferenciación'],
    n_competidores_local: [3, 8],
    n_competidores_nacional: [15, 40],
    gap_frecuente: null,
  },
};

// ─── Hash determinista ─────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ─── Mock inteligente para servicios ─────────────────────────────────────────

function mockServicioLocal(
  palabraClave: string,
  categoria: string,
  scope: 'local' | 'nacional',
  precio: number,
  estado?: string,
  pais?: string | null
): CompetenciaResult {
  const catKey = categoria.toLowerCase();
  const bench = BENCHMARKS_SERVICIO[catKey] ?? BENCHMARKS_SERVICIO['otro'];
  const seed = hashStr(palabraClave);
  // Sin datos reales no inventamos ciudades de otro país.
  const nombrePais = getPaisInfo(pais).nombre;

  const [nMin, nMax] = scope === 'local' ? bench.n_competidores_local : bench.n_competidores_nacional;
  const n = nMin + (seed % (nMax - nMin + 1));

  const competidores: Competidor[] = Array.from({ length: Math.min(n, 8) }, (_, i) => {
    const nameSeed = hashStr(palabraClave + i);
    const [multMin, multMax] = bench.precio_mult;
    const precioComp = Math.round(precio * (multMin + (nameSeed % 100) / 100 * (multMax - multMin)));
    const rating = parseFloat((3.5 + (nameSeed % 15) / 10).toFixed(1));
    const resenas = 5 + (nameSeed % 200);

    return {
      ranking:         i + 1,
      nombre:          bench.nombres[nameSeed % bench.nombres.length] + (i > 0 ? ` ${i + 1}` : ''),
      url:             '',
      ubicacion:       scope === 'local' ? (estado ?? 'Local') : nombrePais,
      distancia_km:    scope === 'local' ? 1 + (nameSeed % 20) : null,
      precio_minimo:   Math.round(precioComp * 0.85),
      precio_maximo:   Math.round(precioComp * 1.15),
      precio_promedio: precioComp,
      rating,
      numero_resenas:  resenas,
      fortalezas:      bench.fortalezas_comunes.slice(0, 1 + (nameSeed % 2)),
      debilidades:     bench.debilidades_comunes.slice(0, 1 + (nameSeed % 2)),
      tiempo_en_mercado: `${1 + (nameSeed % 7)} años`,
      fuente:          'benchmark_sector',
    };
  });

  const precios = competidores.map(c => c.precio_promedio);
  const precioPromedio = Math.round(precios.reduce((a, b) => a + b, 0) / precios.length);

  return {
    total_competidores: n,
    competidores,
    gap_detectado: bench.gap_frecuente,
    precio_mercado_promedio: precioPromedio,
    es_mock: true,
  };
}

// ─── SerpAPI Google Maps (para servicios locales con API key) ─────────────────

async function serpApiGoogleMaps(
  palabraClave: string,
  scope: 'local' | 'nacional',
  precio: number,
  estado?: string,
  pais?: string | null
): Promise<CompetenciaResult> {
  const codigo = (pais ?? 'MX').trim().toUpperCase();
  const gl = /^[A-Z]{2}$/.test(codigo) ? codigo.toLowerCase() : 'mx';
  const hl = gl === 'br' ? 'pt' : 'es';
  const nombrePais = getPaisInfo(pais).nombre;
  const ubicacion = scope === 'local' && estado ? `${estado}, ${nombrePais}` : nombrePais;
  const url = [
    `https://serpapi.com/search.json`,
    `?engine=google_maps`,
    `&q=${encodeURIComponent(palabraClave)}`,
    `&location=${encodeURIComponent(ubicacion)}`,
    `&hl=${hl}`,
    `&gl=${gl}`,
    `&type=search`,
    `&api_key=${process.env.SERPAPI_KEY}`,
  ].join('');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpAPI Maps error: ${res.status}`);

  const data = await res.json() as {
    local_results?: {
      title: string;
      address?: string;
      rating?: number;
      reviews?: number;
      price?: string;
      website?: string;
      phone?: string;
    }[];
  };

  const results = (data.local_results ?? []).slice(0, 8);
  if (results.length === 0) throw new Error('Sin resultados en Google Maps');

  const competidores: Competidor[] = results.map((r, i) => {
    // Google Maps rara vez expone precio. Lo derivamos SOLO si viene en la
    // respuesta (símbolos "$" o número explícito); si no, queda en 0 (desconocido)
    // y se excluye del promedio. Nunca se inventa con azar.
    let precioEst = 0;
    if (r.price) {
      const dollarSigns = (r.price.match(/\$/g) ?? []).length;
      if (dollarSigns === 1) precioEst = precio * 0.7;
      else if (dollarSigns === 2) precioEst = precio * 1.0;
      else if (dollarSigns >= 3) precioEst = precio * 1.5;
      const numMatch = r.price.match(/[\d,.]+/);
      if (numMatch) precioEst = parseFloat(numMatch[0].replace(',', ''));
    }
    const tienePrecioReal = Number.isFinite(precioEst) && precioEst > 0;

    return {
      ranking:         i + 1,
      nombre:          r.title,
      url:             r.website ?? '',
      ubicacion:       r.address ?? (scope === 'local' ? estado ?? 'Local' : nombrePais),
      distancia_km:    null,
      precio_minimo:   tienePrecioReal ? Math.round(precioEst * 0.85) : 0,
      precio_maximo:   tienePrecioReal ? Math.round(precioEst * 1.15) : 0,
      precio_promedio: tienePrecioReal ? Math.round(precioEst) : 0,
      rating:          r.rating ?? 4.0,
      numero_resenas:  r.reviews ?? 0,
      fortalezas:      ['Presencia en Google Maps', r.rating && r.rating >= 4.5 ? 'Excelente calificación' : 'Calificación positiva'].filter(Boolean) as string[],
      debilidades:     [],
      tiempo_en_mercado: 'Desconocido',
      fuente:          'google_maps',
    };
  });

  const precios = competidores.map(c => c.precio_promedio).filter(p => p > 0);
  // Sin precios reales → 0 (neutro en scorePrecioRelativo) en vez de asumir el
  // precio del propio usuario como referencia de mercado.
  const precioPromedio = precios.length
    ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length)
    : 0;

  const avgRating = results.reduce((s, r) => s + (r.rating ?? 4), 0) / results.length;

  return {
    total_competidores: competidores.length,
    competidores,
    gap_detectado: competidores.length <= 3
      ? `Solo ${competidores.length} competidores en Google Maps — alta oportunidad de posicionamiento local`
      : avgRating < 4.0
        ? 'Calificación promedio de competidores baja (< 4⭐) — oportunidad de diferenciación por calidad de servicio'
        : null,
    precio_mercado_promedio: precioPromedio,
    es_mock: false,
  };
}

// ─── Export principal ─────────────────────────────────────────────────────────

export async function obtenerCompetenciaServicio(
  palabraClave: string,
  categoria: string,
  scope: 'local' | 'nacional',
  precio: number,
  estado?: string,
  pais?: string | null
): Promise<CompetenciaResult> {
  // Si hay SerpAPI, usar Google Maps (datos reales de negocios locales)
  if (process.env.SERPAPI_KEY) {
    try {
      return await serpApiGoogleMaps(palabraClave, scope, precio, estado, pais);
    } catch (err) {
      console.warn('SerpAPI Google Maps falló, usando benchmark de sector:', err);
    }
  }
  // Sin SerpAPI: mock inteligente basado en benchmarks reales del sector
  return mockServicioLocal(palabraClave, categoria, scope, precio, estado, pais);
}
