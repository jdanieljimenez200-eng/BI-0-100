import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Papelera de 30 días para cuentas.
 *
 * Borrar una cuenta desde el panel no la elimina al momento: la aparta. Durante
 * 30 días nadie puede entrar en ella, sus fichas de la red desaparecen del
 * directorio y un superadmin puede restaurarla. Pasado ese plazo, una purga la
 * borra de verdad, con sus ficheros.
 *
 * Por qué no borrar directamente: un clic en la fila equivocada, o una cuenta
 * comprometida de admin, no deben poder destruir datos de un cliente sin vuelta
 * atrás. Y por qué no conservar para siempre: la cuenta de alguien que pidió su
 * baja no puede quedarse en la base indefinidamente.
 *
 * `expertos.eliminado_en` existe porque el directorio es público y no pasa por
 * la sesión del dueño: sin esta marca, la ficha de una cuenta en la papelera
 * seguiría saliendo en /network.
 */
export class AddPapelera1775500000000 implements MigrationInterface {
  name = 'AddPapelera1775500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "eliminado_en" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "eliminado_por" uuid`);
    await queryRunner.query(`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "motivo_eliminacion" text`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_usuarios_papelera"
        ON "usuarios" ("eliminado_en") WHERE "eliminado_en" IS NOT NULL
    `);

    await queryRunner.query(`ALTER TABLE "expertos" ADD COLUMN IF NOT EXISTS "eliminado_en" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "expertos" DROP COLUMN IF EXISTS "eliminado_en"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_usuarios_papelera"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "motivo_eliminacion"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "eliminado_por"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "eliminado_en"`);
  }
}
