import { randomUUID as uuidv4 } from 'crypto';
import fs from 'fs';
import { logger } from '../utils/logger';
import path from 'path';

const isProd = process.env.NODE_ENV === 'production';
const TEMP_UPLOADS =
  process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

/**
 * Carpeta lógica del objeto. Es el ÚNICO eje que cambia entre tipos de media:
 * la lógica de subida/borrado (S3 en prod, disco emulado en dev) es idéntica,
 * así que se parametriza en lugar de duplicar la clase.
 */
export type PrefijoStorage = 'images' | 'videos' | 'audio';

const PREFIJOS: ReadonlySet<string> = new Set<PrefijoStorage>(['images', 'videos', 'audio']);

function esPrefijo(valor: string | undefined): valor is PrefijoStorage {
  return valor !== undefined && PREFIJOS.has(valor);
}

export class StorageService {
  private static s3ClientInstance: any = null;

  private static async getS3Client(): Promise<any> {
    if (!StorageService.s3ClientInstance) {
      const { S3Client } = await import('@aws-sdk/client-s3');
      StorageService.s3ClientInstance = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });
    }
    return StorageService.s3ClientInstance;
  }

  /**
   * Sube un archivo a S3 si estamos en producción y existen credenciales.
   * Si estamos en local (Dev), lo guarda de manera emulada en el disco.
   * Retorna la URL (pública de S3 o del endpoint estático localhost)
   *
   * `prefijo` decide la carpeta lógica (Key en S3 / subdirectorio en dev).
   * Por defecto 'images' para no cambiar el comportamiento de los callers
   * existentes (productos.ts).
   */
  static async uploadFile(
    buffer: Buffer,
    originalname: string,
    mimetype: string,
    prefijo: PrefijoStorage = 'images'
  ): Promise<string> {
    const ext = path.extname(originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    
    // MODO PRODUCCIÓN: el almacenamiento DEBE ser S3/R2. Nunca disco efímero
    // (en Railway/contenedores se borra en cada redeploy → pérdida silenciosa).
    if (isProd) {
      const faltantes = [
        'AWS_BUCKET_NAME',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_BUCKET_URL_BASE',
      ].filter((k) => !process.env[k]);

      if (faltantes.length > 0) {
        // Fallo ruidoso: preferimos rechazar la subida a guardarla en disco
        // efímero y que el usuario la pierda sin enterarse.
        throw new Error(
          `[STORAGE] Almacenamiento de objetos mal configurado en producción. ` +
            `Faltan: ${faltantes.join(', ')}. Subida rechazada (no se usa disco efímero).`
          );
  }

      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const s3Client = await StorageService.getS3Client();

      // Sin ACL: Block Public Access rechaza ACLs por objeto
      // (AccessControlListNotSupported). La visibilidad pública se gestiona
      // con bucket policy / CDN, no aquí.
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: `${prefijo}/${uniqueName}`,
          Body: buffer,
          ContentType: mimetype,
        })
      );

      // Si la subida falla, el error se propaga al caller (productos.ts) en vez
      // de degradar en silencio a disco local.
      return `${process.env.AWS_BUCKET_URL_BASE}/${prefijo}/${uniqueName}`;
    }

    // MODO EMULADOR LOCAL DEV
    if (isProd === false) {
      logger.debug(`[STORAGE] Dev mode: saving to ${TEMP_UPLOADS}`  );
  }

    try {
      if (!fs.existsSync(TEMP_UPLOADS)) {
        fs.mkdirSync(TEMP_UPLOADS, { recursive: true });
        if (isProd === false) {
          logger.debug(`[STORAGE] Created directory: ${TEMP_UPLOADS}`  );
  }
      }
      
      // Mismo layout que en prod (`{prefijo}/{uuid.ext}`) para que las URL de
      // dev y prod solo difieran en el host, y deleteFile pueda deducir el
      // prefijo desde la propia URL en ambos entornos.
      const destDir = path.join(TEMP_UPLOADS, prefijo);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const localPath = path.join(destDir, uniqueName);
      await fs.promises.writeFile(localPath, buffer);
      
      if (isProd === false) {
        logger.debug(`[STORAGE] File saved: ${localPath} (${buffer.length} bytes)`  );
  }
      
      const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
      return `${BASE_URL}/uploads/${prefijo}/${uniqueName}`;
    } catch (error) {
      logger.error(`[STORAGE] Failed to save file locally:`, error);
      throw error;
    }
  }

  /**
   * Borra un archivo previamente subido a partir de su URL pública.
   * BEST-EFFORT: nunca lanza — un fallo al limpiar el archivo anterior no debe
   * abortar la subida del nuevo. Solo registra el error.
   *
   * - Prod: DeleteObjectCommand sobre la Key `{prefijo}/{nombre}`.
   * - Dev:  fs.unlink sobre TEMP_UPLOADS/{prefijo}/{nombre}.
   *
   * El prefijo se DEDUCE de la URL (segmento anterior al nombre) para que los
   * callers no tengan que recordarlo; `prefijo` solo hace falta si la URL no lo
   * contiene. Las URL antiguas de dev (planas, sin prefijo) siguen borrándose:
   * ver los candidatos de ruta más abajo.
   */
  static async deleteFile(
    url: string | null | undefined,
    prefijo?: PrefijoStorage
  ): Promise<void> {
    if (!url) return;

    // El nombre de archivo es siempre el último segmento de la ruta, tanto en
    // `.../images/{uuid.ext}` (S3) como en `.../uploads/{uuid.ext}` (dev legacy).
    // Se descarta la query string (?v=…) antes de partir.
    const segmentos = url.split('?')[0].split('/').filter(Boolean);
    const filename = path.basename(segmentos.pop() ?? '');
    if (!filename) return;

    const deducido = segmentos.pop();
    const prefijoFinal: PrefijoStorage = prefijo ?? (esPrefijo(deducido) ? deducido : 'images');

    try {
      if (isProd) {
        if (!process.env.AWS_BUCKET_NAME) return; // storage no configurado: nada que borrar
        const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        const s3Client = await StorageService.getS3Client();
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `${prefijoFinal}/${filename}`,
          })
        );
        return;
      }

      // Dev: borrado del disco emulado. Si no existe, fs.unlink lanza ENOENT
      // que atrapamos y descartamos.
      const candidatos = [
        path.join(TEMP_UPLOADS, prefijoFinal, filename),
        path.join(TEMP_UPLOADS, filename), // legacy: dev guardaba plano, sin prefijo
      ];
      const localPath = candidatos.find((p) => fs.existsSync(p)) ?? candidatos[0];
      await fs.promises.unlink(localPath  );
  } catch (error) {
       // Silent fail for cleanup (best-effort)
       if (process.env.NODE_ENV !== 'production') {
         logger.debug(`[STORAGE] Could not delete old file (${filename}):`, error  );
  }
     }
  }
}
