import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prompts de IA versionados y editables desde el panel de admin.
 *
 * Cada módulo tiene un «modo de comportamiento» (`legal.modo`) y, donde aplica,
 * fichas por país (`legal.pais.CO`). El admin edita un borrador, lo prueba, lo
 * publica y puede revertir. Tres garantías que viven en la base, no en el código:
 *
 *  - **Un solo publicado por clave** (índice único parcial): no hay forma de que
 *    dos versiones compitan por ser «la vigente».
 *  - **Lo publicado no se reescribe** (trigger): un análisis que se hizo con la
 *    versión 3 tiene que poder volver a leer exactamente la versión 3. Solo se
 *    permite mover el estado (publicado ⇄ archivado); el texto de una versión que
 *    ya salió de borrador es inmutable.
 *  - **`uso_ia.prompt_version_id`**: qué versión costó cuánto, para comparar
 *    versiones en el panel de costos.
 *
 * `productos.perfil_negocio` guarda el «Afina tu análisis»: se responde una vez
 * y lo reutilizan todos los módulos.
 */
export class PromptsIA1775710000000 implements MigrationInterface {
  name = 'PromptsIA1775710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "prompts_ia" (
        "id"                  uuid NOT NULL DEFAULT public.uuid_generate_v4(),
        "clave"               varchar(80) NOT NULL,
        "version"             integer NOT NULL,
        "estado"              varchar(12) NOT NULL DEFAULT 'borrador',
        "contenido"           text NOT NULL,
        "secciones_extra"     jsonb NOT NULL DEFAULT '[]'::jsonb,
        "secciones_ocultas"   jsonb NOT NULL DEFAULT '[]'::jsonb,
        "notas"               varchar(500),
        "creado_por_id"       uuid,
        "publicado_por_id"    uuid,
        "fecha_publicacion"   TIMESTAMP,
        "fecha_creacion"      TIMESTAMP NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_prompts_ia" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_prompts_ia_clave_version" UNIQUE ("clave", "version"),
        CONSTRAINT "CHK_prompts_ia_estado" CHECK ("estado" IN ('borrador', 'publicado', 'archivado')),
        CONSTRAINT "CHK_prompts_ia_version" CHECK ("version" > 0),
        CONSTRAINT "FK_prompts_ia_creado_por" FOREIGN KEY ("creado_por_id")
          REFERENCES "usuarios"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_prompts_ia_publicado_por" FOREIGN KEY ("publicado_por_id")
          REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_prompts_ia_publicado" ON "prompts_ia" ("clave") WHERE "estado" = 'publicado'`
    );
    // Una FK nueva lleva índice en la columna hija (CLAUDE.md, regla 1).
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_prompts_ia_creado_por" ON "prompts_ia" ("creado_por_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_prompts_ia_publicado_por" ON "prompts_ia" ("publicado_por_id")`
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prompts_ia_inmutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.estado <> 'borrador' AND (
             NEW.contenido IS DISTINCT FROM OLD.contenido
          OR NEW.secciones_extra IS DISTINCT FROM OLD.secciones_extra
          OR NEW.secciones_ocultas IS DISTINCT FROM OLD.secciones_ocultas
          OR NEW.clave IS DISTINCT FROM OLD.clave
          OR NEW.version IS DISTINCT FROM OLD.version
        ) THEN
          RAISE EXCEPTION 'prompts_ia: la versión % de % ya no es un borrador y no se puede editar', OLD.version, OLD.clave
            USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.estado <> 'borrador' AND NEW.estado = 'borrador' THEN
          RAISE EXCEPTION 'prompts_ia: una versión publicada o archivada no vuelve a borrador'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_prompts_ia_inmutable" ON "prompts_ia"`);
    await queryRunner.query(`
      CREATE TRIGGER "trg_prompts_ia_inmutable"
        BEFORE UPDATE ON "prompts_ia"
        FOR EACH ROW EXECUTE FUNCTION prompts_ia_inmutable()
    `);

    await queryRunner.query(`ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "perfil_negocio" jsonb`);

    await queryRunner.query(`ALTER TABLE "uso_ia" ADD COLUMN IF NOT EXISTS "prompt_version_id" uuid`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_uso_ia_prompt_version') THEN
          ALTER TABLE "uso_ia" ADD CONSTRAINT "FK_uso_ia_prompt_version"
            FOREIGN KEY ("prompt_version_id") REFERENCES "prompts_ia"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_uso_ia_prompt_version" ON "uso_ia" ("prompt_version_id")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_uso_ia_prompt_version"`);
    await queryRunner.query(`ALTER TABLE "uso_ia" DROP CONSTRAINT IF EXISTS "FK_uso_ia_prompt_version"`);
    await queryRunner.query(`ALTER TABLE "uso_ia" DROP COLUMN IF EXISTS "prompt_version_id"`);
    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN IF EXISTS "perfil_negocio"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_prompts_ia_inmutable" ON "prompts_ia"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prompts_ia_inmutable()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "prompts_ia"`);
  }
}
