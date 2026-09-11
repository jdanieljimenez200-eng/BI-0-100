import { MigrationInterface, QueryRunner } from "typeorm";

export class MarcaLogoAndBrief1775200000000 implements MigrationInterface {
    name = 'MarcaLogoAndBrief1775200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add producto_id FK to marcas
        await queryRunner.query(`
            ALTER TABLE "marcas"
            ADD COLUMN IF NOT EXISTS "producto_id" uuid
        `);

        await queryRunner.query(`
            ALTER TABLE "marcas"
            DROP CONSTRAINT IF EXISTS "FK_marcas_producto"
        `);

        await queryRunner.query(`
            ALTER TABLE "marcas"
            ADD CONSTRAINT "FK_marcas_producto"
            FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL
        `);

        // Add brief_data jsonb column
        await queryRunner.query(`
            ALTER TABLE "marcas"
            ADD COLUMN IF NOT EXISTS "brief_data" jsonb
        `);

        // Add logo_analysis jsonb column
        await queryRunner.query(`
            ALTER TABLE "marcas"
            ADD COLUMN IF NOT EXISTS "logo_analysis" jsonb
        `);

        // Drop old single-user index, create composite index
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_marcas_usuario_id"
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_marcas_usuario_producto"
            ON "marcas" ("usuario_id", "producto_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_marcas_usuario_producto"`);
        await queryRunner.query(`ALTER TABLE "marcas" DROP CONSTRAINT IF EXISTS "FK_marcas_producto"`);
        await queryRunner.query(`ALTER TABLE "marcas" DROP COLUMN IF EXISTS "logo_analysis"`);
        await queryRunner.query(`ALTER TABLE "marcas" DROP COLUMN IF EXISTS "brief_data"`);
        await queryRunner.query(`ALTER TABLE "marcas" DROP COLUMN IF EXISTS "producto_id"`);
    }
}
