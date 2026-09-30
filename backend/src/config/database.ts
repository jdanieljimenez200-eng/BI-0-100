import { DataSource } from 'typeorm';
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
import { LugarAtencion } from '../models/LugarAtencion';
import { TurnoEspera } from '../models/TurnoEspera';
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
import { Experto } from '../models/Experto';
import { ResenaExperto } from '../models/ResenaExperto';
import { PatrocinioExperto } from '../models/PatrocinioExperto';
import { AuditoriaAdmin } from '../models/AuditoriaAdmin';
import { EquipoMantenimiento } from '../models/EquipoMantenimiento';
import { MantenimientoRealizado } from '../models/MantenimientoRealizado';
import { CanalCobro } from '../models/CanalCobro';
import { ConexionGoogleCalendar } from '../models/ConexionGoogleCalendar';
import { AuditoriaDinero } from '../models/AuditoriaDinero';
import { PromptIA } from '../models/PromptIA';

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
      LugarAtencion,
      TurnoEspera,
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
      Experto,
      ResenaExperto,
      PatrocinioExperto,
      AuditoriaAdmin,
      EquipoMantenimiento,
      MantenimientoRealizado,
      CanalCobro,
      ConexionGoogleCalendar,
      AuditoriaDinero,
      PromptIA,
    ],
    migrations: [__dirname + '/../migrations/*.{js,ts}'],
    // NUNCA. El esquema lo definen solo las migraciones (CLAUDE.md, regla 1).
    // Antes era `!isProd && TYPEORM_SYNCHRONIZE !== 'false'`: sin la variable,
    // cualquier proceso fuera de Docker —`npm run seed:demo`, `seed:alertas`,
    // un `npm run dev` local, un script— sincronizaba al conectar y borraba los
    // índices, FK y CHECK que solo crean las migraciones. Así quedó dañada
    // `bi0a100_db`: le faltaban exactamente los 31 índices, 5 FK y 4 CHECK que
    // la entidad no declara (auditoría de base de datos, 2026-09-27).
    synchronize: false,
    // Nunca desde aquí: con TYPEORM_MIGRATIONS_RUN=true las aplica
    // `migrarAlArrancar()` (config/migracionesAlArrancar.ts) bajo un candado,
    // porque la API y el worker arrancan a la vez y migraban en paralelo.
    migrationsRun: false,
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
      // Una consulta desbocada o una transacción olvidada retenían su conexión
      // sin límite y con 20 por instancia el pool se agota rápido. Las tareas
      // largas legítimas (purga de cuentas) lo desactivan con SET LOCAL.
      statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '30000', 10),
      idle_in_transaction_session_timeout: parseInt(process.env.DB_IDLE_IN_TX_TIMEOUT_MS || '60000', 10),
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