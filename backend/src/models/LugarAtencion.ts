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

/**
 * Lugar donde se atiende a alguien. Deliberadamente genérico: una mesa en un
 * restaurante, una silla en una barbería, un consultorio en una clínica o una
 * bahía en un taller. El nombre lo pone el negocio.
 */
@Entity('lugares_atencion')
@Index(['usuario_id', 'activo'])
export class LugarAtencion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  usuario_id!: string;

  // Auditoría: trabajador que lo creó cuando no fue el dueño. No afecta el scoping.
  @Column({ type: 'uuid', nullable: true })
  creado_por_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  negocio_id!: string | null;

  // null = el lugar vale para todos los productos de la cuenta, igual que en Cita.
  @Column({ type: 'uuid', nullable: true })
  producto_id!: string | null;

  @Column({ type: 'varchar', length: 60 })
  nombre!: string;

  /** Cuántas personas caben. Opcional: en una barbería no significa nada. */
  @Column({ type: 'int', nullable: true })
  capacidad!: number | null;

  @Column({ type: 'int', default: 0 })
  orden!: number;

  /** Un lugar con turnos se archiva (false), nunca se borra. */
  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}
