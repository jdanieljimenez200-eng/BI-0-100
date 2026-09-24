// Shared geographic and country data for the LATAM expansion.
// Single source of truth for country metadata, currencies, regions, seasonal events, and NSE context.

export interface PaisInfo {
  nombre: string;
  moneda: string;
  simbolo: string;
  poblacion: number;
}

export const PAIS_LATAM: Record<string, PaisInfo> = {
  MX: { nombre: 'México',       moneda: 'MXN', simbolo: '$',   poblacion: 130_000_000 },
  GT: { nombre: 'Guatemala',    moneda: 'GTQ', simbolo: 'Q',   poblacion: 17_600_000 },
  BZ: { nombre: 'Belice',       moneda: 'BZD', simbolo: 'BZ$', poblacion:    441_000 },
  HN: { nombre: 'Honduras',     moneda: 'HNL', simbolo: 'L',   poblacion: 10_300_000 },
  SV: { nombre: 'El Salvador',  moneda: 'USD', simbolo: '$',   poblacion:  6_500_000 },
  NI: { nombre: 'Nicaragua',    moneda: 'NIO', simbolo: 'C$',  poblacion:  6_700_000 },
  CR: { nombre: 'Costa Rica',   moneda: 'CRC', simbolo: '₡',   poblacion:  5_200_000 },
  PA: { nombre: 'Panamá',       moneda: 'USD', simbolo: '$',   poblacion:  4_400_000 },
  CO: { nombre: 'Colombia',     moneda: 'COP', simbolo: '$',   poblacion: 52_000_000 },
  VE: { nombre: 'Venezuela',    moneda: 'VES', simbolo: 'Bs.', poblacion: 28_000_000 },
  EC: { nombre: 'Ecuador',      moneda: 'USD', simbolo: '$',   poblacion: 18_000_000 },
  PE: { nombre: 'Perú',         moneda: 'PEN', simbolo: 'S/',  poblacion: 33_000_000 },
  BO: { nombre: 'Bolivia',      moneda: 'BOB', simbolo: 'Bs',  poblacion: 12_000_000 },
  CL: { nombre: 'Chile',        moneda: 'CLP', simbolo: '$',   poblacion: 19_000_000 },
  AR: { nombre: 'Argentina',    moneda: 'ARS', simbolo: '$',   poblacion: 45_000_000 },
  UY: { nombre: 'Uruguay',      moneda: 'UYU', simbolo: '$U',  poblacion:  3_500_000 },
  PY: { nombre: 'Paraguay',     moneda: 'PYG', simbolo: '₲',   poblacion:  7_500_000 },
  BR: { nombre: 'Brasil',       moneda: 'BRL', simbolo: 'R$',  poblacion: 215_000_000 },
};

export function getPaisInfo(codigo?: string | null): PaisInfo {
  if (!codigo) return PAIS_LATAM.MX;
  return PAIS_LATAM[codigo.toUpperCase()] ?? PAIS_LATAM.MX;
}

export function getPaisNombre(codigo?: string | null): string {
  return getPaisInfo(codigo).nombre;
}

export function getMoneda(codigo?: string | null): string {
  return getPaisInfo(codigo).moneda;
}

// ─── Seasonal commercial events per country ──────────────────────────────────

