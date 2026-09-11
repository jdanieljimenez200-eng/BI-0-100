import { MigrationInterface, QueryRunner } from "typeorm";

export class EquipoFase1775010000000 implements MigrationInterface {
    name = 'EquipoFase1775010000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // --- usuarios: jerarquía de cuenta ---
        await queryRunner.query(`
            ALTER TABLE "usuarios"
            ADD COLUMN IF NOT EXISTS "owner_id" uuid
        `);
        await queryRunner.query(`
            ALTER TABLE "usuarios"
            ADD COLUMN IF NOT EXISTS "account_role" varchar NOT NULL DEFAULT 'owner'
        `);

        // FK owner_id -> usuarios(id). Si se borra el dueño, se borran sus trabajadores.
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE constraint_name = 'FK_usuarios_owner_id'
                ) THEN
                    ALTER TABLE "usuarios"
                    ADD CONSTRAINT "FK_usuarios_owner_id"
                    FOREIGN KEY ("owner_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;
                END IF;
            END $$;
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_usuarios_owner_id" ON "usuarios" ("owner_id")
        `);

        // Backfill: todos los usuarios existentes son dueños de su propia cuenta.
        await queryRunner.query(`
            UPDATE "usuarios"
            SET "account_role" = 'owner', "owner_id" = NULL
            WHERE "account_role" IS NULL OR "account_role" = ''
        `);

        // --- asignaciones_trabajador ---
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "asignaciones_trabajador" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "trabajador_id" uuid NOT NULL,
                "cuenta_id" uuid NOT NULL,
                "producto_id" uuid NOT NULL,
                "permisos" jsonb NOT NULL DEFAULT '{}'::jsonb,
                "activo" boolean NOT NULL DEFAULT true,
                "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
                "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_asignaciones_trabajador" PRIMARY KEY ("id"),
                CONSTRAINT "FK_asignaciones_trabajador_id"
                    FOREIGN KEY ("trabajador_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_asignaciones_cuenta_id"
                    FOREIGN KEY ("cuenta_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_asignaciones_producto_id"
                    FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_asignaciones_trabajador_id"
            ON "asignaciones_trabajador" ("trabajador_id")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_asignaciones_cuenta_id"
            ON "asignaciones_trabajador" ("cuenta_id")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_asignaciones_producto_id"
            ON "asignaciones_trabajador" ("producto_id")
        `);
        // Unicidad: una sola asignación por (trabajador, producto).
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_asignaciones_trabajador_producto"
            ON "asignaciones_trabajador" ("trabajador_id", "producto_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_asignaciones_trabajador_producto"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_asignaciones_producto_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_asignaciones_cuenta_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_asignaciones_trabajador_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "asignaciones_trabajador"`);

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_usuarios_owner_id"`);
        await queryRunner.query(`ALTER TABLE "usuarios" DROP CONSTRAINT IF EXISTS "FK_usuarios_owner_id"`);
        await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "account_role"`);
        await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "owner_id"`);
    }
}