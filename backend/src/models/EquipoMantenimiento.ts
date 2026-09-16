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

/** Con qué intensidad se usa el equipo: acorta o alarga el intervalo sugerido. */
export type IntensidadUso = 'bajo' | 'normal' | 'intenso';

/** De dónde salió `intervalo_dias`: catálogo propio, estimación de IA o el usuario. */
export type OrigenIntervalo = 'catalogo' | 'ia' | 'manual';

/**
 * Un equipo, herramienta o instalación al que hay que darle mantenimiento
 * (tanque de gas, refrigerador, parrilla, tijeras, minisplit…).
 *
 * `intervalo_dias` es SIEMPRE el intervalo efectivo, ya ajustado por intensidad
 * de uso: el frontend lo muestra tal cual y el semáforo se calcula con él
 * (`services/mantenimientos/catalogoIntervalos.ts`). Se guarda resuelto, y no el
 * base del catálogo, para que cambiar el catálogo no mueva por detrás las fechas
 * que el usuario ya vio.
 */
@Entity('equipos_mantenimiento')
@Index(['usuario_id'])
@Index(['usuario_id', 'activo'])
export class EquipoMantenimiento {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  // Auditoría: trabajador que dio de alta la fila cuando no es el dueño.
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

  @Column({ type: 'varchar', length: 160 })
  nombre!: string;

  // Clave del catálogo de intervalos, u 'otro' si no se reconoció el objeto.
  @Column({ type: 'varchar', length: 40, default: 'otro' })
  tipo_clave!: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  emoji!: string | null;

  // Dónde está: "cocina", "sucursal centro", "bodega". Texto libre.
  @Column({ type: 'varchar', length: 120, nullable: true })
  ubicacion!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'normal' })
  intensidad_uso!: IntensidadUso;

  @Column({ type: 'integer' })
  intervalo_dias!: number;

  @Column({ type: 'varchar', length: 10, default: 'catalogo' })
  intervalo_origen!: OrigenIntervalo;

  // Último mantenimiento conocido. Null = nunca se le ha dado (o no se sabe).
  @Column({ type: 'date', nullable: true })
  fecha_ultimo!: string | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}
