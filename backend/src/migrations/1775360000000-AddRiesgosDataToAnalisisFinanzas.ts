import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Riesgos financieros del negocio (movido desde Ventas: "por qué fallan" era
 * contenido financiero, no una táctica de venta). Ver
 * backend/src/services/finanzas/riesgosService.ts.
 * Sincronizado con backend/src/models/AnalisisFinanzas.ts
 */
export class AddRiesgosDataToAnalisisFinanzas1775360000000 implements MigrationInterface {
  name = 'AddRiesgosDataToAnalisisFinanzas1775360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_finanzas" ADD COLUMN IF NOT EXISTS "riesgos_data" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_finanzas" DROP COLUMN IF EXISTS "riesgos_data"`);
  }
}
