import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Experto, type CategoriaExperto } from './Experto';

export type EstadoPatrocinio = 'activo' | 'cancelado' | 'vencido';

/**
 * Posición pagada en el directorio: el experto paga por aparecer arriba de su
 * categoría.
 *
 * La plataforma NO intermedia el dinero de la consulta —eso lo arreglan
 * directamente el experto y el cliente—, así que basta con la suscripción de
 * Stripe que ya existe: sin Stripe Connect, sin KYC de terceros, sin reparto de
 * fondos ni disputas sobre dinero ajeno.
 *
 * Un patrocinio activo se devuelve con `es_patrocinado: true` para que la
 * interfaz pueda etiquetarlo. Enseñar publicidad sin distinguirla del resultado
 * orgánico no es aceptable.
 */
@Entity('patrocinios_experto')
@Index(['categoria', 'estado'])
@Index(['experto_id'])
export class PatrocinioExperto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Experto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'experto_id' })
  experto!: Experto;

  @Column({ type: 'uuid' })
  experto_id!: string;

  @Column({ type: 'varchar', length: 20 })
  categoria!: CategoriaExperto;

  /** Por donde el webhook de Stripe encuentra el patrocinio. Único. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  stripe_subscription_id!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'activo' })
  estado!: EstadoPatrocinio;

  /** A mayor prioridad, más arriba en el listado. */
  @Column({ type: 'int', default: 0 })
  prioridad!: number;

  @CreateDateColumn()
  fecha_inicio!: Date;

  @Column({ type: 'timestamp', nullable: true })
  fecha_fin!: Date | null;
}
