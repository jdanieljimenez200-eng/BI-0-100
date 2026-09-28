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

export const CATEGORIAS_EXPERTO = [
  'legal',
  'contabilidad',
  'marketing',
  'diseno',
  'ventas',
  'proveedores',
  'tecnologia',
] as const;
export type CategoriaExperto = (typeof CATEGORIAS_EXPERTO)[number];
export type EstadoExperto = 'pendiente' | 'aprobado' | 'rechazado' | 'suspendido';

/**
 * Ficha de un profesional del directorio.
 *
 * Nace en `pendiente` y NO es visible para nadie salvo su dueño hasta que un
 * admin la aprueba. `verificado` es una decisión aparte: aprobar la ficha para
 * que se vea no equivale a afirmar que se comprobó la cédula, y esa insignia es
 * justo lo que hace que alguien confíe su asunto legal a un desconocido.
 *
 * `usuario_id` es nullable porque un admin puede dar de alta a un experto que
 * todavía no tiene cuenta en la plataforma.
 */
@Entity('expertos')
@Index(['estado', 'categoria'])
@Index(['usuario_id'])
export class Experto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario | null;

  @Column({ type: 'uuid', nullable: true })
  usuario_id!: string | null;

  @Column({ type: 'varchar', length: 160 })
  nombre_comercial!: string;

  @Column({ type: 'varchar', length: 160 })
  nombre_display!: string;

  @Column({ type: 'varchar', length: 280, default: '' })
  bio_corta!: string;

  @Column({ type: 'text', nullable: true })
  bio_larga!: string | null;

  @Column({ type: 'varchar', length: 20 })
  categoria!: CategoriaExperto;

  @Column({ type: 'varchar', length: 120, default: '' })
  especialidad!: string;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  sub_especialidades!: string[];

  @Column({ type: 'varchar', length: 120, default: '' })
  ciudad!: string;

  /** ISO 3166-1 alfa-2. */
  @Column({ type: 'varchar', length: 2, nullable: true })
  pais!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  direccion!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  google_maps_url!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  latitud!: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  longitud!: number | null;

  // ─── Contacto ───────────────────────────────────────────────────────────
  // Solo se devuelven en la ficha pública si `mostrar_contacto` está activo.

  @Column({ type: 'varchar', length: 180, nullable: true })
  email_contacto!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  telefono!: string | null;

  @Column({ type: 'boolean', default: false })
  mostrar_contacto!: boolean;

  /**
   * Número de WhatsApp en formato internacional, solo dígitos (52155…). Es el
   * contacto que se ofrece como botón: quien lo pone quiere que le escriban, así
   * que se publica aunque `mostrar_contacto` esté apagado.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  whatsapp!: string | null;

  /** Imagen de cabecera del perfil. Pública, en StorageService. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  portada_url!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  sitio_web!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatar_url!: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  tarifa_desde!: number | null;

  @Column({ type: 'varchar', length: 10, default: 'MXN' })
  moneda!: string;

  @Column({ type: 'boolean', default: false })
  ofrece_consulta_gratis!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  video_url!: string | null;

  // ─── Revisión ───────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 20, default: 'pendiente' })
  estado!: EstadoExperto;

  /** Solo lo escribe el endpoint de admin. Nunca el propio experto. */
  @Column({ type: 'boolean', default: false })
  verificado!: boolean;

  /**
   * Cédula o acreditación. Dato personal sensible: NO se expone jamás en los
   * endpoints públicos, solo lo lee un admin durante la revisión.
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  documento_url!: string | null;

  @Column({ type: 'text', nullable: true })
  motivo_rechazo!: string | null;

  // ─── Rating desnormalizado ──────────────────────────────────────────────
  // Se recalcula al crear, ocultar o borrar una reseña. Vive aquí para que el
  // listado del directorio no tenga que agregar reseñas en cada consulta.

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating_promedio!: number;

  @Column({ type: 'int', default: 0 })
  total_resenas!: number;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;

  @Column({ type: 'timestamp', nullable: true })
  fecha_aprobacion!: Date | null;

  /**
   * La cuenta del dueño está en la papelera. La ficha no se muestra en ningún
   * sitio público mientras tanto, y vuelve tal cual si se restaura la cuenta.
   */
  @Column({ type: 'timestamp', nullable: true })
  eliminado_en!: Date | null;
}
