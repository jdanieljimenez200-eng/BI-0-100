import { Router, Response } from 'express';
import { AppDataSource } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AnalisisMercado } from '../models/AnalisisMercado';
import { AnalisisMarketing } from '../models/AnalisisMarketing';
import { AnalisisVentas } from '../models/AnalisisVentas';
import { AnalisisFinanzas } from '../models/AnalisisFinanzas';
import { AnalisisLegal } from '../models/AnalisisLegal';
import { AnalisisBrief } from '../models/AnalisisBrief';

const router = Router();
router.use(authenticate);

/**
 * GET /api/analytics/overview
 * Dashboard principal con agregaciones por usuario (sin N+1 queries).
 * Ejecuta 7 queries en paralelo en lugar de 7*N.
 */
router.get('/overview', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.cuentaEfectivaId ?? req.userId;

    // Ejecutar todas las queries en paralelo (Promise.all)
    const [mercado, marketing, ventas, finanzas, legal, brief] = await Promise.all([
      AppDataSource.getRepository(AnalisisMercado)
        .createQueryBuilder()
        .select('COUNT(*)', 'total')
        .addSelect('SUM(CASE WHEN estado_analisis = \'completado\' THEN 1 ELSE 0 END)', 'completados')
        .addSelect('SUM(CASE WHEN estado_analisis = \'error\' THEN 1 ELSE 0 END)', 'errores')
        .addSelect('AVG(CAST(viabilidad_score AS FLOAT))', 'score_promedio')
        .where('usuario_id = :userId', { userId })
        .getRawOne(),

      AppDataSource.getRepository(AnalisisMarketing)
        .createQueryBuilder()
        .select('COUNT(*)', 'total')
        .addSelect('SUM(CASE WHEN estado_analisis = \'completado\' THEN 1 ELSE 0 END)', 'completados')
        .addSelect('SUM(CASE WHEN estado_analisis = \'error\' THEN 1 ELSE 0 END)', 'errores')
        .where('usuario_id = :userId', { userId })
        .getRawOne(),

      AppDataSource.getRepository(AnalisisVentas)
        .createQueryBuilder()
        .select('COUNT(*)', 'total')
        .addSelect('SUM(CASE WHEN estado_analisis = \'completado\' THEN 1 ELSE 0 END)', 'completados')
        .addSelect('SUM(CASE WHEN estado_analisis = \'error\' THEN 1 ELSE 0 END)', 'errores')
        .where('usuario_id = :userId', { userId })
        .getRawOne(),

      AppDataSource.getRepository(AnalisisFinanzas)
        .createQueryBuilder()
        .select('COUNT(*)', 'total')
        .addSelect('SUM(CASE WHEN estado_analisis = \'completado\' THEN 1 ELSE 0 END)', 'completados')
        .addSelect('SUM(CASE WHEN estado_analisis = \'error\' THEN 1 ELSE 0 END)', 'errores')
        .where('usuario_id = :userId', { userId })
        .getRawOne(),

      AppDataSource.getRepository(AnalisisLegal)
        .createQueryBuilder()
        .select('COUNT(*)', 'total')
        .addSelect('SUM(CASE WHEN estado_analisis = \'completado\' THEN 1 ELSE 0 END)', 'completados')
        .addSelect('SUM(CASE WHEN estado_analisis = \'error\' THEN 1 ELSE 0 END)', 'errores')
        .where('usuario_id = :userId', { userId })
        .getRawOne(),

      AppDataSource.getRepository(AnalisisBrief)
        .createQueryBuilder()
        .select('COUNT(*)', 'total')
        .addSelect('SUM(CASE WHEN estado_analisis = \'completado\' THEN 1 ELSE 0 END)', 'completados')
        .addSelect('SUM(CASE WHEN estado_analisis = \'error\' THEN 1 ELSE 0 END)', 'errores')
        .where('usuario_id = :userId', { userId })
        .getRawOne(),
    ]);

    res.json({
      modules: {
        mercado,
        marketing,
        ventas,
        finanzas,
        legal,
        brief,
      },
      total: {
        analyses:
          parseInt(mercado?.total || 0) +
          parseInt(marketing?.total || 0) +
          parseInt(ventas?.total || 0) +
          parseInt(finanzas?.total || 0) +
          parseInt(legal?.total || 0) +
          parseInt(brief?.total || 0),
        completados:
          parseInt(mercado?.completados || 0) +
          parseInt(marketing?.completados || 0) +
          parseInt(ventas?.completados || 0) +
          parseInt(finanzas?.completados || 0) +
          parseInt(legal?.completados || 0) +
          parseInt(brief?.completados || 0),
        errores:
          parseInt(mercado?.errores || 0) +
          parseInt(marketing?.errores || 0) +
          parseInt(ventas?.errores || 0) +
          parseInt(finanzas?.errores || 0) +
          parseInt(legal?.errores || 0) +
          parseInt(brief?.errores || 0),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error fetching overview';
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/analytics/timeline?days=30
 * Línea de tiempo agregada de análisis (última 30 días por default).
 */
router.get('/timeline', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.cuentaEfectivaId ?? req.userId;
    const days = parseInt(req.query.days as string) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Query única que agrupa por fecha en todas las tablas de análisis
    const timeline = await AppDataSource.query(
      `SELECT 
        DATE(fecha_creacion) as fecha,
        COUNT(*) as total,
        SUM(CASE WHEN estado_analisis = 'completado' THEN 1 ELSE 0 END) as completados,
        SUM(CASE WHEN estado_analisis = 'error' THEN 1 ELSE 0 END) as errores,
        SUM(CASE WHEN estado_analisis = 'procesando' THEN 1 ELSE 0 END) as procesando
      FROM (
        SELECT fecha_creacion, estado_analisis FROM analisis_mercado WHERE usuario_id = $1 AND fecha_creacion >= $2
        UNION ALL
        SELECT fecha_creacion, estado_analisis FROM analisis_marketing WHERE usuario_id = $1 AND fecha_creacion >= $2
        UNION ALL
        SELECT fecha_creacion, estado_analisis FROM analisis_ventas WHERE usuario_id = $1 AND fecha_creacion >= $2
        UNION ALL
        SELECT fecha_creacion, estado_analisis FROM analisis_finanzas WHERE usuario_id = $1 AND fecha_creacion >= $2
        UNION ALL
        SELECT fecha_creacion, estado_analisis FROM analisis_legal WHERE usuario_id = $1 AND fecha_creacion >= $2
        UNION ALL
        SELECT fecha_creacion, estado_analisis FROM analisis_brief WHERE usuario_id = $1 AND fecha_creacion >= $2
      ) combined
      GROUP BY DATE(fecha_creacion)
      ORDER BY fecha DESC`,
      [userId, since]
    );

    res.json({ timeline, days });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error fetching timeline';
    res.status(500).json({ error: msg });
  }
});

export default router;