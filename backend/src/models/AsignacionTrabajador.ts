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

/**
 * Permisos granulares on/off que el dueño concede a un trabajador para UN producto.
 * Las capacidades sensibles (finanzas, nomina, contabilidad) arrancan apagadas
 * por defecto y no se incluyen al crear la asignación salvo que el dueño las active.
 * Una capacidad ausente o false = sin acceso.
 */
export interface PermisosTrabajador {
  // Análisis
  mercado?: boolean;
  marketing?: boolean;
  ventas?: boolean;
  brief?: boolean;
  finanzas?: boolean; // SENSIBLE — off por defecto
  legal?: boolean;    // Módulo de análisis legal-fiscal
  // Herramientas
  pos?: boolean;
  inventario?: boolean;
  citas?: boolean;
  clientes?: boolean;
  cotizaciones?: boolean;
  nomina?: boolean; // SENSIBLE — off por defecto
  contabilidad?: boolean; // SENSIBLE — off por defecto
  mantenimientos?: boolean;
  // Acciones sensibles dentro de una herramienta (ver ACCIONES_SENSIBLES en
  // planService). Tener `pos` no basta para cancelar una venta ni para cobrar
  // un precio distinto al del catálogo: son permisos aparte, off por defecto.
  cancelar_ventas?: boolean; // SENSIBLE — off por defecto
  precio_libre?: boolean;    // SENSIBLE — off por defecto
}

/**
 * Una fila por (trabajador × producto). Si un trabajador no tiene fila para un
 * producto, simplemente no lo ve. Dentro de un producto solo puede lo que esté
 * activado en `permisos`.
 */
@Entity('asignaciones_trabajador')
@Index(['trabajador_id'])
@Index(['cuenta_id'])
@Index(['producto_id'])
@Index(['trabajador_id', 'producto_id'], { unique: true })
export class AsignacionTrabajador {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trabajador_id' })
  trabajador!: Usuario;

  @Column({ type: 'uuid' })
  trabajador_id!: string;

  // cuenta_id = id del dueño (owner). Permite filtrar todo a nivel cuenta.
  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cuenta_id' })
  cuenta!: Usuario;

  @Column({ type: 'uuid' })
  cuenta_id!: string;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column({ type: 'uuid' })
  producto_id!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  permisos!: PermisosTrabajador;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}