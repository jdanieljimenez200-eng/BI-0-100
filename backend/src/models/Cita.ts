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
import { Negocio } from './Negocio';
import { Cliente } from './Cliente';

@Entity('citas')
@Index(['usuario_id'])
@Index(['usuario_id', 'fecha'])
@Index(['usuario_id', 'producto_id'])
@Index(['usuario_id', 'cliente_id'])
export class Cita {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  usuario_id!: string;

  // Auditoría: id del trabajador que creó la fila cuando difiere del dueño
  // (usuario_id). Null = creada por el propio owner. No afecta el scoping.
  @Column({ type: 'uuid', nullable: true })
  creado_por_id!: string | null;

  @ManyToOne(() => Negocio, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'negocio_id' })
  negocio!: Negocio | null;

  @Column({ type: 'uuid', nullable: true })
  negocio_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  producto_id!: string | null;

  // Vínculo opcional al expediente (Cliente). Cuando está presente, la cita
  // pertenece a un expediente; cuando es null, sigue el modo "cliente suelto"
  // con los campos cliente_nombre/telefono/email embebidos (POS/negocios).
  @ManyToOne(() => Cliente, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente | null;

  @Column({ type: 'uuid', nullable: true })
  cliente_id!: string | null;

  @Column({ type: 'varchar', length: 200 })
  titulo!: string;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ type: 'time' })
  hora_inicio!: string;

  @Column({ type: 'time' })
  hora_fin!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  cliente_nombre!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cliente_telefono!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  cliente_email!: string | null;

  // Estado del agendamiento
  @Column({ type: 'varchar', length: 20, default: 'pendiente' })
  estado!: 'pendiente' | 'confirmada' | 'cancelada' | 'completada';

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  // Color para el chip en el calendario (hex o nombre Tailwind)
  @Column({ type: 'varchar', length: 20, default: '#3B82F6' })
  color!: string;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}
