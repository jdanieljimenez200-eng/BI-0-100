import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla de auditoría para registro de cambios en selección de herramientas.
 * Sincronizado con backend/src/models/AuditoriaHerramienta.ts
 */
export class CreateAuditoriaHerramientas1775240000000 implements MigrationInterface {
  name = 'CreateAuditoriaHerramientas1775240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auditoria_herramientas" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "usuario_id" uuid NOT NULL,
        "herramienta_key" varchar(40) NOT NULL,
        "accion" varchar(30) NOT NULL,
        "plan_snapshot" varchar(30) NOT NULL,
        "razon" varchar(100),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_auditoria_herramientas_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auditoria_herramientas_usuario_id"
        ON "auditoria_herramientas" ("usuario_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auditoria_herramientas_herramienta_key"
        ON "auditoria_herramientas" ("herramienta_key")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auditoria_herramientas_created_at"
        ON "auditoria_herramientas" ("created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auditoria_herramientas_usuario_created"
        ON "auditoria_herramientas" ("usuario_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_auditoria_herramientas_usuario_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_auditoria_herramientas_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_auditoria_herramientas_herramienta_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_auditoria_herramientas_usuario_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "auditoria_herramientas"`);
  }
}
