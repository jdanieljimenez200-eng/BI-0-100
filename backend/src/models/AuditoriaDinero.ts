import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Usuario } from './Usuario';

/** Qué pasó. Se guarda como texto para poder añadir casos sin migrar. */
export type AccionAuditada =
  | 'venta_cancelada'
  | 'movimiento_editado'
  | 'movimiento_borrado'
  | 'precio_fuera_de_catalogo';

/**
 * Rastro de los cambios que mueven dinero ya registrado.
 *
 * Sin esto, cancelar una venta o editar el monto de un asiento no dejaba huella
 * de quién lo hizo: en un negocio con empleados, eso es el fraude clásico de
 * caja (cobrar, cancelar y quedarse el efectivo). Es un registro de solo
 * escritura: ninguna ruta lo edita ni lo borra, y se escribe DENTRO de la misma
 * transacción que el cambio, para que no puedan existir el uno sin el otro.
 */
@Entity('auditoria_dinero')
@Index(['usuario_id', 'fecha_creacion'])
@Index(['entidad', 'entidad_id'])
export class AuditoriaDinero {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Cuenta (dueño) a la que pertenece el dato tocado. */
  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  /** Persona real que hizo el cambio: el trabajador, o el dueño si actuó él. */
  @Column({ type: 'uuid', nullable: true })
  actor_id!: string | null;

  @Column({ type: 'varchar', length: 40 })
  accion!: AccionAuditada;

  @Column({ type: 'varchar', length: 30 })
  entidad!: 'venta' | 'movimiento_contable';

  @Column({ type: 'uuid' })
  entidad_id!: string;

  @Column({ type: 'uuid', nullable: true })
  producto_id!: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  monto_antes!: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  monto_despues!: number | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  motivo!: string | null;

  /** Contexto extra (folio, campos cambiados…), sin datos sensibles. */
  @Column({ type: 'jsonb', nullable: true })
  detalle!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  fecha_creacion!: Date;
}
