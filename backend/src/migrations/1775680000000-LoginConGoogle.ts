import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Inicio de sesión y registro con Google.
 *
 * `google_sub` es el identificador estable de la cuenta de Google (el claim
 * `sub` del id_token). Se enlaza por él y no por el email: el email de una
 * cuenta de Google puede cambiar, el `sub` no. Único cuando existe, para que dos
 * usuarios no compartan la misma cuenta de Google.
 */
export class LoginConGoogle1775680000000 implements MigrationInterface {
  name = 'LoginConGoogle1775680000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "google_sub" character varying(64)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_usuarios_google_sub" ON "usuarios" ("google_sub") WHERE "google_sub" IS NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_usuarios_google_sub"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "google_sub"`);
  }
}
