// Client-side palette definitions (mirrors backend paletasService.ts — no DB/API needed)

export interface ColorToken {
  nombre: string;
  hex: string;
}

export interface PaletaColores {
  primario: ColorToken;
  secundario: ColorToken;
  acento: ColorToken;
  neutro: ColorToken;
}

type PaletaSet = [PaletaColores, PaletaColores, PaletaColores];

const PALETAS: Record<string, PaletaSet> = {
  'Minimalista': [
    { primario: { nombre: 'Grafito', hex: '#1A1A2E' }, secundario: { nombre: 'Marfil', hex: '#F5F0E8' }, acento: { nombre: 'Terracota', hex: '#C96B4A' }, neutro: { nombre: 'Gris Piedra', hex: '#8A8A8A' } },
    { primario: { nombre: 'Negro Carbón', hex: '#111111' }, secundario: { nombre: 'Blanco Roto', hex: '#F9F7F4' }, acento: { nombre: 'Verde Sage', hex: '#6B8F71' }, neutro: { nombre: 'Gris Claro', hex: '#CCCCCC' } },
    { primario: { nombre: 'Azul Profundo', hex: '#0D1B2A' }, secundario: { nombre: 'Blanco Puro', hex: '#FFFFFF' }, acento: { nombre: 'Cian Eléctrico', hex: '#00B4D8' }, neutro: { nombre: 'Gris Azulado', hex: '#90A4AE' } },
  ],
  'Bold/Impactante': [
    { primario: { nombre: 'Rojo Fuego', hex: '#D62828' }, secundario: { nombre: 'Negro', hex: '#0A0A0A' }, acento: { nombre: 'Amarillo Neón', hex: '#FFD60A' }, neutro: { nombre: 'Gris Dark', hex: '#3D3D3D' } },
    { primario: { nombre: 'Naranja Brutal', hex: '#F4511E' }, secundario: { nombre: 'Negro Matte', hex: '#121212' }, acento: { nombre: 'Blanco Puro', hex: '#FFFFFF' }, neutro: { nombre: 'Gris Medio', hex: '#555555' } },
    { primario: { nombre: 'Púrpura Intenso', hex: '#6A0572' }, secundario: { nombre: 'Rosa Eléctrico', hex: '#FF2D78' }, acento: { nombre: 'Amarillo Limón', hex: '#F9C80E' }, neutro: { nombre: 'Gris Frío', hex: '#4A4A5A' } },
  ],
  'Orgánico/Natural': [
    { primario: { nombre: 'Verde Bosque', hex: '#2D6A4F' }, secundario: { nombre: 'Crema Natural', hex: '#FAF3E0' }, acento: { nombre: 'Tierra Siena', hex: '#A0522D' }, neutro: { nombre: 'Beige Topo', hex: '#C4A882' } },
    { primario: { nombre: 'Musgo', hex: '#4A5240' }, secundario: { nombre: 'Lino', hex: '#F2EFE4' }, acento: { nombre: 'Mostaza', hex: '#D4A017' }, neutro: { nombre: 'Arena', hex: '#BDB5A6' } },
    { primario: { nombre: 'Aguacate', hex: '#3D6B35' }, secundario: { nombre: 'Pergamino', hex: '#F5EDD6' }, acento: { nombre: 'Coral Tierra', hex: '#C96B4A' }, neutro: { nombre: 'Cacao', hex: '#8B6347' } },
  ],
  'Futurista/Tech': [
    { primario: { nombre: 'Azul Noche', hex: '#0A1628' }, secundario: { nombre: 'Azul Medio', hex: '#1A3A5C' }, acento: { nombre: 'Cian Neón', hex: '#00FFCC' }, neutro: { nombre: 'Gris Plata', hex: '#9EADC8' } },
    { primario: { nombre: 'Grafito Tech', hex: '#0F0F1A' }, secundario: { nombre: 'Violeta Dark', hex: '#1E0A3C' }, acento: { nombre: 'Magenta Cyber', hex: '#FF00FF' }, neutro: { nombre: 'Lavanda Frío', hex: '#A78BFA' } },
    { primario: { nombre: 'Negro Tech', hex: '#080808' }, secundario: { nombre: 'Gris Dark', hex: '#1C1C1C' }, acento: { nombre: 'Verde Matrix', hex: '#39FF14' }, neutro: { nombre: 'Gris Titanio', hex: '#888888' } },
  ],
  'Artesanal/Handmade': [
    { primario: { nombre: 'Terracota', hex: '#C96B4A' }, secundario: { nombre: 'Crema Vintage', hex: '#F5EDD6' }, acento: { nombre: 'Azul Índigo', hex: '#3D5A80' }, neutro: { nombre: 'Madera Clara', hex: '#B8976A' } },
    { primario: { nombre: 'Barro', hex: '#8B4513' }, secundario: { nombre: 'Papel Kraft', hex: '#E8D5B7' }, acento: { nombre: 'Verde Oliva', hex: '#6B6B3A' }, neutro: { nombre: 'Lino Natural', hex: '#C9B99A' } },
    { primario: { nombre: 'Chocolate', hex: '#5C3317' }, secundario: { nombre: 'Marfil Suave', hex: '#FAEBD7' }, acento: { nombre: 'Rojo Ladrillo', hex: '#B22222' }, neutro: { nombre: 'Camel', hex: '#C19A6B' } },
  ],
  'Elegante/Lujo': [
    { primario: { nombre: 'Negro Absoluto', hex: '#000000' }, secundario: { nombre: 'Dorado', hex: '#C9A84C' }, acento: { nombre: 'Champagne', hex: '#F5E6C8' }, neutro: { nombre: 'Gris Perla', hex: '#9E9E9E' } },
    { primario: { nombre: 'Azul Real', hex: '#1B2A4A' }, secundario: { nombre: 'Oro Rosa', hex: '#C9956C' }, acento: { nombre: 'Crema Lujosa', hex: '#FAF0E6' }, neutro: { nombre: 'Platino', hex: '#B8B8B8' } },
    { primario: { nombre: 'Vino Oscuro', hex: '#2C0A0A' }, secundario: { nombre: 'Plata', hex: '#C0C0C0' }, acento: { nombre: 'Borgoña', hex: '#800020' }, neutro: { nombre: 'Gris Grafito', hex: '#6D6D6D' } },
  ],
};

