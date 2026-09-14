import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registro de cada llamada a la IA: modelo, tokens y costo en USD.
 *
 * Es la base para saber cuánto cuesta cada cliente y cada plan, para el panel de
 * costos del admin y para los créditos mensuales de IA. Lo escribe
 * `config/anthropic.ts` después de cada respuesta.
 *
 * `usuario_id` sin FK a propósito: el costo ya se pagó aunque la cuenta se borre,
 * y la purga de la papelera no debe perder el histórico de gasto.
 */
export class CreateUsoIA1775520000000 implements MigrationInterface {
  name = 'CreateUsoIA1775520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "uso_ia" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "usuario_id" uuid,
        "analisis_id" uuid,
        "modulo" varchar(40) NOT NULL,
        "seccion" varchar(80) NOT NULL,
        "modelo" varchar(60) NOT NULL,
        "input_tokens" integer NOT NULL DEFAULT 0,
        "output_tokens" integer NOT NULL DEFAULT 0,
        "cache_write_tokens" integer NOT NULL DEFAULT 0,
        "cache_read_tokens" integer NOT NULL DEFAULT 0,
        "costo_usd" numeric(12, 6) NOT NULL DEFAULT 0,
        "duracion_ms" integer NOT NULL DEFAULT 0,
        "fecha" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_uso_ia_usuario_fecha" ON "uso_ia" ("usuario_id", "fecha")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_uso_ia_fecha" ON "uso_ia" ("fecha")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "uso_ia"`);
  }
}
