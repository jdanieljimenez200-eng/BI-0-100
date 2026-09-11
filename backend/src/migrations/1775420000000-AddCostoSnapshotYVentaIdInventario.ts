import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `costo_unitario_snapshot` congela el costo del item EN EL MOMENTO de la venta.
 *
 * No es un extra: el costo promedio ponderado del insumo cambia con cada entrada
 * de almacen, asi que si no se guarda aqui el margen historico es irrecuperable.
 * Todo el reporte de rentabilidad depende de esta columna.
 *
 * `movimientos_inventario.venta_id` permite unir el reporte de almacen con el de
 * ventas y hacer drill-down de una salida hasta su ticket.
 */
export class AddCostoSnapshotYVentaIdInventario1775420000000 implements MigrationInterface {
  name = 'AddCostoSnapshotYVentaIdInventario1775420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // NULL (no 0) = "no se conocia el costo". Un 0 se confundiria con margen 100%.
    await queryRunner.query(`ALTER TABLE "venta_items" ADD COLUMN IF NOT EXISTS "costo_unitario_snapshot" numeric(12,4)`);
    await queryRunner.query(`ALTER TABLE "movimientos_inventario" ADD COLUMN IF NOT EXISTS "venta_id" uuid`);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "movimientos_inventario"
          ADD CONSTRAINT "FK_movimientos_inventario_venta"
          FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_movimientos_inventario_venta" ON "movimientos_inventario" ("venta_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_movimientos_inventario_venta"`);
    await queryRunner.query(`ALTER TABLE "movimientos_inventario" DROP CONSTRAINT IF EXISTS "FK_movimientos_inventario_venta"`);
    await queryRunner.query(`ALTER TABLE "movimientos_inventario" DROP COLUMN IF EXISTS "venta_id"`);
    await queryRunner.query(`ALTER TABLE "venta_items" DROP COLUMN IF EXISTS "costo_unitario_snapshot"`);
  }
}
