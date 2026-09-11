import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Actualiza las restricciones de integridad referencial para garantizar onDelete consistente:
 * - productos.usuario_id -> CASCADE
 * - herramientas_seleccionadas.usuario_id -> CASCADE
 * - analisis_ventas.usuario_id -> CASCADE
 * - analisis_ventas.producto_id -> CASCADE
 * - usuarios.owner_id -> SET NULL (los trabajadores permanecen desvinculados)
 */
export class UpdateForeignKeyOnDeleteConstraints1775280000000 implements MigrationInterface {
  name = 'UpdateForeignKeyOnDeleteConstraints1775280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. productos(usuario_id) -> ON DELETE CASCADE
    await queryRunner.query(`
      ALTER TABLE "productos"
        DROP CONSTRAINT IF EXISTS "FK_12b2bc8b2bf53a2225681984614",
        ADD CONSTRAINT "FK_12b2bc8b2bf53a2225681984614"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE
    `);

    // 2. herramientas_seleccionadas(usuario_id) -> ON DELETE CASCADE
    await queryRunner.query(`
      ALTER TABLE "herramientas_seleccionadas"
        DROP CONSTRAINT IF EXISTS "FK_0793db1577f433ec36b50d80057",
        ADD CONSTRAINT "FK_0793db1577f433ec36b50d80057"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE
    `);

    // 3. analisis_ventas(usuario_id) -> ON DELETE CASCADE
    await queryRunner.query(`
      ALTER TABLE "analisis_ventas"
        DROP CONSTRAINT IF EXISTS "FK_8bff2e615c7b674d72d927ad456",
        ADD CONSTRAINT "FK_8bff2e615c7b674d72d927ad456"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE
    `);

    // 4. analisis_ventas(producto_id) -> ON DELETE CASCADE
    await queryRunner.query(`
      ALTER TABLE "analisis_ventas"
        DROP CONSTRAINT IF EXISTS "FK_3624baecdaf80e3a62ed3767c9b",
        ADD CONSTRAINT "FK_3624baecdaf80e3a62ed3767c9b"
          FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE
    `);

    // 5. usuarios(owner_id) -> ON DELETE SET NULL
    await queryRunner.query(`
      ALTER TABLE "usuarios"
        DROP CONSTRAINT IF EXISTS "FK_bfadc259f72c9b1ab51301f0e31",
        ADD CONSTRAINT "FK_bfadc259f72c9b1ab51301f0e31"
          FOREIGN KEY ("owner_id") REFERENCES "usuarios"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usuarios"
        DROP CONSTRAINT IF EXISTS "FK_bfadc259f72c9b1ab51301f0e31",
        ADD CONSTRAINT "FK_bfadc259f72c9b1ab51301f0e31"
          FOREIGN KEY ("owner_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "analisis_ventas"
        DROP CONSTRAINT IF EXISTS "FK_3624baecdaf80e3a62ed3767c9b",
        ADD CONSTRAINT "FK_3624baecdaf80e3a62ed3767c9b"
          FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "analisis_ventas"
        DROP CONSTRAINT IF EXISTS "FK_8bff2e615c7b674d72d927ad456",
        ADD CONSTRAINT "FK_8bff2e615c7b674d72d927ad456"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "herramientas_seleccionadas"
        DROP CONSTRAINT IF EXISTS "FK_0793db1577f433ec36b50d80057",
        ADD CONSTRAINT "FK_0793db1577f433ec36b50d80057"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "productos"
        DROP CONSTRAINT IF EXISTS "FK_12b2bc8b2bf53a2225681984614",
        ADD CONSTRAINT "FK_12b2bc8b2bf53a2225681984614"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION
    `);
  }
}
