import { MigrationInterface, QueryRunner } from "typeorm";

export class InvitacionesTrabajador1775020000000 implements MigrationInterface {
    name = 'InvitacionesTrabajador1775020000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // --- invitaciones_trabajador ---
        // Código de un solo uso para que un trabajador se auto-registre y quede
        // ligado a la cuenta del dueño que lo emitió.
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "invitaciones_trabajador" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "codigo" varchar(16) NOT NULL,
                "cuenta_id" uuid NOT NULL,
                "email_destino" varchar,
                "expira_en" TIMESTAMP WITH TIME ZONE NOT NULL,
                "usado_por" uuid,
                "usado_en" TIMESTAMP WITH TIME ZONE,
                "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_invitaciones_trabajador" PRIMARY KEY ("id"),
                CONSTRAINT "FK_invitaciones_cuenta_id"
                    FOREIGN KEY ("cuenta_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_invitaciones_usado_por"
                    FOREIGN KEY ("usado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_invitaciones_cuenta_id"
            ON "invitaciones_trabajador" ("cuenta_id")
        `);
        // Unicidad del código para poder canjearlo sin ambigüedad.
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_invitaciones_codigo"
            ON "invitaciones_trabajador" ("codigo")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_invitaciones_codigo"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invitaciones_cuenta_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "invitaciones_trabajador"`);
    }
}