import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `venta_items.cantidad` pasa de numeric(8,2) a numeric(12,3), igual que el
 * inventario. Con 2 decimales, vender 0.125 kg guardaba 0.13 mientras el
 * subtotal se calculaba con 0.125: la línea no cuadraba (y el máximo era
 * 999 999.99 unidades).
 */
export class CantidadVentaTresDecimales1775610000000 implements MigrationInterface {
  name = 'CantidadVentaTresDecimales1775610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "venta_items" ALTER COLUMN "cantidad" TYPE numeric(12,3)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "venta_items" ALTER COLUMN "cantidad" TYPE numeric(8,2)`);
  }
}
