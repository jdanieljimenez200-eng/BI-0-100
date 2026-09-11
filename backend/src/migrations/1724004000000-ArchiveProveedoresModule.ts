import { MigrationInterface, QueryRunner } from 'typeorm';

export class ArchiveProveedoresModule1724004000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Crear tabla de archivo (backup) con misma estructura
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS analisis_proveedores_archived (
        id UUID PRIMARY KEY,
        producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
        usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
        presupuesto_proveedores NUMERIC(12,2),
        ubicacion VARCHAR(255),
        directorio_data JSONB,
        rfq_data JSONB,
        resumen_data JSONB,
        error_mensaje TEXT,
        estado_analisis VARCHAR(50),
        fecha_creado TIMESTAMP DEFAULT NOW(),
        fecha_actualizado TIMESTAMP DEFAULT NOW(),
        fecha_completado TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 2. Copiar los datos existentes al archivo — solo si la tabla original
    //    sigue estando.
    //
    //    En una base creada desde cero esa tabla NO existe: la baseline actual
    //    (1723999999000) ya no la incluye porque el módulo se archivó. Sin este
    //    guardia, `migration:run` sobre una base limpia moría aquí con
    //    `relation "analisis_proveedores" does not exist`, y con ella cualquier
    //    entorno nuevo: CI, staging o una recuperación desde copia.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.analisis_proveedores') IS NOT NULL THEN
          INSERT INTO analisis_proveedores_archived
          SELECT * FROM analisis_proveedores;
        END IF;
      END $$;
    `);

    // 3. Crear índice en tabla archivada para búsquedas futuras
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analisis_proveedores_archived_usuario_id 
      ON analisis_proveedores_archived(usuario_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analisis_proveedores_archived_producto_id 
      ON analisis_proveedores_archived(producto_id)
    `);

    // 4. Eliminar tabla original (datos ya están en el archivo)
    await queryRunner.query(`DROP TABLE IF EXISTS analisis_proveedores CASCADE`);

    console.log('✅ Migración: analisis_proveedores archivada en analisis_proveedores_archived');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback: restaurar tabla original desde backup
    await queryRunner.query(`
      CREATE TABLE analisis_proveedores (
        id UUID PRIMARY KEY,
        producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
        usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
        presupuesto_proveedores NUMERIC(12,2),
        ubicacion VARCHAR(255),
        directorio_data JSONB,
        rfq_data JSONB,
        resumen_data JSONB,
        error_mensaje TEXT,
        estado_analisis VARCHAR(50),
        fecha_creado TIMESTAMP DEFAULT NOW(),
        fecha_actualizado TIMESTAMP DEFAULT NOW(),
        fecha_completado TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Restaurar datos desde archivo
    await queryRunner.query(`
      INSERT INTO analisis_proveedores
      SELECT * FROM analisis_proveedores_archived
    `);

    // Recrear índices
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analisis_proveedores_usuario_id
      ON analisis_proveedores(usuario_id)
    `);

    console.log('✅ Rollback: analisis_proveedores restaurada desde archivo');
  }
}