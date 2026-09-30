import { PAIS_LATAM } from '../../utils/latam';

/**
 * Fichas de país del módulo Legal.
 *
 * Dos usos distintos, y por eso dos formas:
 *  - **Datos estructurados** (`PaisMeta`): los usa el código para validar la
 *    salida (dominios oficiales de `url_tramite`, moneda, textos del respaldo
 *    determinista). No se editan desde el panel.
 *  - **Texto de la ficha** (`textoFichaPais`): es lo que lee la IA. Es el valor
 *    por defecto de la clave `legal.pais.<ISO>`; el admin puede publicar una
 *    versión corregida o crear la de un país que aquí no existe, sin deploy.
 *
 * Solo autoridades y portales oficiales verificables. Un país sin ficha usa
 * `metaGenerica` y la IA recibe la instrucción de no inventar trámites, con la
 * confianza limitada a «bajo».
 */

export interface PaisMeta {
  nombre: string;
  entidad_fiscal: string;
  registro_tributario: string;
  regimen_pequeno: string;
  facturacion: string;
  seguridad_social: string;
  proteccion_datos: string;
  consumidor: string;
  aduana: string;
  licencia_local: string;
  propiedad_industrial: { nombre: string; url: string };
  /** Autoridades que intervienen en giros regulados (salud, alimentos, seguridad del local). */
  autoridades_sectoriales: string[];
  moneda: string;
  portal_principal: string;
  dominios_oficiales: string[];
  fuentes: { nombre: string; url: string }[];
}

/**
 * Fecha en que se consolidó el contenido de las fichas en este formato. No es
 * una validación profesional: la ficha lo dice así para que la IA la trate como
 * orientación y la contraste.
 */
export const FICHAS_CONSOLIDADAS_EL = '2026-09-29';

/** Cuándo hay que revisar una ficha. Aplica a todos los países. */
export const REVISAR_FICHA_CUANDO = [
  'reforma fiscal o tributaria (en varios países es anual)',
  'cambio de salario mínimo o de las unidades de referencia para multas y umbrales',
  'cambio de la autoridad competente o fusión de organismos',
  'cambio en los requisitos o límites del régimen para pequeños contribuyentes',
  'nueva ley de protección de datos o de comercio electrónico',
];

