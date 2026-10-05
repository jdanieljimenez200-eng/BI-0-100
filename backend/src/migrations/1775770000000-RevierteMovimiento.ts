import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cada asiento inverso de una venta cancelada apunta al asiento que revierte.
 *
 * La cancelación guarda todos sus asientos con la categoría «Cancelaciones», y
 * los cálculos no sabían qué revertían: una venta de $87 (con $12 de IVA)
 * cancelada salía en la base de la estimación fiscal como $99 de ingresos y en
 * el estado de resultados como $87 de gasto operativo. Con el vínculo, el
 * reverso de un ingreso resta ingresos y el de un impuesto resta impuestos.
 *
 * SET NULL y no NO ACTION: el vínculo solo sirve para clasificar; si el asiento
 * original desaparece (la purga de una cuenta borra todo junto) no debe frenar
 * el borrado. Lleva índice: la columna se une en cada agregado de Contabilidad.
 *
 * El relleno enlaza las cancelaciones que ya existen por su descripción, que
 * el código arma como «Cancelación <ticket> — <descripción del original>».
 */
export class RevierteMovimiento1775770000000 implements MigrationInterface {
  name = 'RevierteMovimiento1775770000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "movimientos_contables" ADD COLUMN IF NOT EXISTS "revierte_movimiento_id" uuid`
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "movimientos_contables"
          ADD CONSTRAINT "FK_movimientos_revierte" FOREIGN KEY ("revierte_movimiento_id")
          REFERENCES "movimientos_contables"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_movimientos_revierte" ON "movimientos_contables" ("revierte_movimiento_id")`
    );

    await queryRunner.query(`
      UPDATE "movimientos_contables" c
         SET "revierte_movimiento_id" = sub.original_id
        FROM (
          SELECT DISTINCT ON (r.id) r.id AS reverso_id, o.id AS original_id
            FROM "movimientos_contables" r
            JOIN "ventas" v ON v.id = r.referencia_id
            JOIN "movimientos_contables" o
              ON o.usuario_id = r.usuario_id
             AND o.tipo <> r.tipo
             AND o.monto = r.monto
             AND o.categoria IS DISTINCT FROM 'Cancelaciones'
             AND r.descripcion = left('Cancelación ' || v.numero_ticket || ' — ' || o.descripcion, 255)
           WHERE r.categoria = 'Cancelaciones'
             AND r.referencia_tipo = 'venta'
             AND r.revierte_movimiento_id IS NULL
           ORDER BY r.id, o.fecha_creacion
        ) sub
       WHERE c.id = sub.reverso_id`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_movimientos_revierte"`);
    await queryRunner.query(`ALTER TABLE "movimientos_contables" DROP CONSTRAINT IF EXISTS "FK_movimientos_revierte"`);
    await queryRunner.query(`ALTER TABLE "movimientos_contables" DROP COLUMN IF EXISTS "revierte_movimiento_id"`);
  }
}
