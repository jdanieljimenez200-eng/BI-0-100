import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El análisis de Mercado guarda de dónde salió la tracción.
 *
 * Hasta ahora «clientes al mes» y «tasa de repetición» venían solo de lo que el
 * dueño escribía en el formulario, aunque llevara meses cobrando con el POS de
 * la propia plataforma. Con esta columna el análisis conserva los números
 * reales que se usaron (y cuántos meses los respaldan), para que la pantalla
 * pueda decir «calculado con tus ventas» en vez de presentarlo como una
 * estimación más.
 */
export class TraccionRealMercado1775650000000 implements MigrationInterface {
  name = 'TraccionRealMercado1775650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_mercado" ADD COLUMN IF NOT EXISTS "traccion_data" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analisis_mercado" DROP COLUMN IF EXISTS "traccion_data"`);
  }
}
