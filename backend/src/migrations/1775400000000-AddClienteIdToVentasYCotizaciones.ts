import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cablea POS y Cotizaciones con el CRM.
 *
 * `cliente_nombre` / `cliente_telefono` NO se eliminan: siguen siendo el
 * snapshot legible del ticket (mismo criterio que VentaItem.nombre_snapshot).
 * La FK es para agregar; el snapshot es para leer cuando el cliente ya no está.
 */
export class AddClienteIdToVentasYCotizaciones1775400000000 implements MigrationInterface {
  name = 'AddClienteIdToVentasYCotizaciones1775400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "cliente_id" uuid`);
    await queryRunner.query(`ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "cotizacion_id" uuid`);
    await queryRunner.query(`ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "cliente_id" uuid`);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "ventas"
          ADD CONSTRAINT "FK_ventas_cliente"
          FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "ventas"
          ADD CONSTRAINT "FK_ventas_cotizacion"
          FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "cotizaciones"
          ADD CONSTRAINT "FK_cotizaciones_cliente"
          FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ventas_usuario_cliente" ON "ventas" ("usuario_id", "cliente_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ventas_cotizacion" ON "ventas" ("cotizacion_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cotizaciones_usuario_cliente" ON "cotizaciones" ("usuario_id", "cliente_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cotizaciones_usuario_cliente"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ventas_cotizacion"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ventas_usuario_cliente"`);
    await queryRunner.query(`ALTER TABLE "cotizaciones" DROP CONSTRAINT IF EXISTS "FK_cotizaciones_cliente"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT IF EXISTS "FK_ventas_cotizacion"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT IF EXISTS "FK_ventas_cliente"`);
    await queryRunner.query(`ALTER TABLE "cotizaciones" DROP COLUMN IF EXISTS "cliente_id"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN IF EXISTS "cotizacion_id"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN IF EXISTS "cliente_id"`);
  }
}
