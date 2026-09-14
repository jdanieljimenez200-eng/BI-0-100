import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Red de expertos, segunda etapa: perfiles con contenido e impulsos pagados.
 *
 *  - `usuarios.tipo_cuenta`: al registrarse se elige «tengo un negocio» o
 *    «ofrezco servicios». Solo cambia a dónde se lleva al usuario; no da permisos.
 *  - Categorías ampliadas (contabilidad, diseño, proveedores, tecnología).
 *  - `expertos.whatsapp` y `portada_url`: el contacto directo y la imagen de
 *    cabecera del perfil.
 *  - `experto_imagenes` y `experto_servicios`: galería y catálogo del perfil.
 *  - `impulsos_experto`: campañas prepagadas por días y alcance (ciudad o
 *    nacional), cobradas con Stripe Checkout en modo pago único.
 *  - `experto_metricas_dia`: apariciones, visitas y clics de contacto por día.
 *    Agregado diario y no un evento por fila: el directorio es público y una fila
 *    por impresión crecería sin techo.
 */
const CATEGORIAS = `('legal','contabilidad','marketing','diseno','ventas','proveedores','tecnologia')`;
const CATEGORIAS_ANTES = `('legal','marketing','ventas')`;

export class RedPerfilesEImpulsos1775540000000 implements MigrationInterface {
  name = 'RedPerfilesEImpulsos1775540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "tipo_cuenta" varchar(20) NOT NULL DEFAULT 'negocio'`
    );
    await queryRunner.query(`ALTER TABLE "usuarios" DROP CONSTRAINT IF EXISTS "CHK_usuarios_tipo_cuenta"`);
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD CONSTRAINT "CHK_usuarios_tipo_cuenta" CHECK ("tipo_cuenta" IN ('negocio','experto'))`
    );

    await queryRunner.query(`ALTER TABLE "expertos" DROP CONSTRAINT IF EXISTS "CHK_expertos_categoria"`);
    await queryRunner.query(
      `ALTER TABLE "expertos" ADD CONSTRAINT "CHK_expertos_categoria" CHECK ("categoria" IN ${CATEGORIAS})`
    );
    await queryRunner.query(`ALTER TABLE "expertos" ADD COLUMN IF NOT EXISTS "whatsapp" varchar(20)`);
    await queryRunner.query(`ALTER TABLE "expertos" ADD COLUMN IF NOT EXISTS "portada_url" varchar(500)`);
    // Las fichas nuevas cotizan en pesos; las existentes conservan lo que tenían.
    await queryRunner.query(`ALTER TABLE "expertos" ALTER COLUMN "moneda" SET DEFAULT 'MXN'`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "experto_imagenes" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "experto_id" uuid NOT NULL REFERENCES "expertos"("id") ON DELETE CASCADE,
        "url" varchar(500) NOT NULL,
        "descripcion" varchar(200) NOT NULL DEFAULT '',
        "orden" integer NOT NULL DEFAULT 0,
        "fecha_creacion" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_experto_imagenes_experto" ON "experto_imagenes" ("experto_id", "orden")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "experto_servicios" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "experto_id" uuid NOT NULL REFERENCES "expertos"("id") ON DELETE CASCADE,
        "nombre" varchar(120) NOT NULL,
        "descripcion" varchar(1000) NOT NULL DEFAULT '',
        "precio_desde" numeric(12,2),
        "unidad" varchar(40) NOT NULL DEFAULT '',
        "orden" integer NOT NULL DEFAULT 0,
        "fecha_creacion" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_experto_servicios_precio" CHECK ("precio_desde" IS NULL OR "precio_desde" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_experto_servicios_experto" ON "experto_servicios" ("experto_id", "orden")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "impulsos_experto" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "experto_id" uuid NOT NULL REFERENCES "expertos"("id") ON DELETE CASCADE,
        "categoria" varchar(20) NOT NULL,
        "alcance" varchar(10) NOT NULL,
        "ciudad" varchar(120),
        "dias" integer NOT NULL,
        "monto_mxn" numeric(12,2) NOT NULL,
        "estado" varchar(20) NOT NULL DEFAULT 'pendiente_pago',
        "stripe_session_id" varchar(255) UNIQUE,
        "stripe_payment_intent" varchar(255),
        "fecha_inicio" timestamp,
        "fecha_fin" timestamp,
        "motivo_cancelacion" text,
        "fecha_creacion" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_impulsos_alcance" CHECK ("alcance" IN ('ciudad','nacional')),
        CONSTRAINT "CHK_impulsos_ciudad" CHECK ("alcance" = 'nacional' OR "ciudad" IS NOT NULL),
        CONSTRAINT "CHK_impulsos_estado" CHECK ("estado" IN ('pendiente_pago','activo','terminado','cancelado','expirado')),
        CONSTRAINT "CHK_impulsos_dias" CHECK ("dias" BETWEEN 1 AND 60),
        CONSTRAINT "CHK_impulsos_categoria" CHECK ("categoria" IN ${CATEGORIAS})
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_impulsos_vigentes" ON "impulsos_experto" ("categoria", "alcance", lower("ciudad")) WHERE "estado" = 'activo'`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_impulsos_experto" ON "impulsos_experto" ("experto_id", "fecha_creacion" DESC)`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "experto_metricas_dia" (
        "experto_id" uuid NOT NULL REFERENCES "expertos"("id") ON DELETE CASCADE,
        "fecha" date NOT NULL,
        "impresiones" integer NOT NULL DEFAULT 0,
        "impresiones_impulsadas" integer NOT NULL DEFAULT 0,
        "vistas" integer NOT NULL DEFAULT 0,
        "clics_whatsapp" integer NOT NULL DEFAULT 0,
        "clics_telefono" integer NOT NULL DEFAULT 0,
        "clics_email" integer NOT NULL DEFAULT 0,
        "clics_web" integer NOT NULL DEFAULT 0,
        PRIMARY KEY ("experto_id", "fecha")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "experto_metricas_dia"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "impulsos_experto"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "experto_servicios"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "experto_imagenes"`);
    await queryRunner.query(`ALTER TABLE "expertos" ALTER COLUMN "moneda" SET DEFAULT 'USD'`);
    await queryRunner.query(`ALTER TABLE "expertos" DROP COLUMN IF EXISTS "portada_url"`);
    await queryRunner.query(`ALTER TABLE "expertos" DROP COLUMN IF EXISTS "whatsapp"`);
    await queryRunner.query(`ALTER TABLE "expertos" DROP CONSTRAINT IF EXISTS "CHK_expertos_categoria"`);
    await queryRunner.query(
      `ALTER TABLE "expertos" ADD CONSTRAINT "CHK_expertos_categoria" CHECK ("categoria" IN ${CATEGORIAS_ANTES})`
    );
    await queryRunner.query(`ALTER TABLE "usuarios" DROP CONSTRAINT IF EXISTS "CHK_usuarios_tipo_cuenta"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "tipo_cuenta"`);
  }
}
