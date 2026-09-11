import { MigrationInterface, QueryRunner } from "typeorm";

export class AnalisisLegal1775030000000 implements MigrationInterface {
    name = 'AnalisisLegal1775030000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "analisis_legal" (
                "id"                    uuid NOT NULL DEFAULT gen_random_uuid(),
                "producto_id"           uuid NOT NULL,
                "usuario_id"            uuid NOT NULL,
                "pais"                  varchar NOT NULL DEFAULT 'MX',
                "forma_juridica"        varchar,
                "tiene_empleados"       boolean NOT NULL DEFAULT false,
                "numero_empleados"      integer,
                "vende_en_linea"        boolean NOT NULL DEFAULT false,
                "exporta_importa"       boolean NOT NULL DEFAULT false,
                "giro_especifico"       text,
                "estado_constitucion"   varchar,
                "anios_operando"        varchar,
                "giro_detectado"        varchar,
                "cumplimiento_global"   varchar,
                "puntaje_cumplimiento"  integer,
                "resultado_data"        jsonb,
                "estado_analisis"       varchar NOT NULL DEFAULT 'procesando',
                "error_mensaje"         text,
                "fecha_creacion"        TIMESTAMP NOT NULL DEFAULT now(),
                "fecha_completado"      TIMESTAMP,
                CONSTRAINT "PK_analisis_legal" PRIMARY KEY ("id"),
                CONSTRAINT "FK_analisis_legal_producto"
                    FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_analisis_legal_usuario"
                    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_analisis_legal_usuario_producto"
            ON "analisis_legal" ("usuario_id", "producto_id")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_analisis_legal_estado"
            ON "analisis_legal" ("estado_analisis")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_analisis_legal_estado"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_analisis_legal_usuario_producto"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "analisis_legal"`);
    }
}
