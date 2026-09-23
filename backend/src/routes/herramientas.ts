import { Router, Response } from 'express';
import { z } from 'zod';
import { ah } from '../utils/asyncHandler';
import { authenticate, AuthRequest } from '../middleware/auth';
import { invalidatePlanCache } from '../middleware/requirePlan';
import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { AsignacionTrabajador, PermisosTrabajador } from '../models/AsignacionTrabajador';
import { Plan } from '../models/Usuario';
import {
  SERVICIOS_CATALOGO,
  SERVICIOS_LISTA,
  HerramientaKey,
} from '../services/billing/serviciosCatalogo';
import { computeHerramientasAbribles } from '../services/billing/herramientaGate';
import {
  getHerramientasIncluidas,
  planPermiteSeleccion,
  canSelectHerramienta,
  getMaxHerramientas,
} from '../services/billing/planService';
import { HerramientaSeleccionada } from '../models/HerramientaSeleccionada';
import { esHerramientaContratable } from '../services/billing/serviciosCatalogo';
import { computeOrigenHerramienta } from '../services/billing/origenHerramientaService';
import { registrarCambioHerramienta, obtenerHistorialHerramientas } from '../services/billing/auditoriaHerramientaService';

// Schema de validación para seleccionar/deseleccionar herramientas
const herramientaKeySchema = z.object({
  herramienta_key: z
    .string()
    .min(1, 'herramienta_key requerida')
    .max(40, 'herramienta_key muy larga'),
});

const router = Router();
router.use(authenticate);

// Resuelve la CUENTA (owner) a partir del usuario autenticado, incluyendo el
// PLAN del dueño — que es quien decide, en el modelo por plan, qué herramientas
// están desbloqueadas. Si es trabajador → owner_id + plan del owner; si es
// dueño → su propio id y plan.
async function resolveCuentaId(
  userId: string,
): Promise<{ cuentaId: string; accountRole: string; plan: Plan } | null> {
  const repo = AppDataSource.getRepository(Usuario);
  const usuario = await repo.findOne({
    select: ['id', 'account_role', 'owner_id', 'plan'],
    where: { id: userId },
  });
  if (!usuario) return null;

  if (usuario.account_role === 'trabajador' && usuario.owner_id) {
    const owner = await repo.findOne({
      select: ['id', 'plan'],
      where: { id: usuario.owner_id },
    });
    return {
      cuentaId: usuario.owner_id,
      accountRole: usuario.account_role,
      plan: owner?.plan ?? 'freemium',
    };
  }

  return { cuentaId: usuario.id, accountRole: usuario.account_role, plan: usuario.plan };
}

// ─── GET /api/herramientas ────────────────────────────────────────────────────
// Estado de cada herramienta del catálogo para la cuenta+usuario actual:
// abrible / sin_permiso / no_contratada, más su origen (incluida | pago) y precio.
router.get('/', ah(async (req: AuthRequest, res: Response) => {
  const resuelto = await resolveCuentaId(req.userId!);
  if (!resuelto) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }
  const { cuentaId, accountRole, plan } = resuelto;

  // Modelo por plan: la cuenta "tiene" las herramientas que su plan incluye de
  // fábrica (freemium=todas, business/enterprise=todas) MÁS las que el usuario
  // haya activado a elección (pro/pro_plus → herramientas_seleccionadas).
  const activadas: { herramienta: string; origen: 'incluida' | 'pago' }[] =
    getHerramientasIncluidas(plan).map((herramienta) => ({
      herramienta,
      origen: 'incluida' as const,
    }));

  if (planPermiteSeleccion(plan)) {
    const seleccionadasRows = await AppDataSource.getRepository(HerramientaSeleccionada).find({
      select: ['herramienta_key'],
      where: { usuario_id: cuentaId },
    });
    const seleccionadasKeys = seleccionadasRows.map((s) => s.herramienta_key);
    for (const s of seleccionadasRows) {
      if (!activadas.some((a) => a.herramienta === s.herramienta_key)) {
        const origen = computeOrigenHerramienta(s.herramienta_key, seleccionadasKeys);
        activadas.push({ herramienta: s.herramienta_key, origen });
      }
    }
  }

  // Para el trabajador, reunimos los permisos de sus asignaciones activas de esta
  // cuenta (el gate hace la unión). Para el dueño, no hacen falta: obtiene todo.
  let asignaciones: PermisosTrabajador[] = [];
  if (accountRole === 'trabajador') {
    const filas = await AppDataSource.getRepository(AsignacionTrabajador).find({
      select: ['permisos'],
      where: { trabajador_id: req.userId!, cuenta_id: cuentaId, activo: true },
    });
    asignaciones = filas.map((f) => f.permisos);
  }

  const keys = SERVICIOS_LISTA.map((s) => s.key) as HerramientaKey[];
  const resueltas = computeHerramientasAbribles(
    keys,
    activadas,
    accountRole,
    asignaciones,
  );

  res.json({
    account_role: accountRole,
    plan,
    seleccion: {
      permite: planPermiteSeleccion(plan),
      max: getMaxHerramientas(plan),
    },
    herramientas: resueltas.map((r) => ({
      ...r,
      label: SERVICIOS_CATALOGO[r.herramienta].label,
      precio_mxn: SERVICIOS_CATALOGO[r.herramienta].precio_mxn,
    })),
  });
}));

