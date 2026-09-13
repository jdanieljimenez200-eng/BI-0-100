import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Roles de administración: soporte, moderador y superadmin.
 *
 * Hasta ahora `es_admin` era un interruptor de todo o nada: la persona que solo
 * tenía que atender una incidencia podía también cambiar planes y leer cédulas.
 * Una cuenta de soporte comprometida era una cuenta de superadmin comprometida.
 *
 * `es_admin` no se elimina: lo leen el frontend y el resto del código, y es la
 * vía documentada para crear el primer admin por SQL. En lugar de mantener las
 * dos columnas a mano —y que tarde o temprano digan cosas distintas—, un trigger
 * las sincroniza:
 *
 *  - Si cambia `admin_rol`, `es_admin` pasa a ser `admin_rol IS NOT NULL`.
 *  - Si solo cambia `es_admin` (el `UPDATE usuarios SET es_admin = true` de
 *    siempre), `true` da `superadmin` y `false` quita el rol.
 */
export class AddAdminRol1775480000000 implements MigrationInterface {
  name = 'AddAdminRol1775480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "admin_rol" varchar(20)
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "usuarios" ADD CONSTRAINT "CHK_usuarios_admin_rol"
          CHECK ("admin_rol" IS NULL OR "admin_rol" IN ('soporte', 'moderador', 'superadmin'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // Quien ya era admin conserva exactamente lo que podía hacer: todo.
    await queryRunner.query(
      `UPDATE "usuarios" SET "admin_rol" = 'superadmin' WHERE "es_admin" = true AND "admin_rol" IS NULL`
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION usuarios_sincronizar_admin() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.admin_rol IS NOT NULL THEN
            NEW.es_admin := true;
          ELSIF NEW.es_admin THEN
            NEW.admin_rol := 'superadmin';
          END IF;
        ELSE
          IF NEW.admin_rol IS DISTINCT FROM OLD.admin_rol THEN
            NEW.es_admin := NEW.admin_rol IS NOT NULL;
          ELSIF NEW.es_admin IS DISTINCT FROM OLD.es_admin THEN
            NEW.admin_rol := CASE WHEN NEW.es_admin THEN 'superadmin' ELSE NULL END;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_usuarios_sincronizar_admin" ON "usuarios"`);
    await queryRunner.query(`
      CREATE TRIGGER "trg_usuarios_sincronizar_admin"
        BEFORE INSERT OR UPDATE OF "es_admin", "admin_rol" ON "usuarios"
        FOR EACH ROW EXECUTE FUNCTION usuarios_sincronizar_admin()
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_usuarios_admin_rol" ON "usuarios" ("admin_rol") WHERE "admin_rol" IS NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_usuarios_sincronizar_admin" ON "usuarios"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS usuarios_sincronizar_admin()`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_usuarios_admin_rol"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP CONSTRAINT IF EXISTS "CHK_usuarios_admin_rol"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "admin_rol"`);
  }
}
