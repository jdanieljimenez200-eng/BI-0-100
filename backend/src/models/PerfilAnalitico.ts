import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
  Unique,
} from 'typeorm';
import { Usuario } from './Usuario';
import { Producto } from './Producto';
import { PerfilVideo } from './PerfilVideo';

/**
 * Plataformas soportadas. Se exporta como array `as const` para que rutas y
 * validadores compartan la MISMA fuente de verdad que el tipo: si se añade una
 * plataforma aquí, el `Set` de validación de routes/perfiles.ts la acepta sin
 * tocar nada más.
 */
export const PLATAFORMAS_PERFIL = [
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'linkedin',
  'otro',
] as const;

export type PlataformaPerfil = (typeof PLATAFORMAS_PERFIL)[number];

/** 'archivado' es borrado lógico: la fila y su histórico sobreviven. */
export type EstadoPerfil = 'activo' | 'archivado';

/**
 * Perfil social del usuario usado como INPUT del análisis de ventas.
 *
 * Las métricas son DECLARADAS por el usuario, no leídas de la red: ni Instagram
 * ni TikTok exponen métricas de un perfil ajeno sin OAuth del dueño de la
 * cuenta, así que el backend no puede obtenerlas. `metricas_declaradas_at`
 * existe para que el análisis pueda advertir cuando los números están viejos.
 */
@Entity('perfiles_analiticos')
@Index(['usuario_id', 'estado'])
@Index(['producto_id'])
@Unique('uq_perfil_usuario_plataforma_handle', ['usuario_id', 'plataforma', 'handle'])
export class PerfilAnalitico {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  usuario_id: string;

  /**
   * Producto al que se asocia el perfil. Nullable porque una cuenta puede tener
   * perfiles transversales (la marca) que no pertenecen a un solo producto.
   */
  @Column({ type: 'uuid', nullable: true })
  producto_id?: string | null;

  @Column({ type: 'varchar', length: 30 })
  plataforma: PlataformaPerfil;

  /** Sin '@' y en minúsculas (lo normaliza la ruta antes de persistir). */
  @Column({ type: 'varchar', length: 120 })
  handle: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  url?: string | null;

  @Column({ type: 'int', nullable: true })
  seguidores?: number | null;

  @Column({ type: 'int', nullable: true })
  alcance_mensual?: number | null;

  /** Porcentaje 0–100 con 2 decimales. TypeORM lo devuelve como string. */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  engagement_rate?: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  nicho?: string | null;

  @Column({ type: 'text', nullable: true })
  notas?: string | null;

  /** Última vez que el usuario tocó alguna métrica declarada. */
  @Column({ type: 'timestamp', nullable: true })
  metricas_declaradas_at?: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'activo' })
  estado: EstadoPerfil;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  // SET NULL y no CASCADE: si se borra el producto, el perfil social sigue
  // existiendo para la cuenta y no se pierde su histórico de vídeos.
  @ManyToOne(() => Producto, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto | null;

  @OneToMany(() => PerfilVideo, (video) => video.perfil)
  videos: PerfilVideo[];
}