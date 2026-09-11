'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { getPresets, indexWallpapers, indexPaletas } from '@/lib/temaPresets';

// ── Tipos (espejo del shape que devuelve GET /api/config/tema) ────────────────
export interface UIConfig {
  radio_botones: 'cuadrado' | 'redondeado' | 'pill';
  densidad: 'compacta' | 'normal' | 'espaciosa';
  fuente: 'inter' | 'mono' | 'rounded';
  animaciones: boolean;
  sidebar_collapsed: boolean;
  widgets_activos: string[];
}

export interface Tema {
  wallpaper_url: string | null;
  wallpaper_preset: string | null;
  wallpaper_overlay: number;
  tema_preset: string | null;
  color_acento: string | null;
  color_fondo: string | null;
  logo_url: string | null;
  nombre_sistema: string | null;
  ui_config: UIConfig;
}

interface ThemeContextValue {
  tema: Tema | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  tema: null,
  loading: true,
  refetch: async () => {},
});

export const useTema = () => useContext(ThemeContext);

// ¿El tema referencia algún preset que necesitemos resolver contra el catálogo?
// - wallpaper_preset: siempre necesita el catálogo (solo tenemos la key).
// - tema_preset: solo si falta algún color explícito que rellenar con la paleta.
function necesitaPresets(t: Tema): boolean {
  if (t.wallpaper_preset && !t.wallpaper_url) return true;
  if (t.tema_preset && (!t.color_acento || !t.color_fondo)) return true;
  return false;
}

// Resuelve el background del lienzo: imagen propia > preset (del catálogo) > null.
function resolveWallpaperCss(t: Tema, wallpapers: Record<string, string>): string | null {
  if (t.wallpaper_url) return `url("${t.wallpaper_url}")`;
  if (t.wallpaper_preset && wallpapers[t.wallpaper_preset]) return wallpapers[t.wallpaper_preset];
  return null;
}

// Resuelve la paleta: color explícito > paleta del tema_preset (catálogo) > null.
function resolvePaleta(
  t: Tema,
  paletas: Record<string, { color_acento: string; color_fondo: string }>,
): { acento: string | null; fondo: string | null } {
  const preset = t.tema_preset ? paletas[t.tema_preset] : undefined;
  return {
    acento: t.color_acento ?? preset?.color_acento ?? null,
    fondo: t.color_fondo ?? preset?.color_fondo ?? null,
  };
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [tema, setTema] = useState<Tema | null>(null);
  const [loading, setLoading] = useState(true);
  // Índices key→valor del catálogo; vacíos hasta que (y si) hagan falta.
  const [wallpapers, setWallpapers] = useState<Record<string, string>>({});
  const [paletas, setPaletas] = useState<Record<string, { color_acento: string; color_fondo: string }>>({});

  const fetchTema = useCallback(async () => {
    try {
      const { data } = await api.get('/config/tema');
      const t = data.tema as Tema;
      setTema(t);
      // Solo cargamos el catálogo (cacheado toda la sesión) si el tema lo usa.
      if (necesitaPresets(t)) {
        const cat = await getPresets();
        setWallpapers(indexWallpapers(cat));
        setPaletas(indexPaletas(cat));
      }
    } catch (err: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[ThemeProvider] Falló la carga del tema personalizado, usando estilos base:', err);
      }
      setTema(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTema();
  }, [fetchTema]);

  // Aplica las variables CSS de paleta al <html> para que cualquier consumidor
  // (var(--color-acento) / var(--color-fondo)) las herede globalmente.
  useEffect(() => {
    const root = document.documentElement;
    if (!tema) {
      root.style.removeProperty('--color-acento');
      root.style.removeProperty('--color-fondo');
      return;
    }
    const { acento, fondo } = resolvePaleta(tema, paletas);
    if (acento) root.style.setProperty('--color-acento', acento);
    else root.style.removeProperty('--color-acento');
    if (fondo) root.style.setProperty('--color-fondo', fondo);
    else root.style.removeProperty('--color-fondo');

    return () => {
      root.style.removeProperty('--color-acento');
      root.style.removeProperty('--color-fondo');
    };
  }, [tema, paletas]);

  // Aplica ui_config como atributos data-* en <html>. Los overrides viven en
  // globals.css (capa "ui_config"), así que aquí solo fijamos/limpiamos flags.
  useEffect(() => {
    const root = document.documentElement;
    const ui = tema?.ui_config;
    if (!ui) {
      root.removeAttribute('data-radio');
      root.removeAttribute('data-densidad');
      root.removeAttribute('data-fuente');
      root.removeAttribute('data-animaciones');
      return;
    }
    root.setAttribute('data-radio', ui.radio_botones);
    root.setAttribute('data-densidad', ui.densidad);
    root.setAttribute('data-fuente', ui.fuente);
    root.setAttribute('data-animaciones', ui.animaciones ? 'on' : 'off');

    return () => {
      root.removeAttribute('data-radio');
      root.removeAttribute('data-densidad');
      root.removeAttribute('data-fuente');
      root.removeAttribute('data-animaciones');
    };
  }, [tema]);

  const wallpaperCss = tema ? resolveWallpaperCss(tema, wallpapers) : null;
  // Overlay 30–80 (%) → opacidad del velo oscuro sobre el wallpaper.
  const overlayAlpha = tema ? Math.min(80, Math.max(30, tema.wallpaper_overlay)) / 100 : 0.5;
  const isImage = !!tema?.wallpaper_url;

  return (
    <ThemeContext.Provider value={{ tema, loading, refetch: fetchTema }}>
      {wallpaperCss && (
        <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{
              background: wallpaperCss,
              backgroundSize: isImage ? 'cover' : undefined,
              backgroundPosition: isImage ? 'center' : undefined,
              backgroundRepeat: isImage ? 'no-repeat' : undefined,
            }}
          />
          {/* Velo de legibilidad: cuanto mayor el overlay, más oscuro el lienzo. */}
          <div className="absolute inset-0" style={{ backgroundColor: `rgba(7, 14, 23, ${overlayAlpha})` }} />
        </div>
      )}
      {children}
    </ThemeContext.Provider>
  );
}