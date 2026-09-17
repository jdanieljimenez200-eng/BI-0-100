import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Usuario } from './Usuario';
import { Producto } from './Producto';
import { Negocio } from './Negocio';
import { MovimientoContable } from './MovimientoContable';
import { VentaItem } from './VentaItem';
import { Cliente } from './Cliente';
import { CanalCobro } from './CanalCobro';

@Entity('ventas')
@Index(['usuario_id', 'producto_id'])
@Index(['fecha'])
@Index(['usuario_id', 'numero_ticket'], { unique: true })
@Index(['movimiento_contable_id'])
@Index(['canal_cobro_id'])
@Index(['usuario_id', 'cliente_id'])
@Index(['cotizacion_id'])
@Index(['usuario_id', 'fecha'])
export class Venta {
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

  // Producto SSOT — define el país y por tanto el impuesto aplicado.
  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column()
  producto_id!: string;

  @ManyToOne(() => Negocio, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'negocio_id' })
  negocio!: Negocio | null;

  @Column({ nullable: true, type: 'uuid' })
  negocio_id!: string | null;

  // Folio incremental por usuario (ej. "POS-000123")
  @Column({ type: 'varchar', length: 20 })
  numero_ticket!: string;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  impuesto_monto!: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  impuesto_tasa!: number; // ej. 0.1600

  @Column({ type: 'varchar', length: 50, default: 'IVA' })
  impuesto_nombre!: string; // ej. "IVA", "IGV", "ITBM"

  @Column({ type: 'varchar', length: 3, default: 'MXN' })
  moneda!: string; // del país del producto

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total!: number;

  @Column({ type: 'varchar', length: 30, default: 'efectivo' })
  metodo_pago!: 'efectivo' | 'tarjeta' | 'transferencia' | 'otro';

  @Column({ type: 'varchar', length: 200, nullable: true })
  cliente_nombre!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cliente_telefono!: string | null;

  // FK real al CRM. cliente_nombre/cliente_telefono se mantienen ARRIBA como
  // snapshot: si el cliente se borra, el ticket histórico sigue siendo legible.
  // FK para agregar, snapshot para leer.
  @ManyToOne(() => Cliente, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente | null;

  @Column({ type: 'uuid', nullable: true })
  cliente_id!: string | null;

  // Cotización de origen cuando la venta nació de una conversión.
  @Column({ type: 'uuid', nullable: true })
  cotizacion_id!: string | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'completada' })
  estado!: 'completada' | 'cancelada';

  // Link al movimiento contable padre creado automáticamente
  @ManyToOne(() => MovimientoContable, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'movimiento_contable_id' })
  movimiento_contable!: MovimientoContable | null;

  @Column({ nullable: true, type: 'uuid' })
  movimiento_contable_id!: string | null;

  @ManyToOne(() => CanalCobro, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'canal_cobro_id' })
  canal_cobro!: CanalCobro | null;

  @Column({ nullable: true, type: 'uuid' })
  canal_cobro_id!: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  comision_monto!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  comision_iva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  monto_neto!: number | null;

  @OneToMany(() => VentaItem, (item) => item.venta, { cascade: true })
  items!: VentaItem[];

  @CreateDateColumn()
  fecha_creacion!: Date;
}
