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
import { PerfilAnalitico } from './PerfilAnalitico';
import { Usuario } from './Usuario';

/**
 * 'archivado' = los BYTES se liberaron del storage, la FILA sobrevive.
 *
 * Es la pieza que permite que el tope de 5 vídeos por perfil y el histórico
 * permanente coexistan: al archivar, `storage_url` pasa a null y el objeto se
 * borra de S3/disco, pero las métricas declaradas y `resumen_ia` siguen
 * alimentando la tendencia del análisis. El tope se cuenta SOLO sobre
 * estado = 'activo', así que archivar libera hueco sin perder datos.
 */
export type EstadoPerfilVideo = 'activo' | 'archivado';

@Entity('perfil_videos')
@Index(['perfil_id', 'estado'])
@Index(['usuario_id'])
export class PerfilVideo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  perfil_id: string;

  /**
   * Denormalizado desde el perfil. Evita un JOIN en cada comprobación de
   * propiedad: las rutas filtran por `usuario_id` igual que el resto del
   * proyecto, sin confiar en el `perfil_id` que llega del cliente.
   */
  @Column({ type: 'uuid' })
  usuario_id: string;

  @Column({ type: 'varchar', length: 200 })
  titulo: string;

  /**
   * URL pública del vídeo bajo el prefijo 'videos'. Null cuando el vídeo está
   * archivado (bytes liberados) — la fila sigue siendo válida.
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  storage_url?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mime?: string | null;

  /** Tamaño en bytes. `int` basta: el uploader corta en 50 MB. */
  @Column({ type: 'int', nullable: true })
  bytes?: number | null;

  @Column({ type: 'date', nullable: true })
  publicado_en?: string | null;

  // ─── Métricas DECLARADAS por el usuario ────────────────────────────────────

  @Column({ type: 'int', nullable: true })
  vistas?: number | null;

  @Column({ type: 'int', nullable: true })
  likes?: number | null;

  @Column({ type: 'int', nullable: true })
  comentarios?: number | null;

  @Column({ type: 'int', nullable: true })
  compartidos?: number | null;

  @Column({ type: 'int', nullable: true })
  guardados?: number | null;

  /** % de retención media (0–100). */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  retencion_pct?: number | null;

  /** % de clics a perfil/enlace (0–100). */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  ctr_pct?: number | null;

  /**
   * Resumen textual que el usuario escribe (o que extrae el análisis) sobre el
   * contenido del vídeo. Es lo que sobrevive al archivado, porque el modelo NO
   * puede ver el vídeo: solo trabaja con esta descripción y las métricas.
   */
  @Column({ type: 'text', nullable: true })
  resumen_ia?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'activo' })
  estado: EstadoPerfilVideo;

  @Column({ type: 'timestamp', nullable: true })
  archivado_at?: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => PerfilAnalitico, (perfil) => perfil.videos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'perfil_id' })
  perfil: PerfilAnalitico;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;
}