import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Palabras clave de segmentación (Google Ads) e intereses (Meta Ads),
 * derivadas del ICP ya generado. Ver
 * backend/src/services/ventas/ventasService.ts (generarPalabrasClaveAds).
 * Sincronizado con backend/src/models/AnalisisVentas.ts
 */
export class AddPalabrasClaveAdsToAnalisisVentas1775380000000 implements MigrationInterface {
  name = 'AddPalabrasClaveAdsToAnalisisVentas1775380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_ventas" ADD COLUMN IF NOT EXISTS "palabras_clave_ads_data" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_ventas" DROP COLUMN IF EXISTS "palabras_clave_ads_data"`);
  }
}
