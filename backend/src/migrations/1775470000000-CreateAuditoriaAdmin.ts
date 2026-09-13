import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registro de auditoría de las acciones de administración.
 *
 * Responde a "¿quién cambió esto, cuándo y por qué?". Sin él, ante una
 * reclamación —"me desactivaron la cuenta", "me bajaron el plan"— no hay nada
 * que mirar, y un admin que abusa de su acceso no deja rastro.
 *
 * Tres decisiones que no son detalles:
 *
 *  - **Solo inserción, garantizado por la base.** Un trigger rechaza UPDATE,
 *    DELETE y TRUNCATE. No depende de que el código de la aplicación se porte
 *    bien: ni un bug, ni un admin con acceso a la API, ni una query escrita a
 *    mano desde la aplicación pueden reescribir el pasado. (Quien tenga acceso
 *    de superusuario a PostgreSQL puede desactivar el trigger, pero eso ya queda
 *    fuera del alcance de la aplicación y en los logs del servidor de BD.)
 *
 *  - **Sin clave foránea a `usuarios`.** El registro tiene que sobrevivir al
 *    borrado de la cuenta del admin y de la del afectado; si hubiera FK con
 *    cascada, borrar a alguien borraría la prueba de lo que se le hizo. Por eso
 *    se guarda además una copia del email y del rol en el momento de la acción.
 *
 *  - **`antes` y `despues` en jsonb.** Lo que cambió, no solo que cambió algo.
 */
export class CreateAuditoriaAdmin1775470000000 implements MigrationInterface {
  name = 'CreateAuditoriaAdmin1775470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auditoria_admin" (
        "id"            uuid NOT NULL DEFAULT public.uuid_generate_v4(),
        "admin_id"      uuid NOT NULL,
        "admin_email"   varchar(255) NOT NULL,
        "admin_rol"     varchar(20) NOT NULL,
        "accion"        varchar(60) NOT NULL,
        "recurso_tipo"  varchar(40) NOT NULL,
        "recurso_id"    varchar(64),
        "antes"         jsonb,
        "despues"       jsonb,
        "motivo"        text,
        "ip"            varchar(64),
        "user_agent"    varchar(500),
        "fecha"         TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auditoria_admin" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_auditoria_admin_fecha" ON "auditoria_admin" ("fecha" DESC)`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_auditoria_admin_admin" ON "auditoria_admin" ("admin_id", "fecha" DESC)`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_auditoria_admin_recurso" ON "auditoria_admin" ("recurso_tipo", "recurso_id")`
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION auditoria_admin_solo_insercion() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'auditoria_admin es de solo inserción: no se puede % un registro', TG_OP
          USING ERRCODE = 'insufficient_privilege';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_auditoria_admin_filas" ON "auditoria_admin"`);
    await queryRunner.query(`
      CREATE TRIGGER "trg_auditoria_admin_filas"
        BEFORE UPDATE OR DELETE ON "auditoria_admin"
        FOR EACH ROW EXECUTE FUNCTION auditoria_admin_solo_insercion()
    `);
    // TRUNCATE no dispara triggers de fila: necesita el suyo de sentencia.
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_auditoria_admin_truncate" ON "auditoria_admin"`);
    await queryRunner.query(`
      CREATE TRIGGER "trg_auditoria_admin_truncate"
        BEFORE TRUNCATE ON "auditoria_admin"
        FOR EACH STATEMENT EXECUTE FUNCTION auditoria_admin_solo_insercion()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auditoria_admin"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS auditoria_admin_solo_insercion()`);
  }
}
