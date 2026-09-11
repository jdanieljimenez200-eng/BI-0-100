import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Snapshots periódicos del negocio (panel de Progreso) para graficar la
 * evolución en el tiempo, no solo comparar actual-vs-anterior como hace el
 * panel de alertas operativas en vivo.
 * Sincronizado con backend/src/models/ProgresoSnapshot.ts
 */
export class CreateProgresoSnapshots1775290000000 implements MigrationInterface {
  name = 'CreateProgresoSnapshots1775290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "progreso_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "usuario_id" uuid NOT NULL,
        "producto_id" uuid,
        "periodo_dias" smallint NOT NULL,
        "periodo_inicio" TIMESTAMP NOT NULL,
        "periodo_fin" TIMESTAMP NOT NULL,
        "metricas" jsonb NOT NULL,
        "resumen_ia" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_progreso_snapshots_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_progreso_snapshots_producto"
          FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_progreso_snapshots_usuario_id"
        ON "progreso_snapshots" ("usuario_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_progreso_snapshots_producto_id"
        ON "progreso_snapshots" ("producto_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_progreso_snapshots_created_at"
        ON "progreso_snapshots" ("created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_progreso_snapshots_usuario_created"
        ON "progreso_snapshots" ("usuario_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_progreso_snapshots_usuario_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_progreso_snapshots_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_progreso_snapshots_producto_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_progreso_snapshots_usuario_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "progreso_snapshots"`);
  }
}
