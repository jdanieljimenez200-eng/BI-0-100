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
// `import type` — se borra en compilación, sin riesgo de ciclo en runtime.
import type { MetaIaAnalisis } from '../services/ia/metaAnalisis';
import type {
  TendenciasResult,
  CompetenciaResult,
  DensidadZonaResult,
  DafoResult,
  TamResult,
  ViabilidadFactores,
  Alerta,
  PaybackResult,
} from '../services/mercado/types';
import type { RentaZonaResult, EstudioAreaResult } from '../services/zona/types';
import type { DatosOficialesResult } from '../services/estadisticas/types';
import type { ReporteBi } from '../services/mercado/reporteBiService';
import type { TraccionReal } from '../services/mercado/traccionReal';

export type EstadoAnalisis = 'procesando' | 'completado' | 'error';

@Entity('analisis_mercado')
@Index(['usuario_id', 'producto_id'])
@Index(['estado_analisis'])
export class AnalisisMercado {
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
  pais!: string;  // ISO code: 'MX', 'CO', 'AR', etc.

  @Column({ default: 'local' })
  scope!: string;

  @Column({ nullable: true })
  ciudad!: string;

  @Column({ nullable: true })
  estado!: string;  // estado / departamento / provincia / región

  // Viabilidad — escalares para queries
  @Column({ nullable: true })
  viabilidad_score!: number;

  @Column({ nullable: true })
  viabilidad_estado!: string;

  @Column({ nullable: true, type: 'jsonb' })
  viabilidad_factores!: ViabilidadFactores | null;

  // Escalares de acceso rápido
  @Column({ nullable: true })
  volumen_busquedas_mensual!: number;

  @Column({ nullable: true, type: 'decimal', precision: 6, scale: 2 })
  tendencia_porcentaje!: number;

  @Column({ nullable: true })
  total_competidores!: number;

  // Resultados completos de cada fase (jsonb, tipados)
  @Column({ nullable: true, type: 'jsonb' })
  tendencias_data!: TendenciasResult | null;

  @Column({ nullable: true, type: 'jsonb' })
  competencia_data!: CompetenciaResult | null;

  // Densidad de competencia por km². Siempre se guarda, incluso cuando
  // `es_evaluable: false`, para que la UI pueda explicar POR QUÉ no se midió
  // en vez de omitir el bloque sin más.
  @Column({ nullable: true, type: 'jsonb' })
  densidad_data!: DensidadZonaResult | null;

  @Column({ nullable: true, type: 'jsonb' })
  dafo_data!: DafoResult | null;

  @Column({ nullable: true, type: 'jsonb' })
  tam_data!: TamResult | null;

  @Column({ nullable: true, type: 'jsonb' })
  alertas!: Alerta[] | null;

  @Column({ nullable: true, type: 'jsonb' })
  reporte_bi_data!: ReporteBi | null;

  // ── Nuevos campos Fase 1 ────────────────────────────────────────────────────

  @Column({ nullable: true, type: 'decimal', precision: 12, scale: 2 })
  precio_usuario!: number; // Precio del producto — elimina dependencia de localStorage en frontend

  @Column({ nullable: true })
  confianza_analisis!: string; // 'alta' | 'media' | 'baja' — indica calidad de datos

  @Column({ nullable: true, type: 'jsonb' })
  payback_data!: PaybackResult | null; // cálculo determinista de ROI/Payback

  // Renta mensual del local derivada de m² × precio por m². `null` cuando el
  // formulario no declaró tipo de local; cuando sí lo hizo pero no hay precio
  // por m², se guarda el objeto con `origen: 'no_disponible'` para que la UI
  // pueda explicar qué dato falta en lugar de omitir el bloque.
  @Column({ nullable: true, type: 'jsonb' })
  renta_zona_data!: RentaZonaResult | null;

  // Estudio del área: cruza los m² con la renta por m² y el precio de VENTA por
  // m² para comparar rentar vs comprar. `null` cuando no se declaró tipo de
  // local. Cuando falta el precio de venta se guarda igual, con
  // `veredicto: 'sin_conclusion'` y la `nota` diciendo qué dato falta.
  @Column({ nullable: true, type: 'jsonb' })
  estudio_area_data!: EstudioAreaResult | null;

  // Datos de fuentes estadísticas oficiales (censo de establecimientos + macro).
  // Se guarda ENTERO, incluso cuando `censo.disponible: false`, porque la
  // ausencia de fuente es un dato declarado: la UI debe poder decir qué
  // instituto se consultó y por qué no aportó censo, en vez de omitir el bloque.
  // `null` solo cuando la consulta entera falló y el análisis siguió sin ella.
  @Column({ nullable: true, type: 'jsonb' })
  datos_oficiales_data!: DatosOficialesResult | null;

  // Tracción tomada de las ventas reales del POS (services/mercado/traccionReal.ts).
  // `null` = el producto no tiene ventas cerradas y se usó lo declarado en el
  // formulario. Se guarda para que la pantalla pueda distinguir «tus ventas» de
  // «lo que escribiste».
  @Column({ nullable: true, type: 'jsonb' })
  traccion_data!: TraccionReal | null;

  /**
   * Transparencia de la IA (confianza, supuestos, datos faltantes), secciones
   * extra u ocultas del admin y versión de prompt usada (`services/ia/metaAnalisis.ts`).
   */
  @Column({ nullable: true, type: 'jsonb' })
  meta_ia!: MetaIaAnalisis | null;

  // Estado del proceso
  @Column({ default: 'procesando' })
  estado_analisis!: EstadoAnalisis;

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
