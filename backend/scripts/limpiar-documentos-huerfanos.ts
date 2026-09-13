/**
 * Borra los documentos de acreditación que ya no pertenecen a ninguna ficha.
 *
 * Por qué hace falta: la ruta de baja de una ficha borra su cédula del almacén,
 * pero hay caminos que eliminan la fila sin pasar por esa ruta. El principal es
 * el borrado de la cuenta del usuario: `expertos.usuario_id` tiene
 * `ON DELETE CASCADE`, así que la base se lleva la ficha y el fichero se queda.
 * Una cédula que sobrevive a la baja de su dueño es justo lo que la ley de
 * protección de datos pide que no pase.
 *
 * Por defecto NO borra nada: enumera lo que borraría. Para borrar de verdad hay
 * que pedirlo explícitamente con `--borrar`.
 *
 *   docker compose exec -T backend npx ts-node scripts/limpiar-documentos-huerfanos.ts
 *   docker compose exec -T backend npx ts-node scripts/limpiar-documentos-huerfanos.ts --borrar
 *
 * Conviene programarlo (diario basta) mientras exista algún camino de borrado
 * que no limpie el almacén por sí mismo.
 */
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { listarClaves, borrarDocumento } from '../src/services/network/documentosService';

/**
 * Un fichero más reciente que esto no se toca aunque parezca huérfano.
 *
 * La subida guarda primero el fichero y después la fila de la ficha. Si el
 * script lista el almacén entre esos dos pasos, ve un fichero sin dueño que en
 * realidad está a milisegundos de tenerlo, y borrarlo dejaría la ficha apuntando
 * a un documento que ya no existe. Una hora es de sobra para cualquier subida.
 */
const ANTIGUEDAD_MINIMA_MS = 60 * 60 * 1000;

async function main() {
  const borrar = process.argv.includes('--borrar');
  await AppDataSource.initialize();

  const [enAlmacen, filas] = await Promise.all([
    listarClaves(),
    AppDataSource.query(`SELECT documento_url FROM expertos WHERE documento_url IS NOT NULL`) as Promise<
      { documento_url: string }[]
    >,
  ]);

  const referenciadas = new Set(filas.map((f) => f.documento_url));
  const limite = Date.now() - ANTIGUEDAD_MINIMA_MS;
  const sinDueno = enAlmacen.filter((d) => !referenciadas.has(d.clave));
  const recientes = sinDueno.filter((d) => d.modificado.getTime() > limite);
  const huerfanas = sinDueno.filter((d) => d.modificado.getTime() <= limite).map((d) => d.clave);

  console.log(`Documentos en el almacén:   ${enAlmacen.length}`);
  console.log(`Referenciados por fichas:   ${referenciadas.size}`);
  console.log(`Sin dueño pero recientes:   ${recientes.length} (se respetan: pueden estar subiéndose)`);
  console.log(`Huérfanos:                  ${huerfanas.length}`);

  if (huerfanas.length === 0) {
    await AppDataSource.destroy();
    return;
  }

  if (!borrar) {
    console.log('\nSe borrarían (ejecuta con --borrar para hacerlo):');
    for (const clave of huerfanas) console.log(`  ${clave}`);
    await AppDataSource.destroy();
    return;
  }

  for (const clave of huerfanas) {
    await borrarDocumento(clave);
    console.log(`  borrado ${clave}`);
  }

  const quedan = (await listarClaves()).filter(
    (d) => !referenciadas.has(d.clave) && d.modificado.getTime() <= limite
  );
  console.log(`\nHuérfanos tras la limpieza: ${quedan.length}`);
  if (quedan.length > 0) process.exitCode = 1;

  await AppDataSource.destroy();
}

main().catch(async (e) => {
  console.error('ERROR', e.message);
  process.exitCode = 1;
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
});
