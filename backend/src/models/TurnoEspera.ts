import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Usuario } from './Usuario';
import { Cliente } from './Cliente';
import { LugarAtencion } from './LugarAtencion';

export type EstadoTurno = 'esperando' | 'llamado' | 'atendido' | 'liberado' | 'no_llego';

/**
 * Una persona en la fila de un día concreto.
 *
 * `atendido` es el único estado que ocupa un lugar; `liberado` lo devuelve. Por
 * eso la ocupación se calcula sin guardar nada en el lugar: un lugar está
 * ocupado si tiene un turno `atendido` de hoy.
 */
@Entity('turnos_espera')
@Index(['usuario_id', 'fecha', 'estado'])
@Index(['usuario_id', 'lugar_id'])
export class TurnoEspera {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  usuario_id!: string;

  @Column({ type: 'uuid', nullable: true })
  creado_por_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  negocio_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  producto_id!: string | null;

  // Vínculo opcional al CRM: la fila va deprisa y casi siempre son datos
  // sueltos, pero si el cliente ya existe (o se da de alta ahí mismo) queda
  // enlazado, igual que en las citas.
  @ManyToOne(() => Cliente, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente | null;

  @Column({ type: 'uuid', nullable: true })
  cliente_id!: string | null;

  @ManyToOne(() => LugarAtencion, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'lugar_id' })
  lugar!: LugarAtencion | null;

  @Column({ type: 'uuid', nullable: true })
  lugar_id!: string | null;

  // Snapshot: el turno sigue siendo legible aunque el cliente se borre.
  @Column({ type: 'varchar', length: 200 })
  cliente_nombre!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cliente_telefono!: string | null;

  @Column({ type: 'int', default: 1 })
  personas!: number;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  /** Día de la fila, en la zona del negocio (utils/fechaLocal.ts). */
  @Column({ type: 'date' })
  fecha!: string;

  @Column({ type: 'varchar', length: 20, default: 'esperando' })
  estado!: EstadoTurno;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  hora_llegada!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  hora_llamado!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  hora_atendido!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  hora_liberado!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  fecha_creacion!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  fecha_actualizacion!: Date;
}
