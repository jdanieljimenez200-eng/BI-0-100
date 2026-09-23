import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices: quitar los que sobran y añadir el que falta.
 *
 * Cada índice de más se paga en CADA escritura (una venta toca ventas,
 * venta_items, movimientos_inventario y movimientos_contables), así que en las
 * tablas calientes duele.
 *
 * 1. Duplicados exactos: dos índices con las mismas columnas, uno del modelo y
 *    otro creado a mano en una migración antigua. Se conserva el del modelo
 *    (el decorador `@Index`) para que entidad y base digan lo mismo.
 * 2. `(usuario_id)` suelto en tablas que ya tienen un compuesto que empieza por
 *    `usuario_id`: Postgres usa el prefijo del compuesto, así que el suelto no
 *    aporta nada. Los decoradores correspondientes también se quitan.
 * 3. Falta el índice del orden real de Contabilidad: se pagina por
 *    `(usuario_id, producto_id)` ordenando por `fecha DESC`.
 */
export class LimpiezaIndices1775630000000 implements MigrationInterface {
  name = 'LimpiezaIndices1775630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Duplicados exactos.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clientes_usuario_tipo_contacto"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_marcas_usuario_producto"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_venta_items_item_pos_id"`);

    // 2. `(usuario_id)` cubierto por un compuesto (nombres generados por TypeORM).
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_edcf87e2f9017c3bd010d54b2d"`); // clientes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_a1662fa22f39475bb39bf010ef"`); // citas
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_de57c2896aac257e6a756b71e2"`); // cotizaciones

    // 3. Orden real del listado de Contabilidad.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_mov_cont_cuenta_producto_fecha"
         ON "movimientos_contables" ("usuario_id", "producto_id", "fecha" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mov_cont_cuenta_producto_fecha"`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_de57c2896aac257e6a756b71e2" ON "cotizaciones" ("usuario_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_a1662fa22f39475bb39bf010ef" ON "citas" ("usuario_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_edcf87e2f9017c3bd010d54b2d" ON "clientes" ("usuario_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_venta_items_item_pos_id" ON "venta_items" ("item_pos_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_marcas_usuario_producto" ON "marcas" ("usuario_id", "producto_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_clientes_usuario_tipo_contacto" ON "clientes" ("usuario_id", "tipo_contacto")`);
  }
}
