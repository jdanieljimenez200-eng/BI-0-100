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

/**
 * Catálogo Maestro de Artículos — fuente única de verdad que unifica los
 * productos vendibles (antes ItemPOS) y los insumos de inventario (antes
 * InsumoInventario). Un mismo artículo puede ser vendible e insumo a la vez
 * (ej. una botella de vino en un restaurante), por eso los flags `es_vendible`
 * y `es_insumo` son independientes.
 *
 * No reemplaza destructivamente a ItemPOS/InsumoInventario: convive con ellos y
 * las rutas migran a leer de aquí de forma incremental (ver plan Fase 1-3).
 */
@Entity('articulos')
@Index(['usuario_id', 'negocio_id'])
@Index(['usuario_id', 'es_vendible'])
@Index(['usuario_id', 'es_insumo'])
// SKU único por usuario, solo cuando está presente (índice parcial).
@Index('uq_articulos_usuario_sku', ['usuario_id', 'sku'], {
  unique: true,
  where: 'sku IS NOT NULL',
})
export class Articulo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  usuario_id!: string;

  // Auditoría: id del trabajador que creó la fila cuando difiere del dueño.
  // Null = creada por el propio owner. No afecta el scoping.
  @Column({ type: 'uuid', nullable: true })
  creado_por_id!: string | null;

  @ManyToOne(() => Negocio, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'negocio_id' })
  negocio!: Negocio | null;

  @Column({ type: 'uuid', nullable: true })
  negocio_id!: string | null;

  @Column({ type: 'varchar', length: 255 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  // SKU / código interno. Único por usuario cuando está presente.
  @Column({ type: 'varchar', length: 100, nullable: true })
  sku!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'producto' })
  tipo!: 'producto' | 'servicio' | 'insumo' | 'compuesto';

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  precio_venta!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  costo_unitario!: number;

  @Column({ type: 'varchar', length: 30, default: 'pieza' })
  unidad!: string; // pieza, kg, gramo, litro, ml, hora, caja, paquete...

  @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
  stock_actual!: number;

  @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
  stock_minimo!: number;

  // Costo Promedio Ponderado — actualizado en cada entrada de stock.
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  costo_promedio!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  categoria!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  emoji!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imagen_url!: string | null;

  @Column({ default: true })
  activo!: boolean;

  // Aparece como producto en el Punto de Venta.
  @Column({ default: true })
  es_vendible!: boolean;

  // Aparece como insumo/materia prima en Inventario.
  @Column({ default: false })
  es_insumo!: boolean;

  // Variantes y datos por industria: tallas, colores, requerimientos médicos,
  // atributos de compuestos (receta), etc.
  @Column({ type: 'jsonb', default: '{}' })
  atributos_extra!: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  orden!: number;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}
