import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Check-in de confianza (separado del dato duro, patrón Perdoo/Lattice) e
 * impacto medido (delta de score tras re-analizar) sobre los resultados
 * reportados en el panel de Progreso.
 * Sincronizado con backend/src/models/ProgresoResultadoReportado.ts
 */
export class AddConfianzaYDeltaScoreAResultadosReportados1775340000000 implements MigrationInterface {
  name = 'AddConfianzaYDeltaScoreAResultadosReportados1775340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "progreso_resultados_reportados" ADD COLUMN IF NOT EXISTS "confianza" varchar(10)`);
    await queryRunner.query(`ALTER TABLE "progreso_resultados_reportados" ADD COLUMN IF NOT EXISTS "confianza_nota" text`);
    await queryRunner.query(`ALTER TABLE "progreso_resultados_reportados" ADD COLUMN IF NOT EXISTS "delta_score" smallint`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "progreso_resultados_reportados" DROP COLUMN IF EXISTS "delta_score"`);
    await queryRunner.query(`ALTER TABLE "progreso_resultados_reportados" DROP COLUMN IF EXISTS "confianza_nota"`);
    await queryRunner.query(`ALTER TABLE "progreso_resultados_reportados" DROP COLUMN IF EXISTS "confianza"`);
  }
}
