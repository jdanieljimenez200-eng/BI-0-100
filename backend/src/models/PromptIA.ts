import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type EstadoPromptIA = 'borrador' | 'publicado' | 'archivado';

/** Sección que el admin añade a un módulo sin deploy (se muestra en una tarjeta genérica). */
export interface SeccionExtraDef {
  /** Identificador estable, en minúsculas y con guiones bajos. */
  slug: string;
  titulo: string;
  /** Qué debe analizar la IA en esta sección. Es texto del admin: parte editable del prompt. */
  instrucciones: string;
}

/**
 * Una versión de un prompt de IA.
 *
 * `clave` identifica qué parte del prompt es: el modo de comportamiento de un
 * módulo (`legal.modo`) o una ficha de país (`legal.pais.CO`). Solo la parte
 * editable vive aquí: el contrato de salida (esquema JSON, reglas de formato y
 * anti-inyección) está en el código y se añade siempre después
 * (`services/ia/componerSistema.ts`).
 *
 * Lo que ya no es borrador no se reescribe: lo impide un trigger de la base
 * (migración `PromptsIA`). Editar = crear un borrador nuevo.
 */
@Entity('prompts_ia')
@Index(['clave', 'version'], { unique: true })
export class PromptIA {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  clave!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'varchar', length: 12, default: 'borrador' })
  estado!: EstadoPromptIA;

  @Column({ type: 'text' })
  contenido!: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  secciones_extra!: SeccionExtraDef[];

  /** Claves de secciones nativas que el admin ocultó (ver `seccionesCatalogo.ts`). */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  secciones_ocultas!: string[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  notas!: string | null;

  @Column({ type: 'uuid', nullable: true })
  creado_por_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  publicado_por_id!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  fecha_publicacion!: Date | null;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @UpdateDateColumn()
  fecha_actualizacion!: Date;
}
