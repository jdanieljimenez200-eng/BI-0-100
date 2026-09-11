import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateIndexes1774918332277 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_analisis_mercado_estado" ON "analisis_mercado" ("estado_analisis")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_analisis_mercado_usuario" ON "analisis_mercado" ("usuario_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_productos_usuario" ON "productos" ("usuario_id")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_productos_usuario"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_analisis_mercado_usuario"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_analisis_mercado_estado"`);
  }
}
