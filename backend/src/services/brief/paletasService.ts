import { PaletaColores } from './types';

// ─── Paleta library (deterministic — no AI needed) ───────────────────────────
// Each entry represents one set of 3 options (A/B/C) mapped by estilo_visual x posicionamiento keys.
// Fallback uses estilo_visual alone.

type PaletaSet = [PaletaColores, PaletaColores, PaletaColores]; // A, B, C

const PALETAS_POR_ESTILO: Record<string, PaletaSet> = {
  'Minimalista': [
    {
      primario:   { nombre: 'Grafito',       hex: '#1A1A2E', uso: 'Fondo principal, tipografía dominante' },
      secundario: { nombre: 'Marfil',        hex: '#F5F0E8', uso: 'Fondos secundarios, espacios en blanco' },
      acento:     { nombre: 'Terracota',     hex: '#C96B4A', uso: 'CTAs, highlights, acentos puntuales' },
      neutro:     { nombre: 'Gris Piedra',   hex: '#8A8A8A', uso: 'Texto de apoyo, separadores, iconografía' },
    },
    {
      primario:   { nombre: 'Negro Carbón',  hex: '#111111', uso: 'Fondo principal, tipografía dominante' },
      secundario: { nombre: 'Blanco Roto',   hex: '#F9F7F4', uso: 'Fondos secundarios, espacios en blanco' },
      acento:     { nombre: 'Verde Sage',    hex: '#6B8F71', uso: 'CTAs, highlights, acentos puntuales' },
      neutro:     { nombre: 'Gris Claro',    hex: '#CCCCCC', uso: 'Texto de apoyo, separadores, iconografía' },
    },
    {
      primario:   { nombre: 'Azul Profundo', hex: '#0D1B2A', uso: 'Fondo principal, tipografía dominante' },
      secundario: { nombre: 'Blanco Puro',   hex: '#FFFFFF', uso: 'Fondos secundarios, espacios en blanco' },
      acento:     { nombre: 'Cian Eléctrico',hex: '#00B4D8', uso: 'CTAs, highlights, acentos puntuales' },
      neutro:     { nombre: 'Gris Azulado',  hex: '#90A4AE', uso: 'Texto de apoyo, separadores, iconografía' },
    },
  ],
  'Bold/Impactante': [
    {
      primario:   { nombre: 'Rojo Fuego',    hex: '#D62828', uso: 'Color dominante, fondo de hero, bloques principales' },
      secundario: { nombre: 'Negro',         hex: '#0A0A0A', uso: 'Fondos secundarios, contraste extremo' },
      acento:     { nombre: 'Amarillo Neón', hex: '#FFD60A', uso: 'Tipografía de display, CTAs llamativos' },
      neutro:     { nombre: 'Gris Dark',     hex: '#3D3D3D', uso: 'Texto de apoyo, áreas intermedias' },
    },
    {
      primario:   { nombre: 'Naranja Brutal',hex: '#F4511E', uso: 'Color dominante, fondo de hero, bloques principales' },
      secundario: { nombre: 'Negro Matte',   hex: '#121212', uso: 'Fondos secundarios, contraste extremo' },
      acento:     { nombre: 'Blanco Puro',   hex: '#FFFFFF', uso: 'Tipografía de display, CTAs llamativos' },
      neutro:     { nombre: 'Gris Medio',    hex: '#555555', uso: 'Texto de apoyo, áreas intermedias' },
    },
    {
      primario:   { nombre: 'Púrpura Intenso',hex: '#6A0572', uso: 'Color dominante, fondo de hero, bloques principales' },
      secundario: { nombre: 'Rosa Eléctrico',hex: '#FF2D78', uso: 'Fondos secundarios, elementos de contraste' },
      acento:     { nombre: 'Amarillo Limón',hex: '#F9C80E', uso: 'Tipografía de display, CTAs llamativos' },
      neutro:     { nombre: 'Gris Frío',     hex: '#4A4A5A', uso: 'Texto de apoyo, áreas intermedias' },
    },
  ],
  'Orgánico/Natural': [
    {
      primario:   { nombre: 'Verde Bosque',  hex: '#2D6A4F', uso: 'Color principal, fondos de sección' },
      secundario: { nombre: 'Crema Natural', hex: '#FAF3E0', uso: 'Fondos, áreas de respiro' },
      acento:     { nombre: 'Tierra Siena',  hex: '#A0522D', uso: 'CTAs, detalles cálidos' },
      neutro:     { nombre: 'Beige Topo',    hex: '#C4A882', uso: 'Texto secundario, texturas de fondo' },
    },
    {
      primario:   { nombre: 'Musgo',         hex: '#4A5240', uso: 'Color principal, fondos de sección' },
      secundario: { nombre: 'Lino',          hex: '#F2EFE4', uso: 'Fondos, áreas de respiro' },
      acento:     { nombre: 'Mostaza',       hex: '#D4A017', uso: 'CTAs, detalles cálidos' },
      neutro:     { nombre: 'Arena',         hex: '#BDB5A6', uso: 'Texto secundario, texturas de fondo' },
    },
    {
      primario:   { nombre: 'Aguacate',      hex: '#3D6B35', uso: 'Color principal, fondos de sección' },
      secundario: { nombre: 'Pergamino',     hex: '#F5EDD6', uso: 'Fondos, áreas de respiro' },
      acento:     { nombre: 'Coral Tierra',  hex: '#C96B4A', uso: 'CTAs, detalles cálidos' },
      neutro:     { nombre: 'Cacao',         hex: '#8B6347', uso: 'Texto secundario, texturas de fondo' },
    },
  ],
  'Futurista/Tech': [
    {
      primario:   { nombre: 'Azul Noche',    hex: '#0A1628', uso: 'Fondo oscuro base, hero' },
      secundario: { nombre: 'Azul Medio',    hex: '#1A3A5C', uso: 'Superficies elevadas, cards' },
      acento:     { nombre: 'Cian Neón',     hex: '#00FFCC', uso: 'Glows, CTAs, bordes activos' },
      neutro:     { nombre: 'Gris Plata',    hex: '#9EADC8', uso: 'Texto UI, iconografía técnica' },
    },
    {
      primario:   { nombre: 'Grafito Tech',  hex: '#0F0F1A', uso: 'Fondo oscuro base, hero' },
      secundario: { nombre: 'Violeta Dark',  hex: '#1E0A3C', uso: 'Superficies elevadas, cards' },
      acento:     { nombre: 'Magenta Cyber', hex: '#FF00FF', uso: 'Glows, CTAs, bordes activos' },
      neutro:     { nombre: 'Lavanda Frío',  hex: '#A78BFA', uso: 'Texto UI, iconografía técnica' },
    },
    {
      primario:   { nombre: 'Negro Tech',    hex: '#080808', uso: 'Fondo oscuro base, hero' },
      secundario: { nombre: 'Gris Dark',     hex: '#1C1C1C', uso: 'Superficies elevadas, cards' },
      acento:     { nombre: 'Verde Matrix',  hex: '#39FF14', uso: 'Glows, CTAs, bordes activos' },
      neutro:     { nombre: 'Gris Titanio',  hex: '#888888', uso: 'Texto UI, iconografía técnica' },
    },
  ],
  'Artesanal/Handmade': [
    {
      primario:   { nombre: 'Terracota',     hex: '#C96B4A', uso: 'Color principal, bloques cálidos' },
      secundario: { nombre: 'Crema Vintage', hex: '#F5EDD6', uso: 'Fondos, papel texturizado' },
      acento:     { nombre: 'Azul Índigo',   hex: '#3D5A80', uso: 'Acentos artesanales, CTAs' },
      neutro:     { nombre: 'Madera Clara',  hex: '#B8976A', uso: 'Madera, cuero, elementos naturales' },
    },
    {
      primario:   { nombre: 'Barro',         hex: '#8B4513', uso: 'Color principal, bloques cálidos' },
      secundario: { nombre: 'Papel Kraft',   hex: '#E8D5B7', uso: 'Fondos, papel texturizado' },
      acento:     { nombre: 'Verde Oliva',   hex: '#6B6B3A', uso: 'Acentos artesanales, CTAs' },
      neutro:     { nombre: 'Lino Natural',  hex: '#C9B99A', uso: 'Madera, cuero, elementos naturales' },
    },
    {
      primario:   { nombre: 'Chocolate',     hex: '#5C3317', uso: 'Color principal, bloques cálidos' },
      secundario: { nombre: 'Marfil Suave',  hex: '#FAEBD7', uso: 'Fondos, papel texturizado' },
      acento:     { nombre: 'Rojo Ladrillo', hex: '#B22222', uso: 'Acentos artesanales, CTAs' },
      neutro:     { nombre: 'Camel',         hex: '#C19A6B', uso: 'Madera, cuero, elementos naturales' },
    },
  ],
  'Elegante/Lujo': [
    {
      primario:   { nombre: 'Negro Absoluto',hex: '#000000', uso: 'Fondo principal, máximo contraste' },
      secundario: { nombre: 'Dorado',        hex: '#C9A84C', uso: 'Detalles de lujo, separadores, ornamentos' },
      acento:     { nombre: 'Champagne',     hex: '#F5E6C8', uso: 'Tipografía display, CTAs elegantes' },
      neutro:     { nombre: 'Gris Perla',    hex: '#9E9E9E', uso: 'Texto secundario, elementos de apoyo' },
    },
    {
      primario:   { nombre: 'Azul Real',     hex: '#1B2A4A', uso: 'Fondo principal, máximo contraste' },
      secundario: { nombre: 'Oro Rosa',      hex: '#C9956C', uso: 'Detalles de lujo, separadores, ornamentos' },
      acento:     { nombre: 'Crema Lujosa',  hex: '#FAF0E6', uso: 'Tipografía display, CTAs elegantes' },
      neutro:     { nombre: 'Platino',       hex: '#B8B8B8', uso: 'Texto secundario, elementos de apoyo' },
    },
    {
      primario:   { nombre: 'Vino Oscuro',   hex: '#2C0A0A', uso: 'Fondo principal, máximo contraste' },
      secundario: { nombre: 'Plata',         hex: '#C0C0C0', uso: 'Detalles de lujo, separadores, ornamentos' },
      acento:     { nombre: 'Borgoña',       hex: '#800020', uso: 'Tipografía display, CTAs elegantes' },
      neutro:     { nombre: 'Gris Grafito',  hex: '#6D6D6D', uso: 'Texto secundario, elementos de apoyo' },
    },
  ],
};

