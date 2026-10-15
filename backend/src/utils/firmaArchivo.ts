/**
 * Comprueba que el CONTENIDO de un archivo subido sea de la familia que dice ser.
 *
 * Multer solo ve el tipo y el nombre que manda el navegador, y los dos se
 * falsean: un HTML o un script renombrado a `foto.png` con `image/png` pasaba
 * los filtros y se publicaba en S3. Aquí se leen los primeros bytes (la
 * «firma» de cada formato) después de recibir el archivo.
 *
 * Se compara la FAMILIA (imagen, vídeo, audio, PDF) y no el formato exacto: un
 * JPG con extensión .png sigue siendo una imagen inofensiva, y los contenedores
 * de vídeo y audio comparten firmas (MP4/M4A, WebM).
 */

type Familia = 'image' | 'video' | 'audio' | 'pdf';

const ascii = (b: Buffer, desde: number, texto: string) =>
  b.length >= desde + texto.length && b.toString('latin1', desde, desde + texto.length) === texto;

const esJpeg = (b: Buffer) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const esPng = (b: Buffer) => ascii(b, 0, '\x89PNG\r\n\x1a\n');
const esGif = (b: Buffer) => ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a');
const esWebp = (b: Buffer) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP');
/** MP4, MOV, M4V, M4A, 3GP: contenedor ISO (caja `ftyp`) o QuickTime antiguo. */
const esIsoBmff = (b: Buffer) => ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].some((caja) => ascii(b, 4, caja));
/** WebM / Matroska (cabecera EBML). */
const esWebm = (b: Buffer) => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
/** MP3 (etiqueta ID3 o sincronía de cuadro MPEG) y AAC en ADTS. */
const esMpegAudio = (b: Buffer) => ascii(b, 0, 'ID3') || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
const esOgg = (b: Buffer) => ascii(b, 0, 'OggS');
const esWav = (b: Buffer) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE');
const esFlac = (b: Buffer) => ascii(b, 0, 'fLaC');
const esPdf = (b: Buffer) => ascii(b, 0, '%PDF-');

const FIRMAS: Record<Familia, ((b: Buffer) => boolean)[]> = {
  image: [esJpeg, esPng, esGif, esWebp],
  video: [esIsoBmff, esWebm],
  audio: [esMpegAudio, esIsoBmff, esWebm, esOgg, esWav, esFlac],
  pdf: [esPdf],
};

function familiaDeclarada(mimetype: string): Familia | null {
  const mime = mimetype.split(';')[0].trim().toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  const base = mime.split('/')[0];
  return base === 'image' || base === 'video' || base === 'audio' ? base : null;
}

/**
 * true si los primeros bytes corresponden a un formato de la familia declarada.
 * Un tipo declarado fuera de las familias conocidas no se valida aquí (lo
 * rechazan antes los filtros de cada subida).
 */
export function contenidoCoincideConTipo(buffer: Buffer | undefined, mimetype: string): boolean {
  const familia = familiaDeclarada(mimetype);
  if (!familia) return true;
  if (!buffer || buffer.length < 4) return false;
  return FIRMAS[familia].some((firma) => firma(buffer));
}

type ArchivoMulter = { buffer?: Buffer; mimetype: string; fieldname: string };

/**
 * Revisa todos los archivos de la petición (`req.file` y `req.files`). Devuelve
 * el nombre del campo del primero que no coincide, o null si todos están bien.
 */
export function campoConFirmaInvalida(req: { file?: ArchivoMulter; files?: unknown }): string | null {
  const archivos: ArchivoMulter[] = [];
  if (req.file) archivos.push(req.file);
  if (Array.isArray(req.files)) archivos.push(...(req.files as ArchivoMulter[]));
  else if (req.files && typeof req.files === 'object') {
    for (const lista of Object.values(req.files as Record<string, ArchivoMulter[]>)) archivos.push(...lista);
  }
  const malo = archivos.find((a) => a.buffer && !contenidoCoincideConTipo(a.buffer, a.mimetype));
  return malo ? malo.fieldname : null;
}

export const MENSAJE_FIRMA_INVALIDA = 'El contenido del archivo no corresponde a su tipo. Sube el archivo original sin renombrarlo.';
