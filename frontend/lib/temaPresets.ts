import api from '@/lib/api';

// ── Espejo de tipos de backend/src/config/temaPresets.ts ──────────────────────
export interface WallpaperPreset {
  key: string;
  nombre: string;
  css: string; // gradiente CSS listo para inyectar
}

export interface PaletaPreset {
  key: string;
  nombre: string;
  color_acento: string; // #hex
  color_fondo: string; // #hex
}

export interface PresetsCatalogo {
  wallpapers: WallpaperPreset[];
  paletas: PaletaPreset[];
}

// El catálogo es estático en el backend (no cambia entre peticiones), así que lo
// cacheamos en memoria para toda la sesión. `inflight` deduplica llamadas
// concurrentes: si dos consumidores lo piden a la vez, comparten una sola red.
let cache: PresetsCatalogo | null = null;
let inflight: Promise<PresetsCatalogo> | null = null;

export async function getPresets(): Promise<PresetsCatalogo> {
  if (cache) return cache;
  if (!inflight) {
    inflight = api
      .get('/config/presets')
      .then(({ data }) => {
        cache = {
          wallpapers: Array.isArray(data?.wallpapers) ? data.wallpapers : [],
          paletas: Array.isArray(data?.paletas) ? data.paletas : [],
        };
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// Índices key→valor para resolución O(1) desde el ThemeProvider.
export function indexWallpapers(cat: PresetsCatalogo): Record<string, string> {
  return Object.fromEntries(cat.wallpapers.map((w) => [w.key, w.css]));
}

export function indexPaletas(
  cat: PresetsCatalogo,
): Record<string, { color_acento: string; color_fondo: string }> {
  return Object.fromEntries(
    cat.paletas.map((p) => [p.key, { color_acento: p.color_acento, color_fondo: p.color_fondo }]),
  );
}