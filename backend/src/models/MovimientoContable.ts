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

@Entity('movimientos_contables')
@Index(['usuario_id', 'producto_id'])
@Index(['fecha'])
@Index(['batch_id'])
@Index(['fuente'])
@Index(['parent_movimiento_id'])
export class MovimientoContable {
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

  @ManyToOne(() => Producto, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto | null;

  @Column({ nullable: true, type: 'uuid' })
  producto_id!: string | null;

  @Column({ length: 10 })
  tipo!: 'ingreso' | 'egreso';

  @Column({ length: 255 })
  descripcion!: string;

  @Column({ length: 100, nullable: true })
  categoria!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto!: number;

  @Column({ type: 'date' })
  fecha!: string;

  @ManyToOne(() => MovimientoContable, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'parent_movimiento_id' })
  parent_movimiento!: MovimientoContable | null;

  @Column({ nullable: true, type: 'uuid' })
  parent_movimiento_id!: string | null;

  @Column({ default: false })
  es_auto_generado!: boolean;

  @Column({ default: false })
  tiene_cfdi!: boolean;

  @Column({ default: 'manual', length: 20 })
  fuente!: 'manual' | 'csv_import' | 'pos' | 'inventario' | 'nomina' | 'cotizacion';

  @Column({ nullable: true, type: 'uuid' })
  batch_id!: string | null;

  // Trazabilidad: qué tipo de entidad y qué ID originó este movimiento.
  // Permite reconstruir el libro mayor con referencia exacta a la fuente.
  @Column({ type: 'varchar', length: 30, nullable: true })
  referencia_tipo!: 'venta' | 'cotizacion' | 'pago_nomina' | 'compra_inventario' | 'ajuste_manual' | null;

  @Column({ type: 'uuid', nullable: true })
  referencia_id!: string | null;

  @CreateDateColumn()
  fecha_creacion!: Date;
}