const FALLBACK: PaletaSet = [
  { primario: { nombre: 'Azul Corporativo', hex: '#1E3A5F' }, secundario: { nombre: 'Blanco', hex: '#FFFFFF' }, acento: { nombre: 'Naranja', hex: '#FF6B35' }, neutro: { nombre: 'Gris', hex: '#9E9E9E' } },
  { primario: { nombre: 'Verde Esmeralda', hex: '#10B981' }, secundario: { nombre: 'Blanco Roto', hex: '#F9FAFB' }, acento: { nombre: 'Índigo', hex: '#4F46E5' }, neutro: { nombre: 'Gris Medio', hex: '#6B7280' } },
  { primario: { nombre: 'Morado', hex: '#7C3AED' }, secundario: { nombre: 'Lavanda Claro', hex: '#F5F3FF' }, acento: { nombre: 'Rosa Fuerte', hex: '#EC4899' }, neutro: { nombre: 'Gris Oscuro', hex: '#374151' } },
];

export function obtenerTodasLasPaletas(estiloVisual: string): PaletaSet {
  return PALETAS[estiloVisual] ?? FALLBACK;
}

export function obtenerPaleta(estiloVisual: string, seleccion: 'A' | 'B' | 'C'): PaletaColores {
  const idx = seleccion === 'A' ? 0 : seleccion === 'B' ? 1 : 2;
  return obtenerTodasLasPaletas(estiloVisual)[idx];
}
