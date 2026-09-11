import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optimización de índices en base de datos:
 *  1. Indexa llaves foráneas huérfanas para acelerar JOINs y evitar sequential scans
 *     en eliminaciones y cascadas (ON DELETE SET NULL / CASCADE).
 *  2. Elimina índices redundantes duplicados que ralentizan INSERT/UPDATE/DELETE.
 */
export class AddForeignKeyIndexesAndDropDuplicates1775270000000 implements MigrationInterface {
  name = 'AddForeignKeyIndexesAndDropDuplicates1775270000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Índices en llaves foráneas ───────────────────────────────────────────
    if (await queryRunner.hasTable('venta_items')) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_venta_items_item_pos_id"
          ON "venta_items" ("item_pos_id")
      `);
    }

    if (await queryRunner.hasTable('invitaciones_trabajador')) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_invitaciones_trabajador_usado_por"
          ON "invitaciones_trabajador" ("usado_por")
      `);
    }

    if (await queryRunner.hasTable('pagos_nomina')) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_pagos_nomina_movimiento_id"
          ON "pagos_nomina" ("movimiento_id")
      `);
    }

    if (await queryRunner.hasTable('ventas')) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_ventas_movimiento_contable_id"
          ON "ventas" ("movimiento_contable_id")
      `);
    }

    if (await queryRunner.hasTable('movimientos_inventario')) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_movimientos_inventario_producto_id"
          ON "movimientos_inventario" ("producto_id")
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_movimientos_inventario_movimiento_id"
          ON "movimientos_inventario" ("movimiento_contable_id")
      `);
    }

    if (await queryRunner.hasTable('analisis_legal')) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_analisis_legal_producto_id"
          ON "analisis_legal" ("producto_id")
      `);
    }

    // ── 2. Eliminación de índices duplicados redundantes ────────────────────────
    // "productos"("usuario_id") ya está indexado por "idx_producto_usuario_id"
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_productos_usuario"`);

    // "analisis_mercado"("estado_analisis") ya está indexado por "IDX_1639fc7ae3af3fce1828731e06"
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_analisis_mercado_estado"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaurar índices si se requiere rollback
    if (await queryRunner.hasTable('analisis_mercado')) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_analisis_mercado_estado"
          ON "analisis_mercado" ("estado_analisis")
      `);
    }

    if (await queryRunner.hasTable('productos')) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_productos_usuario"
          ON "productos" ("usuario_id")
      `);
    }

    if (await queryRunner.hasTable('analisis_legal')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_analisis_legal_producto_id"`);
    }

    if (await queryRunner.hasTable('movimientos_inventario')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_movimientos_inventario_movimiento_id"`);
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_movimientos_inventario_producto_id"`);
    }

    if (await queryRunner.hasTable('ventas')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_ventas_movimiento_contable_id"`);
    }

    if (await queryRunner.hasTable('pagos_nomina')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_pagos_nomina_movimiento_id"`);
    }

    if (await queryRunner.hasTable('invitaciones_trabajador')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_invitaciones_trabajador_usado_por"`);
    }

    if (await queryRunner.hasTable('venta_items')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_venta_items_item_pos_id"`);
    }
  }
}
