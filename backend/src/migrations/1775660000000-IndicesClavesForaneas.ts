import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices para las claves foráneas que se consultan al borrar el padre.
 *
 * Postgres no indexa solo el lado hijo de una FK. Al borrar un producto, un
 * cliente o un canal de cobro, la acción de la FK (NO ACTION o SET NULL) busca
 * las filas hijas con `WHERE <fk> = $1`, y sin índice eso recorre la tabla
 * entera —de todas las cuentas— dentro de la transacción del borrado. En
 * `movimientos_contables` (hay cuentas con 600 000 movimientos) y `ventas` es
 * la diferencia entre milisegundos y segundos con el candado tomado. Los
 * índices existentes empiezan por `usuario_id` y no sirven para esa búsqueda.
 *
 * `ventas.canal_cobro_id` además lo declara la entidad (`@Index`) y ninguna
 * migración lo había creado. Los parciales (`IS NOT NULL`) son para columnas que
 * casi siempre van vacías (una venta a público general no lleva cliente); la
 * búsqueda por igualdad los usa igual.
 *
 * También quita la FK duplicada de `marcas.producto_id`: el Baseline creó
 * `FK_a1d19caf…` y `MarcaLogoAndBrief` volvió a crear la misma como
 * `FK_marcas_producto`, así que cada escritura se comprobaba dos veces. Solo se
 * borra si la otra existe (en bases dañadas por un `synchronize` antiguo solo
 * queda una de las dos).
 *
 * Auditoría de base de datos, 2026-09-27.
 */
const INDICES: Array<{ nombre: string; tabla: string; columna: string; parcial: boolean }> = [
  { nombre: 'IDX_ventas_producto', tabla: 'ventas', columna: 'producto_id', parcial: false },
  { nombre: 'IDX_ventas_cliente', tabla: 'ventas', columna: 'cliente_id', parcial: true },
  { nombre: 'IDX_ventas_canal_cobro', tabla: 'ventas', columna: 'canal_cobro_id', parcial: false },
  { nombre: 'IDX_movimientos_contables_producto', tabla: 'movimientos_contables', columna: 'producto_id', parcial: true },
  { nombre: 'IDX_movimientos_inventario_insumo', tabla: 'movimientos_inventario', columna: 'insumo_id', parcial: false },
  { nombre: 'IDX_cotizaciones_cliente', tabla: 'cotizaciones', columna: 'cliente_id', parcial: true },
  { nombre: 'IDX_citas_cliente', tabla: 'citas', columna: 'cliente_id', parcial: true },
  { nombre: 'IDX_mantenimientos_realizados_equipo_id', tabla: 'mantenimientos_realizados', columna: 'equipo_id', parcial: false },
];

export class IndicesClavesForaneas1775660000000 implements MigrationInterface {
  name = 'IndicesClavesForaneas1775660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { nombre, tabla, columna, parcial } of INDICES) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${nombre}" ON "${tabla}" ("${columna}")` +
          (parcial ? ` WHERE "${columna}" IS NOT NULL` : '')
      );
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conrelid = 'marcas'::regclass AND conname = 'FK_marcas_producto'
        ) AND (
          SELECT count(*) FROM pg_constraint
           WHERE conrelid = 'marcas'::regclass
             AND contype = 'f'
             AND pg_get_constraintdef(oid) = 'FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL'
        ) > 1 THEN
          ALTER TABLE "marcas" DROP CONSTRAINT "FK_marcas_producto";
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conrelid = 'marcas'::regclass AND conname = 'FK_marcas_producto'
        ) THEN
          ALTER TABLE "marcas" ADD CONSTRAINT "FK_marcas_producto"
            FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    for (const { nombre } of [...INDICES].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${nombre}"`);
    }
  }
}
