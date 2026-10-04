import type { MetaIaAnalisis } from '../services/ia/metaAnalisis';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Producto } from './Producto';
import { Usuario } from './Usuario';
import type { BriefResultado } from '../services/brief/types';

export type EstadoAnalisisBrief = 'procesando' | 'completado' | 'error';

@Entity('analisis_brief')
@Index(['usuario_id', 'producto_id'])
@Index(['estado_analisis'])
export class AnalisisBrief {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column()
  producto_id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  usuario_id!: string;

  // ─── Bloque 2: Percepción ──────────────────────────────────────────────────
  @Column({ type: 'simple-array', nullable: true })
  percepcion!: string[];

  @Column({ default: 'neutral' })
  emocion!: string;

  @Column({ type: 'simple-array', nullable: true })
  anti_valores!: string[];

  // ─── Bloque 3: Dirección visual ────────────────────────────────────────────
  @Column({ default: '' })
  estilo_visual!: string;

  @Column({ default: 'A' })
  paleta_elegida!: 'A' | 'B' | 'C';

  @Column({ default: '' })
  tipo_logo!: string;

  @Column({ default: '' })
  simbolo_representativo!: string;

  // ─── Bloque 4: Mensaje y tono ──────────────────────────────────────────────
  @Column({ nullable: true, type: 'text' })
  resultado_cliente!: string;

  @Column({ nullable: true })
  tono_comunicacion!: string;

  // ─── Bloque 5: Posicionamiento ─────────────────────────────────────────────
  @Column({ nullable: true })
  posicionamiento!: string;

  // ─── Bloque 6: Diferenciación ──────────────────────────────────────────────
  @Column({ nullable: true })
  nivel_diferenciacion!: string;

  // ─── Resultado completo de la IA ───────────────────────────────────────────
  @Column({ nullable: true, type: 'jsonb' })
  resultado_data!: BriefResultado | null;

  /** brief@2: confianza, supuestos, datos que faltan, secciones extra u ocultas y versión de prompt. */
  @Column({ nullable: true, type: 'jsonb' })
  meta_ia!: MetaIaAnalisis | null;

  // ─── Estado del proceso ────────────────────────────────────────────────────
  @Column({ default: 'procesando' })
  estado_analisis!: EstadoAnalisisBrief;

  @Column({ nullable: true, type: 'text' })
  error_mensaje!: string;

  /** Alguna sección salió de plantilla porque la IA falló: se avisa y no consume cuota. */
  @Column({ type: 'boolean', default: false })
  resultado_estimado!: boolean;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @Column({ nullable: true })
  fecha_completado!: Date;
}