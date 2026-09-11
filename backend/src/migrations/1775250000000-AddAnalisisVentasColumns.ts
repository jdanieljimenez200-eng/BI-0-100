import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega columnas requeridas por el módulo de ventas funcional a analisis_ventas:
 *  - perfil_cliente_data: Perfil del cliente ideal (ICP) generado por IA y editable
 *  - evaluaciones_guion_data: Historial de evaluaciones de guiones/CTAs (array jsonb)
 *  - competidores_data: Competidores y su análisis comparativo (array jsonb)
 *
 * Idempotente (IF NOT EXISTS) para tolerar bases de datos en cualquier estado.
 */
export class AddAnalisisVentasColumns1775250000000 implements MigrationInterface {
  name = 'AddAnalisisVentasColumns1775250000000';

  private async tablaExiste(qr: QueryRunner): Promise<boolean> {
    const res = await qr.query(
      `SELECT to_regclass('public."analisis_ventas"') IS NOT NULL AS existe`
    );
    return Array.isArray(res) && res[0]?.existe === true;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tablaExiste(queryRunner))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "analisis_ventas"
        ADD COLUMN IF NOT EXISTS "perfil_cliente_data" jsonb NULL,
        ADD COLUMN IF NOT EXISTS "evaluaciones_guion_data" jsonb NULL,
        ADD COLUMN IF NOT EXISTS "competidores_data" jsonb NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tablaExiste(queryRunner))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "analisis_ventas"
        DROP COLUMN IF EXISTS "perfil_cliente_data",
        DROP COLUMN IF EXISTS "evaluaciones_guion_data",
        DROP COLUMN IF EXISTS "competidores_data"
    `);
  }
}
