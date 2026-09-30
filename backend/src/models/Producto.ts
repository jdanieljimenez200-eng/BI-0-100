import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Usuario } from './Usuario';
import { AnalisisMercado } from './AnalisisMercado';
import { AnalisisMarketing } from './AnalisisMarketing';
import { AnalisisFinanzas } from './AnalisisFinanzas';
import { AnalisisLegal } from './AnalisisLegal';
import { AnalisisBrief } from './AnalisisBrief';
import { AnalisisVentas } from './AnalisisVentas';
import type { PerfilNegocio } from '../services/ia/perfilNegocio';

@Entity('productos')
export class Producto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  usuario_id: string;

  @Column({ type: 'varchar', length: 255 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  categoria?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  precio?: number;

  @Column({ type: 'int', nullable: true })
  stock?: number;

  @Column({ type: 'varchar', length: 50, default: 'activo' })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  negocio_id?: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  pais?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  nse?: string;

  // ─── Contexto de negocio capturado en el alta ────────────────────────────
  //
  // El wizard de alta (frontend/app/dashboard/nuevo) ya preguntaba todo esto;
  // hasta la migración 1775440000000 no había dónde guardarlo y se descartaba
  // en el submit. Los formularios de análisis lo reutilizan para no volver a
  // preguntar lo mismo en cada módulo.
  //
  // Todo nullable: los productos creados antes de la migración se quedan en
  // NULL y las pantallas muestran "no registrado" en vez de inventar un 0.

  /**
   * 'producto' | 'servicio'. Lo declara el usuario en el alta.
   *
   * Antes se adivinaba con un regex sobre la categoría
   * (`/servici/i.test(categoria)` en marketingOrchestrator), lo que fallaba en
   * cuanto la categoría no llevaba la palabra "servicio".
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  tipo_actividad?: string | null;

  /** 'idea' | 'negocio_en_marcha' — define qué preguntas tienen sentido. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  estatus_proyecto?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  cobertura?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  canal_venta?: string | null;

  /** 'unico' | 'suscripcion' | 'mixto'. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  modelo_cobro?: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  canal_adquisicion?: string | null;

  @Column({ type: 'text', nullable: true })
  direccion?: string | null;

  /** Propuesta única de valor, en las palabras del usuario. */
  @Column({ type: 'text', nullable: true })
  puv?: string | null;

  /** Cliente ideal declarado en el alta (el ICP fino lo calcula Ventas). */
  @Column({ type: 'text', nullable: true })
  cliente_ideal?: string | null;

  @Column({ type: 'int', nullable: true })
  radio_km?: number | null;

  @Column({ type: 'int', nullable: true })
  ltv_meses?: number | null;

  @Column({ type: 'int', nullable: true })
  clientes_mes?: number | null;

  @Column({ type: 'int', nullable: true })
  tamano_equipo?: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  precio_suscripcion?: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  inversion_inicial?: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  costos_fijos?: number | null;

  /** % de clientes que repiten compra (0-100). */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  tasa_repeticion?: number | null;

  /**
   * «Afina tu análisis»: régimen, ingresos, sector regulado… Se responde una vez
   * y lo reutilizan todos los módulos. Forma y límites en
   * `services/ia/perfilNegocio.ts`; léelo siempre con `leerPerfil()`.
   */
  @Column({ type: 'jsonb', nullable: true })
  perfil_negocio?: PerfilNegocio | null;

  /** URL pública de la imagen del producto (S3 en prod, /uploads en dev). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  imagen_url?: string;

  /**
   * URL pública del vídeo del producto (prefijo 'videos' en S3, /uploads/videos
   * en dev). Admite null explícito porque el vídeo se puede quitar sin borrar
   * el producto (DELETE /api/productos/:id/video).
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  video_url?: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  fecha_creacion?: Date;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @OneToMany(() => AnalisisMercado, (analisis) => analisis.producto)
  analisisMercados: AnalisisMercado[];

  @OneToMany(() => AnalisisMarketing, (analisis) => analisis.producto)
  analisisMarketings: AnalisisMarketing[];

  @OneToMany(() => AnalisisFinanzas, (analisis) => analisis.producto)
  analisisFinanzas: AnalisisFinanzas[];

  @OneToMany(() => AnalisisLegal, (analisis) => analisis.producto)
  analisisLegales: AnalisisLegal[];

  @OneToMany(() => AnalisisBrief, (analisis) => analisis.producto)
  analisisBriefs: AnalisisBrief[];

  @OneToMany(() => AnalisisVentas, (analisis) => analisis.producto)
  analisisVentas: AnalisisVentas[];
}