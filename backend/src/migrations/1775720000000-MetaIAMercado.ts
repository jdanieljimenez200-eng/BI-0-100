import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Transparencia de la IA en los análisis de Mercado.
 *
 * Legal la guarda dentro de `resultado_data`, pero Mercado reparte su resultado
 * en una columna por sección. `meta_ia` reúne lo que es del análisis entero:
 * nivel de confianza, supuestos, información faltante, secciones extra y
 * ocultas del admin, y con qué versión de prompt se hizo (`services/ia`).
 */
export class MetaIAMercado1775720000000 implements MigrationInterface {
  name = 'MetaIAMercado1775720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_mercado" ADD COLUMN IF NOT EXISTS "meta_ia" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_mercado" DROP COLUMN IF EXISTS "meta_ia"`);
  }
}
