import { Router, Response } from 'express';
import { z } from 'zod';
import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess } from '../middleware/requirePlan';
import { validateBody, exigirUuid, esUuid, fechaISOOpcional } from '../middleware/validate';
import { Cotizacion, CotizacionItem } from '../models/Cotizacion';
import { Marca } from '../models/Marca';
import { Plan } from '../models/Usuario';
import { getPlanFromDB } from '../middleware/requirePlan';
import { resolveMarca } from '../services/branding/brandingService';
import { ah } from '../utils/asyncHandler';
import { monedaDeCuenta } from '../utils/monedaCuenta';
import { siguienteFolio, siguienteFolioVenta } from '../utils/folios';
import { Venta } from '../models/Venta';
import { requireHerramientaAccess as requireHerramienta } from '../middleware/requirePlan';
import { VentaItem } from '../models/VentaItem';
import { MovimientoContable } from '../models/MovimientoContable';
import { Producto } from '../models/Producto';
import { hoyDePeticion } from '../utils/fechaLocal';
import { idempotente } from '../middleware/idempotency';
import { leerLimite, paginar, responderPagina } from '../utils/paginacion';
import { r2 } from '../utils/dinero';

const CotizacionItemSchema = z.object({
  descripcion: z.string().trim().min(1, 'descripción requerida'),
  cantidad: z.number({ invalid_type_error: 'cantidad debe ser numérica' }).positive('cantidad debe ser > 0'),
  precio_unitario: z.number({ invalid_type_error: 'precio_unitario debe ser numérico' }).min(0, 'precio_unitario debe ser >= 0'),
  subtotal: z.number().optional(),
});

const CrearCotizacionSchema = z.object({
  cliente_nombre: z.string().trim().min(1, 'cliente_nombre es requerido'),
  cliente_empresa: z.string().optional(),
  cliente_email: z.string().optional(),
  cliente_telefono: z.string().optional(),
  // Vinculo opcional con el CRM; los campos cliente_* de arriba quedan como
  // snapshot para el PDF.
  cliente_id: z.string().uuid().nullable().optional(),
  items: z.array(CotizacionItemSchema).optional().default([]),
  descuento_pct: z.number().min(0).max(100).optional().default(0),
  impuesto_tasa: z.number().min(0).optional().default(0),
  impuesto_nombre: z.string().optional().default('IVA'),
  moneda: z.string().optional(), // sin valor: la del país del producto (monedaDeCuenta)
  estado: z.enum(['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida']).optional().default('borrador'),
  fecha_vencimiento: fechaISOOpcional('fecha_vencimiento inválida (YYYY-MM-DD)'),
  notas: z.string().optional(),
  negocio_id: z.string().uuid().nullable().optional(),
  producto_id: z.string().uuid().nullable().optional(),
});

// Editar: sin defaults (partial) y sin cambiar a qué cliente/negocio pertenece.
const EditarCotizacionSchema = CrearCotizacionSchema.omit({ cliente_id: true, negocio_id: true, producto_id: true }).partial();

const router = Router();
exigirUuid(router, 'id');
router.use(authenticate);
router.use(requireToolCapability('cotizaciones'));
// Desbloqueo por plan/selección para todas las rutas (sin getCount: el tope de
// movimientos no debe bloquear lecturas).
router.use(requireHerramientaAccess('cotizaciones'));

// Tope freemium: cada cotización emitida cuenta como un movimiento.
const contarCotizaciones = (cuentaId: string) =>
  AppDataSource.getRepository(Cotizacion).count({ where: { usuario_id: cuentaId } });

const repo = () => AppDataSource.getRepository(Cotizacion);

// ─── helpers ─────────────────────────────────────────────────────────────────

