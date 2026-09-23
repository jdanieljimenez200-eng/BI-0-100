import { DataSource } from 'typeorm';
import { AppDataSource } from './database';

/**
 * DataSource EXCLUSIVO para la CLI de TypeORM (migration:show / run / revert).
 *
 * Motivo de existir: `AppDataSource` tiene `synchronize: true` en desarrollo, y
 * la CLI llama a `DataSource.initialize()` antes de ejecutar cualquier comando.
 * Eso significa que incluso un comando de solo lectura como `migration:show`
 * crearía las tablas a partir de las entidades (con nombres de índice y FK
 * autogenerados, FK_<hash> / IDX_<hash>) ANTES de mostrar el estado, dejando el
 * esquema en un punto intermedio que ninguna migración registró.
 *
 * Reutiliza `AppDataSource.options` en lugar de duplicar la configuración: así
 * la lista de entidades, el glob de migraciones y la URL de conexión son
 * exactamente los mismos que usa la aplicación, y solo se anula lo peligroso.
 *
 * Importar `AppDataSource` NO abre conexión: el constructor de DataSource solo
 * guarda opciones.
 */
export const CliDataSource = new DataSource({
  ...AppDataSource.options,
  synchronize: false,
  migrationsRun: false,
  // La CLI sí debe ser verbosa: queremos ver el SQL exacto que se ejecuta.
  logging: ['query', 'error', 'schema'],
  // Una migración de datos sobre tablas grandes puede tardar más que el
  // statement_timeout de la aplicación (30 s): aquí no hay límite.
  extra: {
    ...((AppDataSource.options as { extra?: Record<string, unknown> }).extra ?? {}),
    statement_timeout: 0,
    idle_in_transaction_session_timeout: 0,
  },
});

// NO añadir `export default CliDataSource`: la CLI de TypeORM
// (CommandUtils.loadDataSource) recorre TODOS los exports del archivo y falla con
// "Given data source file must contain only one export of DataSource instance"
// si encuentra más de uno, aunque el named y el default sean el mismo objeto.