export const PAISES: Record<string, PaisMeta> = {
  MX: {
    nombre: 'México',
    entidad_fiscal: 'SAT — Servicio de Administración Tributaria',
    registro_tributario: 'RFC',
    regimen_pequeno: 'Régimen Simplificado de Confianza (RESICO)',
    facturacion: 'CFDI 4.0 (factura electrónica)',
    seguridad_social: 'IMSS e INFONAVIT',
    proteccion_datos: 'Autoridad de transparencia y protección de datos personales',
    consumidor: 'PROFECO',
    aduana: 'Agencia Nacional de Aduanas de México (ANAM)',
    licencia_local: 'Licencia de funcionamiento municipal',
    propiedad_industrial: { nombre: 'IMPI', url: 'https://www.gob.mx/impi' },
    autoridades_sectoriales: [
      'Sanitaria: COFEPRIS y las secretarías de salud estatales (aviso de funcionamiento, control sanitario)',
      'Seguridad del establecimiento: Protección Civil municipal o estatal',
      'Uso de suelo: dirección de desarrollo urbano del municipio',
      'Venta de alcohol: licencia específica municipal o estatal',
    ],
    moneda: 'MXN',
    portal_principal: 'https://www.gob.mx/tramites',
    dominios_oficiales: ['gob.mx', 'org.mx'],
    fuentes: [
      { nombre: 'SAT — Servicio de Administración Tributaria', url: 'https://www.sat.gob.mx' },
      { nombre: 'IMSS — Instituto Mexicano del Seguro Social', url: 'https://www.imss.gob.mx' },
      { nombre: 'Trámites del Gobierno de México', url: 'https://www.gob.mx/tramites' },
      { nombre: 'PROFECO — Protección al consumidor', url: 'https://www.profeco.gob.mx' },
      { nombre: 'IMPI — Registro de marca', url: 'https://www.gob.mx/impi' },
    ],
  },
  CO: {
    nombre: 'Colombia',
    entidad_fiscal: 'DIAN — Dirección de Impuestos y Aduanas Nacionales',
    registro_tributario: 'RUT / NIT',
    regimen_pequeno: 'Régimen simple de tributación (RST)',
    facturacion: 'Factura electrónica DIAN',
    seguridad_social: 'Seguridad social integral (salud, pensión, ARL)',
    proteccion_datos: 'Superintendencia de Industria y Comercio (SIC)',
    consumidor: 'Superintendencia de Industria y Comercio (SIC)',
    aduana: 'DIAN — área de aduanas',
    licencia_local: 'Registro mercantil en Cámara de Comercio y uso de suelo municipal',
    propiedad_industrial: { nombre: 'SIC — Propiedad Industrial', url: 'https://www.sic.gov.co' },
    autoridades_sectoriales: [
      'Sanitaria: INVIMA (registro de productos) y secretarías de salud (concepto sanitario del establecimiento)',
      'Seguridad del establecimiento: cuerpo de bomberos del municipio',
      'Uso de suelo: oficina de planeación municipal',
    ],
    moneda: 'COP',
    portal_principal: 'https://www.gov.co',
    dominios_oficiales: ['gov.co', 'org.co'],
    fuentes: [
      { nombre: 'DIAN', url: 'https://www.dian.gov.co' },
      { nombre: 'Superintendencia de Industria y Comercio', url: 'https://www.sic.gov.co' },
      { nombre: 'Ministerio del Trabajo', url: 'https://www.mintrabajo.gov.co' },
      { nombre: 'Portal único del Estado colombiano', url: 'https://www.gov.co' },
      { nombre: 'Cámara de Comercio de Bogotá', url: 'https://www.ccb.org.co' },
    ],
  },
  AR: {
    nombre: 'Argentina',
    entidad_fiscal: 'ARCA — Agencia de Recaudación y Control Aduanero (ex AFIP)',
    registro_tributario: 'CUIT',
    regimen_pequeno: 'Monotributo',
    facturacion: 'Factura electrónica',
    seguridad_social: 'ANSES y obra social sindical',
    proteccion_datos: 'Agencia de Acceso a la Información Pública',
    consumidor: 'Dirección Nacional de Defensa del Consumidor',
    aduana: 'ARCA — Dirección General de Aduanas',
    licencia_local: 'Habilitación municipal del establecimiento',
    propiedad_industrial: { nombre: 'INPI', url: 'https://www.argentina.gob.ar/inpi' },
    autoridades_sectoriales: [
      'Sanitaria: ANMAT (alimentos envasados, medicamentos y cosméticos) y bromatología municipal',
      'Agroalimentaria: SENASA (productos de origen animal y vegetal)',
    ],
    moneda: 'ARS',
    portal_principal: 'https://www.argentina.gob.ar',
    dominios_oficiales: ['gob.ar'],
    fuentes: [
      { nombre: 'ARCA (ex AFIP)', url: 'https://www.arca.gob.ar' },
      { nombre: 'ANSES', url: 'https://www.anses.gob.ar' },
      { nombre: 'Portal del Estado argentino', url: 'https://www.argentina.gob.ar' },
      { nombre: 'INPI — Marcas y patentes', url: 'https://www.argentina.gob.ar/inpi' },
    ],
  },
  PE: {
    nombre: 'Perú',
    entidad_fiscal: 'SUNAT — Superintendencia Nacional de Aduanas y Administración Tributaria',
    registro_tributario: 'RUC',
    regimen_pequeno: 'Régimen Especial de Renta (RER) / RMT',
    facturacion: 'Comprobantes de pago electrónicos SUNAT',
    seguridad_social: 'EsSalud y sistema pensionario (ONP/AFP)',
    proteccion_datos: 'Autoridad Nacional de Protección de Datos Personales',
    consumidor: 'INDECOPI',
    aduana: 'SUNAT — Aduanas',
    licencia_local: 'Licencia de funcionamiento municipal',
    propiedad_industrial: { nombre: 'INDECOPI', url: 'https://www.indecopi.gob.pe' },
    autoridades_sectoriales: [
      'Sanitaria: DIGESA (alimentos y bebidas) y DIGEMID (medicamentos, cosméticos y productos sanitarios)',
      'Seguridad del establecimiento: Inspección Técnica de Seguridad en Edificaciones (ITSE) municipal',
    ],
    moneda: 'PEN',
    portal_principal: 'https://www.gob.pe',
    dominios_oficiales: ['gob.pe'],
    fuentes: [
      { nombre: 'SUNAT', url: 'https://www.sunat.gob.pe' },
      { nombre: 'Plataforma digital del Estado peruano', url: 'https://www.gob.pe' },
      { nombre: 'INDECOPI', url: 'https://www.indecopi.gob.pe' },
      { nombre: 'EsSalud', url: 'https://www.essalud.gob.pe' },
      { nombre: 'SUNARP', url: 'https://www.sunarp.gob.pe' },
    ],
  },
  CL: {
    nombre: 'Chile',
    entidad_fiscal: 'SII — Servicio de Impuestos Internos',
    registro_tributario: 'RUT / inicio de actividades',
    regimen_pequeno: 'Régimen Pro Pyme',
    facturacion: 'Documentos tributarios electrónicos (DTE)',
    seguridad_social: 'Cotizaciones previsionales (AFP, salud, mutual)',
    proteccion_datos: 'Autoridad de protección de datos personales',
    consumidor: 'SERNAC',
    aduana: 'Servicio Nacional de Aduanas',
    licencia_local: 'Patente municipal',
    propiedad_industrial: { nombre: 'INAPI', url: 'https://www.inapi.cl' },
    autoridades_sectoriales: [
      'Sanitaria: SEREMI de Salud (autorización sanitaria del establecimiento) e ISP (medicamentos y cosméticos)',
    ],
    moneda: 'CLP',
    portal_principal: 'https://www.chileatiende.gob.cl',
    dominios_oficiales: ['gob.cl', 'sii.cl', 'sernac.cl', 'inapi.cl', 'dt.gob.cl'],
    fuentes: [
      { nombre: 'SII — Servicio de Impuestos Internos', url: 'https://www.sii.cl' },
      { nombre: 'ChileAtiende', url: 'https://www.chileatiende.gob.cl' },
      { nombre: 'SERNAC', url: 'https://www.sernac.cl' },
      { nombre: 'Dirección del Trabajo', url: 'https://www.dt.gob.cl' },
      { nombre: 'INAPI — Marcas', url: 'https://www.inapi.cl' },
    ],
  },
  ES: {
    nombre: 'España',
    entidad_fiscal: 'AEAT — Agencia Estatal de Administración Tributaria',
    registro_tributario: 'NIF y alta censal (modelo 036/037)',
    regimen_pequeno: 'Estimación directa simplificada / régimen de autónomos',
    facturacion: 'Facturación con obligaciones de facturación electrónica',
    seguridad_social: 'Tesorería General de la Seguridad Social (RETA / régimen general)',
    proteccion_datos: 'AEPD — Agencia Española de Protección de Datos',
    consumidor: 'Autoridades de consumo autonómicas',
    aduana: 'AEAT — Departamento de Aduanas e Impuestos Especiales',
    licencia_local: 'Licencia de actividad o declaración responsable municipal',
    propiedad_industrial: { nombre: 'OEPM', url: 'https://www.oepm.es' },
    autoridades_sectoriales: [
      'Sanitaria: AESAN (alimentos), AEMPS (medicamentos y cosméticos) y las autoridades sanitarias autonómicas',
    ],
    moneda: 'EUR',
    portal_principal: 'https://administracion.gob.es',
    dominios_oficiales: ['gob.es', 'seg-social.es', 'aepd.es', 'boe.es', 'oepm.es'],
    fuentes: [
      { nombre: 'Agencia Tributaria (sede electrónica)', url: 'https://sede.agenciatributaria.gob.es' },
      { nombre: 'Seguridad Social', url: 'https://www.seg-social.es' },
      { nombre: 'AEPD — Protección de datos', url: 'https://www.aepd.es' },
      { nombre: 'Punto de Acceso General', url: 'https://administracion.gob.es' },
      { nombre: 'BOE — Boletín Oficial del Estado', url: 'https://www.boe.es' },
    ],
  },
};

