import { MigrationInterface, QueryRunner } from "typeorm";

export class MercadoFase1Columns1774998000000 implements MigrationInterface {
    name = 'MercadoFase1Columns1774998000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // precio_usuario: elimina dependencia de localStorage en el frontend
        await queryRunner.query(`
            ALTER TABLE "analisis_mercado"
            ADD COLUMN IF NOT EXISTS "precio_usuario" NUMERIC(12,2)
        `);

        // confianza_analisis: 'alta' | 'media' | 'baja'
        await queryRunner.query(`
            ALTER TABLE "analisis_mercado"
            ADD COLUMN IF NOT EXISTS "confianza_analisis" VARCHAR
        `);

        // payback_data: cálculo determinista de ROI/Payback (PaybackResult JSON)
        await queryRunner.query(`
            ALTER TABLE "analisis_mercado"
            ADD COLUMN IF NOT EXISTS "payback_data" JSONB
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "analisis_mercado" DROP COLUMN IF EXISTS "payback_data"`);
        await queryRunner.query(`ALTER TABLE "analisis_mercado" DROP COLUMN IF EXISTS "confianza_analisis"`);
        await queryRunner.query(`ALTER TABLE "analisis_mercado" DROP COLUMN IF EXISTS "precio_usuario"`);
    }
}