export const EVENTOS_COMERCIALES: Record<string, string> = {
  MX: 'Buen Fin (nov), Hot Sale (may-jun), Día de las Madres (10 mayo), Día de Muertos (nov 1-2), Fiestas Patrias (15-16 sep), Navidad/Posadas (dic), Reyes Magos (6 ene), San Valentín (14 feb)',
  GT: 'Semana Santa (variable), Independencia (15 sep), Navidad (dic), San Valentín (14 feb)',
  BZ: 'Easter/Semana Santa, Independence Day (21 sep), Christmas (dic)',
  HN: 'Semana Santa, Día de las Madres (10 ene), Independencia (15 sep), Navidad (dic)',
  SV: 'Semana Santa, Fiestas Agostinas (1-6 ago), Independencia (15 sep), Navidad (dic)',
  NI: 'Semana Santa, Independencia (15 sep), Purísima Concepción (8 dic), Navidad (dic)',
  CR: 'Semana Santa, Día Independencia (15 sep), Fiestas de San José (26 dic-1 ene), Navidad (dic)',
  PA: 'Carnaval (4 días pre-Cuaresma), Semana Santa, Independencia (28 nov), Navidad (dic)',
  CO: 'Amor y Amistad (3er sáb sep), Día de las Madres (2do dom mayo), Navidad (dic), Semana Santa, Día del Niño (30 abr)',
  VE: 'Carnaval (feb), Semana Santa, Día de las Madres (2do dom mayo), Navidad (dic)',
  EC: 'Carnaval (feb), Semana Santa, Día de la Madre (mayo), Navidad (dic), Fiestas de Quito (6 dic)',
  PE: 'Día de las Madres (2do dom mayo), Fiestas Patrias (28-29 jul), Navidad (dic), Semana Santa',
  BO: 'Carnaval de Oruro (feb), Semana Santa, Día de las Madres (27 mayo), Independencia (6 ago)',
  CL: 'CyberMonday Chile (oct y jun), Día de las Madres (2do dom mayo), Fiestas Patrias (18-19 sep), Navidad (dic)',
  AR: 'CiberMonday (oct-nov), Día de las Madres (3er dom oct), Día del Padre (3er dom jun), Navidad (dic)',
  UY: 'Carnaval (feb), Semana de Turismo (Pascua), Día de las Madres (2do dom mayo), Navidad (dic)',
  PY: 'Carnaval (feb), Semana Santa, Día de las Madres (15 mayo), Navidad (dic)',
  BR: 'Carnaval (feb), Dia das Mães (2o dom maio), Dia dos Pais (2o dom ago), Black Friday (nov), Natal (dez), Dia de São Valentim (12 jun)',
};

export function getEventosComerciales(pais?: string | null): string {
  const key = (pais ?? 'MX').toUpperCase();
  return EVENTOS_COMERCIALES[key] ?? EVENTOS_COMERCIALES.MX;
}

// ─── NSE / socioeconomic segment context per country ─────────────────────────

const NSE_CONTEXTO: Record<string, string> = {
  MX: 'Clasificación AMAI: AB (alto, 7% pop), C+ (medio-alto, 14%), C/C- (medio, 35%), D+/D (bajo, 44%)',
  BR: 'Critério Brasil: A/B (elite e médio-alto, 25%), C1/C2 (médio, 40%), D/E (baixo, 35%)',
  CO: 'Estratificación DANE: Estrato 6 (alto), 5 (medio-alto), 4 (medio), 3 (medio-bajo), 2 (bajo), 1 (muy bajo)',
  CL: 'GSE Chile: ABC1 (alto, 13%), C2/C3 (medio, 38%), D (medio-bajo, 33%), E (bajo, 16%)',
  AR: 'NSE Argentina: ABC1 (alto, 15%), C2/C3 (medio, 35%), D1/D2 (bajo, 35%), E (marginal, 15%)',
  PE: 'NSE IPSOS Perú: A/B (alto, 12%), C (medio, 28%), D (bajo, 35%), E (muy bajo, 25%)',
  VE: 'NSE Venezuela: A/B (alto), C (medio), D/E (bajo) — basado en poder adquisitivo',
  EC: 'NSE INEC Ecuador: A (alto, 2%), B (medio-alto, 11%), C+ (medio, 22%), C- (medio-bajo, 49%), D (bajo, 16%)',
};

const NSE_CONTEXTO_DEFAULT = 'Segmentos LATAM: AB (alto), C+ (medio-alto), C/C- (medio), D+/D (bajo), E (muy bajo)';

export function getNseContexto(pais?: string | null): string {
  const key = (pais ?? 'MX').toUpperCase();
  return NSE_CONTEXTO[key] ?? NSE_CONTEXTO_DEFAULT;
}

// ─── NSE population percentages (generic LATAM — approximate) ────────────────
// Used by tamService for population filtering by socioeconomic segment.

export const NSE_PCT: Record<string, number> = {
  'ab':  0.07,
  'c+':  0.14,
  'c':   0.20,
  'c-':  0.15,
  'd+':  0.22,
  'd':   0.15,
  'e':   0.07,
};

// ─── Regional population data (scope=local) ───────────────────────────────────

