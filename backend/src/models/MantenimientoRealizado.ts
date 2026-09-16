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
import { EquipoMantenimiento } from './EquipoMantenimiento';

/**
 * Un mantenimiento ya hecho. Es el historial del equipo y la fuente de
 * `equipos_mantenimiento.fecha_ultimo`.
 *
 * Si lleva costo, la ruta crea además un egreso en `movimientos_contables`
 * (fuente 'mantenimiento') y guarda aquí su id: así el gasto se ve en Reportes
 * y se puede rastrear hasta el equipo que lo generó.
 */
@Entity('mantenimientos_realizados')
@Index(['usuario_id'])
@Index(['usuario_id', 'equipo_id', 'fecha'])
export class MantenimientoRealizado {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  @Column({ type: 'uuid', nullable: true })
  creado_por_id!: string | null;

  @ManyToOne(() => EquipoMantenimiento, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equipo_id' })
  equipo!: EquipoMantenimiento;

  @Column({ type: 'uuid' })
  equipo_id!: string;

  @Column({ type: 'date' })
  fecha!: string;

  // Null = no se registró costo (no genera egreso contable).
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: {
    to: (v: number | null) => v,
    from: (v: string | null) => (v === null ? null : Number(v)),
  } })
  costo!: number | null;

  // Quién lo hizo: técnico, proveedor o el propio equipo del negocio.
  @Column({ type: 'varchar', length: 160, nullable: true })
  responsable!: string | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @Column({ type: 'uuid', nullable: true })
  movimiento_contable_id!: string | null;

  @CreateDateColumn()
  fecha_creacion!: Date;
}