function validateItems(items: CotizacionItem[]): string | null {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.descripcion?.trim()) return `Item ${i + 1}: descripción requerida`;
    if (!isFinite(it.cantidad) || it.cantidad <= 0) return `Item ${i + 1}: cantidad debe ser > 0`;
    if (!isFinite(it.precio_unitario) || it.precio_unitario < 0) return `Item ${i + 1}: precio_unitario debe ser >= 0`;
    // Recalculate subtotal server-side — never trust the client
    it.subtotal = r2(it.cantidad * it.precio_unitario);
  }
  return null;
}

function calcTotales(
  items: CotizacionItem[],
  descuentoPct: number,
  impuestoTasa: number,
): { subtotal: number; descuento_monto: number; impuesto_monto: number; total: number } {
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const descuento_monto = r2(subtotal * (descuentoPct / 100));
  const baseImponible = subtotal - descuento_monto;
  const impuesto_monto = r2(baseImponible * (impuestoTasa / 100));
  const total = r2(baseImponible + impuesto_monto);
  return { subtotal, descuento_monto, impuesto_monto, total };
}

/** Siguiente COT-###### de la cuenta (contador O(1), ver utils/folios.ts). */
function nextNumero(manager: EntityManager, userId: string): Promise<string> {
  return siguienteFolio(manager, userId, 'cotizacion');
}

// Sella en la cotización la marca a mostrar, GATEADA por el plan de la cuenta.
// La resolución (incluido el gate de white_label) vive en resolveMarca(): aquí
// solo cargamos la Marca de DB y derivamos el snapshot desde MarcaResuelta.
// Si el plan no habilita white_label (o no hay Marca válida) devolvemos null en
// los tres campos → la cotización renderiza la marca de plataforma por defecto.
async function getMarcaSnapshot(
  userId: string,
  plan: Plan,
): Promise<{ marca_nombre: string | null; marca_color: string | null; marca_logo_url: string | null }> {
  const sinMarca = { marca_nombre: null, marca_color: null, marca_logo_url: null };
  try {
    const marca = await AppDataSource.getRepository(Marca).findOne({
      where: { usuario_id: userId, activo: true },
      order: { fecha_creacion: 'ASC' },
    });
    const resuelta = resolveMarca(marca, plan);
    if (!resuelta.white_label) return sinMarca;
    return {
      marca_nombre: resuelta.nombre,
      marca_color: resuelta.color_primario,
      marca_logo_url: resuelta.logo_url,
    };
  } catch {
    return sinMarca;
  }
}

// ─── GET /api/cotizaciones ────────────────────────────────────────────────────
router.get('/', ah(async (req: AuthRequest, res: Response) => {
  const { estado, negocio_id, producto_id } = req.query as Record<string, string | undefined>;
  if ((negocio_id && !esUuid(negocio_id)) || (producto_id && !esUuid(producto_id))) {
    res.status(400).json({ error: 'negocio_id y producto_id deben ser UUID' });
    return;
  }
  const qb = repo().createQueryBuilder('c').where('c.usuario_id = :uid', { uid: req.userId! });
  if (estado)      qb.andWhere('c.estado = :estado', { estado });
  if (negocio_id)  qb.andWhere('c.negocio_id = :negocio_id', { negocio_id });
  if (producto_id) qb.andWhere('c.producto_id = :producto_id', { producto_id });

  const pagina = await paginar(
    qb,
    [{ expr: 'c.fecha_creacion', tipo: 'timestamp' }, { expr: 'c.id', tipo: 'uuid' }],
    req.query.antes,
    leerLimite(req.query.limite)
  );
  if (!pagina) { res.status(400).json({ error: 'Cursor de paginación inválido' }); return; }
  responderPagina(res, pagina);
}));

// ─── GET /api/cotizaciones/:id ────────────────────────────────────────────────
router.get('/:id', ah(async (req: AuthRequest, res: Response) => {
  const row = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!row) { res.status(404).json({ error: 'Cotización no encontrada' }); return; }
  res.json(row);
}));

