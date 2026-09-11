import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 1 — Trazabilidad del Libro Mayor.
 *
 * Añade `referencia_tipo` y `referencia_id` a `movimientos_contables` para
 * reconstruir con exactitud qué entidad (venta, cotización, pago, etc.) originó
 * cada movimiento. Aditiva e idempotente.
 */
export class MovimientoTrazabilidad1775110000000 implements MigrationInterface {
  name = 'MovimientoTrazabilidad1775110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "movimientos_contables" ADD COLUMN IF NOT EXISTS "referencia_tipo" character varying(30)`);
    await queryRunner.query(`ALTER TABLE "movimientos_contables" ADD COLUMN IF NOT EXISTS "referencia_id" uuid`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_movimientos_referencia" ON "movimientos_contables" ("referencia_tipo", "referencia_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_movimientos_referencia"`);
    await queryRunner.query(`ALTER TABLE "movimientos_contables" DROP COLUMN IF EXISTS "referencia_id"`);
    await queryRunner.query(`ALTER TABLE "movimientos_contables" DROP COLUMN IF EXISTS "referencia_tipo"`);
  }
}
