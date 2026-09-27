import { DataSource, DataSourceOptions } from 'typeorm';
import { AppDataSource } from './database';
import { logger } from '../utils/logger';

/** Candado de sesión que serializa las migraciones entre procesos. */
const CANDADO = 'bi0a100:migraciones';

/**
 * Aplica las migraciones pendientes al arrancar, solo con TYPEORM_MIGRATIONS_RUN=true.
 *
 * Antes lo hacía `AppDataSource.initialize()` por su cuenta (`migrationsRun`),
 * sin candado. En `docker-compose.prod.yml` la API y el worker cargan el mismo
 * `.env.production` y arrancan casi a la vez: los dos migraban en paralelo y uno
 * se caía con `duplicate key value violates unique constraint
 * "pg_class_relname_nsp_index"` (reproducido contra una base vacía y con una sola
 * migración pendiente). `restart: always` lo levantaba al siguiente intento, pero
 * una migración de datos no idempotente podía aplicarse dos veces.
 *
 * Ahora quien llega primero toma `pg_advisory_lock` y migra; el otro espera en el
 * candado y, al entrar, ya no encuentra nada pendiente. Va en un DataSource
 * propio y efímero porque el de la app corta cada consulta a los 30 s
 * (`statement_timeout`): una migración sobre una tabla grande, o la espera del
 * candado, no deben morir por eso. En Railway las migraciones ya corren antes
 * del deploy (`preDeployCommand`), así que aquí no queda nada que hacer.
 *
 * Devuelve cuántas migraciones aplicó este proceso.
 */
export async function migrarAlArrancar(): Promise<number> {
  if (process.env.TYPEORM_MIGRATIONS_RUN !== 'true') return 0;

  const extra = (AppDataSource.options as { extra?: Record<string, unknown> }).extra ?? {};
  const ds = new DataSource({
    ...AppDataSource.options,
    synchronize: false,
    migrationsRun: false,
    logging: ['error'],
    extra: { ...extra, max: 2, min: 0, statement_timeout: 0, idle_in_transaction_session_timeout: 0 },
  } as DataSourceOptions);

  await ds.initialize();
  const candado = ds.createQueryRunner();
  try {
    await candado.connect();
    await candado.query('SELECT pg_advisory_lock(hashtext($1))', [CANDADO]);
    try {
      const aplicadas = await ds.runMigrations({ transaction: 'all' });
      if (aplicadas.length) {
        logger.info(`[boot] Migraciones aplicadas: ${aplicadas.map((m) => m.name).join(', ')}`);
      }
      return aplicadas.length;
    } finally {
      await candado.query('SELECT pg_advisory_unlock(hashtext($1))', [CANDADO]);
    }
  } finally {
    await candado.release();
    await ds.destroy();
  }
}
