import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Usuario } from './Usuario';
import { Empleado } from './Empleado';
import { MovimientoContable } from './MovimientoContable';

@Entity('pagos_nomina')
@Index(['usuario_id'])
@Index(['empleado_id'])
@Index(['movimiento_id'])
export class PagoNomina {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  usuario_id!: string;

  // Auditoría: id del trabajador que creó la fila cuando difiere del dueño
  // (usuario_id). Null = creada por el propio owner. No afecta el scoping.
  @Column({ type: 'uuid', nullable: true })
  creado_por_id!: string | null;

  @ManyToOne(() => Empleado, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empleado_id' })
  empleado!: Empleado;

  @Column()
  empleado_id!: string;

  // Snapshot del nombre por si el empleado cambia
  @Column({ type: 'varchar', length: 200 })
  empleado_nombre!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto!: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  moneda!: string;

  @Column({ type: 'date' })
  periodo_inicio!: string;

  @Column({ type: 'date' })
  periodo_fin!: string;

  @Column({ type: 'date' })
  fecha_pago!: string;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @ManyToOne(() => MovimientoContable, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'movimiento_id' })
  movimiento!: MovimientoContable | null;

  // FK opcional al movimiento contable creado (egreso en Finanzas)
  @Column({ type: 'uuid', nullable: true })
  movimiento_id!: string | null;

  @CreateDateColumn()
  fecha_creacion!: Date;
}
