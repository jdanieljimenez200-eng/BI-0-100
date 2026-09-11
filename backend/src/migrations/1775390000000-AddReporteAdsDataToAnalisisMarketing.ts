import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReporteAdsDataToAnalisisMarketing1775390000000 implements MigrationInterface {
  name = 'AddReporteAdsDataToAnalisisMarketing1775390000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_marketing" ADD COLUMN IF NOT EXISTS "reporte_ads_data" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_marketing" DROP COLUMN IF EXISTS "reporte_ads_data"`);
  }
}
