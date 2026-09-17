import { Router, Request, Response, NextFunction } from 'express';
import { exigirUuid } from '../middleware/validate';
import multer from 'multer';
import { AppDataSource } from '../config/database';
import { Producto } from '../models/Producto';
import { authenticate } from '../middleware/auth';
import { requireCanAddProducto } from '../middleware/requirePlan';
import { logger } from '../utils/logger';
import { upload, recibirVideo } from '../middleware/upload';
import { StorageService } from '../services/StorageService';

const router = Router();
exigirUuid(router, 'id');

function parsePrecio(raw: unknown): number {
  const n = parseFloat(String(raw ?? ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}


/**
 * Campos de negocio del alta, saneados desde `multipart/form-data`.
 *
 * Todo llega como string, así que hay dos trampas que este helper evita:
 *
 * 1. Un campo vacío (`''`) NO puede convertirse en 0. Un 0 se lee como un dato
 *    real ("costos fijos = 0") y contamina los análisis; `undefined` deja la
 *    columna en NULL y las pantallas muestran "no registrado".
 * 2. Un número inválido se descarta en vez de guardarse como NaN.
 *
 * Devuelve solo las claves presentes, para poder hacer `Object.assign` tanto al
 * crear como al editar sin borrar lo que ya estaba.
 */
const CAMPOS_TEXTO = [
  'tipo_actividad', 'estatus_proyecto', 'cobertura', 'canal_venta', 'modelo_cobro',
  'canal_adquisicion', 'direccion', 'puv', 'cliente_ideal',
] as const;

const CAMPOS_NUMERO = [
  'radio_km', 'ltv_meses', 'clientes_mes', 'tamano_equipo',
  'precio_suscripcion', 'inversion_inicial', 'costos_fijos', 'tasa_repeticion',
] as const;

export function parseCamposNegocio(body: Record<string, unknown>): Partial<Producto> {
  const out: Record<string, unknown> = {};

  // El wizard envía el campo como `tipo`; en la tabla es `tipo_actividad`.
  if (!body.tipo_actividad && typeof body.tipo === 'string' && body.tipo.trim()) {
    out.tipo_actividad = body.tipo.trim();
  }

  for (const campo of CAMPOS_TEXTO) {
    const v = body[campo];
    if (typeof v === 'string' && v.trim()) out[campo] = v.trim();
  }

  for (const campo of CAMPOS_NUMERO) {
    const raw = body[campo];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const n = Number(String(raw).replace(/,/g, ''));
    if (Number.isFinite(n) && n >= 0) out[campo] = n;
  }

  return out as Partial<Producto>;
}

router.post('/', authenticate, requireCanAddProducto(), upload.single('image'), async (req: any, res: Response) => {
  try {
    const { nombre, descripcion, precio, precio_objetivo, categoria } = req.body;
    const usuarioId = req.userId;

    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'El nombre del producto es requerido' });
    }

    let imagen_url: string | undefined = undefined;
    if (req.file?.buffer) {
      try {
        imagen_url = await StorageService.uploadFile(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype
        );
      } catch (err) {
        logger.error('[productos] Falló la subida de imagen:', err);
        return res.status(500).json({ error: 'No se pudo guardar la imagen del producto' });
      }
    }

    const productoRepo = AppDataSource.getRepository(Producto);
    const producto = productoRepo.create({
      nombre: String(nombre).trim(),
      descripcion: descripcion || '',
      precio: parsePrecio(precio ?? precio_objetivo),
      categoria: categoria || '',
      usuario_id: usuarioId,
      status: 'activo',
      imagen_url,
      // Contexto para TAM por país / DENUE / Banco Mundial y segmentación NSE
      pais: typeof req.body.pais === 'string' && req.body.pais.trim() ? req.body.pais.trim().slice(0, 2).toUpperCase() : undefined,
      nse: typeof req.body.nse === 'string' && req.body.nse.trim() ? req.body.nse.trim().slice(0, 50) : undefined,
      // El wizard ya enviaba negocio_id; hasta ahora se descartaba en silencio.
      negocio_id: typeof req.body.negocio_id === 'string' && req.body.negocio_id.trim()
        ? req.body.negocio_id.trim()
        : undefined,
      // Contexto de negocio del alta: lo que el usuario contestó en los 5 pasos.
      ...parseCamposNegocio(req.body),
    });

    await productoRepo.save(producto);

    res.status(201).json({ id: producto.id, message: 'Producto creado exitosamente', producto });
  } catch (err) {
    logger.error('POST /api/productos error:', err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

router.get('/', authenticate, async (req: any, res: Response) => {
  try {
    const usuarioId = req.userId;

    const productos = await AppDataSource.getRepository(Producto).find({
      where: { usuario_id: usuarioId },
      order: { created_at: 'DESC' },
    });

    res.json(productos);
  } catch (err) {
    logger.error('GET /api/productos error:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

router.get('/count', authenticate, async (req: any, res: Response) => {
  try {
    const usuarioId = req.userId;

    const count = await AppDataSource.getRepository(Producto).count({
      where: { usuario_id: usuarioId },
    });

    res.json({ count });
  } catch (err) {
    logger.error('GET /api/productos/count error:', err);
    res.status(500).json({ error: 'Error al obtener conteo' });
  }
});

// GET /:id — declarado DESPUÉS de /count para que Express no lo sombree
router.get('/:id', authenticate, async (req: any, res: Response) => {
  try {
    const id = req.params.id;
    const usuarioId = req.userId;

    const producto = await AppDataSource.getRepository(Producto).findOne({
      where: { id, usuario_id: usuarioId },
    });

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(producto);
  } catch (err) {
    logger.error('GET /api/productos/:id error:', err);
    res.status(500).json({ error: 'Error al obtener producto' });
  }
});

router.put('/:id', authenticate, upload.single('image'), async (req: any, res: Response) => {
  try {
    const id = req.params.id;
    const usuarioId = req.userId;

    const productoRepo = AppDataSource.getRepository(Producto);
    const producto = await productoRepo.findOne({
      where: { id, usuario_id: usuarioId },
    });

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Update fields
    if (req.body.nombre) producto.nombre = String(req.body.nombre).trim();
    if (req.body.descripcion !== undefined) producto.descripcion = req.body.descripcion;
    if (req.body.precio) producto.precio = parsePrecio(req.body.precio);
    else if (req.body.precio_objetivo) producto.precio = parsePrecio(req.body.precio_objetivo);
    if (req.body.categoria) producto.categoria = req.body.categoria;
    if (typeof req.body.pais === 'string' && req.body.pais.trim())
      producto.pais = req.body.pais.trim().slice(0, 2).toUpperCase();
    if (typeof req.body.nse === 'string' && req.body.nse.trim())
      producto.nse = req.body.nse.trim().slice(0, 50);
    if (typeof req.body.negocio_id === 'string' && req.body.negocio_id.trim())
      producto.negocio_id = req.body.negocio_id.trim();
    // Solo pisa las claves presentes: editar el nombre no borra la inversión.
    Object.assign(producto, parseCamposNegocio(req.body));

    if (req.file?.buffer) {
      const nuevaUrl = await StorageService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
      // Best-effort: borrar la imagen anterior para no acumular huérfanos
      if (producto.imagen_url) {
        StorageService.deleteFile(producto.imagen_url).catch(() => {});
      }
      producto.imagen_url = nuevaUrl;
    }

    await productoRepo.save(producto);

    res.json({ message: 'Producto actualizado exitosamente', id: producto.id, producto });
  } catch (err) {
    logger.error('PUT /api/productos/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

/**
 * POST /api/productos/:id/video — sube o reemplaza el vídeo del producto.
 * Va en su propio endpoint (no en el PUT) porque son 50 MB de multipart: no
 * queremos que editar el nombre obligue a reenviar el vídeo, ni que un fallo
 * de subida aborte el resto de la edición.
 */
router.post('/:id/video', authenticate, recibirVideo, async (req: any, res: Response) => {
  try {
    const id = req.params.id;
    const usuarioId = req.userId;

    const productoRepo = AppDataSource.getRepository(Producto);
    const producto = await productoRepo.findOne({
      where: { id, usuario_id: usuarioId },
    });

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'Falta el vídeo (campo "video" del form-data)' });
    }

    let nuevaUrl: string;
    try {
      nuevaUrl = await StorageService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        'videos'
      );
    } catch (err) {
      logger.error('[productos] Falló la subida de vídeo:', err);
      return res.status(500).json({ error: 'No se pudo guardar el vídeo del producto' });
    }

    const anterior = producto.video_url;
    producto.video_url = nuevaUrl;
    await productoRepo.save(producto);

    // Best-effort DESPUÉS de persistir: si el borrado falla solo queda un
    // huérfano en storage; borrar antes de guardar podría dejar al producto
    // apuntando a un archivo ya inexistente.
    if (anterior) {
      StorageService.deleteFile(anterior, 'videos').catch(() => {});
    }

    res.json({
      message: 'Vídeo actualizado exitosamente',
      id: producto.id,
      video_url: nuevaUrl,
    });
  } catch (err) {
    logger.error('POST /api/productos/:id/video error:', err);
    res.status(500).json({ error: 'Error al subir el vídeo del producto' });
  }
});

// DELETE /api/productos/:id/video — quita el vídeo sin tocar el resto del
// producto. Idempotente: si ya no había vídeo responde 200 igualmente.
router.delete('/:id/video', authenticate, async (req: any, res: Response) => {
  try {
    const id = req.params.id;
    const usuarioId = req.userId;

    const productoRepo = AppDataSource.getRepository(Producto);
    const producto = await productoRepo.findOne({
      where: { id, usuario_id: usuarioId },
    });

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const anterior = producto.video_url;
    if (anterior) {
      await productoRepo.update({ id, usuario_id: usuarioId }, { video_url: null });
      StorageService.deleteFile(anterior, 'videos').catch(() => {});
    }

    res.json({ message: 'Vídeo eliminado exitosamente', id });
  } catch (err) {
    logger.error('DELETE /api/productos/:id/video error:', err);
    res.status(500).json({ error: 'Error al eliminar el vídeo del producto' });
  }
});

router.delete('/:id', authenticate, async (req: any, res: Response) => {
  try {
    const id = req.params.id;
    const usuarioId = req.userId;

    const productoRepo = AppDataSource.getRepository(Producto);
    const producto = await productoRepo.findOne({
      where: { id, usuario_id: usuarioId },
    });

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    if (producto.imagen_url) {
      StorageService.deleteFile(producto.imagen_url).catch(() => {});
    }
    if (producto.video_url) {
      StorageService.deleteFile(producto.video_url, 'videos').catch(() => {});
    }

    await productoRepo.remove(producto);

    res.json({ message: 'Producto eliminado exitosamente' });
  } catch (err) {
    logger.error('DELETE /api/productos/:id error:', err);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

export default router;
