import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Una cotización puede volver a venderse si su venta se canceló.
 *
 * `UQ_ventas_cotizacion` impedía cualquier segunda venta con la misma
 * cotización, también cuando la primera estaba cancelada. Pero al cancelar la
 * venta el POS devuelve la cotización a 'enviada', así que la interfaz la
 * ofrecía para convertir otra vez y la conversión chocaba con el índice.
 *
 * Lo único que debe ser único es la venta VIGENTE de cada cotización: el índice
 * pasa a ser parcial y excluye las canceladas.
 */
export class VentaActivaPorCotizacion1775670000000 implements MigrationInterface {
  name = 'VentaActivaPorCotizacion1775670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ventas_cotizacion"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ventas_cotizacion" ON "ventas" ("cotizacion_id")
        WHERE "cotizacion_id" IS NOT NULL AND "estado" <> 'cancelada'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // El índice anterior no admite dos ventas con la misma cotización: a las
    // canceladas que tengan una vigente al lado se les quita el enlace.
    await queryRunner.query(`
      UPDATE ventas v SET cotizacion_id = NULL
       WHERE v.cotizacion_id IS NOT NULL
         AND v.estado = 'cancelada'
         AND EXISTS (
           SELECT 1 FROM ventas o
            WHERE o.cotizacion_id = v.cotizacion_id AND o.id <> v.id
              AND (o.estado <> 'cancelada' OR (o.fecha_creacion, o.id) < (v.fecha_creacion, v.id))
         )
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ventas_cotizacion"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ventas_cotizacion" ON "ventas" ("cotizacion_id") WHERE "cotizacion_id" IS NOT NULL`
    );
  }
}
