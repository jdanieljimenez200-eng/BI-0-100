import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enlace de la agenda con Google Calendar (solo app → Google).
 *
 * - `usuarios.zona_horaria`: zona IANA del navegador con el que el usuario
 *   entró por última vez. Con ella se crean los eventos a la hora correcta.
 * - `conexiones_google_calendar`: una por usuario que conectó su calendario.
 *   El refresh token se guarda cifrado (AES-256-GCM con GOOGLE_TOKENS_KEY).
 * - `citas.google_*`: id del evento creado y estado de la última sincronización.
 */
export class GoogleCalendar1775580000000 implements MigrationInterface {
  name = 'GoogleCalendar1775580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "zona_horaria" character varying(64)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conexiones_google_calendar" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "usuario_id" uuid NOT NULL,
        "cuenta_id" uuid NOT NULL,
        "email_google" character varying(200),
        "calendario_id" character varying(200) NOT NULL DEFAULT 'primary',
        "refresh_token_cifrado" text NOT NULL,
        "activa" boolean NOT NULL DEFAULT true,
        "ultimo_error" character varying(300),
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conexiones_google_calendar" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_conexiones_google_calendar_usuario" UNIQUE ("usuario_id"),
        CONSTRAINT "FK_conexiones_google_calendar_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_conexiones_google_calendar_cuenta"
          FOREIGN KEY ("cuenta_id") REFERENCES "usuarios"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_conexiones_google_calendar_cuenta" ON "conexiones_google_calendar" ("cuenta_id", "activa")`
    );

    await queryRunner.query(`ALTER TABLE "citas" ADD COLUMN IF NOT EXISTS "google_event_id" character varying(1024)`);
    await queryRunner.query(`ALTER TABLE "citas" ADD COLUMN IF NOT EXISTS "google_sync_estado" character varying(20)`);
    await queryRunner.query(`ALTER TABLE "citas" ADD COLUMN IF NOT EXISTS "google_sync_error" character varying(300)`);
    await queryRunner.query(`
      ALTER TABLE "citas" ADD CONSTRAINT "CHK_citas_google_sync_estado"
        CHECK ("google_sync_estado" IS NULL OR "google_sync_estado" IN ('pendiente','sincronizada','error'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "citas" DROP CONSTRAINT IF EXISTS "CHK_citas_google_sync_estado"`);
    await queryRunner.query(`ALTER TABLE "citas" DROP COLUMN IF EXISTS "google_sync_error"`);
    await queryRunner.query(`ALTER TABLE "citas" DROP COLUMN IF EXISTS "google_sync_estado"`);
    await queryRunner.query(`ALTER TABLE "citas" DROP COLUMN IF EXISTS "google_event_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conexiones_google_calendar"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "zona_horaria"`);
  }
}
