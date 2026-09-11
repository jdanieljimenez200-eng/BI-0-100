import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Usuario } from './Usuario';
import { Negocio } from './Negocio';

@Entity('empleados')
@Index(['usuario_id'])
@Index(['usuario_id', 'producto_id'])
export class Empleado {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  usuario_id!: string;

  @ManyToOne(() => Negocio, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'negocio_id' })
  negocio!: Negocio | null;

  @Column({ type: 'uuid', nullable: true })
  negocio_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  producto_id!: string | null;

  @Column({ type: 'varchar', length: 200 })
  nombre!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  cargo!: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  salario!: number;

  // semanal | quincenal | mensual
  @Column({ type: 'varchar', length: 20, default: 'mensual' })
  tipo_pago!: 'semanal' | 'quincenal' | 'mensual';

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  moneda!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  telefono!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email!: string | null;

  @Column({ type: 'date', nullable: true })
  fecha_inicio!: string | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}
