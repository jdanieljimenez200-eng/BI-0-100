import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Producto } from './Producto';
import { AsignacionTrabajador } from './AsignacionTrabajador';
import { InvitacionTrabajador } from './InvitacionTrabajador';
import { HerramientaSeleccionada } from './HerramientaSeleccionada';

export type Plan = 'freemium' | 'pro' | 'pro_plus' | 'business' | 'enterprise';
export type AccountRole = 'owner' | 'trabajador';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ type: 'varchar' })
  password_hash!: string;

  @Column({ type: 'varchar' })
  nombre!: string;

  @Column({ type: 'varchar', default: 'freemium' })
  plan!: Plan;

  @Column({ type: 'varchar', default: 'owner' })
  account_role!: AccountRole;

  /**
   * Rol de PLATAFORMA (administradores del SaaS).
   * NO confundir con account_role ('owner' = dueño de cuenta, multi-tenancy).
   */
  @Column({ type: 'boolean', default: false })
  es_admin!: boolean;

  @Column({ type: 'uuid', nullable: true })
  owner_id?: string;

  @ManyToOne(() => Usuario, (u) => u.trabajadores, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_id' })
  owner?: Usuario;

  @OneToMany(() => Usuario, (u) => u.owner)
  trabajadores?: Usuario[];

  @Column({ type: 'integer', default: 0 })
  analisis_disponibles!: number;

  @Column({ type: 'integer', default: 0 })
  creditos_marketing!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => Producto, (p) => p.usuario)
  productos!: Producto[];

  @OneToMany(() => AsignacionTrabajador, (a) => a.trabajador)
  asignacionesTrabajador?: AsignacionTrabajador[];

  // Plan limits
  @Column({ type: 'integer', default: -1 })
  limit_analisis_mercado!: number;

  @Column({ type: 'integer', default: -1 })
  limit_analisis_marketing!: number;

  @Column({ type: 'integer', default: -1 })
  limit_analisis_finanzas!: number;

  @Column({ type: 'integer', default: -1 })
  limit_analisis_legal!: number;

  @Column({ type: 'integer', default: -1 })
  limit_analisis_brief!: number;

  @Column({ type: 'integer', default: -1 })
  max_productos!: number;

  @Column({ type: 'integer', default: -1 })
  max_herramientas!: number;

  // Stripe
  @Column({ type: 'varchar', nullable: true })
  stripe_customer_id?: string;

  @Column({ type: 'varchar', nullable: true })
  stripe_subscription_id?: string;

  @Column({ type: 'bigint', nullable: true })
  stripe_event_ts?: number;

  @Column({ type: 'timestamp', nullable: true })
  plan_expires_at?: Date;

  @OneToMany(() => InvitacionTrabajador, (i) => i.cuenta)
  invitaciones?: InvitacionTrabajador[];

  @OneToMany(() => AsignacionTrabajador, (a) => a.cuenta)
  asignaciones_cuenta?: AsignacionTrabajador[];

  @Column({ type: 'jsonb', nullable: true })
  datos_negocio?: Record<string, any>;

  /** Vertical activo del usuario (p. ej. 'oftalmologo'). null = genérico. */
  @Column({ type: 'varchar', nullable: true })
  vertical_activo?: string | null;

  @OneToMany(() => HerramientaSeleccionada, (h) => h.usuario)
  herramientas_seleccionadas?: HerramientaSeleccionada[];
}