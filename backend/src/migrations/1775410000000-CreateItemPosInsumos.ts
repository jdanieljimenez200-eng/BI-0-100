import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Receta (BOM) de cada item del catalogo POS: que insumos consume y cuanto.
 *
 * Es lo que permite que vender descuente almacen y que exista un costo de venta
 * real. Un item sin filas aqui simplemente no descuenta nada (comportamiento
 * identico al anterior a esta migracion).
 */
export class CreateItemPosInsumos1775410000000 implements MigrationInterface {
  name = 'CreateItemPosInsumos1775410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "item_pos_insumos" (
        "id"           uuid NOT NULL DEFAULT public.uuid_generate_v4(),
        "usuario_id"   uuid NOT NULL,
        "item_pos_id"  uuid NOT NULL,
        "insumo_id"    uuid NOT NULL,
        "cantidad"     numeric(12,3) NOT NULL DEFAULT 0,
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_item_pos_insumos" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "item_pos_insumos"
          ADD CONSTRAINT "FK_item_pos_insumos_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "item_pos_insumos"
          ADD CONSTRAINT "FK_item_pos_insumos_item"
          FOREIGN KEY ("item_pos_id") REFERENCES "items_pos"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "item_pos_insumos"
          ADD CONSTRAINT "FK_item_pos_insumos_insumo"
          FOREIGN KEY ("insumo_id") REFERENCES "insumos_inventario"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // Un insumo no puede aparecer dos veces en la misma receta: si no, la
    // expansion del carrito lo descontaria dos veces.
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_item_pos_insumos_item_insumo" ON "item_pos_insumos" ("item_pos_id", "insumo_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_item_pos_insumos_usuario" ON "item_pos_insumos" ("usuario_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_item_pos_insumos_insumo" ON "item_pos_insumos" ("insumo_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "item_pos_insumos"`);
  }
}
