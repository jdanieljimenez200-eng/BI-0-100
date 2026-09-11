import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Metas de negocio por periodo — insumo de las alertas automáticas
 * (services/alertas/alertasService.ts → alertasMetas).
 *
 * Aditiva e idempotente: solo crea la tabla `metas_negocio`, sus FKs y sus
 * índices, con IF NOT EXISTS para poder correrse sobre bases donde
 * `synchronize` ya materializó el esquema en desarrollo.
 */
export class MetasNegocio1775210000000 implements MigrationInterface {
  name = 'MetasNegocio1775210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "metas_negocio" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "usuario_id" uuid NOT NULL,
        "negocio_id" uuid,
        "nombre" character varying(200) NOT NULL,
        "tipo" character varying(20) NOT NULL DEFAULT 'personalizada',
        "objetivo" numeric(14,2) NOT NULL DEFAULT 0,
        "avance_manual" numeric(14,2) NOT NULL DEFAULT 0,
        "periodo_inicio" date NOT NULL,
        "periodo_fin" date NOT NULL,
        "notas" text,
        "activa" boolean NOT NULL DEFAULT true,
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_metas_negocio_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "metas_negocio"
          ADD CONSTRAINT "FK_metas_negocio_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "metas_negocio"
          ADD CONSTRAINT "FK_metas_negocio_negocio"
          FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_metas_negocio_usuario_negocio" ON "metas_negocio" ("usuario_id", "negocio_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_metas_negocio_usuario_activa" ON "metas_negocio" ("usuario_id", "activa")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_metas_negocio_periodo_fin" ON "metas_negocio" ("periodo_fin")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_metas_negocio_periodo_fin"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_metas_negocio_usuario_activa"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_metas_negocio_usuario_negocio"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "metas_negocio"`);
  }
}