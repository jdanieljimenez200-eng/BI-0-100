import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * Personalización tipo "sistema operativo" de una cuenta (feature Pro Plus+).
 * Un único registro por cuenta (owner): wallpaper, paleta, marca y ui_config.
 *
 * usuario_id apunta SIEMPRE a la cuenta (owner). Los trabajadores heredan el
 * tema de la cuenta a la que pertenecen; no tienen tema propio.
 */
export interface UIConfig {
  radio_botones: 'cuadrado' | 'redondeado' | 'pill';
  densidad: 'compacta' | 'normal' | 'espaciosa';
  fuente: 'inter' | 'mono' | 'rounded';
  animaciones: boolean;
  sidebar_collapsed: boolean;
  widgets_activos: string[];
}

export const UI_CONFIG_DEFAULT: UIConfig = {
  radio_botones: 'redondeado',
  densidad: 'normal',
  fuente: 'inter',
  animaciones: true,
  sidebar_collapsed: false,
  widgets_activos: [],
};

@Entity('temas_usuario')
@Unique(['usuario_id'])
export class TemaUsuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  usuario_id!: string;

  // ── Wallpaper ───────────────────────────────────────────────────────────────
  // wallpaper_url = imagen subida por el usuario; wallpaper_preset = key de un
  // preset incluido. Se usa uno u otro (el preset tiene prioridad si ambos null).
  @Column({ type: 'varchar', nullable: true })
  wallpaper_url!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  wallpaper_preset!: string | null;

  // Intensidad del overlay sobre el wallpaper (30–80). Legibilidad del texto.
  @Column({ type: 'int', default: 50 })
  wallpaper_overlay!: number;

  // ── Paleta ──────────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 20, nullable: true })
  tema_preset!: string | null; // 'midnight' | 'obsidian' | 'synthwave' | ...

  @Column({ type: 'varchar', length: 9, nullable: true })
  color_acento!: string | null; // #hex

  @Column({ type: 'varchar', length: 20, nullable: true })
  color_fondo!: string | null; // #hex o 'dark'/'midnight'/'slate'

  // ── Marca ───────────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  logo_url!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  nombre_sistema!: string | null;

  // ── UI ──────────────────────────────────────────────────────────────────────
  @Column({ type: 'jsonb', default: () => "'{}'" })
  ui_config!: UIConfig;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}