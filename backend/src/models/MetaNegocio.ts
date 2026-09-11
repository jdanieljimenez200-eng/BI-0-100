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
 * Metas de negocio por periodo. Alimentan las alertas automáticas
 * (services/alertas/alertasService.ts → alertasMetas) y el panel operativo.
 *
 * El avance se resuelve según `tipo`:
 *  - 'ingresos'      → SUM(ventas.total) del periodo (ventas completadas)
 *  - 'ventas'        → COUNT(ventas) del periodo (ventas completadas)
 *  - 'personalizada' → valor manual en `avance_manual`
 *
 * `negocio_id` es opcional: null = meta de toda la cuenta; con valor = meta
 * limitada a esa carpeta/negocio (y el avance se filtra por ella).
 */
export type TipoMeta = 'ingresos' | 'ventas' | 'personalizada';

@Entity('metas_negocio')
@Index(['usuario_id', 'negocio_id'])
@Index(['usuario_id', 'activa'])
export class MetaNegocio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  usuario_id!: string;

  @ManyToOne(() => Negocio, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'negocio_id' })
  negocio!: Negocio | null;

  @Column({ type: 'uuid', nullable: true })
  negocio_id!: string | null;

  @Column({ type: 'varchar', length: 200 })
  nombre!: string;

  @Column({ type: 'varchar', length: 20, default: 'personalizada' })
  tipo!: TipoMeta;

  // Objetivo del periodo. En metas de tipo 'ingresos' va en la moneda de las
  // ventas; en 'ventas' es un conteo de tickets.
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  objetivo!: number;

  // Solo se usa cuando tipo = 'personalizada'.
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  avance_manual!: number;

  @Column({ type: 'date' })
  periodo_inicio!: string;

  @Column({ type: 'date' })
  periodo_fin!: string;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @Column({ default: true })
  activa!: boolean;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}