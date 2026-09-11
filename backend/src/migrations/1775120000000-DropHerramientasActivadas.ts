import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retiro de `herramientas_activadas`.
 *
 * El modelo `HerramientaActivada` quedó huérfano: nunca estuvo en la lista de
 * `entities` del DataSource, así que en la mayoría de entornos ni siquiera se
 * creó la tabla. Este DROP es idempotente (`IF EXISTS`) para limpiar los
 * entornos donde un `synchronize` viejo sí llegó a materializarla.
 *
 * El `down` reconstruye la tabla tal como la definía el modelo retirado, para
 * que la migración sea reversible.
 */
export class DropHerramientasActivadas1775120000000 implements MigrationInterface {
  name = 'DropHerramientasActivadas1775120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_herramientas_activadas_cuenta_herramienta"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_herramientas_activadas_cuenta"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "herramientas_activadas"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "herramientas_activadas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cuenta_id" uuid NOT NULL,
        "herramienta" character varying(40) NOT NULL,
        "origen" character varying(10) NOT NULL DEFAULT 'pago',
        "activa_desde" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "cambiable_desde" TIMESTAMP,
        "stripe_subscription_item_id" character varying,
        "activa" boolean NOT NULL DEFAULT true,
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_herramientas_activadas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_herramientas_activadas_cuenta" FOREIGN KEY ("cuenta_id")
          REFERENCES "usuarios"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_herramientas_activadas_cuenta" ON "herramientas_activadas" ("cuenta_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_herramientas_activadas_cuenta_herramienta" ON "herramientas_activadas" ("cuenta_id", "herramienta")`);
  }
}