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
/** Rol de administración de la PLATAFORMA. Ver la matriz en `middleware/requireAdmin.ts`. */
export type AdminRol = 'soporte' | 'moderador' | 'superadmin';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ type: 'varchar' })
  password_hash!: string;

  /**
   * `sub` de la cuenta de Google con la que entra (login con Google). Único
   * cuando existe (índice parcial `UQ_usuarios_google_sub`, migración 1775680000000).
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  google_sub!: string | null;

  @Column({ type: 'varchar' })
  nombre!: string;

  @Column({ type: 'varchar', default: 'freemium' })
  plan!: Plan;

  @Column({ type: 'varchar', default: 'owner' })
  account_role!: AccountRole;

  /**
   * Lo que eligió al registrarse: «tengo un negocio» o «ofrezco servicios».
   * Solo decide a dónde se le lleva al entrar; no concede ni quita permisos.
   */
  @Column({ type: 'varchar', length: 20, default: 'negocio' })
  tipo_cuenta!: 'negocio' | 'experto';

  /**
   * Rol de PLATAFORMA (administradores del SaaS).
   * NO confundir con account_role ('owner' = dueño de cuenta, multi-tenancy).
   */
  @Column({ type: 'boolean', default: false })
  es_admin!: boolean;

  /**
   * Nivel de administración. `null` = no es admin.
   *
   * Un trigger de la base lo mantiene sincronizado con `es_admin` (ver la
   * migración `AddAdminRol`): no hace falta tocar las dos columnas.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  admin_rol!: AdminRol | null;

  /**
   * Secreto TOTP del panel de admin, cifrado (ver `services/admin/totp.ts`).
   * `select: false`: no viaja en ninguna consulta que no lo pida expresamente.
   */
  @Column({ type: 'text', nullable: true, select: false })
  admin_totp_secreto?: string | null;

  /** `null` = sin verificación en dos pasos activa (o enrolamiento a medias). */
  @Column({ type: 'timestamp', nullable: true })
  admin_totp_activado_en!: Date | null;

  // ─── Papelera ─────────────────────────────────────────────────────────────
  // Una cuenta en la papelera está desactivada y se puede restaurar durante 30
  // días; después la purga la borra. Ver `services/admin/papelera.ts`.

  @Column({ type: 'timestamp', nullable: true })
  eliminado_en!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  eliminado_por!: string | null;

  @Column({ type: 'text', nullable: true })
  motivo_eliminacion!: string | null;

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

  /** Zona IANA del último navegador con el que entró (cabecera X-Zona-Horaria). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  zona_horaria?: string | null;

  /** Vertical activo del usuario (p. ej. 'oftalmologo'). null = genérico. */
  @Column({ type: 'varchar', nullable: true })
  vertical_activo?: string | null;

  @OneToMany(() => HerramientaSeleccionada, (h) => h.usuario)
  herramientas_seleccionadas?: HerramientaSeleccionada[];
}