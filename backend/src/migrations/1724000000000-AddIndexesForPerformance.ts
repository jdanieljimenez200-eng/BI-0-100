import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/**
 * Agregar índices a columnas críticas para optimizar queries de análisis y dashboard.
 * Índices reducen tiempo de búsqueda O(n) → O(log n).
 */
export class AddIndexesForPerformance1724000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'analisis_mercado',
      'analisis_marketing',
      'analisis_finanzas',
      'analisis_legal',
      'analisis_brief',
      'analisis_ventas',
    ];

    for (const table of tables) {
      const tableExists = await queryRunner.hasTable(table);
      if (!tableExists) continue;

      // Índice compuesto: (usuario_id, estado_analisis) para queries de quota
      await queryRunner.createIndex(
        table,
        new TableIndex({
          name: `idx_${table}_usuario_estado`,
          columnNames: ['usuario_id', 'estado_analisis'],
        })
      );

      // Índice en fecha_creacion para dashboard timeseries
      await queryRunner.createIndex(
        table,
        new TableIndex({
          name: `idx_${table}_fecha_creacion`,
          columnNames: ['fecha_creacion'],
        })
      );

      // Índice en producto_id para listar análisis por producto
      await queryRunner.createIndex(
        table,
        new TableIndex({
          name: `idx_${table}_producto_id`,
          columnNames: ['producto_id'],
        })
      );
    }

    // Índices en tabla Usuario (búsquedas por email, plan)
    await queryRunner.createIndex(
      'usuarios',
      new TableIndex({
        name: 'idx_usuario_email',
        columnNames: ['email'],
        isUnique: true,
      })
    );

    await queryRunner.createIndex(
      'usuarios',
      new TableIndex({
        name: 'idx_usuario_plan',
        columnNames: ['plan'],
      })
    );

    // Índice en Producto (lista por usuario)
    await queryRunner.createIndex(
      'productos',
      new TableIndex({
        name: 'idx_producto_usuario_id',
        columnNames: ['usuario_id'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'analisis_mercado',
      'analisis_marketing',
      'analisis_finanzas',
      'analisis_legal',
      'analisis_brief',
      'analisis_ventas',
    ];

    for (const table of tables) {
      const tableExists = await queryRunner.hasTable(table);
      if (!tableExists) continue;

      await queryRunner.dropIndex(table, `idx_${table}_usuario_estado`);
      await queryRunner.dropIndex(table, `idx_${table}_fecha_creacion`);
      await queryRunner.dropIndex(table, `idx_${table}_producto_id`);
    }

    await queryRunner.dropIndex('usuarios', 'idx_usuario_email');
    await queryRunner.dropIndex('usuarios', 'idx_usuario_plan');
    await queryRunner.dropIndex('productos', 'idx_producto_usuario_id');
  }
}