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
import type { FinanzasInput, SensibilidadAnalisis } from '../services/finanzas/types';
import type { generarProyeccion } from '../services/finanzas/proyeccionService';
import type { calcularBreakeven } from '../services/finanzas/breakevenService';
import type { generarResumen } from '../services/finanzas/resumenService';
import type { MetaIaAnalisis } from '../services/ia/metaAnalisis';

// Tipos de salida derivados de las funciones puras (evita duplicación).
export type ProyeccionResult = ReturnType<typeof generarProyeccion>;
export type BreakevenResult = ReturnType<typeof calcularBreakeven>;
export type ResumenFinanciero = ReturnType<typeof generarResumen>;

// Snapshot de los inputs originales almacenado en `inputs_data`. Los de
// finanzas@2 (impuesto incluido, comisiones, plazos, sueldo, deuda) faltan en
// los análisis anteriores.
export type FinanzasInputsSnapshot = Pick<FinanzasInput,
  'precio_venta' | 'costo_variable_unitario' | 'costos_fijos_mensuales'
  | 'unidades_mes_inicial' | 'tasa_crecimiento_mensual' | 'inversion_inicial'>
  & Partial<Pick<FinanzasInput,
    'precio_incluye_impuesto' | 'tasa_impuesto_consumo' | 'comision_venta_pct' | 'dias_cobro'
    | 'dias_pago' | 'sueldo_dueno_mensual' | 'pago_deuda_mensual' | 'merma_pct'>>;

@Entity('analisis_finanzas')
@Index(['usuario_id', 'producto_id'])
@Index(['estado_analisis'])
export class AnalisisFinanzas {
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

  @Column({ default: 'MX' })
  pais!: string;

  // Inputs del usuario
  @Column({ type: 'jsonb', nullable: true })
  inputs_data!: FinanzasInputsSnapshot | null;

  // Resultados de cada fase (jsonb, tipados)
  @Column({ nullable: true, type: 'jsonb' })
  proyeccion_data!: ProyeccionResult | null;

  @Column({ nullable: true, type: 'jsonb' })
  breakeven_data!: BreakevenResult | null;

  @Column({ nullable: true, type: 'jsonb' })
  resumen_data!: ResumenFinanciero | null;

  @Column({ nullable: true, type: 'jsonb' })
  sensibilidad_data!: SensibilidadAnalisis | null;

  // Riesgos financieros del negocio (antes vivía en Ventas como "por qué fallan").
  @Column({ nullable: true, type: 'jsonb' })
  riesgos_data!: unknown | null;

  /**
   * finanzas@2: confianza, supuestos y datos faltantes, secciones extra u
   * ocultas del admin y versión de prompt usada (`services/ia/metaAnalisis.ts`).
   */
  @Column({ nullable: true, type: 'jsonb' })
  meta_ia!: MetaIaAnalisis | null;

  // Estado del proceso
  @Column({ default: 'procesando' })
  estado_analisis!: 'procesando' | 'completado' | 'error';

  // Overrides editados por el usuario en el Centro de Mando (null = sin overrides)
  @Column({ nullable: true, type: 'jsonb' })
  overrides_data!: Record<string, unknown> | null;

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
