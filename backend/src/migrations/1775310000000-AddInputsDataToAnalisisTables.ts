import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mercado, Marketing, Legal y Brief no persistían el payload que originó cada
 * análisis (a diferencia de Finanzas, que ya tiene `inputs_data`, y Ventas,
 * que lo reconstruye desde columnas dedicadas). Se necesita para el panel de
 * Progreso: "reportar resultados" parte de los inputs del análisis anterior.
 * Sincronizado con los @Column({ type: 'jsonb', nullable: true }) inputs_data
 * añadidos a los modelos AnalisisMercado, AnalisisMarketing, AnalisisLegal y
 * AnalisisBrief.
 */
export class AddInputsDataToAnalisisTables1775310000000 implements MigrationInterface {
  name = 'AddInputsDataToAnalisisTables1775310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_mercado" ADD COLUMN IF NOT EXISTS "inputs_data" jsonb`);
    await queryRunner.query(`ALTER TABLE "analisis_marketing" ADD COLUMN IF NOT EXISTS "inputs_data" jsonb`);
    await queryRunner.query(`ALTER TABLE "analisis_legal" ADD COLUMN IF NOT EXISTS "inputs_data" jsonb`);
    await queryRunner.query(`ALTER TABLE "analisis_brief" ADD COLUMN IF NOT EXISTS "inputs_data" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_brief" DROP COLUMN IF EXISTS "inputs_data"`);
    await queryRunner.query(`ALTER TABLE "analisis_legal" DROP COLUMN IF EXISTS "inputs_data"`);
    await queryRunner.query(`ALTER TABLE "analisis_marketing" DROP COLUMN IF EXISTS "inputs_data"`);
    await queryRunner.query(`ALTER TABLE "analisis_mercado" DROP COLUMN IF EXISTS "inputs_data"`);
  }
}
