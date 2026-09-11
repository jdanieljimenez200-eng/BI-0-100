import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Columnas de negocio que el wizard de alta de producto YA recogía y que se
 * perdían al enviar: la tabla no tenía dónde guardarlas.
 *
 * El formulario incluso validaba `precio_suscripcion` como obligatorio al elegir
 * modelo de suscripción, y luego lo descartaba.
 *
 * Todas nullable a propósito: los productos existentes se quedan en NULL y las
 * pantallas deben mostrar "no registrado" en vez de inventar un 0.
 */
export class AddCamposNegocioAProductos1775440000000 implements MigrationInterface {
  name = 'AddCamposNegocioAProductos1775440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "productos"
        ADD COLUMN IF NOT EXISTS "tipo_actividad"     varchar(20),
        ADD COLUMN IF NOT EXISTS "estatus_proyecto"   varchar(40),
        ADD COLUMN IF NOT EXISTS "cobertura"          varchar(40),
        ADD COLUMN IF NOT EXISTS "canal_venta"        varchar(40),
        ADD COLUMN IF NOT EXISTS "modelo_cobro"       varchar(40),
        ADD COLUMN IF NOT EXISTS "canal_adquisicion"  varchar(60),
        ADD COLUMN IF NOT EXISTS "direccion"          text,
        ADD COLUMN IF NOT EXISTS "puv"                text,
        ADD COLUMN IF NOT EXISTS "cliente_ideal"      text,
        ADD COLUMN IF NOT EXISTS "radio_km"           integer,
        ADD COLUMN IF NOT EXISTS "ltv_meses"          integer,
        ADD COLUMN IF NOT EXISTS "clientes_mes"       integer,
        ADD COLUMN IF NOT EXISTS "tamano_equipo"      integer,
        ADD COLUMN IF NOT EXISTS "precio_suscripcion" numeric(12,2),
        ADD COLUMN IF NOT EXISTS "inversion_inicial"  numeric(12,2),
        ADD COLUMN IF NOT EXISTS "costos_fijos"       numeric(12,2),
        ADD COLUMN IF NOT EXISTS "tasa_repeticion"    numeric(5,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "productos"
        DROP COLUMN IF EXISTS "tipo_actividad",
        DROP COLUMN IF EXISTS "estatus_proyecto",
        DROP COLUMN IF EXISTS "cobertura",
        DROP COLUMN IF EXISTS "canal_venta",
        DROP COLUMN IF EXISTS "modelo_cobro",
        DROP COLUMN IF EXISTS "canal_adquisicion",
        DROP COLUMN IF EXISTS "direccion",
        DROP COLUMN IF EXISTS "puv",
        DROP COLUMN IF EXISTS "cliente_ideal",
        DROP COLUMN IF EXISTS "radio_km",
        DROP COLUMN IF EXISTS "ltv_meses",
        DROP COLUMN IF EXISTS "clientes_mes",
        DROP COLUMN IF EXISTS "tamano_equipo",
        DROP COLUMN IF EXISTS "precio_suscripcion",
        DROP COLUMN IF EXISTS "inversion_inicial",
        DROP COLUMN IF EXISTS "costos_fijos",
        DROP COLUMN IF EXISTS "tasa_repeticion"
    `);
  }
}