export function metaGenerica(iso: string): PaisMeta {
  // PAIS_LATAM directo: getPaisNombre() devuelve «México» ante un código que no
  // conoce, y un país sin ficha no debe disfrazarse de México.
  const info = PAIS_LATAM[iso];
  return {
    nombre: info?.nombre ?? `país con código ${iso}`,
    entidad_fiscal: 'Autoridad tributaria nacional',
    registro_tributario: 'Registro de contribuyente',
    regimen_pequeno: 'Régimen simplificado para pequeños contribuyentes',
    facturacion: 'Emisión de comprobantes fiscales',
    seguridad_social: 'Instituto de seguridad social',
    proteccion_datos: 'Autoridad de protección de datos personales',
    consumidor: 'Autoridad de protección al consumidor',
    aduana: 'Autoridad aduanera nacional',
    licencia_local: 'Licencia municipal de funcionamiento',
    propiedad_industrial: { nombre: 'Oficina nacional de propiedad industrial', url: '#no-aplica' },
    autoridades_sectoriales: [],
    moneda: info?.moneda ?? 'moneda local',
    portal_principal: '#no-aplica',
    dominios_oficiales: [],
    fuentes: [],
  };
}

export function normalizarIso(iso?: string | null): string {
  return (iso || 'MX').trim().toUpperCase();
}

