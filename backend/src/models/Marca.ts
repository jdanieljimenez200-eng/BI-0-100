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
import { Producto } from './Producto';

@Entity('marcas')
@Index(['usuario_id', 'producto_id'])
export class Marca {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  usuario_id!: string;

  @ManyToOne(() => Producto, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column({ nullable: true })
  producto_id!: string;

  @Column()
  nombre!: string;

  @Column({ nullable: true })
  slogan!: string;

  @Column({ nullable: true, type: 'text' })
  descripcion!: string;

  @Column({ nullable: true })
  logo_url!: string;

  // Dominio propio para white-label (POS, tickets, cotizaciones). Solo se
  // aplica si el plan del dueño tiene white_label activo. Ej. "ventas.minegocio.com".
  @Column({ nullable: true })
  dominio!: string;

  @Column({ nullable: true, type: 'jsonb' })
  paleta_colores!: Record<string, unknown> | null;

  @Column({ nullable: true })
  tipografia!: string;

  @Column({ nullable: true, type: 'jsonb' })
  brief_data!: object | null;

  @Column({ nullable: true, type: 'jsonb' })
  logo_analysis!: object | null;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fecha_creacion!: Date;
}
