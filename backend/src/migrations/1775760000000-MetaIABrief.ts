import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Transparencia de la IA en el Brief de marca (brief@2), como en los otros
 * cinco módulos: confianza, supuestos, contexto que faltó, secciones extra y
 * ocultas del admin, y con qué versión de prompt se hizo.
 */
export class MetaIABrief1775760000000 implements MigrationInterface {
  name = 'MetaIABrief1775760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_brief" ADD COLUMN IF NOT EXISTS "meta_ia" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_brief" DROP COLUMN IF EXISTS "meta_ia"`);
  }
}