// ─── POST /api/cotizaciones ───────────────────────────────────────────────────
router.post('/', idempotente('cotizacion'), requireHerramientaAccess('cotizaciones', contarCotizaciones), validateBody(CrearCotizacionSchema), ah(async (req: AuthRequest, res: Response) => {
  const {
    cliente_nombre, cliente_empresa, cliente_email, cliente_telefono,
    items = [], descuento_pct = 0, impuesto_tasa = 0, impuesto_nombre = 'IVA',
    moneda, estado = 'borrador', fecha_vencimiento, notas, negocio_id, producto_id,
  } = req.body as {
    cliente_nombre: string;
    cliente_empresa?: string;
    cliente_email?: string;
    cliente_telefono?: string;
    items?: CotizacionItem[];
    descuento_pct?: number;
    impuesto_tasa?: number;
    impuesto_nombre?: string;
    moneda?: string;
    estado?: Cotizacion['estado'];
    fecha_vencimiento?: string;
    notas?: string;
    negocio_id?: string;
    producto_id?: string;
  };

  if (!cliente_nombre?.trim()) {
    res.status(400).json({ error: 'cliente_nombre es requerido' });
    return;
  }

  const itemError = validateItems(items);
  if (itemError) { res.status(400).json({ error: itemError }); return; }

  const { subtotal, descuento_monto, impuesto_monto, total } = calcTotales(items, descuento_pct, impuesto_tasa);
  const plan = (await getPlanFromDB(req.cuentaEfectivaId ?? req.userId!)) as Plan;
  const marcaSnap = await getMarcaSnapshot(req.userId!, plan);

  const cot = await AppDataSource.transaction(async manager => {
    const numero = await nextNumero(manager, req.userId!);
    const c = manager.create(Cotizacion, {
      usuario_id:       req.userId!,
      creado_por_id:    req.trabajadorRealId ?? null,
      negocio_id:       negocio_id ?? null,
      producto_id:      producto_id ?? null,
      numero,
      cliente_nombre:   cliente_nombre.trim(),
      cliente_empresa:  cliente_empresa?.trim() || null,
      cliente_email:    cliente_email?.trim() || null,
      cliente_telefono: cliente_telefono?.trim() || null,
      items,
      subtotal,
      descuento_pct,
      descuento_monto,
      impuesto_tasa,
      impuesto_nombre,
      impuesto_monto,
      total,
      // Sin moneda explícita, la del país del producto: una cotización mexicana
      // salía al cliente en dólares.
      moneda: moneda || (await monedaDeCuenta(req.userId!, producto_id)),
      estado,
      fecha_vencimiento: fecha_vencimiento ?? null,
      notas:            notas?.trim() || null,
      ...marcaSnap,
    });
    await manager.save(Cotizacion, c);
    return c;
  });

  res.status(201).json(cot);
}));

// ─── PATCH /api/cotizaciones/:id ──────────────────────────────────────────────
router.patch('/:id', validateBody(EditarCotizacionSchema), ah(async (req: AuthRequest, res: Response) => {
  const cot = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!cot) { res.status(404).json({ error: 'Cotización no encontrada' }); return; }

  const {
    cliente_nombre, cliente_empresa, cliente_email, cliente_telefono,
    items, descuento_pct, impuesto_tasa, impuesto_nombre,
    moneda, estado, fecha_vencimiento, notas,
  } = req.body;

  if (cliente_nombre !== undefined) cot.cliente_nombre   = cliente_nombre;
  if (cliente_empresa !== undefined) cot.cliente_empresa = cliente_empresa || null;
  if (cliente_email !== undefined)   cot.cliente_email   = cliente_email || null;
  if (cliente_telefono !== undefined) cot.cliente_telefono = cliente_telefono || null;
  if (moneda !== undefined)           cot.moneda          = moneda;
  if (estado !== undefined)           cot.estado          = estado;
  if (fecha_vencimiento !== undefined) cot.fecha_vencimiento = fecha_vencimiento || null;
  if (notas !== undefined)            cot.notas           = notas || null;
  if (impuesto_nombre !== undefined)  cot.impuesto_nombre = impuesto_nombre;

  if (items !== undefined) {
    const itemError = validateItems(items);
    if (itemError) { res.status(400).json({ error: itemError }); return; }
    cot.items = items;
  }
  if (descuento_pct !== undefined) cot.descuento_pct = descuento_pct;
  if (impuesto_tasa !== undefined)  cot.impuesto_tasa = impuesto_tasa;

  const recalc = calcTotales(cot.items, Number(cot.descuento_pct), Number(cot.impuesto_tasa));
  Object.assign(cot, recalc);

  await repo().save(cot);
  res.json(cot);
}));

