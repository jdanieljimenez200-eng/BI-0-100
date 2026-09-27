/**
 * Guardia de los scripts de datos de demostración (seeds y utilidades de demo).
 *
 * Importar como PRIMERA línea del script: `import './guardiaSeeds';` (o
 * `'../scripts/guardiaSeeds'`). Se ejecuta antes que cualquier otro import y
 * aborta el proceso si el destino parece producción.
 *
 * Estos scripts crean cuentas con contraseñas escritas en el repositorio
 * (`Demo123!`, `Admin123!`…) y algunos borran datos. Antes varios no tenían
 * ninguna guardia, y los que sí la tenían solo miraban NODE_ENV: un
 * `DATABASE_URL` de producción en la terminal bastaba para sembrarla.
 *
 * Se aborta si:
 *  - NODE_ENV=production, o
 *  - la base de datos no está en un host local o del docker-compose,
 * salvo que se declare SEED_PERMITIR_REMOTO=true (p. ej. un entorno de staging).
 */
import dotenv from 'dotenv';

// Carga el mismo .env que el script cargaría después, para juzgar el destino
// real. Dentro de Jest no: contaminaría el entorno del resto de la suite.
if (!process.env.JEST_WORKER_ID) dotenv.config();

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db', 'bi0a100-postgres', 'host.docker.internal']);

export function hostDeBaseDeDatos(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.DATABASE_URL) {
    try {
      return new URL(env.DATABASE_URL).hostname.replace(/^\[|\]$/g, '');
    } catch {
      return null;
    }
  }
  return env.DB_HOST || 'postgres';
}

export function motivoParaAbortar(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV === 'production') return 'NODE_ENV=production';
  if (env.SEED_PERMITIR_REMOTO === 'true') return null;
  const host = hostDeBaseDeDatos(env);
  if (host === null) return 'DATABASE_URL no se puede interpretar';
  if (!HOSTS_LOCALES.has(host)) return `la base de datos está en un host remoto (${host})`;
  return null;
}

const motivo = motivoParaAbortar();
if (motivo && !process.env.JEST_WORKER_ID) {
  const script = process.argv[1] ?? 'script';
  // eslint-disable-next-line no-console
  console.error(
    `[seeds] Abortado ${script}: ${motivo}. Estos scripts son solo para desarrollo local ` +
      '(define SEED_PERMITIR_REMOTO=true si de verdad es un entorno de pruebas).'
  );
  process.exit(1);
}

// Las columnas `timestamp` (sin zona) guardan la hora de pared del proceso que
// escribe: node-postgres convierte cada Date a la hora local. Docker y
// producción corren en UTC, igual que los `DEFAULT now()`; un seed lanzado desde
// una terminal en Ciudad de México guardaba el mismo instante 6 horas antes
// (12:30 en vez de 18:30). Dentro de Jest no se toca: la suite decide su zona.
if (!process.env.JEST_WORKER_ID) process.env.TZ = 'UTC';