const POBLACION_REGIONES: Record<string, number> = {
  // Mexico
  mx_aguascalientes: 1_434_635,   mx_baja_california: 3_769_020,
  mx_baja_california_sur: 798_447, mx_campeche: 928_363,
  mx_chiapas: 5_543_828,          mx_chihuahua: 3_741_869,
  mx_ciudad_de_mexico: 9_209_944, mx_cdmx: 9_209_944,
  mx_coahuila: 3_146_771,         mx_colima: 731_391,
  mx_durango: 1_832_650,          mx_estado_de_mexico: 16_992_418,
  mx_guanajuato: 6_166_934,       mx_guerrero: 3_657_048,
  mx_hidalgo: 3_082_841,          mx_jalisco: 8_348_151,
  mx_michoacan: 4_748_846,        mx_morelos: 2_011_042,
  mx_nayarit: 1_235_456,          mx_nuevo_leon: 5_784_442,
  mx_oaxaca: 4_132_148,           mx_puebla: 6_583_278,
  mx_queretaro: 2_368_467,        mx_quintana_roo: 1_857_985,
  mx_san_luis_potosi: 2_822_255,  mx_sinaloa: 3_026_164,
  mx_sonora: 2_944_840,           mx_tabasco: 2_402_598,
  mx_tamaulipas: 3_527_735,       mx_tlaxcala: 1_342_977,
  mx_veracruz: 8_062_579,         mx_yucatan: 2_320_898,
  mx_zacatecas: 1_622_138,
  // Guatemala
  gt_guatemala: 3_200_000, gt_quetzaltenango: 1_000_000,
  gt_escuintla: 800_000,   gt_alta_verapaz: 1_200_000, gt_san_marcos: 900_000,
  // Honduras
  hn_francisco_morazan: 2_000_000, hn_cortes: 1_800_000, hn_yoro: 600_000,
  // El Salvador
  sv_san_salvador: 1_800_000, sv_santa_ana: 600_000, sv_san_miguel: 500_000,
  // Nicaragua
  ni_managua: 1_500_000, ni_leon: 450_000, ni_chinandega: 420_000,
  // Costa Rica
  cr_san_jose: 1_400_000, cr_alajuela: 900_000,
  cr_heredia: 500_000,    cr_cartago: 500_000,
  // Panama
  pa_panama: 1_500_000, pa_chiriqui: 500_000,
  // Colombia
  co_bogota: 8_400_000,        co_antioquia: 6_700_000,  co_medellin: 2_700_000,
  co_valle_del_cauca: 4_500_000, co_cundinamarca: 3_000_000, co_barranquilla: 1_300_000,
  co_atlantico: 2_700_000,     co_santander: 2_300_000,  co_bolivar: 2_200_000,
  // Venezuela
  ve_distrito_capital: 2_900_000, ve_miranda: 2_700_000,
  ve_zulia: 3_700_000,            ve_carabobo: 2_400_000, ve_lara: 2_000_000,
  // Ecuador
  ec_guayas: 4_400_000, ec_pichincha: 3_300_000,
  ec_manabi: 1_600_000, ec_el_oro: 700_000,
  // Peru
  pe_lima: 10_500_000,   pe_callao: 1_100_000,  pe_arequipa: 1_400_000,
  pe_la_libertad: 2_000_000, pe_piura: 2_000_000, pe_cusco: 1_400_000,
  // Bolivia
  bo_santa_cruz: 3_400_000, bo_la_paz: 2_900_000,
  bo_cochabamba: 2_200_000,  bo_tarija: 600_000,
  // Chile
  cl_metropolitana_de_santiago: 8_100_000, cl_region_metropolitana: 8_100_000,
  cl_valparaiso: 2_000_000, cl_biobio: 1_700_000, cl_la_araucania: 1_000_000,
  // Argentina
  ar_buenos_aires: 17_500_000,    ar_buenos_aires_ciudad: 3_100_000,
  ar_cordoba: 3_700_000,          ar_santa_fe: 3_500_000,
  ar_mendoza: 2_000_000,          ar_tucuman: 1_700_000, ar_salta: 1_400_000,
  // Uruguay
  uy_montevideo: 1_400_000, uy_canelones: 600_000,
  // Paraguay
  py_asuncion: 550_000, py_central: 2_200_000, py_alto_parana: 800_000,
  // Brazil
  br_sao_paulo: 12_300_000,       br_rio_de_janeiro: 6_800_000,
  br_minas_gerais: 21_400_000,    br_bahia: 14_800_000,
  br_parana: 11_400_000,          br_rio_grande_do_sul: 11_400_000,
  br_ceara: 9_200_000,            br_pernambuco: 9_600_000,
  br_goias: 7_200_000,
};

