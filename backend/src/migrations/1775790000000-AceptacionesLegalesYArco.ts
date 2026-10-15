import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Evidencia de consentimiento y canal de derechos ARCO (docs/legal/).
 *
 * `aceptaciones_legales`: qué documento aceptó cada cuenta, en qué versión, cuándo,
 * por qué vía y desde dónde. Sin esta prueba, el «Al registrarte aceptas…» no
 * demostraba nada (Código de Comercio, arts. 89 y ss.). También guarda la
 * autorización expresa del cargo recurrente que exige el art. 76 Bis fr. VIII de
 * la LFPC. Se borra con la cuenta: tras la purga ya no hay relación que probar.
 * `metodo = 'sesion'`: aceptó desde la app ya con sesión (cuentas anteriores a
 * este registro, colaboradores dados de alta por el dueño o una versión nueva).
 *
 * `solicitudes_arco`: cada solicitud de acceso, rectificación, cancelación u
 * oposición con su folio y sus plazos (20 días para responder y 15 para
 * ejecutar, art. 31 de la LFPDPPP). `usuario_id` es SET NULL a propósito: si el
 * titular pidió borrar su cuenta, la solicitud tiene que sobrevivir a la purga
 * para probar que se atendió.
 */
export class AceptacionesLegalesYArco1775790000000 implements MigrationInterface {
  name = 'AceptacionesLegalesYArco1775790000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "aceptaciones_legales" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "usuario_id" uuid NOT NULL,
        "documento" character varying(30) NOT NULL,
        "version" character varying(20) NOT NULL,
        "metodo" character varying(20) NOT NULL,
        "ip" character varying(45),
        "user_agent" character varying(300),
        "detalle" jsonb,
        "aceptado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_aceptaciones_legales" PRIMARY KEY ("id"),
        CONSTRAINT "FK_aceptaciones_legales_usuario" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_aceptaciones_legales_documento" CHECK (
          "documento" IN ('terminos', 'privacidad', 'cargo_recurrente')
        ),
        CONSTRAINT "CHK_aceptaciones_legales_metodo" CHECK (
          "metodo" IN ('registro', 'google', 'sesion', 'checkout')
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_aceptaciones_legales_usuario" ON "aceptaciones_legales" ("usuario_id", "documento", "aceptado_en" DESC)`,
    );

    // Folio legible y sin huecos por concurrencia: una secuencia, no MAX()+1.
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "solicitudes_arco_folio_seq"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "solicitudes_arco" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "folio" character varying(20) NOT NULL,
        "usuario_id" uuid,
        "nombre" character varying(150) NOT NULL,
        "email" character varying(254) NOT NULL,
        "tipo" character varying(20) NOT NULL,
        "relacion" character varying(20) NOT NULL DEFAULT 'titular',
        "descripcion" text NOT NULL,
        "estado" character varying(20) NOT NULL DEFAULT 'recibida',
        "respuesta" text,
        "notas_internas" text,
        "ip" character varying(45),
        "fecha_recepcion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fecha_limite_respuesta" TIMESTAMP WITH TIME ZONE NOT NULL,
        "fecha_respuesta" TIMESTAMP WITH TIME ZONE,
        "fecha_limite_ejecucion" TIMESTAMP WITH TIME ZONE,
        "fecha_ejecucion" TIMESTAMP WITH TIME ZONE,
        "fecha_actualizacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_solicitudes_arco" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_solicitudes_arco_folio" UNIQUE ("folio"),
        CONSTRAINT "FK_solicitudes_arco_usuario" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_solicitudes_arco_tipo" CHECK (
          "tipo" IN ('acceso', 'rectificacion', 'cancelacion', 'oposicion', 'revocacion', 'limitacion')
        ),
        CONSTRAINT "CHK_solicitudes_arco_relacion" CHECK ("relacion" IN ('titular', 'representante')),
        CONSTRAINT "CHK_solicitudes_arco_estado" CHECK (
          "estado" IN ('recibida', 'requiere_info', 'en_revision', 'respondida', 'ejecutada', 'improcedente', 'remitida')
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_solicitudes_arco_usuario" ON "solicitudes_arco" ("usuario_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_solicitudes_arco_pendientes" ON "solicitudes_arco" ("fecha_limite_respuesta")
         WHERE "estado" IN ('recibida', 'requiere_info', 'en_revision')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "solicitudes_arco"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "solicitudes_arco_folio_seq"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "aceptaciones_legales"`);
  }
}
