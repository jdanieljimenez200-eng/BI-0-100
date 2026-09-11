import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Historial de score (0-100) por módulo+producto, uno por cada análisis
 * completado — permite graficar tendencia y calcular deltas.
 * Sincronizado con backend/src/models/ProgresoModuloScore.ts
 */
export class CreateProgresoModuloScores1775330000000 implements MigrationInterface {
  name = 'CreateProgresoModuloScores1775330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "progreso_modulo_scores" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "usuario_id" uuid NOT NULL,
        "producto_id" uuid NOT NULL,
        "modulo" varchar(20) NOT NULL,
        "analisis_id" uuid NOT NULL,
        "score" smallint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_progreso_modulo_scores_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_progreso_modulo_scores_producto"
          FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_progreso_modulo_scores_usuario_id"
        ON "progreso_modulo_scores" ("usuario_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_progreso_modulo_scores_producto_modulo_created"
        ON "progreso_modulo_scores" ("producto_id", "modulo", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_progreso_modulo_scores_producto_modulo_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_progreso_modulo_scores_usuario_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "progreso_modulo_scores"`);
  }
}
