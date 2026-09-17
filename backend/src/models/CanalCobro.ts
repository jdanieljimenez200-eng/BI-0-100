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
import { Producto } from './Producto';

export type TipoCanalCobro =
  | 'terminal'
  | 'delivery'
  | 'pasarela_web'
  | 'transferencia'
  | 'efectivo'
  | 'otro';

@Entity('canales_cobro')
@Index(['usuario_id'])
@Index(['usuario_id', 'producto_id'])
@Index(['usuario_id', 'activo'])
export class CanalCobro {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  usuario_id!: string;

  @ManyToOne(() => Producto, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto | null;

  @Column({ nullable: true, type: 'uuid' })
  producto_id!: string | null;

  @Column({ length: 120 })
  nombre!: string;

  @Column({ length: 30, default: 'terminal' })
  tipo_canal!: TipoCanalCobro;

  @Column({ length: 100 })
  institucion!: string; // ej. Clip, Mercado Pago, BBVA, Uber Eats, Rappi, Stripe

  @Column({ type: 'decimal', precision: 6, scale: 4, default: 0 })
  comision_porcentaje!: number; // ej. 0.0360 para 3.6%

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  comision_fija!: number; // ej. 4.00 para $4 MXN

  @Column({ default: true })
  aplica_iva_comision!: boolean; // 16% sobre comision_porcentaje + fija

  @Column({ type: 'decimal', precision: 6, scale: 4, default: 0 })
  retencion_isr_porcentaje!: number; // para plataformas tecnológicas (ej. 0.0100 o 0.0250)

  @Column({ type: 'decimal', precision: 6, scale: 4, default: 0 })
  retencion_iva_porcentaje!: number; // para plataformas tecnológicas (ej. 0.0800)

  @Column({ type: 'int', default: 1 })
  dias_liquidacion!: number; // días hábiles hasta depósito real en banco

  @Column({ default: true })
  activo!: boolean;

  @Column({ type: 'varchar', length: 30, nullable: true })
  color!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  icono!: string | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}
