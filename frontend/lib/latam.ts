export const PAISES_LATAM = [
  { code: 'MX', nombre: 'México',      flag: '🇲🇽', moneda: 'MXN' },
  { code: 'GT', nombre: 'Guatemala',   flag: '🇬🇹', moneda: 'GTQ' },
  { code: 'BZ', nombre: 'Belice',      flag: '🇧🇿', moneda: 'BZD' },
  { code: 'HN', nombre: 'Honduras',    flag: '🇭🇳', moneda: 'HNL' },
  { code: 'SV', nombre: 'El Salvador', flag: '🇸🇻', moneda: 'USD' },
  { code: 'NI', nombre: 'Nicaragua',   flag: '🇳🇮', moneda: 'NIO' },
  { code: 'CR', nombre: 'Costa Rica',  flag: '🇨🇷', moneda: 'CRC' },
  { code: 'PA', nombre: 'Panamá',      flag: '🇵🇦', moneda: 'USD' },
  { code: 'CO', nombre: 'Colombia',    flag: '🇨🇴', moneda: 'COP' },
  { code: 'VE', nombre: 'Venezuela',   flag: '🇻🇪', moneda: 'VES' },
  { code: 'EC', nombre: 'Ecuador',     flag: '🇪🇨', moneda: 'USD' },
  { code: 'PE', nombre: 'Perú',        flag: '🇵🇪', moneda: 'PEN' },
  { code: 'BO', nombre: 'Bolivia',     flag: '🇧🇴', moneda: 'BOB' },
  { code: 'CL', nombre: 'Chile',       flag: '🇨🇱', moneda: 'CLP' },
  { code: 'AR', nombre: 'Argentina',   flag: '🇦🇷', moneda: 'ARS' },
  { code: 'UY', nombre: 'Uruguay',     flag: '🇺🇾', moneda: 'UYU' },
  { code: 'PY', nombre: 'Paraguay',    flag: '🇵🇾', moneda: 'PYG' },
  { code: 'BR', nombre: 'Brasil',      flag: '🇧🇷', moneda: 'BRL' },
] as const;

export const REGIONES_POR_PAIS: Record<string, string[]> = {
  MX: ['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato','Guerrero','Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas'],
  GT: ['Alta Verapaz','Baja Verapaz','Chimaltenango','Chiquimula','El Progreso','Escuintla','Guatemala','Huehuetenango','Izabal','Jalapa','Jutiapa','Petén','Quetzaltenango','Quiché','Retalhuleu','Sacatepéquez','San Marcos','Santa Rosa','Sololá','Suchitepéquez','Totonicapán','Zacapa'],
  BZ: ['Belize District','Cayo','Corozal','Orange Walk','Stann Creek','Toledo'],
  HN: ['Atlántida','Choluteca','Colón','Comayagua','Copán','Cortés','El Paraíso','Francisco Morazán','Gracias a Dios','Intibucá','Islas de la Bahía','La Paz','Lempira','Ocotepeque','Olancho','Santa Bárbara','Valle','Yoro'],
  SV: ['Ahuachapán','Cabañas','Chalatenango','Cuscatlán','La Libertad','La Paz','La Unión','Morazán','San Miguel','San Salvador','San Vicente','Santa Ana','Sonsonate','Usulután'],
  NI: ['Boaco','Carazo','Chinandega','Chontales','Costa Caribe Norte','Costa Caribe Sur','Estelí','Granada','Jinotega','León','Madriz','Managua','Masaya','Matagalpa','Nueva Segovia','Río San Juan','Rivas'],
  CR: ['Alajuela','Cartago','Guanacaste','Heredia','Limón','Puntarenas','San José'],
  PA: ['Bocas del Toro','Chiriquí','Coclé','Colón','Darién','Emberá','Guna Yala','Herrera','Los Santos','Ngäbe-Buglé','Panamá','Panamá Oeste','Veraguas'],
  CO: ['Amazonas','Antioquia','Arauca','Atlántico','Bogotá D.C.','Bolívar','Boyacá','Caldas','Caquetá','Casanare','Cauca','Cesar','Chocó','Córdoba','Cundinamarca','Guainía','Guaviare','Huila','La Guajira','Magdalena','Meta','Nariño','Norte de Santander','Putumayo','Quindío','Risaralda','San Andrés','Santander','Sucre','Tolima','Valle del Cauca','Vaupés','Vichada'],
  VE: ['Amazonas','Anzoátegui','Apure','Aragua','Barinas','Bolívar','Carabobo','Cojedes','Delta Amacuro','Distrito Capital','Falcón','Guárico','Lara','Mérida','Miranda','Monagas','Nueva Esparta','Portuguesa','Sucre','Táchira','Trujillo','Vargas','Yaracuy','Zulia'],
  EC: ['Azuay','Bolívar','Cañar','Carchi','Chimborazo','Cotopaxi','El Oro','Esmeraldas','Galápagos','Guayas','Imbabura','Loja','Los Ríos','Manabí','Morona Santiago','Napo','Orellana','Pastaza','Pichincha','Santa Elena','Santo Domingo','Sucumbíos','Tungurahua','Zamora Chinchipe'],
  PE: ['Amazonas','Áncash','Apurímac','Arequipa','Ayacucho','Cajamarca','Callao','Cusco','Huancavelica','Huánuco','Ica','Junín','La Libertad','Lambayeque','Lima','Loreto','Madre de Dios','Moquegua','Pasco','Piura','Puno','San Martín','Tacna','Tumbes','Ucayali'],
  BO: ['Beni','Chuquisaca','Cochabamba','La Paz','Oruro','Pando','Potosí','Santa Cruz','Tarija'],
  CL: ['Arica y Parinacota','Tarapacá','Antofagasta','Atacama','Coquimbo','Valparaíso','Metropolitana de Santiago',"O'Higgins",'Maule','Ñuble','Biobío','La Araucanía','Los Ríos','Los Lagos','Aysén','Magallanes'],
  AR: ['Buenos Aires','Buenos Aires (Ciudad)','Catamarca','Chaco','Chubut','Córdoba','Corrientes','Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucumán'],
  UY: ['Artigas','Canelones','Cerro Largo','Colonia','Durazno','Flores','Florida','Lavalleja','Maldonado','Montevideo','Paysandú','Río Negro','Rivera','Rocha','Salto','San José','Soriano','Tacuarembó','Treinta y Tres'],
  PY: ['Alto Paraguay','Alto Paraná','Amambay','Asunción','Boquerón','Caaguazú','Caazapá','Canindeyú','Central','Concepción','Cordillera','Guairá','Itapúa','Misiones','Ñeembucú','Paraguarí','Presidente Hayes','San Pedro'],
  BR: ['Acre','Alagoas','Amapá','Amazonas','Bahia','Ceará','Distrito Federal','Espírito Santo','Goiás','Maranhão','Mato Grosso','Mato Grosso do Sul','Minas Gerais','Pará','Paraíba','Paraná','Pernambuco','Piauí','Rio de Janeiro','Rio Grande do Norte','Rio Grande do Sul','Rondônia','Roraima','Santa Catarina','São Paulo','Sergipe','Tocantins'],
};

export function getPaisInfo(code: string) {
  return PAISES_LATAM.find(p => p.code === code) ?? PAISES_LATAM[0];
}
