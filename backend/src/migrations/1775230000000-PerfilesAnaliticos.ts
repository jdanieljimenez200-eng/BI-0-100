import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Perfiles analíticos (redes sociales del usuario) + sus vídeos con métricas
 * declaradas.
 *
 * Idempotente a propósito (IF NOT EXISTS en todo): en dev `synchronize` ya pudo
 * crear las tablas desde las entidades, y en ese caso la migración debe ser un
 * no-op en lugar de reventar el arranque con "relation already exists".
 */
export class PerfilesAnaliticos1775230000000 implements MigrationInterface {
  name = 'PerfilesAnaliticos1775230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // uuid_generate_v4() y no gen_random_uuid(): es el default que TypeORM
    // genera para @PrimaryGeneratedColumn('uuid') y el que ya usa el resto del
    // esquema (productos.id), así que una comparación posterior no ve deriva.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "perfiles_analiticos" (
        "id"                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "usuario_id"             uuid NOT NULL,
        "producto_id"            uuid,
        "plataforma"             varchar(30) NOT NULL,
        "handle"                 varchar(120) NOT NULL,
        "url"                    varchar(500),
        "seguidores"             integer,
        "alcance_mensual"        integer,
        "engagement_rate"        numeric(5,2),
        "nicho"                  varchar(120),
        "notas"                  text,
        "metricas_declaradas_at" timestamp,
        "estado"                 varchar(20) NOT NULL DEFAULT 'activo',
        "created_at"             TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"             TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_perfil_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_perfil_producto"
          FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL
      )
    `);

    // Un mismo handle no se repite por plataforma dentro de la misma cuenta.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_perfil_usuario_plataforma_handle"
        ON "perfiles_analiticos" ("usuario_id", "plataforma", "handle")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_perfil_usuario_estado"
        ON "perfiles_analiticos" ("usuario_id", "estado")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_perfil_producto"
        ON "perfiles_analiticos" ("producto_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "perfil_videos" (
        "id"            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "perfil_id"     uuid NOT NULL,
        "usuario_id"    uuid NOT NULL,
        "titulo"        varchar(200) NOT NULL,
        "storage_url"   varchar(500),
        "mime"          varchar(100),
        "bytes"         integer,
        "publicado_en"  date,
        "vistas"        integer,
        "likes"         integer,
        "comentarios"   integer,
        "compartidos"   integer,
        "guardados"     integer,
        "retencion_pct" numeric(5,2),
        "ctr_pct"       numeric(5,2),
        "resumen_ia"    text,
        "estado"        varchar(20) NOT NULL DEFAULT 'activo',
        "archivado_at"  timestamp,
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_perfil_video_perfil"
          FOREIGN KEY ("perfil_id") REFERENCES "perfiles_analiticos"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_perfil_video_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE
      )
    `);

    // El tope de vídeos se cuenta sobre (perfil_id, estado='activo'): ese es el
    // índice que sostiene el COUNT de cada subida.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_perfil_video_perfil_estado"
        ON "perfil_videos" ("perfil_id", "estado")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_perfil_video_usuario"
        ON "perfil_videos" ("usuario_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // perfil_videos primero: depende de perfiles_analiticos.
    await queryRunner.query(`DROP TABLE IF EXISTS "perfil_videos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "perfiles_analiticos"`);
  }
}