import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fila de espera del día y catálogo de lugares (herramienta de Citas).
 *
 * La agenda solo sabía de citas con fecha y hora. Cuando el negocio se llena, la
 * gente llega sin reserva y no había dónde anotar quién espera, en qué orden ni
 * dónde sentarlo: el dueño lo llevaba en papel.
 *
 * `lugares_atencion` es deliberadamente genérico: una mesa en un restaurante,
 * una silla en una barbería, un consultorio en una clínica o una bahía en un
 * taller. `turnos_espera` es la fila de un día, con el rastro de a qué hora
 * llegó, se le llamó, se le sentó y se liberó el lugar.
 */
export class FilaEspera1775640000000 implements MigrationInterface {
  name = 'FilaEspera1775640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lugares_atencion" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "usuario_id" uuid NOT NULL,
        "creado_por_id" uuid,
        "negocio_id" uuid,
        "producto_id" uuid,
        "nombre" character varying(60) NOT NULL,
        "capacidad" integer,
        "orden" integer NOT NULL DEFAULT 0,
        "activo" boolean NOT NULL DEFAULT true,
        "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lugares_atencion" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lugares_atencion_usuario" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lugares_atencion_negocio" FOREIGN KEY ("negocio_id")
          REFERENCES "negocios"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_lugares_atencion_producto" FOREIGN KEY ("producto_id")
          REFERENCES "productos"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_lugares_atencion_capacidad" CHECK ("capacidad" IS NULL OR "capacidad" > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_lugares_atencion_cuenta_activo" ON "lugares_atencion" ("usuario_id", "activo")`,
    );
    // Dos "Mesa 4" vivas a la vez son un error de dedo, no dos lugares: el
    // índice es parcial para que los archivados no bloqueen reutilizar el nombre.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lugares_atencion_nombre_activo"
         ON "lugares_atencion" ("usuario_id", lower("nombre")) WHERE "activo"`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "turnos_espera" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "usuario_id" uuid NOT NULL,
        "creado_por_id" uuid,
        "negocio_id" uuid,
        "producto_id" uuid,
        "cliente_id" uuid,
        "lugar_id" uuid,
        "cliente_nombre" character varying(200) NOT NULL,
        "cliente_telefono" character varying(30),
        "personas" integer NOT NULL DEFAULT 1,
        "notas" text,
        "fecha" date NOT NULL,
        "estado" character varying(20) NOT NULL DEFAULT 'esperando',
        "hora_llegada" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "hora_llamado" TIMESTAMP WITH TIME ZONE,
        "hora_atendido" TIMESTAMP WITH TIME ZONE,
        "hora_liberado" TIMESTAMP WITH TIME ZONE,
        "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_turnos_espera" PRIMARY KEY ("id"),
        CONSTRAINT "FK_turnos_espera_usuario" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_turnos_espera_negocio" FOREIGN KEY ("negocio_id")
          REFERENCES "negocios"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_turnos_espera_producto" FOREIGN KEY ("producto_id")
          REFERENCES "productos"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_turnos_espera_cliente" FOREIGN KEY ("cliente_id")
          REFERENCES "clientes"("id") ON DELETE SET NULL,
        -- El lugar se archiva en vez de borrarse cuando tiene historial; si aun
        -- así desapareciera, el turno conserva el resto de su rastro.
        CONSTRAINT "FK_turnos_espera_lugar" FOREIGN KEY ("lugar_id")
          REFERENCES "lugares_atencion"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_turnos_espera_estado" CHECK (
          "estado" IN ('esperando', 'llamado', 'atendido', 'liberado', 'no_llego')
        ),
        CONSTRAINT "CHK_turnos_espera_personas" CHECK ("personas" > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_turnos_espera_cuenta_fecha" ON "turnos_espera" ("usuario_id", "fecha", "estado")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_turnos_espera_lugar" ON "turnos_espera" ("usuario_id", "lugar_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "turnos_espera"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lugares_atencion"`);
  }
}
