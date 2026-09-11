import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dos features nuevas de Ventas que reusan datos ya recolectados (ICP): un
 * generador de rebatidas de objeciones y una secuencia de seguimiento.
 * Ambas se generan perezosamente y se cachean aquí. Ver
 * backend/src/services/ventas/ventasService.ts (generarRebatidas/generarFollowUps).
 * Sincronizado con backend/src/models/AnalisisVentas.ts
 */
export class AddRebatidasYFollowupsToAnalisisVentas1775370000000 implements MigrationInterface {
  name = 'AddRebatidasYFollowupsToAnalisisVentas1775370000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_ventas" ADD COLUMN IF NOT EXISTS "rebatidas_objeciones_data" jsonb`);
    await queryRunner.query(`ALTER TABLE "analisis_ventas" ADD COLUMN IF NOT EXISTS "followups_data" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_ventas" DROP COLUMN IF EXISTS "followups_data"`);
    await queryRunner.query(`ALTER TABLE "analisis_ventas" DROP COLUMN IF EXISTS "rebatidas_objeciones_data"`);
  }
}
