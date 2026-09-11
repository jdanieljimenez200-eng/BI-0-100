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

/**
 * Código de un solo uso que un dueño (owner) genera para que un trabajador se
 * registre por sí mismo en /api/auth/signup. Al canjearse queda ligado al
 * usuario creado (usado_por) y no puede reutilizarse. Caduca en expira_en.
 */
@Entity('invitaciones_trabajador')
@Index(['cuenta_id'])
@Index(['codigo'], { unique: true })
@Index(['usado_por'])
export class InvitacionTrabajador {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  codigo!: string;

  // cuenta_id = id del dueño (owner) que emitió la invitación.
  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cuenta_id' })
  cuenta!: Usuario;

  @Column({ type: 'uuid' })
  cuenta_id!: string;

  // Candado suave opcional: si se fija, solo ese email puede canjear el código.
  @Column({ type: 'varchar', nullable: true })
  email_destino!: string | null;

  @Column({ type: 'timestamptz' })
  expira_en!: Date;

  // Trabajador que canjeó el código (null mientras no se use).
  @ManyToOne(() => Usuario, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'usado_por' })
  usuarioUsado!: Usuario | null;

  @Column({ type: 'uuid', nullable: true })
  usado_por!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  usado_en!: Date | null;

  @CreateDateColumn()
  fecha_creacion!: Date;
}