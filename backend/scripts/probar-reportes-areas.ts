/**
 * Ejecuta todas las áreas de reportes contra una cuenta real y resume lo que
 * devuelven. Sirve para cazar errores de SQL y ver que los números cuadran.
 *
 *   docker compose exec -T backend npx ts-node scripts/probar-reportes-areas.ts <email> [desde] [hasta]
 */
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { Usuario } from '../src/models/Usuario';
import * as areas from '../src/services/reportes/reportesAreas';

async function main() {
  const [email, desde = '2025-01-01', hasta = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
  if (!email) throw new Error('uso: probar-reportes-areas.ts <email> [desde] [hasta]');
  await AppDataSource.initialize();

  const u = await AppDataSource.getRepository(Usuario).findOneOrFail({ where: { email } });
  const f = { usuarioId: u.id, desde, hasta, tz: 'America/Mexico_City' };

  const visibles = await areas.areasDisponibles(u.id);
  console.log('áreas visibles:', visibles);

  let fallos = 0;
  for (const area of areas.AREAS) {
    const t0 = Date.now();
    try {
      const r = (await areas.CALCULAR_AREA[area](f)) as Record<string, unknown>;
      console.log(`\n[${area}] ok en ${Date.now() - t0} ms — claves: ${Object.keys(r).join(', ')}`);
      console.log(JSON.stringify(r, null, 0).slice(0, 700));
    } catch (e) {
      fallos++;
      console.log(`\n[${area}] FALLA: ${(e as Error).message}`);
    }
  }

  try {
    const c = await areas.completo(f, visibles);
    console.log('\n[completo] alertas:', JSON.stringify(c.panorama.alertas));
    console.log('[completo] kpis:', JSON.stringify(c.panorama.kpis));
  } catch (e) {
    fallos++;
    console.log(`\n[completo] FALLA: ${(e as Error).message}`);
  }

  await AppDataSource.destroy();
  process.exitCode = fallos ? 1 : 0;
}

main().catch(async (e) => {
  console.error('ERROR', e.message);
  process.exitCode = 1;
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
});
