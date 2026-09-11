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
import { ItemPOS } from './ItemPOS';
import { InsumoInventario } from './InsumoInventario';

/**
 * Receta (BOM) de un item del catálogo POS: qué insumo consume y cuánto por
 * unidad vendida.
 *
 * Es la pieza que conecta el POS con el almacén. Al cobrar, cada línea del
 * carrito se expande contra esta tabla para generar las salidas de inventario y
 * para calcular el costo de la venta.
 *
 * Un item SIN filas aquí sigue funcionando igual que antes: se vende, pero no
 * descuenta stock ni aporta costo. La UI lo marca como "sin costo definido" en
 * vez de asumir margen 100%.
 */
@Entity('item_pos_insumos')
@Index(['usuario_id'])
@Index(['insumo_id'])
@Index(['item_pos_id', 'insumo_id'], { unique: true })
export class ItemPOSInsumo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  usuario_id!: string;

  @ManyToOne(() => ItemPOS, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_pos_id' })
  item_pos!: ItemPOS;

  @Column()
  item_pos_id!: string;

  @ManyToOne(() => InsumoInventario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'insumo_id' })
  insumo!: InsumoInventario;

  @Column()
  insumo_id!: string;

  /** Cantidad de insumo consumida por UNA unidad del item vendido. */
  @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
  cantidad!: number;

  @CreateDateColumn()
  fecha_creacion!: Date;
}
