import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Transparencia de la IA en los análisis de Marketing (marketing@2), como en
 * Mercado, Finanzas y Ventas: confianza, supuestos, contexto que faltó,
 * secciones extra y ocultas del admin, y con qué versión de prompt se hizo.
 */
export class MetaIAMarketing1775750000000 implements MigrationInterface {
  name = 'MetaIAMarketing1775750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_marketing" ADD COLUMN IF NOT EXISTS "meta_ia" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_marketing" DROP COLUMN IF EXISTS "meta_ia"`);
  }
}
