import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reversión de decisión de producto: el historial de progreso (score por
 * análisis, resultados reportados, snapshots) crecía indefinidamente y era
 * caro de mantener sin aportar suficiente valor. Se reemplaza por un
 * "resumen completo" generado bajo demanda (sin persistencia), con
 * recomendación de cuándo repetirlo y accesos directos a cada formulario.
 *
 * Elimina las 3 tablas de tracking y las columnas `inputs_data` que solo
 * existían para alimentar ese mecanismo (Finanzas conserva su propio
 * `inputs_data`, que es anterior a este mecanismo y no depende de él).
 */
export class RevertProgresoHistorialTracking1775350000000 implements MigrationInterface {
  name = 'RevertProgresoHistorialTracking1775350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "progreso_modulo_scores"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "progreso_resultados_reportados"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "progreso_snapshots"`);

    await queryRunner.query(`ALTER TABLE "analisis_mercado" DROP COLUMN IF EXISTS "inputs_data"`);
    await queryRunner.query(`ALTER TABLE "analisis_marketing" DROP COLUMN IF EXISTS "inputs_data"`);
    await queryRunner.query(`ALTER TABLE "analisis_legal" DROP COLUMN IF EXISTS "inputs_data"`);
    await queryRunner.query(`ALTER TABLE "analisis_brief" DROP COLUMN IF EXISTS "inputs_data"`);
  }

  public async down(): Promise<void> {
    // No se revierte: la decisión de producto fue eliminar este mecanismo,
    // no pausarlo. Si se necesita de nuevo, se re-crea con una migración nueva.
  }
}
