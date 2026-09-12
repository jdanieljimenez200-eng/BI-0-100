import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Una sola ficha por usuario y categoria.
 *
 * Sin esto, el alta es un boton de spam: cada POST crea otra ficha pendiente y
 * la cola de revision del admin se llena de copias del mismo profesional. Con
 * el indice, el segundo intento rebota y la ruta responde "ya tienes una ficha
 * aqui, editala" — que ademas es el flujo correcto para volver a presentarse
 * despues de un rechazo.
 *
 * Parcial sobre `usuario_id IS NOT NULL` porque las fichas que da de alta un
 * admin no tienen cuenta asociada y no deben competir por el hueco.
 */
export class UnicoExpertoPorUsuarioYCategoria1775460000000 implements MigrationInterface {
  name = 'UnicoExpertoPorUsuarioYCategoria1775460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_expertos_usuario_categoria"
        ON "expertos" ("usuario_id", "categoria")
        WHERE "usuario_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_expertos_usuario_categoria"`);
  }
}
