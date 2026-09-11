import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega restricciones de unicidad compuestas para garantizar la integridad
 * de folios a nivel de base de datos bajo condiciones de concurrencia:
 *  - cotizaciones (usuario_id, numero)
 *  - ventas (usuario_id, numero_ticket)
 */
export class AddFolioUniqueConstraints1775260000000 implements MigrationInterface {
  name = 'AddFolioUniqueConstraints1775260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cotizacionesExiste = await queryRunner.hasTable('cotizaciones');
    if (cotizacionesExiste) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cotizaciones_usuario_numero"
          ON "cotizaciones" ("usuario_id", "numero")
      `);
    }

    const ventasExiste = await queryRunner.hasTable('ventas');
    if (ventasExiste) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ventas_usuario_ticket"
          ON "ventas" ("usuario_id", "numero_ticket")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const ventasExiste = await queryRunner.hasTable('ventas');
    if (ventasExiste) {
      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ventas_usuario_ticket"`);
    }

    const cotizacionesExiste = await queryRunner.hasTable('cotizaciones');
    if (cotizacionesExiste) {
      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cotizaciones_usuario_numero"`);
    }
  }
}
