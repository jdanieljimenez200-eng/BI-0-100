import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Producto } from './Producto';
import { Usuario } from './Usuario';

@Entity('analisis_marketing')
@Index(['usuario_id', 'producto_id'])
@Index(['estado_analisis'])
export class AnalisisMarketing {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column()
  producto_id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  usuario_id!: string;

  @Column({ nullable: true })
  analisis_mercado_id!: string;

  @Column({ nullable: true, type: 'varchar' })
  voz_marca!: string;

  @Column({ type: 'int', nullable: true })
  presupuesto_mensual!: number;

  @Column({ nullable: true, type: 'varchar' })
  meta_campana!: string;

  // Resultados de cada fase (jsonb)
  @Column({ nullable: true, type: 'jsonb' })
  estrategias_data!: object;

  @Column({ nullable: true, type: 'jsonb' })
  copies_data!: object;

  @Column({ nullable: true, type: 'jsonb' })
  calendario_data!: object;

  @Column({ nullable: true, type: 'jsonb' })
  reporte_ads_data?: object | null;

  // Estado del proceso
  @Column({ default: 'procesando' })
  estado_analisis!: 'procesando' | 'completado' | 'error';

  @Column({ nullable: true, type: 'text' })
  error_mensaje!: string;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @Column({ nullable: true })
  fecha_completado!: Date;
}