function normalizeKey(str: string): string {
  return str.toLowerCase()
    .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i').replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function getPoblacionRegion(pais: string | null | undefined, region: string | null | undefined): number {
  if (!region) return Math.round(getPaisInfo(pais).poblacion * 0.15);
  const key = `${normalizeKey(pais ?? 'mx')}_${normalizeKey(region)}`;
  return POBLACION_REGIONES[key] ?? Math.round(getPaisInfo(pais).poblacion * 0.15);
}

// ─── UI dropdown data: region lists per country ───────────────────────────────

export const REGIONES_POR_PAIS: Record<string, string[]> = {
  MX: ['Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'],
  GT: ['Guatemala', 'Alta Verapaz', 'Baja Verapaz', 'Chimaltenango', 'Chiquimula', 'El Progreso', 'Escuintla', 'Huehuetenango', 'Izabal', 'Jalapa', 'Jutiapa', 'Petén', 'Quetzaltenango', 'Quiché', 'Retalhuleu', 'Sacatepéquez', 'San Marcos', 'Santa Rosa', 'Sololá', 'Suchitepéquez', 'Totonicapán', 'Zacapa'],
  BZ: ['Belize', 'Cayo', 'Corozal', 'Orange Walk', 'Stann Creek', 'Toledo'],
  HN: ['Atlántida', 'Choluteca', 'Colón', 'Comayagua', 'Copán', 'Cortés', 'El Paraíso', 'Francisco Morazán', 'Gracias a Dios', 'Intibucá', 'Islas de la Bahía', 'La Paz', 'Lempira', 'Ocotepeque', 'Olancho', 'Santa Bárbara', 'Valle', 'Yoro'],
  SV: ['Ahuachapán', 'Cabañas', 'Chalatenango', 'Cuscatlán', 'La Libertad', 'La Paz', 'La Unión', 'Morazán', 'San Miguel', 'San Salvador', 'San Vicente', 'Santa Ana', 'Sonsonate', 'Usulután'],
  NI: ['Boaco', 'Carazo', 'Chinandega', 'Chontales', 'Estelí', 'Granada', 'Jinotega', 'León', 'Madriz', 'Managua', 'Masaya', 'Matagalpa', 'Nueva Segovia', 'Río San Juan', 'Rivas'],
  CR: ['Alajuela', 'Cartago', 'Guanacaste', 'Heredia', 'Limón', 'Puntarenas', 'San José'],
  PA: ['Bocas del Toro', 'Chiriquí', 'Coclé', 'Colón', 'Darién', 'Herrera', 'Los Santos', 'Panamá', 'Panamá Oeste', 'Veraguas'],
  CO: ['Antioquia', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá', 'Casanare', 'Cauca', 'Cesar', 'Córdoba', 'Cundinamarca', 'Huila', 'La Guajira', 'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Quindío', 'Risaralda', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca'],
  VE: ['Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar', 'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón', 'Guárico', 'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta', 'Portuguesa', 'Sucre', 'Táchira', 'Trujillo', 'Vargas', 'Yaracuy', 'Zulia'],
  EC: ['Azuay', 'Bolívar', 'Cañar', 'Carchi', 'Chimborazo', 'Cotopaxi', 'El Oro', 'Esmeraldas', 'Guayas', 'Imbabura', 'Loja', 'Los Ríos', 'Manabí', 'Napo', 'Pichincha', 'Santa Elena', 'Santo Domingo', 'Tungurahua'],
  PE: ['Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca', 'Callao', 'Cusco', 'Huancavelica', 'Huánuco', 'Ica', 'Junín', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Moquegua', 'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali'],
  BO: ['Beni', 'Chuquisaca', 'Cochabamba', 'La Paz', 'Oruro', 'Pando', 'Potosí', 'Santa Cruz', 'Tarija'],
  CL: ['Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso', 'Metropolitana de Santiago', "O'Higgins", 'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes'],
  AR: ['Buenos Aires (Provincia)', 'Buenos Aires (CABA)', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'],
  UY: ['Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores', 'Florida', 'Lavalleja', 'Maldonado', 'Montevideo', 'Paysandú', 'Río Negro', 'Rivera', 'Rocha', 'Salto', 'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres'],
  PY: ['Alto Paraguay', 'Alto Paraná', 'Amambay', 'Asunción', 'Boquerón', 'Caaguazú', 'Caazapá', 'Canindeyú', 'Central', 'Concepción', 'Cordillera', 'Guairá', 'Itapúa', 'Misiones', 'Ñeembucú', 'Paraguarí', 'Presidente Hayes', 'San Pedro'],
  BR: ['Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí', 'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia', 'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins'],
};
