import * as fs from 'fs';
import * as path from 'path';

/**
 * Contrato entre los formularios del frontend y los schemas del backend.
 *
 * Motivo: **Zod hace `strip` por defecto**. Si el front envía una clave que el
 * schema no declara, se descarta sin error, sin log y sin 400 — el usuario
 * rellena un campo y el dato desaparece. Así se perdieron durante meses los ~15
 * campos de negocio del alta de producto.
 *
 * Este test recorre las llamadas `api.post/put/patch` del frontend, extrae las
 * claves de primer nivel del payload y comprueba que el schema Zod de esa ruta
 * las declare.
 *
 * El parser es deliberadamente conservador: ante la duda, ignora la llamada en
 * vez de inventar un fallo. Un test que grita en falso se acaba desactivando, y
 * entonces no protege de nada.
 */

const RAIZ = path.resolve(__dirname, '../../..', '..');
const FRONTEND = process.env.FRONTEND_DIR || path.join(RAIZ, 'frontend');
const frontendExiste = fs.existsSync(FRONTEND);
const ROUTES = path.resolve(__dirname, '../../routes');

/**
 * Alias aceptados a propósito. Cada entrada es una decisión, no un descuido:
 * el backend los resuelve explícitamente.
 */
const ALIAS_PERMITIDOS: Record<string, string[]> = {
  // El handler de auth lee `req.body.name || req.body.nombre`.
  'auth': ['name'],
  // Los schemas de análisis aceptan camelCase y snake_case del mismo dato.
  'marketing': ['mercadoId', 'briefAnalisisId', 'ventasAnalisisId'],
  'mercado': ['canalAdquisicion'],
};

/**
 * Endpoints concretos que NO pasan por `validateBody(Schema)` y leen `req.body`
 * a mano. No son descuidos: el dato sí se consume. Cada uno lleva su motivo.
 */
const RUTAS_SIN_ZOD: { patron: RegExp; motivo: string }[] = [
  {
    patron: /^\/contabilidad\/[^/]+\/import$/,
    motivo: 'importación masiva: valida fila a fila con validateRow(), no con Zod',
  },
  {
    patron: /^\/nomina\/empleados\/[^/]+$/,
    motivo: 'PATCH parcial de activación',
  },
  {
    patron: /^\/pos\/catalogo\/[^/]+$/,
    motivo: 'PATCH parcial con lista `updatable` en el handler',
  },
];

/** Rutas cuyo body no se valida con Zod (validación manual o multipart). */
const SIN_SCHEMA_ZOD = new Set([
  'productos',   // multipart/form-data, saneado con parseCamposNegocio
  'ventas',      // validación manual en el propio handler
  'marca', 'dashboard', 'admin', 'billing', 'equipo', 'config', 'analytics',
  'calendario', 'clientes', 'inventario', 'metas', 'perfiles', 'auth',
  'herramientas', 'negocios', 'brief',
]);

interface Llamada {
  archivo: string;
  ruta: string;
  claves: string[];
}

/**
 * Neutraliza comentarios y literales de texto.
 *
 * Sin esto, un comentario como `// Excluyentes: o cliente_id o crear_cliente`
 * y un `scope === 'local'` se leían como claves del payload y producían fallos
 * fantasma. Se sustituyen por espacios para no mover ningún índice.
 */
function limpiar(src: string): string {
  const NL = String.fromCharCode(10);
  let out = '';
  let i = 0;
  while (i < src.length) {
    const dos = src.slice(i, i + 2);
    if (dos === '//') {
      while (i < src.length && src[i] !== NL) { out += ' '; i++; }
    } else if (dos === '/*') {
      while (i < src.length && src.slice(i, i + 2) !== '*/') {
        out += src[i] === NL ? NL : ' ';
        i++;
      }
      out += '  ';
      i += 2;
    } else if (src[i] === "'" || src[i] === '"' || src[i] === '`') {
      const cierre = src[i];
      // Se conservan las comillas (el regex que localiza la ruta las necesita);
      // solo se vacía el contenido.
      out += cierre;
      i++;
      while (i < src.length && src[i] !== cierre) {
        if (src[i] === String.fromCharCode(92)) { out += '  '; i += 2; continue; }
        out += src[i] === NL ? NL : ' ';
        i++;
      }
      out += cierre;
      i++;
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

/** Recorre llaves balanceadas desde la posición de `{`. */
function bloque(src: string, desde: number): string {
  let prof = 0;
  for (let i = desde; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') {
      prof--;
      if (prof === 0) return src.slice(desde, i + 1);
    }
  }
  return '';
}

/** Claves de primer nivel de un objeto literal, ignorando anidados. */
function clavesDePrimerNivel(cuerpo: string): string[] {
  const claves: string[] = [];
  let prof = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    const ch = cuerpo[i];
    if (ch === '{' || ch === '[' || ch === '(') prof++;
    else if (ch === '}' || ch === ']' || ch === ')') prof--;
    else if (prof === 1) {
      const m = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/.exec(cuerpo.slice(i));
      if (m && (i === 0 || ',{\n '.includes(cuerpo[i - 1]))) claves.push(m[1]);
    }
  }
  return [...new Set(claves)];
}

function listarTsx(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') listarTsx(p, acc);
    } else if (entry.name.endsWith('.tsx')) {
      acc.push(p);
    }
  }
  return acc;
}

