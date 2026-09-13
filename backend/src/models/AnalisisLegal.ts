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
import type { LegalResultado } from '../services/legal/types';

export type EstadoAnalisisLegal = 'procesando' | 'completado' | 'error';

@Entity('analisis_legal')
@Index(['usuario_id', 'producto_id'])
@Index(['estado_analisis'])
@Index(['producto_id'])
export class AnalisisLegal {
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

  // ─── País analizado ────────────────────────────────────────────────────────
  @Column({ default: 'MX' })
  pais!: string; // ISO code: 'MX', 'CO', 'AR', 'PE', 'CL', 'ES', etc.

  // ─── Inputs del formulario ─────────────────────────────────────────────────
  @Column({ nullable: true })
  forma_juridica!: string; // 'Persona Física', 'PFAE', 'S.A. de C.V.', 'S. de R.L.', etc.

  @Column({ default: false })
  tiene_empleados!: boolean;

  @Column({ type: 'int', nullable: true })
  numero_empleados!: number;

  @Column({ default: false })
  vende_en_linea!: boolean;

  @Column({ default: false })
  exporta_importa!: boolean;

  @Column({ nullable: true, type: 'text' })
  giro_especifico!: string; // Aclaración adicional del usuario

  @Column({ nullable: true })
  estado_constitucion!: string; // Estado/región dentro del país

  @Column({ nullable: true })
  anios_operando!: string; // '0', '1-2', '3-5', '+5'

  // ─── Escalares de acceso rápido ────────────────────────────────────────────
  @Column({ nullable: true })
  giro_detectado!: string; // Giro detectado por la IA

  @Column({ nullable: true })
  cumplimiento_global!: string; // 'verde' | 'amarillo' | 'rojo'

  @Column({ type: 'int', nullable: true })
  puntaje_cumplimiento!: number; // 0-100

  // ─── Resultado completo de la IA ───────────────────────────────────────────
  @Column({ nullable: true, type: 'jsonb' })
  resultado_data!: LegalResultado | null;

  // ─── Estado del proceso ────────────────────────────────────────────────────
  @Column({ default: 'procesando' })
  estado_analisis!: EstadoAnalisisLegal;

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
