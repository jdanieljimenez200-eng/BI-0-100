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
import { InsumoInventario } from './InsumoInventario';
import { Producto } from './Producto';
import { MovimientoContable } from './MovimientoContable';

@Entity('movimientos_inventario')
@Index(['usuario_id', 'insumo_id'])
@Index(['fecha'])
@Index(['producto_id'])
@Index(['movimiento_contable_id'])
export class MovimientoInventario {
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

  @ManyToOne(() => InsumoInventario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'insumo_id' })
  insumo!: InsumoInventario;

  @Column()
  insumo_id!: string;

  // Producto SSOT — necesario para integrar al egreso contable (define país/moneda)
  @ManyToOne(() => Producto, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto | null;

  @Column({ type: 'uuid', nullable: true })
  producto_id!: string | null;

  @Column({ type: 'varchar', length: 20 })
  tipo!: 'entrada' | 'salida' | 'ajuste' | 'merma';

  // Cantidad positiva siempre — el tipo indica si suma o resta del stock
  @Column({ type: 'decimal', precision: 12, scale: 3 })
  cantidad!: number;

  // Costo unitario al momento de la operación (importante para entradas)
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  costo_unitario!: number;

  // Costo total de la transacción (cantidad × costo_unitario)
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  costo_total!: number;

  // Stock resultante DESPUÉS de aplicar este movimiento — útil para auditoría
  @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
  stock_resultante!: number;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  motivo!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  proveedor!: string | null;

  // Link al egreso en Finanzas (solo cuando tipo='entrada' es compra)
  @ManyToOne(() => MovimientoContable, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'movimiento_contable_id' })
  movimiento_contable!: MovimientoContable | null;

  @Column({ type: 'uuid', nullable: true })
  movimiento_contable_id!: string | null;

  // Venta que originó esta salida (null en movimientos manuales de almacén).
  // Permite unir el reporte de almacén con el de ventas y hacer drill-down.
  @Column({ type: 'uuid', nullable: true })
  venta_id!: string | null;

  @CreateDateColumn()
  fecha_creacion!: Date;
}
