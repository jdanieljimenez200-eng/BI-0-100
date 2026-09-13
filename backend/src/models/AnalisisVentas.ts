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

@Entity('analisis_ventas')
@Index(['usuario_id', 'producto_id', 'estado_analisis'])
export class AnalisisVentas {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  @Column({ type: 'uuid' })
  producto_id!: string;

  // ─── Inputs del usuario ────────────────────────────────────────────────────
  @Column({ type: 'varchar', default: 'MX' })
  pais!: string;

  @Column({ type: 'varchar', default: 'B2C_directo' })
  tipo_venta!: string;

  @Column({ type: 'varchar', default: 'directo' })
  canal_principal!: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  ticket_promedio!: number;

  @Column({ type: 'varchar', default: 'solo_tu' })
  tamano_equipo!: string;

  @Column({ type: 'varchar', nullable: true })
  objetivo_ventas!: string | null;

  @Column({ type: 'varchar', default: '' })
  nombre_producto!: string;

  @Column({ type: 'varchar', default: '' })
  categoria!: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  precio!: number;

  /** Copia íntegra del payload recibido (auditoría/reprocesos). */
  @Column({ nullable: true, type: 'jsonb' })
  inputs_data!: Record<string, unknown> | null;

  // ─── Resultado ─────────────────────────────────────────────────────────────
  @Column({ nullable: true, type: 'jsonb' })
  tips_data!: unknown | null;

  /** Historia diaria del emprendedor ("la noticia del día"). */
  @Column({ nullable: true, type: 'jsonb' })
  historia_data!: unknown | null;

  /** Por qué los emprendimientos como el de este producto fracasan. */
  @Column({ nullable: true, type: 'jsonb' })
  porque_fallan_data!: unknown | null;

  /** Perfil del cliente ideal (ICP) generado por IA y editable por el usuario. */
  @Column({ nullable: true, type: 'jsonb' })
  perfil_cliente_data!: unknown | null;

  /**
   * Historial de evaluaciones de guiones/CTAs asociadas a este análisis.
   * Se guarda como array jsonb para evitar una tabla extra:
   * [{ id, guion_input, resultado, fecha }]
   */
  @Column({ nullable: true, type: 'jsonb' })
  evaluaciones_guion_data!: unknown | null;

  /**
   * Competidores cargados y su análisis comparativo.
   * [{ id, nombre, archivo_key?, analisis, fecha }] + comparativa global.
   */
  @Column({ nullable: true, type: 'jsonb' })
  competidores_data!: unknown | null;

  /** Rebatidas sugeridas para las objeciones del ICP. Se genera perezosamente. */
  @Column({ nullable: true, type: 'jsonb' })
  rebatidas_objeciones_data!: unknown | null;

  /** Secuencia de mensajes de seguimiento (inmediato/48h/1 semana). Perezoso. */
  @Column({ nullable: true, type: 'jsonb' })
  followups_data!: unknown | null;

  /** Palabras clave de segmentación (Google/Meta Ads), derivadas del ICP. Perezoso. */
  @Column({ nullable: true, type: 'jsonb' })
  palabras_clave_ads_data!: unknown | null;

  /** Secciones NO generadas por plan (fuente de verdad para la UI). */
  @Column('simple-array', { nullable: true })
  secciones_bloqueadas!: string[] | null;

  @Column({ type: 'varchar', default: 'procesando' })
  estado_analisis!: string; // 'procesando', 'completado', 'error'

  @Column({ nullable: true, type: 'text' })
  error_mensaje!: string | null;

  /** Alguna sección salió de plantilla porque la IA falló: se avisa y no consume cuota. */
  @Column({ type: 'boolean', default: false })
  resultado_estimado!: boolean;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @Column({ type: 'timestamp', nullable: true })
  fecha_completado!: Date | null;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @ManyToOne(() => Producto, (p) => p.analisisVentas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;
}