// ─── POST /api/herramientas/seleccionar ───────────────────────────────────────
// El dueño de un plan por selección (pro, pro_plus) ACTIVA una herramienta a
// elección, hasta el tope max_herramientas del plan. Idempotente: si ya está
// activada, responde 200 sin duplicar.
router.post('/seleccionar', ah(async (req: AuthRequest, res: Response) => {
  // Validar body con Zod
  const parseResult = herramientaKeySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validación fallida',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }
  const { herramienta_key: key } = parseResult.data;

  // Validar que sea una herramienta contractable
  if (!esHerramientaContratable(key)) {
    res.status(400).json({ error: 'herramienta_key inválida o no disponible para contratar' });
    return;
  }

  const resuelto = await resolveCuentaId(req.userId!);
  if (!resuelto) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }
  const { cuentaId, accountRole, plan } = resuelto;

  // Solo el dueño gestiona las herramientas de la cuenta.
  if (accountRole !== 'owner') {
    res.status(403).json({ error: 'Solo el dueño de la cuenta puede activar herramientas' });
    return;
  }

  if (!planPermiteSeleccion(plan)) {
    res.status(403).json({
      error: `Tu plan ${plan} no permite elegir herramientas`,
      plan_actual: plan,
    });
    return;
  }

  const repo = AppDataSource.getRepository(HerramientaSeleccionada);

  // Idempotencia: si ya está activada, no hacemos nada.
  const existente = await repo.findOne({
    select: ['id'],
    where: { usuario_id: cuentaId, herramienta_key: key },
  });
  if (existente) {
    res.json({ ok: true, herramienta_key: key, ya_activada: true });
    return;
  }

  // Validar tope del plan.
  const activas = await repo.count({ where: { usuario_id: cuentaId } });
  if (!canSelectHerramienta(plan, activas)) {
    res.status(403).json({
      error: `Tu plan ${plan} permite activar máximo ${getMaxHerramientas(plan)} herramienta(s). Deselecciona una o mejora tu plan.`,
      upgrade_required: true,
      plan_actual: plan,
      max: getMaxHerramientas(plan),
    });
    return;
  }

  const fila = repo.create({ usuario_id: cuentaId, herramienta_key: key });
  await repo.save(fila);

  // Logging: herramienta activada
  console.log(`[HERRAMIENTAS] Usuario ${cuentaId} activó ${key} (plan: ${plan})`);

  // Auditoría
  await registrarCambioHerramienta(cuentaId, key, 'activada', plan, 'usuario_manual');
  await invalidatePlanCache(cuentaId);

  res.status(201).json({ ok: true, herramienta_key: key });
}));

// ─── DELETE /api/herramientas/deseleccionar ───────────────────────────────────
// El dueño DESACTIVA una herramienta previamente elegida. Los datos ya
// registrados no se borran; solo se cierra el acceso hasta reactivarla.
router.delete('/deseleccionar', ah(async (req: AuthRequest, res: Response) => {
  // Validar body con Zod
  const parseResult = herramientaKeySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validación fallida',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }
  const { herramienta_key: key } = parseResult.data;

  // Validar que sea una herramienta contractable
  if (!esHerramientaContratable(key)) {
    res.status(400).json({ error: 'herramienta_key inválida' });
    return;
  }

  const resuelto = await resolveCuentaId(req.userId!);
  if (!resuelto) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }
  const { cuentaId, accountRole, plan } = resuelto;

  // Solo el dueño puede desactivar.
  if (accountRole !== 'owner') {
    res.status(403).json({ error: 'Solo el dueño de la cuenta puede desactivar herramientas' });
    return;
  }

  if (!planPermiteSeleccion(plan)) {
    res.status(403).json({
      error: `Tu plan ${plan} no gestiona herramientas por selección`,
      plan_actual: plan,
    });
    return;
  }

  // Validación explícita de cuentaId antes de delete
  if (!cuentaId) {
    res.status(500).json({ error: 'Error interno: cuentaId no resuelto' });
    return;
  }

  const repo = AppDataSource.getRepository(HerramientaSeleccionada);
  const resultado = await repo.delete({ usuario_id: cuentaId, herramienta_key: key });
  if (!resultado.affected) {
    res.status(404).json({ error: 'Esa herramienta no estaba activada' });
    return;
  }

  // Logging: herramienta desactivada
  console.log(`[HERRAMIENTAS] Usuario ${cuentaId} desactivó ${key} (plan: ${plan})`);

  // Auditoría
  await registrarCambioHerramienta(cuentaId, key, 'desactivada', plan, 'usuario_manual');
  await invalidatePlanCache(cuentaId);

  res.json({ ok: true, herramienta_key: key });
}));

// ─── GET /api/herramientas/historial ──────────────────────────────────────────
// Devuelve el historial de cambios en herramientas para el usuario (owner only).
// Útil para auditoría y soporte.
router.get('/historial', ah(async (req: AuthRequest, res: Response) => {
  const resuelto = await resolveCuentaId(req.userId!);
  if (!resuelto) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }
  const { cuentaId, accountRole } = resuelto;

  if (accountRole !== 'owner') {
    res.status(403).json({ error: 'Solo el dueño puede ver el historial de herramientas' });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  const historial = await obtenerHistorialHerramientas(cuentaId, limit, offset);

  res.json({
    total: historial.length,
    limit,
    offset,
    historial: historial.map((h) => ({
      id: h.id,
      herramienta_key: h.herramienta_key,
      accion: h.accion,
      plan_snapshot: h.plan_snapshot,
      razon: h.razon,
      created_at: h.created_at,
    })),
  });
}));

export default router;
