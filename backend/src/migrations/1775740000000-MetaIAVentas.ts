import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Transparencia de la IA en los análisis de Ventas (ventas@2), como en Mercado
 * y Finanzas: confianza, supuestos, datos del embudo que faltan, secciones
 * extra y ocultas del admin, y con qué versión de prompt se hizo.
 */
export class MetaIAVentas1775740000000 implements MigrationInterface {
  name = 'MetaIAVentas1775740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_ventas" ADD COLUMN IF NOT EXISTS "meta_ia" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_ventas" DROP COLUMN IF EXISTS "meta_ia"`);
  }
}