const FALLBACK_PALETAS: PaletaSet = [
  {
    primario:   { nombre: 'Azul Corporativo', hex: '#1E3A5F', uso: 'Color principal de la marca' },
    secundario: { nombre: 'Blanco',           hex: '#FFFFFF', uso: 'Fondos y espacios' },
    acento:     { nombre: 'Naranja',          hex: '#FF6B35', uso: 'CTAs y highlights' },
    neutro:     { nombre: 'Gris',             hex: '#9E9E9E', uso: 'Texto secundario' },
  },
  {
    primario:   { nombre: 'Verde Esmeralda',  hex: '#10B981', uso: 'Color principal de la marca' },
    secundario: { nombre: 'Blanco Roto',      hex: '#F9FAFB', uso: 'Fondos y espacios' },
    acento:     { nombre: 'Índigo',           hex: '#4F46E5', uso: 'CTAs y highlights' },
    neutro:     { nombre: 'Gris Medio',       hex: '#6B7280', uso: 'Texto secundario' },
  },
  {
    primario:   { nombre: 'Morado',           hex: '#7C3AED', uso: 'Color principal de la marca' },
    secundario: { nombre: 'Lavanda Claro',    hex: '#F5F3FF', uso: 'Fondos y espacios' },
    acento:     { nombre: 'Rosa Fuerte',      hex: '#EC4899', uso: 'CTAs y highlights' },
    neutro:     { nombre: 'Gris Oscuro',      hex: '#374151', uso: 'Texto secundario' },
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

export function obtenerPaleta(
  estiloVisual: string,
  seleccion: 'A' | 'B' | 'C'
): PaletaColores {
  const idx = seleccion === 'A' ? 0 : seleccion === 'B' ? 1 : 2;
  const set = PALETAS_POR_ESTILO[estiloVisual] ?? FALLBACK_PALETAS;
  return set[idx];
}

export function obtenerTodasLasPaletas(estiloVisual: string): PaletaSet {
  return PALETAS_POR_ESTILO[estiloVisual] ?? FALLBACK_PALETAS;
}
