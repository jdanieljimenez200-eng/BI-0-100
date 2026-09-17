import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `temas_usuario.usuario_id` no tenía clave foránea: al borrar una cuenta por
 * cualquier camino que no fuera la purga de la papelera (que lo borraba a mano),
 * su tema quedaba huérfano para siempre.
 *
 * Primero se eliminan los huérfanos que ya existan (la FK no se podría crear con
 * ellos) y después se añade la FK con ON DELETE CASCADE.
 */
export class FkTemasUsuario1775550000000 implements MigrationInterface {
  name = 'FkTemasUsuario1775550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "temas_usuario" t WHERE NOT EXISTS (SELECT 1 FROM "usuarios" u WHERE u."id" = t."usuario_id")`
    );
    await queryRunner.query(
      `ALTER TABLE "temas_usuario"
         ADD CONSTRAINT "FK_temas_usuario_usuario"
         FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "temas_usuario" DROP CONSTRAINT IF EXISTS "FK_temas_usuario_usuario"`);
  }
}
