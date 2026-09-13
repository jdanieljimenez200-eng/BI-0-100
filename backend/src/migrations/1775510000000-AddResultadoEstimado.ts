import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marca los análisis en los que alguna sección salió de plantilla porque la IA
 * falló (ver utils/seguimientoIA.ts).
 *
 * Sirve para dos cosas: avisar al usuario de que parte del resultado es una
 * estimación, y que ese análisis no le consuma la cuota del plan gratuito.
 */
const TABLAS = [
  'analisis_mercado',
  'analisis_marketing',
  'analisis_finanzas',
  'analisis_legal',
  'analisis_brief',
  'analisis_ventas',
];

export class AddResultadoEstimado1775510000000 implements MigrationInterface {
  name = 'AddResultadoEstimado1775510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of TABLAS) {
      await queryRunner.query(
        `ALTER TABLE "${tabla}" ADD COLUMN IF NOT EXISTS "resultado_estimado" boolean NOT NULL DEFAULT false`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of TABLAS) {
      await queryRunner.query(`ALTER TABLE "${tabla}" DROP COLUMN IF EXISTS "resultado_estimado"`);
    }
  }
}
