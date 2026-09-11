import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rework de analisis_ventas para el módulo funcional:
 *  - usuario_id/producto_id pasan a uuid (alineados con el resto de análisis).
 *  - tamano_equipo pasa a varchar (enum 'solo_tu' | '1_2_personas' | ...).
 *  - Columnas nuevas: inputs_data, tips_data, historia_data, porque_fallan_data,
 *    secciones_bloqueadas, objetivo_ventas, fecha_completado.
 *  - Se retiran columnas del diseño descartado (canales, presupuesto, ubicacion,
 *    terminos_pago, mercado_id, reporte_bi_data, resultado_json).
 *
 * El módulo nunca llegó a producción (rutas placeholder), por lo que la tabla
 * está vacía o no existe en todos los entornos: cada paso va protegido.
 */
export class ReworkAnalisisVentas1775160000000 implements MigrationInterface {
  private async tablaExiste(qr: QueryRunner): Promise<boolean> {
    const res = await qr.query(
      `SELECT to_regclass('public."analisis_ventas"') IS NOT NULL AS existe`
    );
    return Array.isArray(res) && res[0]?.existe === true;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tablaExiste(queryRunner))) {
      // Tabla nueva: synchronize/entidades la crearán completa; nada que alterar.
      return;
    }

    // La conversión a uuid solo aplica si la columna sigue siendo texto.
    //
    // En una base creada desde cero, la baseline ya declara ambas como `uuid`, y
    // entonces `NULLIF("usuario_id", '')` compara un uuid con una cadena vacía:
    // Postgres intenta castear '' a uuid y aborta con
    // `invalid input syntax for type uuid: ""`. Eso rompía `migration:run` en
    // cualquier entorno nuevo.
    await queryRunner.query(`
      DO $$
      DECLARE
        col record;
      BEGIN
        FOR col IN
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'analisis_ventas'
            AND column_name IN ('usuario_id', 'producto_id')
            AND data_type <> 'uuid'
        LOOP
          EXECUTE format(
            'ALTER TABLE "analisis_ventas"
               ALTER COLUMN %I DROP DEFAULT,
               ALTER COLUMN %I TYPE uuid USING NULLIF(%I, '''')::uuid',
            col.column_name, col.column_name, col.column_name
          );
        END LOOP;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "analisis_ventas"
         ALTER COLUMN "tamano_equipo" TYPE varchar(20) USING 'solo_tu',
         ALTER COLUMN "tamano_equipo" SET DEFAULT 'solo_tu'`
    );

    await queryRunner.query(
      `ALTER TABLE "analisis_ventas"
         ADD COLUMN IF NOT EXISTS "objetivo_ventas" varchar NULL,
         ADD COLUMN IF NOT EXISTS "inputs_data" jsonb NULL,
         ADD COLUMN IF NOT EXISTS "tips_data" jsonb NULL,
         ADD COLUMN IF NOT EXISTS "historia_data" jsonb NULL,
         ADD COLUMN IF NOT EXISTS "porque_fallan_data" jsonb NULL,
         ADD COLUMN IF NOT EXISTS "secciones_bloqueadas" text NULL,
         ADD COLUMN IF NOT EXISTS "fecha_completado" timestamp NULL`
    );

    await queryRunner.query(
      `ALTER TABLE "analisis_ventas"
         DROP COLUMN IF EXISTS "canales",
         DROP COLUMN IF EXISTS "presupuesto",
         DROP COLUMN IF EXISTS "ubicacion",
         DROP COLUMN IF EXISTS "terminos_pago",
         DROP COLUMN IF EXISTS "mercado_id",
         DROP COLUMN IF EXISTS "reporte_bi_data",
         DROP COLUMN IF EXISTS "resultado_json"`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tablaExiste(queryRunner))) return;

    await queryRunner.query(
      `ALTER TABLE "analisis_ventas"
         ADD COLUMN IF NOT EXISTS "canales" text NULL,
         ADD COLUMN IF NOT EXISTS "presupuesto" integer NULL,
         ADD COLUMN IF NOT EXISTS "ubicacion" varchar NULL,
         ADD COLUMN IF NOT EXISTS "terminos_pago" varchar NULL,
         ADD COLUMN IF NOT EXISTS "mercado_id" varchar NULL,
         ADD COLUMN IF NOT EXISTS "reporte_bi_data" jsonb NULL,
         ADD COLUMN IF NOT EXISTS "resultado_json" jsonb NULL`
    );

    await queryRunner.query(
      `ALTER TABLE "analisis_ventas"
         ALTER COLUMN "tamano_equipo" TYPE integer USING 1,
         ALTER COLUMN "tamano_equipo" SET DEFAULT 1`
    );
  }
}
