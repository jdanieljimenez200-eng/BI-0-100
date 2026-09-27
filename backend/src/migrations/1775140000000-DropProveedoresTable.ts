import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class DropProveedoresTable1775140000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminar tabla si existe
    await queryRunner.dropTable('analisis_proveedores', true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // La tabla ya la había archivado ArchiveProveedoresModule1724004000000, y es
    // su down quien la restaura CON sus datos desde `analisis_proveedores_archived`.
    // Recrearla aquí vacía y con otras columnas hacía fallar ese restore
    // («relation "analisis_proveedores" already exists») y cortaba el rollback.
    if (await queryRunner.hasTable('analisis_proveedores_archived')) return;

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