/** ¿Hay ficha propia en el repositorio para este país? */
export function tieneFichaEnRepo(iso?: string | null): boolean {
  return Boolean(PAISES[normalizarIso(iso)]);
}

export function resolverPais(iso?: string | null): { iso: string; meta: PaisMeta } {
  const code = normalizarIso(iso);
  const meta = PAISES[code];
  return meta ? { iso: code, meta } : { iso: code, meta: metaGenerica(code) };
}

/**
 * Texto de la ficha que lee la IA (valor por defecto de `legal.pais.<ISO>`).
 * `null` si el país no tiene ficha en el repositorio: entonces el compositor usa
 * `textoSinFicha`.
 */
export function textoFichaPais(iso: string): string | null {
  const code = normalizarIso(iso);
  const m = PAISES[code];
  if (!m) return null;
  return `FICHA DE PAÍS — ${m.nombre} (${code})
Consolidada el ${FICHAS_CONSOLIDADAS_EL}. Aún no la ha validado un profesional local: úsala como orientación de dónde buscar, no como texto legal, y contrasta cualquier dato con la fuente oficial.

- Autoridad fiscal: ${m.entidad_fiscal}
- Registro tributario: ${m.registro_tributario}
- Régimen para pequeños contribuyentes: ${m.regimen_pequeno}
- Comprobantes fiscales: ${m.facturacion}
- Seguridad social: ${m.seguridad_social}
- Protección de datos personales: ${m.proteccion_datos}
- Protección al consumidor: ${m.consumidor}
- Aduanas: ${m.aduana}
- Permiso para operar el local: ${m.licencia_local}
- Propiedad industrial (marcas): ${m.propiedad_industrial.nombre}
${m.autoridades_sectoriales.map((a) => `- ${a}`).join('\n')}
- Dominios oficiales (solo estos valen para url_tramite): ${m.dominios_oficiales.join(', ')}
- Portal de trámites: ${m.portal_principal}

Revisa esta ficha cuando haya: ${REVISAR_FICHA_CUANDO.join('; ')}.`;
}

/** Punto de partida para escribir desde el panel la ficha de un país que no tiene. */
export function plantillaFichaNueva(iso: string): string {
  const code = normalizarIso(iso);
  const { meta } = resolverPais(code);
  return `FICHA DE PAÍS — ${meta.nombre} (${code})
Consolidada el [fecha]. Validada por: [profesional o fuente].

- Autoridad fiscal: [completar]
- Registro tributario: [completar]
- Régimen para pequeños contribuyentes: [completar]
- Comprobantes fiscales: [completar]
- Seguridad social: [completar]
- Protección de datos personales: [completar]
- Protección al consumidor: [completar]
- Aduanas: [completar]
- Permiso para operar el local: [completar]
- Propiedad industrial (marcas): [completar]
- Sanitaria y otras autoridades sectoriales: [completar]
- Portal de trámites: [completar]

Revisa esta ficha cuando haya: ${REVISAR_FICHA_CUANDO.join('; ')}.`;
}

/** Lo que lee la IA cuando el país no tiene ficha (ni en el repositorio ni publicada). */
export function textoSinFicha(iso: string): string {
  const code = normalizarIso(iso);
  const { meta } = resolverPais(code);
  return `SIN FICHA DE PAÍS — ${meta.nombre} (${code})
No hay una ficha revisada para este país. Reglas adicionales para este análisis:
- No nombres autoridades, trámites, regímenes, formularios, montos, umbrales ni plazos específicos salvo que tengas alta certeza de que existen hoy; si no, describe la obligación de forma genérica («registro ante la autoridad tributaria nacional») y márcala para verificación.
- Usa url_tramite "#no-aplica" en todos los casos.
- nivel_confianza no puede ser mayor que "bajo"; explícalo en motivo_confianza.
- Incluye en informacion_faltante que conviene confirmar el marco con un contador o abogado local.`;
}
