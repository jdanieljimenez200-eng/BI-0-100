import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Control interno de caja (Fase 2 del análisis de herramientas).
 *
 * 1. `ventas` guarda el rastro de la cancelación (quién, cuándo y por qué).
 *    Antes cancelar era `DELETE`: la venta, sus ítems y sus asientos
 *    desaparecían y no quedaba ni constancia de que existieron.
 * 2. `venta_items.precio_catalogo` conserva el precio de lista de la línea, para
 *    poder ver cuándo se cobró otra cosa.
 * 3. `auditoria_dinero`: registro de solo escritura de los cambios sobre dinero
 *    ya registrado (cancelaciones, ediciones y borrados de asientos).
 */
export class ControlInternoVentas1775620000000 implements MigrationInterface {
  name = 'ControlInternoVentas1775620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "cancelada_por_id" uuid`);
    await queryRunner.query(`ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "motivo_cancelacion" character varying(300)`);
    await queryRunner.query(`ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "fecha_cancelacion" TIMESTAMP WITH TIME ZONE`);
    // Quien canceló puede darse de baja después: la venta conserva el rastro
    // aunque el usuario desaparezca.
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "ventas"
          ADD CONSTRAINT "FK_ventas_cancelada_por"
          FOREIGN KEY ("cancelada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`ALTER TABLE "venta_items" ADD COLUMN IF NOT EXISTS "precio_catalogo" numeric(12,2)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auditoria_dinero" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "usuario_id" uuid NOT NULL,
        "actor_id" uuid,
        "accion" character varying(40) NOT NULL,
        "entidad" character varying(30) NOT NULL,
        "entidad_id" uuid NOT NULL,
        "producto_id" uuid,
        "monto_antes" numeric(12,2),
        "monto_despues" numeric(12,2),
        "motivo" character varying(300),
        "detalle" jsonb,
        "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auditoria_dinero" PRIMARY KEY ("id"),
        CONSTRAINT "FK_auditoria_dinero_usuario" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_auditoria_dinero_entidad" CHECK ("entidad" IN ('venta', 'movimiento_contable'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_auditoria_dinero_cuenta_fecha" ON "auditoria_dinero" ("usuario_id", "fecha_creacion" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_auditoria_dinero_entidad" ON "auditoria_dinero" ("entidad", "entidad_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auditoria_dinero"`);
    await queryRunner.query(`ALTER TABLE "venta_items" DROP COLUMN IF EXISTS "precio_catalogo"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT IF EXISTS "FK_ventas_cancelada_por"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN IF EXISTS "fecha_cancelacion"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN IF EXISTS "motivo_cancelacion"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN IF EXISTS "cancelada_por_id"`);
  }
}
