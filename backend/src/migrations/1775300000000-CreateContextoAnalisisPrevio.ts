import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contexto propuesto/aprobado por módulo entre corridas sucesivas de análisis
 * ("esto cambió desde tu último análisis"). Tabla genérica parametrizada por
 * `modulo` (mercado|marketing|legal|brief|ventas — Finanzas queda fuera por no
 * tener LLM/prompt donde inyectar texto).
 * Sincronizado con backend/src/models/ContextoAnalisisPrevio.ts
 */
export class CreateContextoAnalisisPrevio1775300000000 implements MigrationInterface {
  name = 'CreateContextoAnalisisPrevio1775300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contexto_analisis_previo" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "usuario_id" uuid NOT NULL,
        "producto_id" uuid NOT NULL,
        "modulo" varchar(20) NOT NULL,
        "analisis_anterior_id" uuid,
        "texto_propuesto" text NOT NULL,
        "texto_aprobado" text,
        "estado" varchar(20) NOT NULL DEFAULT 'pendiente',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "resuelto_at" TIMESTAMP,
        "consumido_en_analisis_id" uuid,
        CONSTRAINT "FK_contexto_analisis_previo_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_contexto_analisis_previo_producto"
          FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contexto_analisis_previo_usuario_id"
        ON "contexto_analisis_previo" ("usuario_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contexto_analisis_previo_producto_modulo"
        ON "contexto_analisis_previo" ("producto_id", "modulo")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contexto_analisis_previo_estado"
        ON "contexto_analisis_previo" ("estado")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contexto_analisis_previo_producto_modulo_created"
        ON "contexto_analisis_previo" ("producto_id", "modulo", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contexto_analisis_previo_producto_modulo_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contexto_analisis_previo_estado"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contexto_analisis_previo_producto_modulo"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contexto_analisis_previo_usuario_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contexto_analisis_previo"`);
  }
}
