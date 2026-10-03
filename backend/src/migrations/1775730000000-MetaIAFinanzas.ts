import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Finanzas v2.
 *
 *  - `meta_ia`: confianza, supuestos, información faltante, secciones extra y
 *    ocultas del admin, y con qué versión de prompt se hizo (como Mercado).
 *  - `pais`: la ruta nunca lo llenaba y quedaba en el 'MX' por defecto, así que
 *    un análisis colombiano se mostraba en pesos mexicanos con IVA del 16 %. Se
 *    corrige con el país del producto, que es en el que se declararon los números.
 */
export class MetaIAFinanzas1775730000000 implements MigrationInterface {
  name = 'MetaIAFinanzas1775730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_finanzas" ADD COLUMN IF NOT EXISTS "meta_ia" jsonb`);
    await queryRunner.query(`
      UPDATE "analisis_finanzas" a
         SET "pais" = upper(p."pais")
        FROM "productos" p
       WHERE p."id" = a."producto_id"
         AND p."pais" IS NOT NULL
         AND length(p."pais") = 2
         AND a."pais" IS DISTINCT FROM upper(p."pais")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // El país corregido no se revierte: el 'MX' anterior era un error, no un dato.
    await queryRunner.query(`ALTER TABLE "analisis_finanzas" DROP COLUMN IF EXISTS "meta_ia"`);
  }
}
