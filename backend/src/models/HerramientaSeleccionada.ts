import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Usuario } from './Usuario';

/**
 * Herramienta que un usuario de plan por SELECCIÓN (pro, pro_plus) ha ACTIVADO
 * a elección. El nº de filas activas por cuenta está topado por
 * PLAN_LIMITES[plan].max_herramientas (pro = 1, pro_plus = 4).
 *
 * usuario_id apunta SIEMPRE a la cuenta (owner). Los trabajadores no seleccionan;
 * heredan las herramientas de la cuenta a la que pertenecen.
 *
 * herramienta_key es una HerramientaCapabilityKey ('pos' | 'inventario' | ...).
 *
 * El constraint UNIQUE(usuario_id, herramienta_key) a nivel BD previene
 * duplicados y race conditions en POST /seleccionar.
 */
@Entity('herramientas_seleccionadas')
@Unique(['usuario_id', 'herramienta_key'])
@Index(['usuario_id'])
export class HerramientaSeleccionada {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  @ManyToOne(() => Usuario, (u) => u.herramientas_seleccionadas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column({ type: 'varchar', length: 40 })
  herramienta_key!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}