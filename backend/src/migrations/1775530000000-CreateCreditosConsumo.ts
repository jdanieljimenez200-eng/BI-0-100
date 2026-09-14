import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Consumo de créditos de IA.
 *
 * Una fila por acción cobrada (un análisis, una evaluación de guion…). Si la
 * acción falla o la IA cae a plantilla, la fila se marca `reembolsado` en vez de
 * borrarse: queda el rastro de qué se cobró y qué se devolvió.
 *
 * Los créditos disponibles = `creditos_ia_mes` del plan − consumo no reembolsado
 * del mes natural en curso (services/billing/creditosIA.ts).
 */
export class CreateCreditosConsumo1775530000000 implements MigrationInterface {
  name = 'CreateCreditosConsumo1775530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creditos_consumo" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
        "accion" varchar(40) NOT NULL,
        "creditos" integer NOT NULL CHECK ("creditos" >= 0),
        "referencia_id" uuid,
        "reembolsado" boolean NOT NULL DEFAULT false,
        "fecha" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_creditos_consumo_usuario_fecha" ON "creditos_consumo" ("usuario_id", "fecha")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_creditos_consumo_referencia" ON "creditos_consumo" ("referencia_id") WHERE "referencia_id" IS NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "creditos_consumo"`);
  }
}
