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

@Entity('insumos_inventario')
@Index(['usuario_id', 'negocio_id'])
export class InsumoInventario {
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

  @Column({ type: 'uuid', nullable: true })
  negocio_id!: string | null;

  @Column({ type: 'varchar', length: 255 })
  nombre!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  categoria!: string | null;

  @Column({ type: 'varchar', length: 30, default: 'pieza' })
  unidad!: string; // pieza, kg, gramo, litro, ml, caja, paquete...

  @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
  stock_actual!: number;

  @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
  stock_minimo!: number;

  // Costo Promedio Ponderado — actualizado en cada entrada
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  costo_promedio!: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  proveedor_default!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  ubicacion!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  emoji!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imagen_url!: string | null;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}
