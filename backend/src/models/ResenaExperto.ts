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
import { Experto } from './Experto';

export type EstadoResena = 'publicada' | 'oculta';

/**
 * Reseña de un usuario sobre un experto.
 *
 * Puede reseñar cualquier usuario con cuenta, con tres salvaguardas:
 *
 *  1. Índice único `(experto_id, usuario_id)`: una sola reseña por persona.
 *  2. Un experto no puede reseñarse a sí mismo (se comprueba en la ruta).
 *  3. Un admin puede pasarla a `oculta` sin borrarla.
 *
 * Sin la primera, inflar el rating es tan barato como repetir el POST, y la
 * puntuación deja de valer para decidir a quién contratar.
 */
@Entity('resenas_experto')
@Index(['experto_id', 'usuario_id'], { unique: true })
@Index(['usuario_id'])
export class ResenaExperto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Experto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'experto_id' })
  experto!: Experto;

  @Column({ type: 'uuid' })
  experto_id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  /** De 1 a 5. La base lo garantiza con un CHECK. */
  @Column({ type: 'smallint' })
  puntuacion!: number;

  @Column({ type: 'text', nullable: true })
  comentario!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'publicada' })
  estado!: EstadoResena;

  @CreateDateColumn()
  fecha_creacion!: Date;
}
