import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Integridad del historial de las herramientas.
 *
 * 1. Borrar un producto, un empleado o un insumo ya no arrastra en cascada su
 *    historial (ventas, pagos de nómina, movimientos de inventario). Las FK pasan
 *    a NO ACTION: el borrado falla si hay historial y la aplicación archiva en su
 *    lugar. NO ACTION y no RESTRICT a propósito: se comprueba al final de la
 *    sentencia, así que borrar la CUENTA (usuarios → todo en cascada) sigue
 *    funcionando.
 * 2. Borrar un negocio deja su catálogo POS e insumos "sin negocio" (SET NULL)
 *    en vez de borrarlos.
 * 3. Una cotización solo puede convertirse en UNA venta (índice único parcial).
 *    Si ya hay duplicados por la carrera anterior, se conserva el enlace de la
 *    venta más antigua y las demás quedan sin cotización (la venta no se toca).
 */

interface CambioFk {
  tabla: string;
  columna: string;
  referencia: string;
  nueva: 'NO ACTION' | 'SET NULL';
  anterior: 'CASCADE';
}

const CAMBIOS: CambioFk[] = [
  { tabla: 'ventas', columna: 'producto_id', referencia: 'productos', nueva: 'NO ACTION', anterior: 'CASCADE' },
  { tabla: 'pagos_nomina', columna: 'empleado_id', referencia: 'empleados', nueva: 'NO ACTION', anterior: 'CASCADE' },
  { tabla: 'movimientos_inventario', columna: 'insumo_id', referencia: 'insumos_inventario', nueva: 'NO ACTION', anterior: 'CASCADE' },
  { tabla: 'items_pos', columna: 'negocio_id', referencia: 'negocios', nueva: 'SET NULL', anterior: 'CASCADE' },
  { tabla: 'insumos_inventario', columna: 'negocio_id', referencia: 'negocios', nueva: 'SET NULL', anterior: 'CASCADE' },
];

async function nombreFk(queryRunner: QueryRunner, tabla: string, columna: string): Promise<string | null> {
  const filas: Array<{ conname: string }> = await queryRunner.query(
    `SELECT c.conname
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f' AND c.conrelid = $1::regclass AND a.attname = $2`,
    [tabla, columna]
  );
  return filas[0]?.conname ?? null;
}

async function cambiarFk(queryRunner: QueryRunner, c: CambioFk, regla: string): Promise<void> {
  const actual = await nombreFk(queryRunner, c.tabla, c.columna);
  if (actual) await queryRunner.query(`ALTER TABLE "${c.tabla}" DROP CONSTRAINT "${actual}"`);
  await queryRunner.query(
    `ALTER TABLE "${c.tabla}" ADD CONSTRAINT "FK_${c.tabla}_${c.columna}"
       FOREIGN KEY ("${c.columna}") REFERENCES "${c.referencia}"("id") ON DELETE ${regla}`
  );
}

export class IntegridadHerramientas1775590000000 implements MigrationInterface {
  name = 'IntegridadHerramientas1775590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const c of CAMBIOS) await cambiarFk(queryRunner, c, c.nueva);

    await queryRunner.query(`
      UPDATE ventas v SET cotizacion_id = NULL
       WHERE v.cotizacion_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM ventas o
            WHERE o.cotizacion_id = v.cotizacion_id
              AND (o.fecha_creacion, o.id) < (v.fecha_creacion, v.id)
         )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ventas_cotizacion" ON "ventas" ("cotizacion_id") WHERE "cotizacion_id" IS NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ventas_cotizacion"`);
    for (const c of CAMBIOS) await cambiarFk(queryRunner, c, c.anterior);
  }
}
