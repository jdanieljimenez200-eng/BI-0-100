import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 1 — Catálogo Maestro de Artículos + Directorio Universal de Contactos.
 *
 * Aditiva y no destructiva:
 *  - Crea la tabla `articulos` (fuente única que unifica ItemPOS + InsumoInventario).
 *  - Asegura las columnas `tipo_contacto` y `atributos_extra` en `clientes`.
 *  - Relaja `producto_id` de `clientes` a NULLABLE (directorio compartido).
 *
 * Idempotente: usa IF NOT EXISTS para poder correrse sobre bases donde
 * `synchronize` ya haya materializado parte del esquema en desarrollo.
 */
export class ArticulosYContactos1775100000000 implements MigrationInterface {
  name = 'ArticulosYContactos1775100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Tabla articulos ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "articulos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "usuario_id" uuid NOT NULL,
        "creado_por_id" uuid,
        "negocio_id" uuid,
        "nombre" character varying(255) NOT NULL,
        "descripcion" text,
        "sku" character varying(100),
        "tipo" character varying(20) NOT NULL DEFAULT 'producto',
        "precio_venta" numeric(12,2) NOT NULL DEFAULT 0,
        "costo_unitario" numeric(12,2) NOT NULL DEFAULT 0,
        "unidad" character varying(30) NOT NULL DEFAULT 'pieza',
        "stock_actual" numeric(12,3) NOT NULL DEFAULT 0,
        "stock_minimo" numeric(12,3) NOT NULL DEFAULT 0,
        "costo_promedio" numeric(12,4) NOT NULL DEFAULT 0,
        "categoria" character varying(100),
        "emoji" character varying(8),
        "imagen_url" character varying(500),
        "activo" boolean NOT NULL DEFAULT true,
        "es_vendible" boolean NOT NULL DEFAULT true,
        "es_insumo" boolean NOT NULL DEFAULT false,
        "atributos_extra" jsonb NOT NULL DEFAULT '{}',
        "orden" integer NOT NULL DEFAULT 0,
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_articulos_id" PRIMARY KEY ("id")
      )
    `);

    // FKs (guardadas por si la tabla ya existía sin ellas).
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "articulos"
          ADD CONSTRAINT "FK_articulos_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "articulos"
          ADD CONSTRAINT "FK_articulos_negocio"
          FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // Índices.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_articulos_usuario_negocio" ON "articulos" ("usuario_id", "negocio_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_articulos_usuario_vendible" ON "articulos" ("usuario_id", "es_vendible")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_articulos_usuario_insumo" ON "articulos" ("usuario_id", "es_insumo")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_articulos_usuario_sku" ON "articulos" ("usuario_id", "sku") WHERE "sku" IS NOT NULL`);

    // ── Columnas nuevas en clientes ─────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "tipo_contacto" character varying(20) NOT NULL DEFAULT 'cliente'`);
    await queryRunner.query(`ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "atributos_extra" jsonb NOT NULL DEFAULT '{}'`);

    // producto_id deja de ser obligatorio (directorio universal).
    await queryRunner.query(`ALTER TABLE "clientes" ALTER COLUMN "producto_id" DROP NOT NULL`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_clientes_usuario_tipo_contacto" ON "clientes" ("usuario_id", "tipo_contacto")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clientes_usuario_tipo_contacto"`);
    await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN IF EXISTS "atributos_extra"`);
    await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN IF EXISTS "tipo_contacto"`);
    // No se re-impone NOT NULL en producto_id en el rollback: podría haber filas
    // con producto_id NULL creadas bajo el nuevo esquema, y forzarlo fallaría.

    await queryRunner.query(`DROP INDEX IF EXISTS "uq_articulos_usuario_sku"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_articulos_usuario_insumo"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_articulos_usuario_vendible"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_articulos_usuario_negocio"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "articulos"`);
  }
}