function recolectarLlamadas(): Llamada[] {
  const out: Llamada[] = [];
  for (const archivo of listarTsx(path.join(FRONTEND, 'app')).concat(
    listarTsx(path.join(FRONTEND, 'components')),
  )) {
    const original = fs.readFileSync(archivo, 'utf8');
    const src = limpiar(original);
    // La ruta se lee del archivo ORIGINAL (limpiar() vacía los strings), pero
    // las posiciones coinciden porque la limpieza conserva la longitud.
    const re = /api\.(?:post|put|patch)\(\s*[`'"][^`'"]*[`'"]\s*,\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const rutaM = /[`'"]([^`'"]+)[`'"]/.exec(original.slice(m.index, m.index + m[0].length));
      if (!rutaM) continue;
      const cuerpo = bloque(src, m.index + m[0].length - 1);
      if (!cuerpo) continue;
      const claves = clavesDePrimerNivel(cuerpo);
      if (claves.length > 0) {
        out.push({ archivo: path.relative(FRONTEND, archivo), ruta: rutaM[1], claves });
      }
    }
  }
  return out;
}

/** Módulo de backend al que pertenece una ruta del front ('/marketing/x' → 'marketing'). */
function moduloDe(ruta: string): string {
  return ruta.replace(/^\/+/, '').split(/[/?]/)[0].replace(/\$\{.*/, '');
}

/** Todas las claves declaradas en los schemas Zod de un archivo de rutas. */
function clavesDeSchemas(modulo: string): Set<string> | null {
  const archivo = path.join(ROUTES, `${modulo}.ts`);
  if (!fs.existsSync(archivo)) return null;
  const src = limpiar(fs.readFileSync(archivo, 'utf8'));
  const claves = new Set<string>();
  const re = /z\s*\.?\s*object\(\{/g;
  let m: RegExpExecArray | null;
  let hubo = false;
  while ((m = re.exec(src)) !== null) {
    hubo = true;
    const cuerpo = bloque(src, m.index + m[0].length - 1);
    for (const c of clavesDePrimerNivel(cuerpo)) claves.add(c);
  }
  return hubo ? claves : null;
}

describe('contrato formularios ↔ schemas', () => {
  const llamadas = frontendExiste ? recolectarLlamadas() : [];

  it('encuentra formularios que analizar', () => {
    if (!frontendExiste) {
      console.warn('[contratos/formularios] Directorio frontend no presente en este entorno. Prueba omitida.');
      return;
    }
    // Si el parser deja de encontrar llamadas (por un refactor del cliente HTTP),
    // el test pasaría en verde sin comprobar nada. Esto lo delata.
    expect(llamadas.length).toBeGreaterThan(10);
  });

  it('ninguna clave enviada se descarta en silencio por Zod', () => {
    if (!frontendExiste) return;
    const problemas: string[] = [];

    for (const { archivo, ruta, claves } of llamadas) {
      const modulo = moduloDe(ruta);
      if (SIN_SCHEMA_ZOD.has(modulo)) continue;

      // La ruta trae `${...}` de los template literals; se normaliza a un
      // segmento cualquiera para poder compararla con los patrones.
      const rutaNormalizada = ruta.replace(/\$\{[^}]*\}/g, ':id');
      if (RUTAS_SIN_ZOD.some((r) => r.patron.test(rutaNormalizada))) continue;

      const declaradas = clavesDeSchemas(modulo);
      if (!declaradas) continue; // sin schema Zod: nada que contrastar

      const permitidas = new Set([...(ALIAS_PERMITIDOS[modulo] ?? [])]);
      const huerfanas = claves.filter((c) => !declaradas.has(c) && !permitidas.has(c));

      if (huerfanas.length > 0) {
        problemas.push(
          `${archivo}\n    POST ${ruta} → el schema de "${modulo}" no declara: ${huerfanas.join(', ')}`,
        );
      }
    }

    if (problemas.length > 0) {
      throw new Error(
        'Hay campos que el frontend envía y el backend descarta sin avisar.\n' +
          'Añádelos al schema Zod, o quítalos del formulario si no se usan:\n\n  ' +
          problemas.join('\n  '),
      );
    }
  });
});
