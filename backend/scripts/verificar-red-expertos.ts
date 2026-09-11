/**
 * Comprueba que las entidades de la red de expertos coinciden con el esquema
 * que dejó la migración: inserta, lee y borra con los repositorios de TypeORM.
 *
 * Un desajuste entre entidad y tabla (una columna que no existe, un tipo que no
 * cuadra) no lo detecta ni el typecheck ni el linter — solo se ve al hablar con
 * la base de verdad.
 *
 *   docker compose exec -T backend npx ts-node scripts/verificar-red-expertos.ts
 */
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { Experto } from '../src/models/Experto';
import { ResenaExperto } from '../src/models/ResenaExperto';
import { PatrocinioExperto } from '../src/models/PatrocinioExperto';
import { Usuario } from '../src/models/Usuario';

const ok = (bien: boolean, msg: string, extra = '') => {
  console.log(`${bien ? 'PASA ' : 'FALLA'}  ${msg}${extra ? ' — ' + extra : ''}`);
  if (!bien) process.exitCode = 1;
};

async function main() {
  await AppDataSource.initialize();
  const expertos = AppDataSource.getRepository(Experto);
  const resenas = AppDataSource.getRepository(ResenaExperto);
  const patrocinios = AppDataSource.getRepository(PatrocinioExperto);

  const usuario = await AppDataSource.getRepository(Usuario).findOne({ where: {} });
  if (!usuario) throw new Error('no hay usuarios en la base para la prueba');

  // ── Alta: solo se rellenan los campos obligatorios ────────────────────
  const creado = await expertos.save(
    expertos.create({
      usuario_id: usuario.id,
      nombre_comercial: 'Verificación TypeORM',
      nombre_display: 'Verificación',
      categoria: 'legal',
      sub_especialidades: ['mercantil', 'societario'],
    })
  );

  const leido = await expertos.findOneOrFail({ where: { id: creado.id } });
  ok(leido.estado === 'pendiente', 'nace en pendiente', leido.estado);
  ok(leido.verificado === false, 'nace sin verificar');
  ok(Array.isArray(leido.sub_especialidades) && leido.sub_especialidades.length === 2,
     'sub_especialidades va y vuelve como array', JSON.stringify(leido.sub_especialidades));
  ok(Number(leido.rating_promedio) === 0 && leido.total_resenas === 0, 'rating a cero');
  ok(leido.documento_url === null && leido.tarifa_desde === null, 'opcionales nulos, no cero');
  ok(leido.fecha_aprobacion === null, 'sin fecha de aprobación');

  // ── Reseña ────────────────────────────────────────────────────────────
  const resena = await resenas.save(
    resenas.create({ experto_id: creado.id, usuario_id: usuario.id, puntuacion: 4, comentario: 'ok' })
  );
  ok(resena.estado === 'publicada', 'la reseña nace publicada', resena.estado);

  let duplicada = false;
  try {
    await resenas.save(resenas.create({ experto_id: creado.id, usuario_id: usuario.id, puntuacion: 1 }));
  } catch {
    duplicada = true;
  }
  ok(duplicada, 'una segunda reseña del mismo usuario es rechazada');

  // ── Patrocinio ────────────────────────────────────────────────────────
  const patro = await patrocinios.save(
    patrocinios.create({ experto_id: creado.id, categoria: 'legal', prioridad: 10 })
  );
  ok(patro.estado === 'activo' && patro.fecha_fin === null, 'el patrocinio nace activo y sin fin');

  // ── El listado del directorio filtra por estado ────────────────────────
  const publicos = await expertos.find({ where: { estado: 'aprobado', categoria: 'legal' } });
  ok(!publicos.some((e) => e.id === creado.id), 'un experto pendiente NO sale en el directorio');

  // ── Borrado en cascada ────────────────────────────────────────────────
  await expertos.delete(creado.id);
  ok((await resenas.countBy({ experto_id: creado.id })) === 0, 'borrar el experto borra sus reseñas');
  ok((await patrocinios.countBy({ experto_id: creado.id })) === 0, 'borrar el experto borra sus patrocinios');

  await AppDataSource.destroy();
}

main().catch(async (e) => {
  console.error('ERROR', e.message);
  process.exitCode = 1;
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
});
