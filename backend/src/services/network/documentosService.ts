import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';

/**
 * Almacenamiento del documento de acreditación de un experto.
 *
 * Esto NO usa `StorageService` a propósito. Ese servicio devuelve una URL
 * pública —en dev sirve `/uploads/**` como estático, y en producción escribe en
 * un bucket que se sirve por CDN—, y ahí no puede acabar la cédula profesional
 * de nadie: bastaría con tener el enlace para verla, sin sesión y sin ser admin.
 *
 * Aquí el fichero se guarda bajo una carpeta que NO se sirve estáticamente, y
 * en la ficha se guarda la clave (`documentos/<uuid>.pdf`), no una URL. El
 * único camino para leerlo es el endpoint de admin, que comprueba la sesión
 * antes de devolver un solo byte.
 *
 * En producción va a S3 con la misma cuenta que el resto, pero el objeto no se
 * sirve nunca por su URL: se lee desde el backend y se reenvía al admin.
 */

const isProd = process.env.NODE_ENV === 'production';

/**
 * Carpeta de documentos privados, DELIBERADAMENTE fuera de `UPLOADS_DIR`: ese
 * directorio entero se publica como estático en desarrollo.
 */
const DIR_PRIVADO =
  process.env.DOCUMENTOS_DIR || path.join(process.cwd(), 'almacen-privado');

const PREFIJO = 'documentos';

/** Extensiones admitidas. Una cédula es un PDF o una foto, nada más. */
export const EXTENSIONES_DOCUMENTO = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);

const TIPO_POR_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Una clave válida es exactamente `documentos/<nombre>.<ext>`.
 *
 * Se comprueba con una expresión regular anclada y sin barras en el nombre, no
 * con un `startsWith`: la clave llega desde la base de datos y termina en una
 * ruta de fichero, así que `documentos/../../etc/passwd` tiene que rebotar aquí.
 */
const CLAVE_VALIDA = /^documentos\/[A-Za-z0-9._-]+$/;

export function esClaveDocumento(clave: string | null | undefined): boolean {
  return typeof clave === 'string' && CLAVE_VALIDA.test(clave) && !clave.includes('..');
}

async function clienteS3() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

/**
 * Guarda el documento y devuelve su clave interna.
 *
 * Lo que se devuelve NO es una URL y no debe tratarse como tal: guardarlo en
 * `expertos.documento_url` es lo que hace que el dato sea inútil para quien lo
 * obtenga sin pasar por el endpoint de admin.
 */
export async function guardarDocumento(
  buffer: Buffer,
  nombreOriginal: string,
  mimetype: string
): Promise<string> {
  const ext = path.extname(nombreOriginal).toLowerCase();
  if (!EXTENSIONES_DOCUMENTO.has(ext)) {
    throw new Error('Formato de documento no admitido');
  }

  const nombre = `${uuidv4()}${ext}`;
  const clave = `${PREFIJO}/${nombre}`;

  if (isProd) {
    const faltantes = ['AWS_BUCKET_NAME', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'].filter(
      (k) => !process.env[k]
    );
    if (faltantes.length > 0) {
      // Igual que en StorageService: antes rechazar la subida que guardarla en
      // un disco que el siguiente despliegue se lleva por delante.
      throw new Error(
        `[documentos] Almacenamiento mal configurado en producción. Faltan: ${faltantes.join(', ')}.`
      );
    }
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = await clienteS3();
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: clave,
        Body: buffer,
        ContentType: mimetype,
      })
    );
    return clave;
  }

  const destino = path.join(DIR_PRIVADO, PREFIJO);
  await fs.promises.mkdir(destino, { recursive: true });
  await fs.promises.writeFile(path.join(destino, nombre), buffer);
  return clave;
}

export interface DocumentoLeido {
  buffer: Buffer;
  tipo: string;
  nombre: string;
}

/** Lee el documento para reenviarlo. Devuelve `null` si ya no está. */
export async function leerDocumento(clave: string): Promise<DocumentoLeido | null> {
  if (!esClaveDocumento(clave)) return null;

  const nombre = path.basename(clave);
  const tipo = TIPO_POR_EXTENSION[path.extname(nombre).toLowerCase()] ?? 'application/octet-stream';

  if (isProd) {
    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = await clienteS3();
      const salida = await s3.send(
        new GetObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: clave })
      );
      const trozos: Buffer[] = [];
      for await (const trozo of salida.Body as AsyncIterable<Uint8Array>) {
        trozos.push(Buffer.from(trozo));
      }
      return { buffer: Buffer.concat(trozos), tipo, nombre };
    } catch (e) {
      logger.error(`[documentos] no se pudo leer ${clave}:`, e);
      return null;
    }
  }

  try {
    const ruta = path.join(DIR_PRIVADO, PREFIJO, nombre);
    return { buffer: await fs.promises.readFile(ruta), tipo, nombre };
  } catch {
    return null;
  }
}

export interface DocumentoAlmacenado {
  clave: string;
  modificado: Date;
}

/**
 * Todos los documentos que hay en el almacén, con su fecha.
 *
 * Existe para encontrar huérfanos: una ficha borrada por un camino que no pasa
 * por la ruta de baja —la cascada de `ON DELETE CASCADE` al borrar la cuenta, un
 * `DELETE` manual en SQL— elimina la fila pero no el fichero, y la cédula queda
 * guardada sin que nada la referencie. La fecha permite no tocar lo que se está
 * subiendo en ese momento.
 */
export async function listarClaves(): Promise<DocumentoAlmacenado[]> {
  if (isProd) {
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const s3 = await clienteS3();
    const claves: DocumentoAlmacenado[] = [];
    let token: string | undefined;
    do {
      const pagina = await s3.send(
        new ListObjectsV2Command({
          Bucket: process.env.AWS_BUCKET_NAME,
          Prefix: `${PREFIJO}/`,
          ContinuationToken: token,
        })
      );
      for (const obj of pagina.Contents ?? []) {
        if (obj.Key && esClaveDocumento(obj.Key)) {
          claves.push({ clave: obj.Key, modificado: obj.LastModified ?? new Date() });
        }
      }
      token = pagina.IsTruncated ? pagina.NextContinuationToken : undefined;
    } while (token);
    return claves;
  }

  try {
    const dir = path.join(DIR_PRIVADO, PREFIJO);
    const nombres = await fs.promises.readdir(dir);
    const salida: DocumentoAlmacenado[] = [];
    for (const n of nombres) {
      const clave = `${PREFIJO}/${n}`;
      if (!esClaveDocumento(clave)) continue;
      const info = await fs.promises.stat(path.join(dir, n));
      salida.push({ clave, modificado: info.mtime });
    }
    return salida;
  } catch {
    return [];
  }
}

/**
 * Borra el documento. Best-effort: que falle la limpieza no puede tumbar la
 * operación que la provocó (sustituir el documento, darse de baja).
 */
export async function borrarDocumento(clave: string | null | undefined): Promise<void> {
  if (!clave || !esClaveDocumento(clave)) return;

  try {
    if (isProd) {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = await clienteS3();
      await s3.send(
        new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: clave })
      );
      return;
    }
    await fs.promises.unlink(path.join(DIR_PRIVADO, PREFIJO, path.basename(clave)));
  } catch (e) {
    logger.warn(`[documentos] no se pudo borrar ${clave}: ${(e as Error).message}`);
  }
}
