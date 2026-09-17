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

/**
 * Calendario de Google conectado por un usuario. Las citas de `cuenta_id` (el
 * dueño, aunque conecte un trabajador) se copian a ese calendario.
 */
@Entity('conexiones_google_calendar')
@Index(['cuenta_id', 'activa'])
export class ConexionGoogleCalendar {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column({ type: 'uuid', unique: true })
  usuario_id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cuenta_id' })
  cuenta!: Usuario;

  @Column({ type: 'uuid' })
  cuenta_id!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email_google!: string | null;

  @Column({ type: 'varchar', length: 200, default: 'primary' })
  calendario_id!: string;

  /** Cifrado con `cifrarToken` (services/google/cifradoTokens.ts). Nunca sale de la API. */
  @Column({ type: 'text', select: false })
  refresh_token_cifrado!: string;

  @Column({ type: 'boolean', default: true })
  activa!: boolean;

  @Column({ type: 'varchar', length: 300, nullable: true })
  ultimo_error!: string | null;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}
