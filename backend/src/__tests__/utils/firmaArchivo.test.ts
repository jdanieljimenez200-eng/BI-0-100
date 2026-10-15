import { campoConFirmaInvalida, contenidoCoincideConTipo } from '../../utils/firmaArchivo';

const b = (...bytes: number[]) => Buffer.from(bytes);
const txt = (s: string) => Buffer.from(s, 'latin1');

const JPG = b(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const PNG = txt('\x89PNG\r\n\x1a\n\0\0\0\rIHDR');
const GIF = txt('GIF89a\x01\0\x01\0');
const WEBP = txt('RIFF\x24\0\0\0WEBPVP8 ');
const MP4 = txt('\0\0\0\x18ftypmp42\0\0\0\0');
const MOV = txt('\0\0\0\x14ftypqt  \0\0\0\0');
const WEBM = b(0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42);
const MP3_ID3 = txt('ID3\x04\0\0\0\0\0\0');
const MP3_SYNC = b(0xff, 0xfb, 0x90, 0x64);
const OGG = txt('OggS\0\x02\0\0');
const WAV = txt('RIFF\x24\0\0\0WAVEfmt ');
const FLAC = txt('fLaC\0\0\0\x22');
const PDF = txt('%PDF-1.4\n');
const HTML = txt('<!doctype html><script>alert(1)</script>');
const SVG = txt('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">');
const EXE = txt('MZ\x90\0\x03\0\0\0');

describe('firma del contenido de los archivos subidos', () => {
  it('acepta cada formato real en su familia', () => {
    for (const [buf, mime] of [
      [JPG, 'image/jpeg'], [PNG, 'image/png'], [GIF, 'image/gif'], [WEBP, 'image/webp'],
      [MP4, 'video/mp4'], [MOV, 'video/quicktime'], [WEBM, 'video/webm'],
      [MP3_ID3, 'audio/mpeg'], [MP3_SYNC, 'audio/mpeg'], [OGG, 'audio/ogg'], [WAV, 'audio/wav'],
      [FLAC, 'audio/flac'], [MP4, 'audio/mp4'], [WEBM, 'audio/webm;codecs=opus'],
      [PDF, 'application/pdf'],
    ] as const) {
      expect(contenidoCoincideConTipo(buf, mime)).toBe(true);
    }
  });

  it('una imagen con la extensión de otra sigue siendo imagen (no se rechaza)', () => {
    expect(contenidoCoincideConTipo(JPG, 'image/png')).toBe(true);
  });

  it('rechaza HTML, SVG o ejecutables disfrazados de imagen, vídeo, audio o PDF', () => {
    for (const disfrazado of [HTML, SVG, EXE]) {
      for (const mime of ['image/png', 'image/jpeg', 'video/mp4', 'audio/mpeg', 'application/pdf']) {
        expect(contenidoCoincideConTipo(disfrazado, mime)).toBe(false);
      }
    }
  });

  it('rechaza un PDF declarado como imagen y una imagen declarada como vídeo', () => {
    expect(contenidoCoincideConTipo(PDF, 'image/png')).toBe(false);
    expect(contenidoCoincideConTipo(PNG, 'video/mp4')).toBe(false);
  });

  it('rechaza archivos vacíos o de menos de 4 bytes', () => {
    expect(contenidoCoincideConTipo(Buffer.alloc(0), 'image/png')).toBe(false);
    expect(contenidoCoincideConTipo(b(0xff, 0xd8), 'image/jpeg')).toBe(false);
  });

  it('revisa req.file y req.files (por campo o en lista) y dice qué campo falló', () => {
    expect(campoConFirmaInvalida({ file: { buffer: PNG, mimetype: 'image/png', fieldname: 'avatar' } })).toBeNull();
    expect(campoConFirmaInvalida({
      files: {
        audio: [{ buffer: MP3_ID3, mimetype: 'audio/mpeg', fieldname: 'audio' }],
        video: [{ buffer: HTML, mimetype: 'video/mp4', fieldname: 'video' }],
      },
    })).toBe('video');
    expect(campoConFirmaInvalida({ files: [{ buffer: SVG, mimetype: 'image/png', fieldname: 'foto' }] })).toBe('foto');
    expect(campoConFirmaInvalida({})).toBeNull();
  });
});
