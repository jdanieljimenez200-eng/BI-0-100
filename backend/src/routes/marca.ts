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
import { analizarLogo, type BriefLogo, type ProductoLogo } from '../services/brief/logoAnalysisService';
import { AnalisisBrief } from '../models/AnalisisBrief';
import { USOS_MARCA, type UsoMarca } from '../services/brief/types';
import { ah } from '../utils/asyncHandler';

const router = Router();
exigirUuid(router, 'productoId');
router.use(authenticate);

const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

/**
 * Lo del brief guardado que sirve para juzgar el logo: esencia, concepto de
 * logo, paleta y los usos declarados en «Afina tu análisis» (viven en el
 * `meta_ia` del último brief completado del producto).
 */
async function briefParaLogo(usuarioId: string, productoId: string): Promise<BriefLogo | null> {
  const [marca, ultimoBrief] = await Promise.all([
    AppDataSource.getRepository(Marca).findOneBy({ usuario_id: usuarioId, producto_id: productoId }),
    AppDataSource.getRepository(AnalisisBrief).findOne({
      select: ['id', 'meta_ia'],
      where: { usuario_id: usuarioId, producto_id: productoId, estado_analisis: 'completado' },
      order: { fecha_creacion: 'DESC' },
    }),
  ]);

  const bd = (marca?.brief_data ?? null) as Record<string, unknown> | null;
  const bi = (bd?.brief_identidad ?? {}) as Record<string, unknown>;
  const iv = (bd?.identidad_visual ?? {}) as Record<string, unknown>;
  const paleta = (iv.paleta ?? {}) as Record<string, { hex?: unknown } | undefined>;
  const usos = (ultimoBrief?.meta_ia?.meta?.contexto_usado?.usos_marca ?? []) as unknown[];

  const brief: BriefLogo = {
    slogan: texto(bi.slogan_principal),
    adn: texto(bi.adn),
    personalidad: Array.isArray(bi.personalidad) ? bi.personalidad.filter((p): p is string => typeof p === 'string') : undefined,
    concepto_logo: texto(iv.concepto_logo),
    estilo_grafico: texto(iv.estilo_grafico),
    paleta: ['primario', 'secundario', 'acento', 'neutro']
      .map((rol) => paleta[rol]?.hex)
      .filter((h): h is string => typeof h === 'string'),
    usos_marca: usos.filter((u): u is UsoMarca => (USOS_MARCA as readonly unknown[]).includes(u)),
  };
  const hayAlgo = Object.values(brief).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v)));
  return hayAlgo ? brief : null;
}

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
      let productoOwner: Producto | null = null;

      if (productoId) {
        productoOwner = await AppDataSource.getRepository(Producto).findOneBy({
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

      // 2. El brief guardado y dónde se usará la marca (para medir la coherencia)
      const briefData = productoId ? await briefParaLogo(req.userId!, productoId) : null;
      const producto: ProductoLogo | null = productoOwner
        ? {
            nombre: productoOwner.nombre,
            categoria: productoOwner.categoria,
            pais: productoOwner.pais,
            cliente_ideal: productoOwner.cliente_ideal,
            perfil_negocio: productoOwner.perfil_negocio,
          }
        : null;

      // 3. Analyze with AI (synchronous — ~5s)
      const plan = await getPlanFromDB(req.userId!);
      const analysis = await conCreditos(req.userId!, plan, 'marca_logo', () =>
        analizarLogo({ buffer: req.file!.buffer, mimetype: req.file!.mimetype, producto, briefData })
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
