import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Si el negocio cobra el impuesto al consumo (IVA, IGV, ITBMS…) en sus ventas
 * del POS. Lo decide el régimen, no cada ticket: el monotributista argentino,
 * el Nuevo RUS peruano o el «no responsable de IVA» colombiano no lo cobran.
 *
 * El precio del catálogo es siempre el precio al público con el impuesto
 * dentro (así lo exige la ley en México, Colombia, Perú, Chile, Ecuador…), así
 * que este dato no cambia lo que se cobra: solo si una parte se registra como
 * impuesto por pagar.
 */
export class CobraImpuestoConsumo1775780000000 implements MigrationInterface {
  name = 'CobraImpuestoConsumo1775780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "cobra_impuesto_consumo" boolean NOT NULL DEFAULT true`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN IF EXISTS "cobra_impuesto_consumo"`);
  }
}
