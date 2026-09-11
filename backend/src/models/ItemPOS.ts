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

@Entity('items_pos')
@Index(['usuario_id', 'negocio_id'])
export class ItemPOS {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  usuario_id!: string;

  @ManyToOne(() => Negocio, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'negocio_id' })
  negocio!: Negocio | null;

  @Column({ nullable: true, type: 'uuid' })
  negocio_id!: string | null;

  @Column({ type: 'varchar', length: 255 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  precio!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  categoria!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imagen_url!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  emoji!: string | null;

  @Column({ default: true })
  activo!: boolean;

  @Column({ type: 'int', default: 0 })
  orden!: number;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}
