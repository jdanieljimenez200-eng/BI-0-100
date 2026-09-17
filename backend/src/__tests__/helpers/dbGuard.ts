// Tests de INTEGRACIÓN: requieren Postgres real (en CI se levanta como servicio).
//
// Escriben y no limpian (usuarios `test-*@example.com`, productos, análisis), así
// que SOLO pueden correr contra una base cuyo nombre contenga "test". Antes
// bastaba con que hubiera DATABASE_URL: dentro del contenedor de desarrollo eso
// apunta a bi0a100_db, y la base de desarrollo acumuló cientos de cuentas de
// prueba. Con una URL de producción habría sido peor.
//
// - Sin BD configurada: se saltan.
// - BD que no es de test: se saltan con aviso en local; en CI fallan, para que
//   una configuración equivocada no deje la integración sin ejecutar en verde.
//
// Local: crea `bi0a100_test`, aplica migraciones y corre la suite con
//   DATABASE_URL=postgresql://bi0a100_user:bi0a100_password@localhost:5432/bi0a100_test

/** Nombre de la base a la que apunta la configuración, o null si no hay ninguna. */
export function nombreBaseDeDatos(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.DATABASE_URL) {
    try {
      return decodeURIComponent(new URL(env.DATABASE_URL).pathname.replace(/^\//, '')) || null;
    } catch {
      return null;
    }
  }
  if (env.DB_HOST) return env.DB_NAME || 'bi0a100';
  return null;
}

export function esBaseDeTest(nombre: string | null): boolean {
  return nombre !== null && /test/i.test(nombre);
}

function elegirDescribe(): jest.Describe {
  const nombre = nombreBaseDeDatos();
  if (nombre === null) {
    if (process.env.CI) throw new Error('[tests] CI sin DATABASE_URL: los tests de integración no se ejecutarían');
    return describe.skip;
  }
  if (!esBaseDeTest(nombre)) {
    const mensaje = `[tests] La base "${nombre}" no es de test (su nombre debe contener "test"): se omiten los tests de integración para no escribir en ella.`;
    if (process.env.CI) throw new Error(mensaje);
    // eslint-disable-next-line no-console
    console.warn(mensaje);
    return describe.skip;
  }
  return describe;
}

export const describeWithDb = elegirDescribe();
