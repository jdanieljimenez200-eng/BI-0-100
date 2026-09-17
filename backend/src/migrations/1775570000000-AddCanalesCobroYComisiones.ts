import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo de Contabilidad Financiera: Canales de cobro, terminales bancarias y
 * plataformas de delivery con cálculo automático de comisiones, IVA sobre comisiones,
 * retenciones fiscales y conciliación de liquidaciones.
 */
export class AddCanalesCobroYComisiones1775570000000 implements MigrationInterface {
  name = 'AddCanalesCobroYComisiones1775570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`);

    // 1. Crear tabla canales_cobro
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "canales_cobro" (
        "id" uuid NOT NULL DEFAULT public.uuid_generate_v4(),
        "usuario_id" uuid NOT NULL,
        "producto_id" uuid,
        "nombre" character varying(120) NOT NULL,
        "tipo_canal" character varying(30) NOT NULL DEFAULT 'terminal',
        "institucion" character varying(100) NOT NULL,
        "comision_porcentaje" numeric(6,4) NOT NULL DEFAULT 0.0000,
        "comision_fija" numeric(12,2) NOT NULL DEFAULT 0.00,
        "aplica_iva_comision" boolean NOT NULL DEFAULT true,
        "retencion_isr_porcentaje" numeric(6,4) NOT NULL DEFAULT 0.0000,
        "retencion_iva_porcentaje" numeric(6,4) NOT NULL DEFAULT 0.0000,
        "dias_liquidacion" integer NOT NULL DEFAULT 1,
        "activo" boolean NOT NULL DEFAULT true,
        "color" character varying(30),
        "icono" character varying(60),
        "notas" text,
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_canales_cobro" PRIMARY KEY ("id"),
        CONSTRAINT "FK_canales_cobro_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_canales_cobro_producto"
          FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_canales_cobro_tipo"
          CHECK ("tipo_canal" IN ('terminal', 'delivery', 'pasarela_web', 'transferencia', 'efectivo', 'otro'))
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_canales_cobro_usuario" ON "canales_cobro" ("usuario_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_canales_cobro_producto" ON "canales_cobro" ("usuario_id", "producto_id")`
    );

    // 2. Agregar columnas a movimientos_contables
    await queryRunner.query(`
      ALTER TABLE "movimientos_contables"
        ADD COLUMN IF NOT EXISTS "canal_cobro_id" uuid,
        ADD COLUMN IF NOT EXISTS "canal_nombre_snapshot" character varying(120),
        ADD COLUMN IF NOT EXISTS "institucion_snapshot" character varying(100),
        ADD COLUMN IF NOT EXISTS "monto_bruto" numeric(12,2),
        ADD COLUMN IF NOT EXISTS "comision_monto" numeric(12,2),
        ADD COLUMN IF NOT EXISTS "comision_iva" numeric(12,2),
        ADD COLUMN IF NOT EXISTS "retencion_monto" numeric(12,2),
        ADD COLUMN IF NOT EXISTS "monto_neto" numeric(12,2),
        ADD COLUMN IF NOT EXISTS "estado_liquidacion" character varying(20) DEFAULT 'liquidado',
        ADD COLUMN IF NOT EXISTS "fecha_liquidacion" date;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_movimientos_contables_canal'
        ) THEN
          ALTER TABLE "movimientos_contables"
            ADD CONSTRAINT "FK_movimientos_contables_canal"
            FOREIGN KEY ("canal_cobro_id") REFERENCES "canales_cobro"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_movimientos_contables_canal" ON "movimientos_contables" ("canal_cobro_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_movimientos_contables_liquidacion" ON "movimientos_contables" ("usuario_id", "estado_liquidacion")`
    );

    // 3. Agregar columnas a ventas (POS)
    await queryRunner.query(`
      ALTER TABLE "ventas"
        ADD COLUMN IF NOT EXISTS "canal_cobro_id" uuid,
        ADD COLUMN IF NOT EXISTS "comision_monto" numeric(12,2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS "comision_iva" numeric(12,2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS "monto_neto" numeric(12,2);
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_ventas_canal_cobro'
        ) THEN
          ALTER TABLE "ventas"
            ADD CONSTRAINT "FK_ventas_canal_cobro"
            FOREIGN KEY ("canal_cobro_id") REFERENCES "canales_cobro"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ventas"
        DROP CONSTRAINT IF EXISTS "FK_ventas_canal_cobro",
        DROP COLUMN IF EXISTS "canal_cobro_id",
        DROP COLUMN IF EXISTS "comision_monto",
        DROP COLUMN IF EXISTS "comision_iva",
        DROP COLUMN IF EXISTS "monto_neto";
    `);

    await queryRunner.query(`
      ALTER TABLE "movimientos_contables"
        DROP CONSTRAINT IF EXISTS "FK_movimientos_contables_canal",
        DROP COLUMN IF EXISTS "canal_cobro_id",
        DROP COLUMN IF EXISTS "canal_nombre_snapshot",
        DROP COLUMN IF EXISTS "institucion_snapshot",
        DROP COLUMN IF EXISTS "monto_bruto",
        DROP COLUMN IF EXISTS "comision_monto",
        DROP COLUMN IF EXISTS "comision_iva",
        DROP COLUMN IF EXISTS "retencion_monto",
        DROP COLUMN IF EXISTS "monto_neto",
        DROP COLUMN IF EXISTS "estado_liquidacion",
        DROP COLUMN IF EXISTS "fecha_liquidacion";
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "canales_cobro"`);
  }
}
