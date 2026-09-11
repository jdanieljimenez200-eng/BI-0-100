import { DataSource } from 'typeorm';
import { logger } from '../utils/logger';
import { Usuario } from '../models/Usuario';
import { Marca } from '../models/Marca';
import { Producto } from '../models/Producto';
import { AnalisisMercado } from '../models/AnalisisMercado';
import { AnalisisMarketing } from '../models/AnalisisMarketing';
import { AnalisisVentas } from '../models/AnalisisVentas';
import { AnalisisFinanzas } from '../models/AnalisisFinanzas';
import { MovimientoContable } from '../models/MovimientoContable';
import { AnalisisBrief } from '../models/AnalisisBrief';
import { Negocio } from '../models/Negocio';
import { MetaNegocio } from '../models/MetaNegocio';
import { ItemPOS } from '../models/ItemPOS';
import { ItemPOSInsumo } from '../models/ItemPOSInsumo';
import { Venta } from '../models/Venta';
import { VentaItem } from '../models/VentaItem';
import { InsumoInventario } from '../models/InsumoInventario';
import { MovimientoInventario } from '../models/MovimientoInventario';
import { Articulo } from '../models/Articulo';
import { Cliente } from '../models/Cliente';
import { Cotizacion } from '../models/Cotizacion';
import { Cita } from '../models/Cita';
import { Empleado } from '../models/Empleado';
import { PagoNomina } from '../models/PagoNomina';
import { AsignacionTrabajador } from '../models/AsignacionTrabajador';
import { InvitacionTrabajador } from '../models/InvitacionTrabajador';
import { StripeEvent } from '../models/StripeEvent';
import { AnalisisLegal } from '../models/AnalisisLegal';
import { HerramientaSeleccionada } from '../models/HerramientaSeleccionada';
import { TemaUsuario } from '../models/TemaUsuario';
import { PerfilAnalitico } from '../models/PerfilAnalitico';
import { PerfilVideo } from '../models/PerfilVideo';
import { AuditoriaHerramienta } from '../models/AuditoriaHerramienta';

const isProd = process.env.NODE_ENV === 'production';

function buildDataSourceOptions() {
  const databaseUrl = process.env.DATABASE_URL;

  const baseOptions = {
    entities: [
      Usuario,
      Marca,
      Producto,
      Negocio,
      MetaNegocio,
      AnalisisMercado,
      AnalisisMarketing,
      AnalisisVentas,
      AnalisisFinanzas,
      MovimientoContable,
      AnalisisBrief,
      AnalisisLegal,
      ItemPOS,
      ItemPOSInsumo,
      Venta,
      VentaItem,
      InsumoInventario,
      MovimientoInventario,
      Articulo,
      Cliente,
      Cotizacion,
      Cita,
      Empleado,
      PagoNomina,
      AsignacionTrabajador,
      InvitacionTrabajador,
      StripeEvent,
      HerramientaSeleccionada,
      AuditoriaHerramienta,
      TemaUsuario,
      PerfilAnalitico,
      PerfilVideo,
    ],
    migrations: [__dirname + '/../migrations/*.{js,ts}'],
    // synchronize SOLO en dev, y desactivable con TYPEORM_SYNCHRONIZE=false
    synchronize: !isProd && process.env.TYPEORM_SYNCHRONIZE !== 'false',
    // Ejecutar migraciones automáticamente al arrancar si se habilita
    migrationsRun: process.env.TYPEORM_MIGRATIONS_RUN === 'true',
    logging: false,
    // SSL solo si se habilita explícitamente; rejectUnauthorized configurable
    // para BD administradas con CA propia (DB_SSL_REJECT_UNAUTHORIZED=false)
    ssl:
      process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
    // Configuración optimizada del pool de conexiones PostgreSQL
    extra: {
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONN_TIMEOUT_MS || '5000', 10),
    },
  };

  if (databaseUrl) {
    return { type: 'postgres' as const, url: databaseUrl, ...baseOptions };
  }

  return {
    type: 'postgres' as const,
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'bi0a100',
    ...baseOptions,
  };
}

export const AppDataSource = new DataSource(buildDataSourceOptions());

export async function initDatabase(): Promise<void> {
  await AppDataSource.initialize();
  logger.info('[db] Database connected');
}

// Health check endpoint
export function isDatabaseReady(): boolean {
  return AppDataSource.isInitialized;
}