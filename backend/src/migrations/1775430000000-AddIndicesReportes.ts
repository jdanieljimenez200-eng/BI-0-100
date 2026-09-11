import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indices compuestos para las agregaciones de /api/reportes.
 *
 * Los indices sueltos por `fecha` que ya existian no sirven aqui: toda consulta
 * de reportes filtra SIEMPRE por usuario primero y luego por rango de fechas.
 */
export class AddIndicesReportes1775430000000 implements MigrationInterface {
  name = 'AddIndicesReportes1775430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ventas_usuario_fecha" ON "ventas" ("usuario_id", "fecha")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_mov_inv_usuario_fecha_tipo" ON "movimientos_inventario" ("usuario_id", "fecha", "tipo")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_mov_cont_usuario_fecha_tipo" ON "movimientos_contables" ("usuario_id", "fecha", "tipo")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_venta_items_item_pos" ON "venta_items" ("item_pos_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_venta_items_item_pos"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mov_cont_usuario_fecha_tipo"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mov_inv_usuario_fecha_tipo"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ventas_usuario_fecha"`);
  }
}
