import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Red de expertos: directorio de profesionales (legal, marketing, ventas) que
 * los usuarios pueden consultar desde los resultados de sus analisis.
 *
 * Tres tablas:
 *
 *  - `expertos`            la ficha. Nace en `pendiente` y solo un admin la
 *                          pasa a `aprobado`; el directorio publico filtra por
 *                          ese estado, asi que una ficha recien dada de alta no
 *                          es visible para nadie mas que su dueno.
 *  - `resenas_experto`     una resena por usuario y experto (indice unico), de
 *                          1 a 5 estrellas (CHECK). El promedio se guarda
 *                          desnormalizado en `expertos` para no recalcularlo en
 *                          cada listado.
 *  - `patrocinios_experto` posiciones pagadas. El experto paga por aparecer
 *                          arriba; la plataforma NO intermedia el dinero de la
 *                          consulta, por eso basta con el Stripe que ya existe.
 *
 * Notas de diseno que importan:
 *
 *  - `usuario_id` es NULLABLE a proposito: un admin puede dar de alta a un
 *    experto que todavia no tiene cuenta. Cuando si la tiene, el borrado de la
 *    cuenta arrastra la ficha (CASCADE) para que darse de baja borre de verdad
 *    los datos personales.
 *  - `verificado` es una columna aparte de `estado`: aprobar una ficha para que
 *    se vea NO es lo mismo que declarar que se comprobo la cedula. Solo el
 *    endpoint de admin toca esta columna.
 *  - `documento_url` (cedula o acreditacion) nunca sale en el endpoint publico.
 */
export class CreateRedExpertos1775450000000 implements MigrationInterface {
  name = 'CreateRedExpertos1775450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`);

    // ─── expertos ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expertos" (
        "id"                     uuid NOT NULL DEFAULT public.uuid_generate_v4(),
        "usuario_id"             uuid,
        "nombre_comercial"       varchar(160) NOT NULL,
        "nombre_display"         varchar(160) NOT NULL,
        "bio_corta"              varchar(280) NOT NULL DEFAULT '',
        "bio_larga"              text,
        "categoria"              varchar(20) NOT NULL,
        "especialidad"           varchar(120) NOT NULL DEFAULT '',
        "sub_especialidades"     jsonb NOT NULL DEFAULT '[]'::jsonb,
        "ciudad"                 varchar(120) NOT NULL DEFAULT '',
        "pais"                   varchar(2),
        "email_contacto"         varchar(180),
        "telefono"               varchar(40),
        "sitio_web"              varchar(300),
        "avatar_url"             varchar(500),
        "mostrar_contacto"       boolean NOT NULL DEFAULT false,
        "tarifa_desde"           numeric(12,2),
        "moneda"                 varchar(10) NOT NULL DEFAULT 'USD',
        "ofrece_consulta_gratis" boolean NOT NULL DEFAULT false,
        "video_url"              varchar(500),
        "estado"                 varchar(20) NOT NULL DEFAULT 'pendiente',
        "verificado"             boolean NOT NULL DEFAULT false,
        "documento_url"          varchar(500),
        "motivo_rechazo"         text,
        "rating_promedio"        numeric(3,2) NOT NULL DEFAULT 0,
        "total_resenas"          integer NOT NULL DEFAULT 0,
        "fecha_creacion"         TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_actualizacion"    TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_aprobacion"       TIMESTAMP,
        CONSTRAINT "PK_expertos" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_expertos_estado"
          CHECK ("estado" IN ('pendiente','aprobado','rechazado','suspendido')),
        CONSTRAINT "CHK_expertos_categoria"
          CHECK ("categoria" IN ('legal','marketing','ventas'))
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "expertos"
          ADD CONSTRAINT "FK_expertos_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // El listado publico siempre filtra por estado + categoria y ordena por
    // rating: este indice cubre la consulta entera.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_expertos_directorio" ON "expertos" ("estado", "categoria", "rating_promedio" DESC)`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_expertos_usuario" ON "expertos" ("usuario_id")`
    );
    // Cola de revision del admin.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_expertos_pendientes" ON "expertos" ("fecha_creacion") WHERE "estado" = 'pendiente'`
    );

    // ─── resenas_experto ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "resenas_experto" (
        "id"             uuid NOT NULL DEFAULT public.uuid_generate_v4(),
        "experto_id"     uuid NOT NULL,
        "usuario_id"     uuid NOT NULL,
        "puntuacion"     smallint NOT NULL,
        "comentario"     text,
        "estado"         varchar(20) NOT NULL DEFAULT 'publicada',
        "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_resenas_experto" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_resenas_experto_puntuacion"
          CHECK ("puntuacion" BETWEEN 1 AND 5),
        CONSTRAINT "CHK_resenas_experto_estado"
          CHECK ("estado" IN ('publicada','oculta'))
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "resenas_experto"
          ADD CONSTRAINT "FK_resenas_experto_experto"
          FOREIGN KEY ("experto_id") REFERENCES "expertos"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "resenas_experto"
          ADD CONSTRAINT "FK_resenas_experto_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // Una resena por usuario y experto. Sin esto el rating es trivial de
    // inflar repitiendo el POST, y deja de significar nada.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_resenas_experto_experto_usuario" ON "resenas_experto" ("experto_id", "usuario_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_resenas_experto_usuario" ON "resenas_experto" ("usuario_id")`
    );

    // ─── patrocinios_experto ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "patrocinios_experto" (
        "id"                     uuid NOT NULL DEFAULT public.uuid_generate_v4(),
        "experto_id"             uuid NOT NULL,
        "categoria"              varchar(20) NOT NULL,
        "stripe_subscription_id" varchar(255),
        "estado"                 varchar(20) NOT NULL DEFAULT 'activo',
        "prioridad"              integer NOT NULL DEFAULT 0,
        "fecha_inicio"           TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_fin"              TIMESTAMP,
        CONSTRAINT "PK_patrocinios_experto" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_patrocinios_experto_estado"
          CHECK ("estado" IN ('activo','cancelado','vencido'))
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "patrocinios_experto"
          ADD CONSTRAINT "FK_patrocinios_experto_experto"
          FOREIGN KEY ("experto_id") REFERENCES "expertos"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // El webhook de Stripe llega con el id de suscripcion y nada mas: tiene que
    // poder encontrar el patrocinio por ahi, y solo puede haber uno.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_patrocinios_experto_subscription" ON "patrocinios_experto" ("stripe_subscription_id") WHERE "stripe_subscription_id" IS NOT NULL`
    );
    // Los patrocinios activos se leen en cada listado del directorio.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_patrocinios_experto_activos" ON "patrocinios_experto" ("categoria", "prioridad" DESC) WHERE "estado" = 'activo'`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_patrocinios_experto_experto" ON "patrocinios_experto" ("experto_id")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "patrocinios_experto"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "resenas_experto"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expertos"`);
  }
}
