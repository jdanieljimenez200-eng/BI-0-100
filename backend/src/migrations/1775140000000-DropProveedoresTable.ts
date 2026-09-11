import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class DropProveedoresTable1775140000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminar tabla si existe
    await queryRunner.dropTable('analisis_proveedores', true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recrear tabla en caso de rollback
    await queryRunner.createTable(
      new Table({
        name: 'analisis_proveedores',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'usuario_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'producto_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'estado_analisis',
            type: 'varchar',
            isNullable: false,
            default: "'procesando'",
          },
          {
            name: 'error_mensaje',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'fecha_creacion',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      })
    );
  }
}