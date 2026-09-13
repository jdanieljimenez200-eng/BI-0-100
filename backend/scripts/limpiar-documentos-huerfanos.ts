/**
 * Borra los documentos de acreditación que ya no pertenecen a ninguna ficha.
 *
 * El backend ya lo hace solo una vez al día (ver `programarPurgaPapelera` en
 * `services/admin/papelera.ts`). Este script existe para lanzarlo a mano.
 *
 * Por defecto NO borra nada: enumera lo que borraría. Para borrar de verdad hay
 * que pedirlo explícitamente con `--borrar`.
 *
 *   docker compose exec -T backend npx ts-node scripts/limpiar-documentos-huerfanos.ts
 *   docker compose exec -T backend npx ts-node scripts/limpiar-documentos-huerfanos.ts --borrar
 */
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { limpiarDocumentosHuerfanos } from '../src/services/admin/papelera';

async function main() {
  const borrar = process.argv.includes('--borrar');
  await AppDataSource.initialize();

  const r = await limpiarDocumentosHuerfanos({ borrar });

  console.log(`Documentos en el almacén:   ${r.enAlmacen}`);
  console.log(`Referenciados por fichas:   ${r.referenciadas}`);
  console.log(`Sin dueño pero recientes:   ${r.recientes} (se respetan: pueden estar subiéndose)`);
  console.log(`Huérfanos:                  ${r.huerfanas.length}`);

  if (r.huerfanas.length > 0) {
    console.log(borrar ? '\nBorrados:' : '\nSe borrarían (ejecuta con --borrar para hacerlo):');
    for (const clave of r.huerfanas) console.log(`  ${clave}`);
  }

  await AppDataSource.destroy();
}

main().catch(async (e) => {
  console.error('ERROR', e.message);
  process.exitCode = 1;
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
});
