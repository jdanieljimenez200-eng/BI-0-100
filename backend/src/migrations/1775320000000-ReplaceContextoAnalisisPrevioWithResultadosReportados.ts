import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `contexto_analisis_previo` (texto libre auto-generado e inyectado en el
 * prompt del LLM) no era el mecanismo correcto — se reemplaza por
 * `progreso_resultados_reportados`: el usuario reporta resultados reales en
 * un formulario (mismos campos que el análisis original), la IA compara
 * contra el análisis anterior y genera un resumen, y esos datos se usan para
 * pre-llenar el formulario de re-análisis. Tabla vieja sin datos de usuarios
 * reales todavía — se elimina en vez de migrarse.
 * Sincronizado con backend/src/models/ProgresoResultadoReportado.ts
 */
export class ReplaceContextoAnalisisPrevioWithResultadosReportados1775320000000
  implements MigrationInterface
{
  name = 'ReplaceContextoAnalisisPrevioWithResultadosReportados1775320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "contexto_analisis_previo"`);

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "progreso_resultados_reportados" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "usuario_id" uuid NOT NULL,
        "producto_id" uuid NOT NULL,
        "modulo" varchar(20) NOT NULL,
        "analisis_anterior_id" uuid,
        "inputs_anteriores" jsonb,
        "inputs_reportados" jsonb NOT NULL,
        "campos_cambiados" jsonb NOT NULL DEFAULT '[]',
        "resumen_ia" text NOT NULL,
        "estado" varchar(20) NOT NULL DEFAULT 'pendiente',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "resuelto_at" TIMESTAMP,
        "analisis_nuevo_id" uuid,
        CONSTRAINT "FK_progreso_resultados_reportados_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_progreso_resultados_reportados_producto"
          FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_progreso_resultados_reportados_usuario_id"
        ON "progreso_resultados_reportados" ("usuario_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_progreso_resultados_reportados_producto_modulo"
        ON "progreso_resultados_reportados" ("producto_id", "modulo")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_progreso_resultados_reportados_estado"
        ON "progreso_resultados_reportados" ("estado")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_progreso_resultados_reportados_producto_modulo_created"
        ON "progreso_resultados_reportados" ("producto_id", "modulo", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "progreso_resultados_reportados"`);
    // No se recrea contexto_analisis_previo: el mecanismo anterior fue reemplazado, no revertido.
  }
}
