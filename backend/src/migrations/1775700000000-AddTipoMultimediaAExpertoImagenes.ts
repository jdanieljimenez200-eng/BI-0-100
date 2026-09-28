import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTipoMultimediaAExpertoImagenes1775700000000 implements MigrationInterface {
  name = 'AddTipoMultimediaAExpertoImagenes1775700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "experto_imagenes"
      ADD COLUMN IF NOT EXISTS "tipo" varchar(20) NOT NULL DEFAULT 'imagen'
    `);

    // Si alguna URL existente ya apunta a un archivo de video, actualizar tipo
    await queryRunner.query(`
      UPDATE "experto_imagenes"
         SET "tipo" = 'video'
       WHERE "url" ~* '\\.(mp4|webm|mov|m4v)(\\?.*)?$'
          OR "url" ~* '(youtube\\.com|youtu\\.be|vimeo\\.com|tiktok\\.com)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "experto_imagenes" DROP COLUMN IF EXISTS "tipo"
    `);
  }
}
