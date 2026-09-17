import { Router, Response } from 'express';
import { exigirUuid } from '../middleware/validate';
import { body, validationResult } from 'express-validator';
import { AppDataSource } from '../config/database';
import { Marca } from '../models/Marca';
import { Producto } from '../models/Producto';
import { Usuario } from '../models/Usuario';
import { redactBriefData } from '../services/billing/redactAnalisis';
import { authenticate, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { StorageService } from '../services/StorageService';
import { getPlanFromDB } from '../middleware/requirePlan';
import { conCreditos, responderSinCreditos, CreditosInsuficientesError } from '../services/billing/creditosIA';
import { analizarLogo } from '../services/brief/logoAnalysisService';
import { ah } from '../utils/asyncHandler';

const router = Router();
exigirUuid(router, 'productoId');
router.use(authenticate);

/**
 * `Marca.brief_data` es una COPIA del resultado del brief, así que estas rutas
 * eran una puerta trasera al brief completo en plan gratuito: el recorte de
 * `GET /api/brief/:id` no se aplicaba aquí. Se recorta con el plan ACTUAL, igual
 * que en las rutas de análisis.
 */
async function planDeCuenta(usuarioId: string): Promise<string> {
  const usuario = await AppDataSource.getRepository(Usuario).findOne({
    select: ['plan'],
    where: { id: usuarioId },
  });
  return usuario?.plan ?? 'freemium';
}

// ─── GET /api/marca — list all brand kits for this user ───────────────────────
router.get('/', ah(async (req: AuthRequest, res: Response) => {
  const marcas = await AppDataSource.getRepository(Marca).find({
    where: { usuario_id: req.userId! },
    order: { fecha_creacion: 'DESC' },
  });
  // Backward compat: if frontend expects a single object, return first or null
  // New frontend uses /api/marca/lista
  const marca = marcas[0];
  if (!marca) return res.json(null);

  const plan = await planDeCuenta(req.userId!);
  const { brief_data, secciones_bloqueadas } = redactBriefData(
    plan,
    marca.brief_data as Record<string, unknown> | null,
  );
  return res.json({ ...marca, brief_data, secciones_bloqueadas });
}));

// ─── GET /api/marca/lista — list all brand kits ──────────────────────────────
router.get('/lista', ah(async (req: AuthRequest, res: Response) => {
  const marcas = await AppDataSource.getRepository(Marca).find({
    where: { usuario_id: req.userId! },
    order: { fecha_creacion: 'DESC' },
  });
  if (marcas.length === 0) return res.json([]);

  // Un solo SELECT de plan para toda la lista (son todas de la misma cuenta).
  const plan = await planDeCuenta(req.userId!);
  return res.json(
    marcas.map((m) => {
      const { brief_data, secciones_bloqueadas } = redactBriefData(
        plan,
        m.brief_data as Record<string, unknown> | null,
      );
      return { ...m, brief_data, secciones_bloqueadas };
    }),
  );
}));

// ─── GET /api/marca/producto/:productoId — get kit for specific product ──────
router.get('/producto/:productoId', ah(async (req: AuthRequest, res: Response) => {
  const marca = await AppDataSource.getRepository(Marca).findOneBy({
    usuario_id: req.userId!,
    producto_id: req.params.productoId,
  });
  if (!marca) return res.json(null);

  const plan = await planDeCuenta(req.userId!);
  const { brief_data, secciones_bloqueadas } = redactBriefData(
    plan,
    marca.brief_data as Record<string, unknown> | null,
  );
  return res.json({ ...marca, brief_data, secciones_bloqueadas });
}));

// ─── POST /api/marca — create or update brand kit ────────────────────────────
router.post(
  '/',
  [body('nombre').trim().notEmpty().withMessage('Nombre de marca requerido')],
  ah(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { nombre, slogan, descripcion, paleta_colores, tipografia, producto_id, brief_data } = req.body;
    const repo = AppDataSource.getRepository(Marca);

    if (producto_id) {
      const producto = await AppDataSource.getRepository(Producto).findOne({
        where: { id: req.body?.producto_id, usuario_id: req.userId },
      });
      if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // If producto_id is provided, upsert by (usuario_id, producto_id)
    // Otherwise, upsert by (usuario_id) with null producto_id (legacy behavior)
    const whereClause: Record<string, string> = { usuario_id: req.userId! };
    if (producto_id) {
      whereClause.producto_id = producto_id;
    }

    const existing = await repo.findOneBy(whereClause);

    const updateData = {
      nombre,
      slogan: slogan ?? null,
      descripcion: descripcion ?? null,
      paleta_colores: paleta_colores ?? null,
      tipografia: tipografia ?? null,
      producto_id: producto_id ?? null,
      brief_data: brief_data ?? null,
    };

    if (existing) {
      await repo.update(existing.id, updateData);
      return res.json({ ...existing, ...updateData });
    }

    const marca = repo.create({ usuario_id: req.userId!, ...updateData });
    await repo.save(marca);
    return res.status(201).json(marca);
  }
));

// ─── POST /api/marca/logo — upload logo and analyze with AI ──────────────────
router.post(
  '/logo',
  upload.single('logo'),
  [body('producto_id').optional().isUUID()],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    }

    try {
      const productoId = req.body.producto_id;

      if (productoId) {
        const productoOwner = await AppDataSource.getRepository(Producto).findOneBy({
          id: productoId,
          usuario_id: req.userId!,
        });
        if (!productoOwner) {
          return res.status(404).json({ error: 'Producto no encontrado' });
        }
      }

      // 1. Save the logo file
      const logoUrl = await StorageService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      // 2. Get existing brief data if available (for coherence check)
      let briefData = null;

      if (productoId) {
        const marca = await AppDataSource.getRepository(Marca).findOneBy({
          usuario_id: req.userId!,
          producto_id: productoId,
        });
        if (marca?.brief_data) {
          const bd = marca.brief_data as Record<string, unknown>;
          const bi = bd.brief_identidad as Record<string, unknown> | undefined;
          briefData = {
            slogan: bi?.slogan_principal as string | undefined,
            adn: bi?.adn as string | undefined,
            personalidad: bi?.personalidad as string[] | undefined,
          };
        }
      }

      // 3. Analyze with AI (synchronous — ~5s)
      const plan = await getPlanFromDB(req.userId!);
      const analysis = await conCreditos(req.userId!, plan, 'marca_logo', () =>
        analizarLogo({ buffer: req.file!.buffer, mimetype: req.file!.mimetype, briefData })
      );

      // 4. Save logo_url and analysis to marca (upsert)
      if (productoId) {
        const repo = AppDataSource.getRepository(Marca);
        const existing = await repo.findOneBy({
          usuario_id: req.userId!,
          producto_id: productoId,
        });

        if (existing) {
          // Delete old logo file if it exists
          if (existing.logo_url) {
            await StorageService.deleteFile(existing.logo_url);
          }
          await repo.update(existing.id, {
            logo_url: logoUrl,
            logo_analysis: analysis as unknown as object,
          });
        } else {
          // Get product name for the marca record
          const producto = await AppDataSource.getRepository(Producto).findOneBy({
            id: productoId,
            usuario_id: req.userId!,
          });
          if (producto) {
            const marca = repo.create({
              usuario_id: req.userId!,
              producto_id: productoId,
              nombre: producto.nombre,
              logo_url: logoUrl,
              logo_analysis: analysis as unknown as object,
            });
            await repo.save(marca);
          }
        }
      }

      return res.json({
        logo_url: logoUrl,
        analysis,
      });
    } catch (err) {
      if (err instanceof CreditosInsuficientesError) return responderSinCreditos(res, err);
      console.error('[marca/logo] Error:', err);
      const msg = err instanceof Error ? err.message : 'Error al analizar el logo';
      return res.status(500).json({ error: msg });
    }
  }
);

export default router;
