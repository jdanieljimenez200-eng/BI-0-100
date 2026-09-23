import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contador de folios por cuenta y tipo (utils/folios.ts).
 *
 * Sustituye el `MAX(regexp_replace(...))` por venta, que recorría todas las
 * ventas de la cuenta bajo un lock. Se siembra con el máximo actual de cada
 * cuenta para que la numeración continúe donde iba. Solo cuentan los folios con
 * el formato propio (POS-/COT- + hasta 9 dígitos): otros formatos desbordaban
 * el entero (y hacían fallar también el cálculo anterior).
 */
export class SecuenciasFolio1775600000000 implements MigrationInterface {
  name = 'SecuenciasFolio1775600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "secuencias_folio" (
        "usuario_id" uuid NOT NULL,
        "tipo" character varying(20) NOT NULL,
        "ultimo" integer NOT NULL,
        CONSTRAINT "PK_secuencias_folio" PRIMARY KEY ("usuario_id", "tipo"),
        CONSTRAINT "FK_secuencias_folio_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_secuencias_folio_tipo" CHECK ("tipo" IN ('venta', 'cotizacion'))
      )
    `);
    await queryRunner.query(`
      INSERT INTO secuencias_folio (usuario_id, tipo, ultimo)
      SELECT usuario_id, 'venta', MAX(substring(numero_ticket FROM 5)::integer)
        FROM ventas WHERE numero_ticket ~ '^POS-[0-9]{1,9}$'
       GROUP BY usuario_id
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO secuencias_folio (usuario_id, tipo, ultimo)
      SELECT usuario_id, 'cotizacion', MAX(substring(numero FROM 5)::integer)
        FROM cotizaciones WHERE numero ~ '^COT-[0-9]{1,9}$'
       GROUP BY usuario_id
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "secuencias_folio"`);
  }
}
