import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Venta } from './Venta';
import { ItemPOS } from './ItemPOS';

@Entity('venta_items')
@Index(['venta_id'])
@Index(['item_pos_id'])
export class VentaItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Venta, (v) => v.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta!: Venta;

  @Column()
  venta_id!: string;

  // Nullable porque un item del catálogo puede ser eliminado después; el snapshot
  // de nombre/precio preserva el ticket histórico.
  @ManyToOne(() => ItemPOS, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'item_pos_id' })
  item_pos!: ItemPOS | null;

  @Column({ nullable: true, type: 'uuid' })
  item_pos_id!: string | null;

  @Column({ type: 'varchar', length: 255 })
  nombre_snapshot!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  precio_unitario!: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 1 })
  cantidad!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal_linea!: number;

  /**
   * Costo unitario del item CONGELADO en el momento de la venta, calculado
   * expandiendo su receta contra el costo promedio de cada insumo.
   *
   * NULL = no se pudo determinar (item sin receta). Se distingue de 0 a
   * propósito: un 0 se leería como margen del 100%.
   *
   * No es un extra. El costo promedio de los insumos cambia con cada entrada de
   * almacén, así que si no se guarda aquí el margen histórico es irrecuperable.
   */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  costo_unitario_snapshot!: number | null;
}
