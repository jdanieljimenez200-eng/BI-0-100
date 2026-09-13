import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Verificación en dos pasos para el panel de administración.
 *
 *  - `usuarios.admin_totp_secreto`: el secreto TOTP, **cifrado** (AES-256-GCM).
 *    Si se filtra la base, el secreto no sirve sin la clave, que vive fuera de
 *    ella. En claro, un volcado de la tabla daría a cualquiera los códigos de
 *    todos los admins.
 *  - `usuarios.admin_totp_activado_en`: `null` mientras el enrolamiento está a
 *    medias (el QR se ha mostrado pero no se ha confirmado con un código). Solo
 *    cuenta como activo cuando la persona ha demostrado que su app genera códigos
 *    válidos.
 *  - `admin_codigos_recuperacion`: diez códigos de un solo uso por admin, para
 *    cuando se pierde el móvil. Se guardan **hasheados**: son contraseñas.
 */
export class AddAdminTotp1775490000000 implements MigrationInterface {
  name = 'AddAdminTotp1775490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`);
    await queryRunner.query(`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "admin_totp_secreto" text`);
    await queryRunner.query(`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "admin_totp_activado_en" TIMESTAMP`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_codigos_recuperacion" (
        "id"             uuid NOT NULL DEFAULT public.uuid_generate_v4(),
        "usuario_id"     uuid NOT NULL,
        "hash"           varchar(100) NOT NULL,
        "usado_en"       TIMESTAMP,
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_codigos_recuperacion" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "admin_codigos_recuperacion"
          ADD CONSTRAINT "FK_admin_codigos_recuperacion_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_codigos_recuperacion_vivos"
        ON "admin_codigos_recuperacion" ("usuario_id") WHERE "usado_en" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_codigos_recuperacion"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "admin_totp_activado_en"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "admin_totp_secreto"`);
  }
}
