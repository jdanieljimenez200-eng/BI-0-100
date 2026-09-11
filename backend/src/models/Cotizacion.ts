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

export interface CotizacionItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

@Entity('cotizaciones')
@Index(['usuario_id'])
@Index(['usuario_id', 'producto_id'])
@Index(['usuario_id', 'numero'], { unique: true })
export class Cotizacion {
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

  @ManyToOne(() => Negocio, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'negocio_id' })
  negocio!: Negocio | null;

  @Column({ type: 'uuid', nullable: true })
  negocio_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  producto_id!: string | null;

  // Auto-generado: COT-000001
  @Column({ type: 'varchar', length: 20 })
  numero!: string;

  @Column({ type: 'varchar', length: 200 })
  cliente_nombre!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  cliente_empresa!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  cliente_email!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cliente_telefono!: string | null;

  // FK real al CRM; los campos cliente_* de arriba quedan como snapshot para
  // el PDF, igual que marca_nombre/marca_logo_url.
  @Column({ type: 'uuid', nullable: true })
  cliente_id!: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  items!: CotizacionItem[];

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  descuento_pct!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  descuento_monto!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  impuesto_tasa!: number;

  @Column({ type: 'varchar', length: 20, default: 'IVA' })
  impuesto_nombre!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  impuesto_monto!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  total!: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  moneda!: string;

  @Column({ type: 'varchar', length: 20, default: 'borrador' })
  estado!: 'borrador' | 'enviada' | 'aceptada' | 'rechazada';

  @Column({ type: 'date', nullable: true })
  fecha_vencimiento!: string | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  // Snapshots de marca para el PDF (no FK — el logo puede cambiar)
  @Column({ type: 'varchar', length: 200, nullable: true })
  marca_nombre!: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  marca_color!: string | null;

  @Column({ type: 'varchar', nullable: true })
  marca_logo_url!: string | null;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}