// ─── DELETE /api/cotizaciones/:id ─────────────────────────────────────────────
router.delete('/:id', ah(async (req: AuthRequest, res: Response) => {
    const cot = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
    if (!cot) { res.status(404).json({ error: 'Cotización no encontrada' }); return; }
    await repo().remove(cot);
    res.json({ ok: true });
  }));

  // ─── POST /api/cotizaciones/:id/whatsapp ─────────────────────────────────────
  router.post('/:id/whatsapp', ah(async (req: AuthRequest, res: Response) => {
    const cot = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
    if (!cot) { res.status(404).json({ error: 'Cotización no encontrada' }); return; }

    const { mensaje } = req.body as { mensaje?: string };
    const tel = (cot.cliente_telefono || '').replace(/[^\d]/g, '');
    const base = tel ? `https://wa.me/${tel}` : 'https://wa.me/';
    const msgDefault = `Hola ${cot.cliente_nombre.split(' ')[0]}, te envío la cotización *${cot.numero}* por *${cot.moneda} $${Number(cot.total).toFixed(2)}*. ¿Tienes alguna pregunta?`;
    const url = `${base}?text=${encodeURIComponent(mensaje?.trim() || msgDefault)}`;

    // Marcar como enviada si era borrador
    if (cot.estado === 'borrador') {
      cot.estado = 'enviada';
      await repo().save(cot);
    }

    res.json({ whatsapp_url: url, cotizacion: cot });
  }));

  // ─── POST /api/cotizaciones/:id/convertir-venta ──────────────────────────────
  //
  // Cierra el ciclo cotizacion -> venta, que hasta ahora habia que rehacer a mano
  // en el POS. Sin esto no existe la tasa de conversion de cotizaciones.
  //
  // La venta se crea con el MISMO folio correlativo y el mismo advisory lock que
  // el POS (utils/folios.ts), asi que ambos caminos comparten una sola secuencia.
  const contarVentasPOS = (cuentaId: string) =>
    AppDataSource.getRepository(Venta).count({ where: { usuario_id: cuentaId } });

  router.post(
    '/:id/convertir-venta',
    idempotente('cotizacion_venta'),
    requireHerramienta('pos', contarVentasPOS),
    ah(async (req: AuthRequest, res: Response) => {
    const cot = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
    if (!cot) { res.status(404).json({ error: 'Cotización no encontrada' }); return; }

    if (cot.estado === 'aceptada') {
      res.status(409).json({ error: 'Esta cotización ya se convirtió en venta' });
      return;
    }
    if (!Array.isArray(cot.items) || cot.items.length === 0) {
      res.status(400).json({ error: 'La cotización no tiene items' });
      return;
    }

    // El producto define pais y moneda. Se acepta por body para cotizaciones
    // antiguas que se guardaron sin producto_id.
    const { producto_id: productoIdBody, metodo_pago } = req.body as {
      producto_id?: string;
      metodo_pago?: 'efectivo' | 'tarjeta' | 'transferencia' | 'otro';
    };
    const productoId = cot.producto_id || productoIdBody;
    if (!productoId) {
      res.status(400).json({ error: 'producto_id es requerido (define el país y la moneda de la venta)' });
      return;
    }
    const producto = await AppDataSource.getRepository(Producto).findOne({
      where: { id: productoId, usuario_id: req.userId! },
    });
    if (!producto) { res.status(404).json({ error: 'Producto no encontrado' }); return; }

    const hoy = await hoyDePeticion(req);
    const venta = await AppDataSource.transaction(async manager => {
      // Primero se "toma" la cotización: el UPDATE bloquea la fila, así que dos
      // conversiones simultáneas no pueden pasar las dos. Antes la comprobación
      // de estado iba fuera de la transacción y tres clics creaban tres ventas.
      const tomada = await manager
        .createQueryBuilder()
        .update(Cotizacion)
        .set({ estado: 'aceptada' })
        .where('id = :id AND usuario_id = :uid AND estado <> :aceptada', { id: cot.id, uid: req.userId!, aceptada: 'aceptada' })
        .execute();
      if (!tomada.affected) return null;

      const numeroTicket = await siguienteFolioVenta(manager, req.userId!);

      // Los importes se copian de la cotizacion tal cual, sin recalcular: el
      // cliente acepto ESOS numeros, incluido el descuento ya aplicado.
      const v = manager.create(Venta, {
        usuario_id:       req.userId!,
        creado_por_id:    req.trabajadorRealId ?? null,
        producto_id:      productoId,
        negocio_id:       cot.negocio_id ?? null,
        numero_ticket:    numeroTicket,
        fecha:            hoy,
        subtotal:         Number(cot.subtotal) - Number(cot.descuento_monto),
        impuesto_monto:   Number(cot.impuesto_monto),
        impuesto_tasa:    Number(cot.impuesto_tasa) / 100, // la cotizacion la guarda en %
        impuesto_nombre:  cot.impuesto_nombre,
        moneda:           cot.moneda,
        total:            Number(cot.total),
        metodo_pago:      metodo_pago || 'transferencia',
        cliente_id:       cot.cliente_id,
        cliente_nombre:   cot.cliente_nombre,
        cliente_telefono: cot.cliente_telefono,
        notas:            `Generada desde la cotización ${cot.numero}`,
        estado:           'completada',
        cotizacion_id:    cot.id,
      });
      await manager.save(Venta, v);

      // Los items de la cotizacion son texto libre (jsonb), no items del catalogo
      // POS: no hay item_pos_id que enlazar y por tanto tampoco receta ni
      // descuento de almacen. Queda como snapshot, igual que un item borrado.
      await manager.save(VentaItem, cot.items.map((it) => manager.create(VentaItem, {
        venta_id:        v.id,
        item_pos_id:     null,
        nombre_snapshot: it.descripcion,
        precio_unitario: Number(it.precio_unitario),
        cantidad:        Number(it.cantidad),
        subtotal_linea:  Number(it.subtotal ?? Number(it.precio_unitario) * Number(it.cantidad)),
      })));

      const mov = manager.create(MovimientoContable, {
        usuario_id:       req.userId!,
        creado_por_id:    req.trabajadorRealId ?? null,
        producto_id:      productoId,
        tipo:             'ingreso',
        descripcion:      `${numeroTicket} — ${cot.numero} — ${cot.cliente_nombre}`,
        categoria:        'Ventas',
        monto:            Number(cot.total),
        fecha:            v.fecha,
        es_auto_generado: false,
        tiene_cfdi:       true,
        fuente:           'cotizacion',
        referencia_tipo:  'cotizacion',
        referencia_id:    cot.id,
      });
      await manager.save(MovimientoContable, mov);

      v.movimiento_contable_id = mov.id;
      await manager.save(Venta, v);

      return v;
    });

    if (!venta) {
      res.status(409).json({ error: 'Esta cotización ya se convirtió en venta' });
      return;
    }
    res.status(201).json({ venta, cotizacion_id: cot.id });
  }),
);

export default router;
