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
import { CanalCobro } from './CanalCobro';

@Entity('movimientos_contables')
@Index(['usuario_id', 'producto_id'])
@Index(['fecha'])
@Index(['batch_id'])
@Index(['fuente'])
@Index(['parent_movimiento_id'])
@Index('IDX_movimientos_revierte', ['revierte_movimiento_id'])
@Index(['canal_cobro_id'])
@Index(['usuario_id', 'estado_liquidacion'])
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

  /**
   * Asiento que este revierte (cancelación de una venta). Los agregados de
   * Contabilidad lo usan para restar el reverso de la clase del original: el de
   * un ingreso resta ingresos, el de un impuesto resta impuestos.
   */
  @ManyToOne(() => MovimientoContable, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'revierte_movimiento_id' })
  revierte_movimiento!: MovimientoContable | null;

  @Column({ nullable: true, type: 'uuid' })
  revierte_movimiento_id!: string | null;

  @Column({ default: false })
  es_auto_generado!: boolean;

  @Column({ default: false })
  tiene_cfdi!: boolean;

  @Column({ default: 'manual', length: 20 })
  fuente!: 'manual' | 'csv_import' | 'pos' | 'inventario' | 'nomina' | 'cotizacion' | 'mantenimiento' | 'delivery' | 'terminal';

  @Column({ nullable: true, type: 'uuid' })
  batch_id!: string | null;

  // Trazabilidad de canal / terminal / delivery
  @ManyToOne(() => CanalCobro, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'canal_cobro_id' })
  canal_cobro!: CanalCobro | null;

  @Column({ nullable: true, type: 'uuid' })
  canal_cobro_id!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  canal_nombre_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  institucion_snapshot!: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  monto_bruto!: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  comision_monto!: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  comision_iva!: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  retencion_monto!: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  monto_neto!: number | null;

  @Column({ length: 20, default: 'liquidado' })
  estado_liquidacion!: 'inmediato' | 'pendiente' | 'liquidado';

  @Column({ type: 'date', nullable: true })
  fecha_liquidacion!: string | null;

  // Trazabilidad: qué tipo de entidad y qué ID originó este movimiento.
  // Permite reconstruir el libro mayor con referencia exacta a la fuente.
  @Column({ type: 'varchar', length: 30, nullable: true })
  referencia_tipo!: 'venta' | 'cotizacion' | 'pago_nomina' | 'compra_inventario' | 'ajuste_manual' | 'mantenimiento' | null;

  @Column({ type: 'uuid', nullable: true })
  referencia_id!: string | null;

  @CreateDateColumn()
  fecha_creacion!: Date;
}
