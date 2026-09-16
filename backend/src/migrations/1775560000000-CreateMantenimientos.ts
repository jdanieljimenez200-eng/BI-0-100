import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Herramienta «Mantenimientos»: equipos a los que hay que dar servicio y el
 * historial de cada servicio hecho.
 *
 * `intervalo_dias` se guarda ya resuelto (catálogo + intensidad de uso) para que
 * cambiar el catálogo no mueva por detrás las fechas que el usuario ya vio.
 * El historial referencia el egreso contable que generó, si lo hubo.
 */
export class CreateMantenimientos1775560000000 implements MigrationInterface {
  name = 'CreateMantenimientos1775560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "equipos_mantenimiento" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "usuario_id" uuid NOT NULL,
        "creado_por_id" uuid,
        "negocio_id" uuid,
        "producto_id" uuid,
        "nombre" character varying(160) NOT NULL,
        "tipo_clave" character varying(40) NOT NULL DEFAULT 'otro',
        "emoji" character varying(8),
        "ubicacion" character varying(120),
        "intensidad_uso" character varying(10) NOT NULL DEFAULT 'normal',
        "intervalo_dias" integer NOT NULL,
        "intervalo_origen" character varying(10) NOT NULL DEFAULT 'catalogo',
        "fecha_ultimo" date,
        "notas" text,
        "activo" boolean NOT NULL DEFAULT true,
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_equipos_mantenimiento" PRIMARY KEY ("id"),
        CONSTRAINT "FK_equipos_mantenimiento_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_equipos_mantenimiento_negocio"
          FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_equipos_mantenimiento_producto"
          FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_equipos_mantenimiento_intensidad"
          CHECK ("intensidad_uso" IN ('bajo','normal','intenso')),
        CONSTRAINT "CHK_equipos_mantenimiento_origen"
          CHECK ("intervalo_origen" IN ('catalogo','ia','manual')),
        CONSTRAINT "CHK_equipos_mantenimiento_intervalo"
          CHECK ("intervalo_dias" BETWEEN 1 AND 3650)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_equipos_mantenimiento_usuario" ON "equipos_mantenimiento" ("usuario_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_equipos_mantenimiento_activo" ON "equipos_mantenimiento" ("usuario_id", "activo")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mantenimientos_realizados" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "usuario_id" uuid NOT NULL,
        "creado_por_id" uuid,
        "equipo_id" uuid NOT NULL,
        "fecha" date NOT NULL,
        "costo" numeric(12,2),
        "responsable" character varying(160),
        "notas" text,
        "movimiento_contable_id" uuid,
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mantenimientos_realizados" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mantenimientos_realizados_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mantenimientos_realizados_equipo"
          FOREIGN KEY ("equipo_id") REFERENCES "equipos_mantenimiento"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mantenimientos_realizados_movimiento"
          FOREIGN KEY ("movimiento_contable_id") REFERENCES "movimientos_contables"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_mantenimientos_realizados_costo" CHECK ("costo" IS NULL OR "costo" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_mantenimientos_realizados_equipo" ON "mantenimientos_realizados" ("usuario_id", "equipo_id", "fecha")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mantenimientos_realizados"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "equipos_mantenimiento"`);
  }
}
