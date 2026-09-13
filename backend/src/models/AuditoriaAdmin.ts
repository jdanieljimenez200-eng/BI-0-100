import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Una acción de administración, tal como ocurrió.
 *
 * Solo inserción: la base rechaza UPDATE, DELETE y TRUNCATE sobre esta tabla
 * (ver la migración `CreateAuditoriaAdmin`). No tiene relación con `Usuario` a
 * propósito: el registro tiene que sobrevivir al borrado de las cuentas de las
 * que habla. Por eso guarda una copia del email y del rol.
 *
 * No se escribe directamente: se usa `registrarAccionAdmin`
 * (`services/admin/auditoria.ts`), dentro de la transacción del cambio.
 */
@Entity('auditoria_admin')
@Index(['admin_id', 'fecha'])
@Index(['recurso_tipo', 'recurso_id'])
export class AuditoriaAdmin {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  admin_id!: string;

  @Column({ type: 'varchar', length: 255 })
  admin_email!: string;

  @Column({ type: 'varchar', length: 20 })
  admin_rol!: string;

  @Column({ type: 'varchar', length: 60 })
  accion!: string;

  @Column({ type: 'varchar', length: 40 })
  recurso_tipo!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  recurso_id!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  antes!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  despues!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  motivo!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  user_agent!: string | null;

  @CreateDateColumn()
  fecha!: Date;
}
