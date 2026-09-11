import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Usuario } from './Usuario';

export type AccionHerramienta = 'activada' | 'desactivada' | 'seleccion_cambiada';

/**
 * Registro de auditoría para cambios en selección de herramientas.
 * Permite rastrear cuándo cada usuario activó/desactivó herramientas y por qué.
 */
@Entity('auditoria_herramientas')
@Index(['usuario_id'])
@Index(['herramienta_key'])
@Index(['created_at'])
@Index(['usuario_id', 'created_at'])
export class AuditoriaHerramienta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  @Column({ type: 'varchar', length: 40 })
  herramienta_key!: string;

  @Column({ type: 'varchar', length: 30 })
  accion!: AccionHerramienta;

  /**
   * Plan del usuario en el momento del cambio (snapshot para auditoría).
   */
  @Column({ type: 'varchar', length: 30 })
  plan_snapshot!: string;

  /**
   * Razón del cambio (ej. "webhook_stripe_upgrade", "usuario_manual", etc.)
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  razon!: string | null;

  @CreateDateColumn()
  created_at!: Date;
}