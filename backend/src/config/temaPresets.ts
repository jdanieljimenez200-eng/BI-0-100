/**
 * Catálogo estático de presets de personalización (Fase P2).
 * No dependen de DB: se sirven tal cual por GET /api/config/presets para que el
 * frontend pinte el selector de wallpapers y paletas.
 *
 * - wallpaper_preset (key) → se guarda en TemaUsuario.wallpaper_preset.
 * - tema_preset (key) → se guarda en TemaUsuario.tema_preset y define la paleta.
 */

export interface WallpaperPreset {
  key: string;
  nombre: string;
  // CSS listo para inyectar como background (gradiente puro, sin assets externos).
  css: string;
}

export interface PaletaPreset {
  key: string;
  nombre: string;
  color_acento: string; // #hex
  color_fondo: string; // #hex
}

// Wallpapers incluidos: gradientes CSS (cero peso, cero peticiones externas).
export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  { key: 'midnight', nombre: 'Midnight', css: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' },
  { key: 'obsidian', nombre: 'Obsidian', css: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)' },
  { key: 'synthwave', nombre: 'Synthwave', css: 'linear-gradient(135deg, #2b1055 0%, #7597de 100%)' },
  { key: 'aurora', nombre: 'Aurora', css: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
  { key: 'ember', nombre: 'Ember', css: 'linear-gradient(135deg, #420516 0%, #b91c1c 100%)' },
  { key: 'slate', nombre: 'Slate', css: 'linear-gradient(135deg, #334155 0%, #64748b 100%)' },
];

// Paletas: acento + fondo. El acento pinta botones/enlaces; el fondo, el lienzo.
export const PALETA_PRESETS: PaletaPreset[] = [
  { key: 'midnight', nombre: 'Midnight', color_acento: '#6366f1', color_fondo: '#0f172a' },
  { key: 'obsidian', nombre: 'Obsidian', color_acento: '#a855f7', color_fondo: '#0a0a0a' },
  { key: 'synthwave', nombre: 'Synthwave', color_acento: '#ec4899', color_fondo: '#1a0b2e' },
  { key: 'aurora', nombre: 'Aurora', color_acento: '#10b981', color_fondo: '#0c1f1a' },
  { key: 'ember', nombre: 'Ember', color_acento: '#ef4444', color_fondo: '#1a0505' },
  { key: 'slate', nombre: 'Slate', color_acento: '#3b82f6', color_fondo: '#1e293b' },
];

export const WALLPAPER_PRESET_KEYS = WALLPAPER_PRESETS.map((w) => w.key);
export const PALETA_PRESET_KEYS = PALETA_PRESETS.map((p) => p.key);