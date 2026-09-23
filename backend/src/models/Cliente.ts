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
import { Producto } from './Producto';

@Entity('clientes')
// Sin índice suelto de `usuario_id`: lo cubre el prefijo de los compuestos
// de abajo (migración 1775630000000).
@Index(['usuario_id', 'negocio_id'])
@Index(['usuario_id', 'producto_id'])
@Index(['usuario_id', 'tipo_contacto'])
export class Cliente {
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

  @ManyToOne(() => Producto, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto | null;

  @Column({ type: 'uuid', nullable: true })
  producto_id!: string | null;

  @Column({ type: 'varchar', length: 200 })
  nombre!: string;

  // Tipo de contacto: cliente (quien compra), proveedor (a quien compramos), o ambos.
  // Por defecto 'cliente' para no romper compatibilidad con registros anteriores.
  @Column({ type: 'varchar', length: 20, default: 'cliente' })
  tipo_contacto!: 'cliente' | 'proveedor' | 'ambos';

  @Column({ type: 'varchar', length: 200, nullable: true })
  empresa!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email!: string | null;

  // Formato internacional preferido para wa.me (ej. "525512345678").
  // Se guarda crudo y se sanitiza al construir el link.
  @Column({ type: 'varchar', length: 30, nullable: true })
  telefono!: string | null;

  @Column({ type: 'text', nullable: true })
  direccion!: string | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  // Segmentación: "VIP", "Lead", "Cliente recurrente", "Mayorista"...
  @Column({ type: 'varchar', length: 100, nullable: true })
  categoria!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  emoji!: string | null;

  // Estado del cliente en el funnel
  @Column({ type: 'varchar', length: 20, default: 'cliente' })
  estado!: 'lead' | 'cliente' | 'inactivo';

  @Column({ type: 'date', nullable: true })
  fecha_ultimo_contacto!: string | null;

  @Column({ default: true })
  activo!: boolean;

  // Campos personalizados por industria (ej. número de expediente para médicos,
  // RFC para proveedores MX, historial de alergia, notas de negociación, etc.).
  @Column({ type: 'jsonb', default: '{}' })
  atributos_extra!: Record<string, unknown>;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}
