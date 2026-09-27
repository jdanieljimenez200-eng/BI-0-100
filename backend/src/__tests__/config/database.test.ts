import type { DataSource } from 'typeorm';

/**
 * `synchronize` no se activa nunca, pase lo que pase en el entorno.
 *
 * Con el interruptor antiguo (`!isProd && TYPEORM_SYNCHRONIZE !== 'false'`),
 * `npm run seed:demo` lanzado desde una terminal sin esa variable sincronizaba
 * la base al conectar y borraba los índices, FK y CHECK que solo crean las
 * migraciones. Se carga el módulo aislado para leer las opciones con cada
 * entorno, sin abrir conexión (el constructor de DataSource solo las guarda).
 */
/** Carga `ruta` en un registro de módulos limpio y devuelve su export `nombre`. */
function cargarAislado(ruta: string, nombre: string): DataSource {
  let ds: DataSource | undefined;
  jest.isolateModules(() => {
    ds = require(ruta)[nombre];
  });
  if (!ds) throw new Error(`${ruta} no exporta ${nombre}`);
  return ds;
}

function opcionesCon(env: Record<string, string | undefined>) {
  const previo = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return cargarAislado('../../config/database', 'AppDataSource').options;
  } finally {
    process.env = previo;
  }
}

describe('config/database — synchronize', () => {
  it.each([
    ['desarrollo sin la variable', { NODE_ENV: 'development', TYPEORM_SYNCHRONIZE: undefined }],
    ['test sin la variable', { NODE_ENV: 'test', TYPEORM_SYNCHRONIZE: undefined }],
    ['alguien la pone a true', { NODE_ENV: 'development', TYPEORM_SYNCHRONIZE: 'true' }],
    ['producción', { NODE_ENV: 'production', TYPEORM_SYNCHRONIZE: undefined }],
  ])('está apagado: %s', (_caso, env) => {
    expect(opcionesCon(env).synchronize).toBe(false);
  });

  it('no migra al conectar aunque TYPEORM_MIGRATIONS_RUN=true (lo hace migrarAlArrancar con candado)', () => {
    expect(opcionesCon({ NODE_ENV: 'production', TYPEORM_MIGRATIONS_RUN: 'true' }).migrationsRun).toBe(false);
  });

  it('la CLI de migraciones tampoco sincroniza', () => {
    const cli = cargarAislado('../../config/cli-datasource', 'CliDataSource');
    expect(cli.options.synchronize).toBe(false);
    expect(cli.options.migrationsRun).toBe(false);
  });
});
