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
import { monedaDeCuenta, paisDeCuenta } from '../utils/monedaCuenta';
import { telefonoWhatsApp } from '../utils/whatsapp';
import { siguienteFolio, siguienteFolioVenta } from '../utils/folios';
import { Venta } from '../models/Venta';
import { requireHerramientaAccess as requireHerramienta } from '../middleware/requirePlan';
import { VentaItem } from '../models/VentaItem';
import { MovimientoContable } from '../models/MovimientoContable';
import { Producto } from '../models/Producto';
import { Negocio } from '../models/Negocio';
import { Cliente } from '../models/Cliente';
import { hoyDePeticion } from '../utils/fechaLocal';
import { idempotente } from '../middleware/idempotency';
import { leerLimite, paginar, responderPagina } from '../utils/paginacion';
import { r2 } from '../utils/dinero';
import { cantidad, dinero, MAX_DINERO } from '../utils/limitesNumericos';
import { getTaxConfig } from '../utils/taxConfig';

// Los items viven en `cotizaciones.items` (jsonb), pero al convertir en venta
// cada uno pasa a `venta_items` (nombre_snapshot varchar(255), cantidad
// numeric(12,3), precio numeric(12,2)): los topes son los de ese destino, o la
// cotización se guardaba bien y luego no había forma de convertirla.
const CotizacionItemSchema = z.object({
  descripcion: z.string().trim().min(1, 'descripción requerida').max(255),
  cantidad: cantidad('cantidad').refine((c) => c > 0, 'cantidad debe ser > 0'),
  precio_unitario: dinero('precio_unitario'),
  subtotal: z.number().optional(),
});

// Texto opcional que también admite null: el formulario manda `campo || null`
// en los vacíos, y con `z.string().optional()` a secas crear una cotización sin
// empresa, email, teléfono o notas respondía 400. Mismo helper que clientes.
const textoOpcional = (max: number) => z.string().trim().max(max).nullable().optional();

const CrearCotizacionSchema = z.object({
  cliente_nombre: z.string().trim().min(1, 'cliente_nombre es requerido').max(200),
  cliente_empresa: textoOpcional(200),
  cliente_email: textoOpcional(200),
  cliente_telefono: textoOpcional(30),
  // Vinculo opcional con el CRM; los campos cliente_* de arriba quedan como
  // snapshot para el PDF.
  cliente_id: z.string().uuid().nullable().optional(),
  items: z.array(CotizacionItemSchema).optional().default([]),
  descuento_pct: z.number().min(0).max(100).optional().default(0),
  // Porcentaje (16 = 16 %) en numeric(5,2): sin tope, 1000 reventaba el INSERT.
  impuesto_tasa: z.number().min(0).max(100).optional().default(0),
  impuesto_nombre: z.string().max(20).optional().default('IVA'),
  // Código ISO de 3 letras. La columna admite 10, pero al convertir en venta
  // se copia a `ventas.moneda`, que es varchar(3). Vacío = la del país del
  // producto (monedaDeCuenta); «mx» o «$» no son monedas y rompían el formato.
  moneda: z.string().trim().toUpperCase()
    .refine((m) => m === '' || /^[A-Z]{3}$/.test(m), 'moneda: código de 3 letras (MXN, USD, COP…)')
    .optional(),
  estado: z.enum(['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida']).optional().default('borrador'),
  fecha_vencimiento: fechaISOOpcional('fecha_vencimiento inválida (YYYY-MM-DD)'),
  notas: textoOpcional(5000),
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

/** Venta vigente (no cancelada) de cada cotización, por id de cotización. */
async function ventasVigentes(ids: string[]): Promise<Map<string, { id: string; numero_ticket: string }>> {
  if (!ids.length) return new Map();
  const filas: { id: string; numero_ticket: string; cotizacion_id: string }[] = await AppDataSource.query(
    `SELECT id, numero_ticket, cotizacion_id FROM ventas WHERE cotizacion_id = ANY($1::uuid[]) AND estado <> 'cancelada'`,
    [ids]
  );
  return new Map(filas.map((f) => [f.cotizacion_id, { id: f.id, numero_ticket: f.numero_ticket }]));
}

/** Folio de cualquier venta (también cancelada) hecha desde la cotización. */
async function ventaDeCotizacion(id: string): Promise<string | null> {
  const [fila]: { numero_ticket: string }[] = await AppDataSource.query(
    `SELECT numero_ticket FROM ventas WHERE cotizacion_id = $1 ORDER BY fecha_creacion DESC LIMIT 1`,
    [id]
  );
  return fila?.numero_ticket ?? null;
}

/** Importe con la moneda en el formato del país, para el mensaje al cliente. */
function dineroTexto(valor: number, moneda: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: moneda }).format(valor);
  } catch {
    return `${moneda} ${valor.toFixed(2)}`;
  }
}

/** La cotización con su venta vigente, para que la interfaz sepa si falta convertirla. */
function conVenta(cot: Cotizacion, ventas: Map<string, { id: string; numero_ticket: string }>) {
  const v = ventas.get(cot.id);
  return { ...cot, venta_id: v?.id ?? null, venta_ticket: v?.numero_ticket ?? null };
}

function validateItems(items: CotizacionItem[]): string | null {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.descripcion?.trim()) return `Item ${i + 1}: descripción requerida`;
    if (!isFinite(it.cantidad) || it.cantidad <= 0) return `Item ${i + 1}: cantidad debe ser > 0`;
    if (!isFinite(it.precio_unitario) || it.precio_unitario < 0) return `Item ${i + 1}: precio_unitario debe ser >= 0`;
    // Recalculate subtotal server-side — never trust the client
    it.subtotal = r2(it.cantidad * it.precio_unitario);
    if (it.subtotal > MAX_DINERO) return `Item ${i + 1}: el importe (cantidad × precio) es demasiado grande`;
  }
  return null;
}

/**
 * La venta y su asiento son numeric(12,2): un total que no cabe ahí se podía
 * cotizar y luego no había forma de convertirlo en venta (500 al guardar).
 */
function totalFueraDeRango(t: { subtotal: number; total: number }): string | null {
  return t.subtotal > MAX_DINERO || t.total > MAX_DINERO
    ? 'El total de la cotización es demasiado grande para registrarse como venta'
    : null;
}

function calcTotales(
  items: CotizacionItem[],
  descuentoPct: number,
  impuestoTasa: number,
): { subtotal: number; descuento_monto: number; impuesto_monto: number; total: number } {
  // Redondeado: sumar 0.1 + 0.2 en coma flotante deja 0.30000000000000004.
  const subtotal = r2(items.reduce((s, i) => s + i.subtotal, 0));
  const descuento_monto = r2(subtotal * (descuentoPct / 100));
  const baseImponible = subtotal - descuento_monto;
  const impuesto_monto = r2(baseImponible * (impuestoTasa / 100));
  const total = r2(baseImponible + impuesto_monto);
  return { subtotal, descuento_monto, impuesto_monto, total };
}

/**
 * Líneas de la venta que sale de una cotización: precio unitario y subtotal con
 * el descuento ya aplicado y sin impuesto. El centavo que deja el redondeo va a
 * la línea más grande para que sumen exactamente subtotal − descuento.
 */
export function lineasDeVenta(cot: Pick<Cotizacion, 'items' | 'subtotal' | 'descuento_monto'>) {
  const items = Array.isArray(cot.items) ? cot.items : [];
  const base = Number(cot.subtotal) || 0;
  const neto = r2(base - (Number(cot.descuento_monto) || 0));
  const factor = base > 0 ? neto / base : 1;
  const lineas = items.map((it) => {
    const bruto = r2(Number(it.subtotal ?? Number(it.precio_unitario) * Number(it.cantidad)));
    return {
      descripcion: it.descripcion,
      cantidad: Number(it.cantidad),
      precio_unitario: r2(Number(it.precio_unitario) * factor),
      subtotal_linea: r2(bruto * factor),
      bruto,
    };
  });
  const resto = r2(neto - lineas.reduce((s, l) => s + l.subtotal_linea, 0));
  if (resto !== 0 && lineas.length) {
    const mayor = lineas.reduce((iMax, l, i, arr) => (l.bruto > arr[iMax].bruto ? i : iMax), 0);
    lineas[mayor].subtotal_linea = r2(lineas[mayor].subtotal_linea + resto);
  }
  return lineas.map(({ bruto: _bruto, ...l }) => l);
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
  const ventas = await ventasVigentes(pagina.filas.map((c) => c.id));
  responderPagina(res, { ...pagina, filas: pagina.filas.map((c) => conVenta(c, ventas)) });
}));

// ─── GET /api/cotizaciones/:id ────────────────────────────────────────────────
router.get('/:id', ah(async (req: AuthRequest, res: Response) => {
  const row = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!row) { res.status(404).json({ error: 'Cotización no encontrada' }); return; }
  res.json(conVenta(row, await ventasVigentes([row.id])));
}));

// ─── POST /api/cotizaciones ───────────────────────────────────────────────────
router.post('/', idempotente('cotizacion'), requireHerramientaAccess('cotizaciones', contarCotizaciones), validateBody(CrearCotizacionSchema), ah(async (req: AuthRequest, res: Response) => {
  const {
    cliente_nombre, cliente_empresa, cliente_email, cliente_telefono,
    items = [], descuento_pct = 0, impuesto_tasa = 0, impuesto_nombre = 'IVA',
    moneda, estado = 'borrador', fecha_vencimiento, notas, negocio_id, producto_id, cliente_id,
  } = req.body as {
    cliente_id?: string | null;
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

  // Negocio, producto y cliente tienen que ser de ESTA cuenta. El esquema
  // aceptaba cliente_id pero el alta lo descartaba: ninguna cotización quedaba
  // ligada a su expediente del CRM.
  if (negocio_id && !(await AppDataSource.getRepository(Negocio).exists({ where: { id: negocio_id, usuario_id: req.userId! } }))) {
    res.status(404).json({ error: 'Negocio no encontrado' });
    return;
  }
  if (producto_id && !(await AppDataSource.getRepository(Producto).exists({ where: { id: producto_id, usuario_id: req.userId! } }))) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }
  if (cliente_id && !(await AppDataSource.getRepository(Cliente).exists({ where: { id: cliente_id, usuario_id: req.userId! } }))) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }

  const { subtotal, descuento_monto, impuesto_monto, total } = calcTotales(items, descuento_pct, impuesto_tasa);
  const fuera = totalFueraDeRango({ subtotal, total });
  if (fuera) { res.status(400).json({ error: fuera }); return; }
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
      cliente_id:       cliente_id ?? null,
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

  // Ya vendida, sus importes son los de la venta y su asiento: cambiarlos aquí
  // dejaba la cotización diciendo una cosa y la venta y la contabilidad otra.
  // Solo se pueden cambiar las notas; para otra propuesta se duplica.
  const vendida = (await ventasVigentes([cot.id])).get(cot.id);
  if (vendida && Object.keys(req.body ?? {}).some((campo) => campo !== 'notas')) {
    res.status(409).json({
      error: `Esta cotización ya se vendió (${vendida.numero_ticket}): solo puedes cambiar sus notas. Para otra propuesta, duplícala.`,
      venta_id: vendida.id,
    });
    return;
  }

  const {
    cliente_nombre, cliente_empresa, cliente_email, cliente_telefono,
    items, descuento_pct, impuesto_tasa, impuesto_nombre,
    moneda, estado, fecha_vencimiento, notas,
  } = req.body;

  if (cliente_nombre !== undefined) cot.cliente_nombre   = cliente_nombre;
  if (cliente_empresa !== undefined) cot.cliente_empresa = cliente_empresa || null;
  if (cliente_email !== undefined)   cot.cliente_email   = cliente_email || null;
  if (cliente_telefono !== undefined) cot.cliente_telefono = cliente_telefono || null;
  if (moneda)                         cot.moneda          = moneda;
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
  const fuera = totalFueraDeRango(recalc);
  if (fuera) { res.status(400).json({ error: fuera }); return; }
  Object.assign(cot, recalc);

  await repo().save(cot);
  res.json(conVenta(cot, await ventasVigentes([cot.id])));
}));

// ─── DELETE /api/cotizaciones/:id ─────────────────────────────────────────────
router.delete('/:id', ah(async (req: AuthRequest, res: Response) => {
    const cot = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
    if (!cot) { res.status(404).json({ error: 'Cotización no encontrada' }); return; }
    // Con una venta (aunque se haya cancelado) es parte del historial de dinero:
    // la venta y sus asientos la citan. Antes se borraba y la venta perdía su
    // origen en silencio (la FK pone NULL).
    const ticket = await ventaDeCotizacion(cot.id);
    if (ticket) {
      res.status(409).json({
        error: `Esta cotización tiene la venta ${ticket} y no se puede eliminar: es parte del historial de ventas.`,
      });
      return;
    }
    await repo().remove(cot);
    res.json({ ok: true });
  }));

  // ─── POST /api/cotizaciones/:id/whatsapp ─────────────────────────────────────
  const WhatsAppSchema = z.object({ mensaje: z.string().max(4000).nullable().optional() });

  router.post('/:id/whatsapp', validateBody(WhatsAppSchema), ah(async (req: AuthRequest, res: Response) => {
    const cot = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
    if (!cot) { res.status(404).json({ error: 'Cotización no encontrada' }); return; }

    const { mensaje } = req.body as { mensaje?: string };
    const pais = await paisDeCuenta(req.userId!, cot.producto_id);
    const tel = cot.cliente_telefono ? telefonoWhatsApp(cot.cliente_telefono, pais) : '';
    const base = tel ? `https://wa.me/${tel}` : 'https://wa.me/';

    // El detalle va en el mensaje: antes decía «te envío la cotización» sin
    // nada adjunto y el cliente no veía qué se le cotizaba.
    const locale = getTaxConfig(pais).locale;
    const d = (v: unknown) => dineroTexto(Number(v), cot.moneda, locale);
    const items = Array.isArray(cot.items) ? cot.items : [];
    const visibles = items.slice(0, 20);
    const vigencia = cot.fecha_vencimiento
      ? new Date(`${cot.fecha_vencimiento}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
      : null;
    const msgDefault = [
      `Hola ${cot.cliente_nombre.split(' ')[0]}, te comparto la cotización *${cot.numero}*:`,
      '',
      ...visibles.map((it) => `• ${Number(it.cantidad)} × ${it.descripcion} — ${d(it.subtotal ?? Number(it.cantidad) * Number(it.precio_unitario))}`),
      items.length > visibles.length ? `…y ${items.length - visibles.length} concepto(s) más` : null,
      '',
      `Subtotal: ${d(cot.subtotal)}`,
      Number(cot.descuento_monto) > 0 ? `Descuento (${Number(cot.descuento_pct)}%): -${d(cot.descuento_monto)}` : null,
      Number(cot.impuesto_monto) > 0 ? `${cot.impuesto_nombre} (${Number(cot.impuesto_tasa)}%): ${d(cot.impuesto_monto)}` : null,
      `*Total: ${d(cot.total)}*`,
      vigencia ? `Válida hasta el ${vigencia}.` : null,
      '',
      '¿Tienes alguna pregunta?',
    ].filter((linea): linea is string => linea !== null).join('\n');
    const url = `${base}?text=${encodeURIComponent(mensaje?.trim() || msgDefault)}`;

    // Marcar como enviada si era borrador
    if (cot.estado === 'borrador') {
      cot.estado = 'enviada';
      await repo().save(cot);
    }

    res.json({ whatsapp_url: url, cotizacion: conVenta(cot, await ventasVigentes([cot.id])) });
  }));

  // ─── POST /api/cotizaciones/:id/convertir-venta ──────────────────────────────
  //
  // Cierra el ciclo cotizacion -> venta, que hasta ahora habia que rehacer a mano
  // en el POS. Sin esto no existe la tasa de conversion de cotizaciones.
  //
  // La venta se crea con el MISMO folio correlativo y el mismo advisory lock que
  // el POS (utils/folios.ts), asi que ambos caminos comparten una sola secuencia.
  // Mismo conteo que el POS (routes/pos.ts): el tope es de la herramienta, no del camino.
  const contarVentasPOS = (cuentaId: string) =>
    AppDataSource.getRepository(Venta).count({ where: { usuario_id: cuentaId, estado: 'completada' } });

  // Sin esquema, cualquier texto acababa en `ventas.metodo_pago` (varchar sin
  // CHECK) y aparecía como un método más en Reportes.
  const ConvertirVentaSchema = z.object({
    producto_id: z.string().uuid().optional(),
    metodo_pago: z.enum(['efectivo', 'tarjeta', 'transferencia', 'otro']).optional(),
  });

  router.post(
    '/:id/convertir-venta',
    idempotente('cotizacion_venta'),
    requireHerramienta('pos', contarVentasPOS),
    validateBody(ConvertirVentaSchema),
    ah(async (req: AuthRequest, res: Response) => {
    const cot = await repo().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
    if (!cot) { res.status(404).json({ error: 'Cotización no encontrada' }); return; }

    // Lo que dice si ya se vendió es la venta vigente, no el estado: «Aceptar»
    // marca 'aceptada' sin crear venta, y antes eso dejaba la cotización sin
    // forma de convertirse (409 «ya se convirtió» sin venta detrás).
    const previa = (await ventasVigentes([cot.id])).get(cot.id);
    if (previa) {
      res.status(409).json({ error: `Esta cotización ya se convirtió en la venta ${previa.numero_ticket}`, venta_id: previa.id });
      return;
    }
    if (!Array.isArray(cot.items) || cot.items.length === 0) {
      res.status(400).json({ error: 'La cotización no tiene items' });
      return;
    }

    // El producto define pais y moneda. Se acepta por body para cotizaciones
    // antiguas que se guardaron sin producto_id.
    const { producto_id: productoIdBody, metodo_pago } = req.body as z.infer<typeof ConvertirVentaSchema>;
    const productoId = cot.producto_id || productoIdBody;
    if (!productoId) {
      res.status(400).json({ error: 'producto_id es requerido (define el país y la moneda de la venta)' });
      return;
    }
    const producto = await AppDataSource.getRepository(Producto).findOne({
      where: { id: productoId, usuario_id: req.userId! },
    });
    if (!producto) { res.status(404).json({ error: 'Producto no encontrado' }); return; }

    // La contabilidad del producto va en su moneda: una cotización en dólares
    // entraba como 928 «pesos» y mezclaba monedas en los reportes.
    const monedaProducto = getTaxConfig(producto.pais || 'MX').moneda;
    if (cot.moneda && cot.moneda !== monedaProducto) {
      res.status(409).json({
        error: `La cotización está en ${cot.moneda} y la contabilidad de ${producto.nombre} en ${monedaProducto}. Duplícala en ${monedaProducto} para registrar la venta.`,
      });
      return;
    }

    const hoy = await hoyDePeticion(req);
    const venta = await AppDataSource.transaction(async manager => {
      // Primero se "toma" la cotización: el UPDATE bloquea la fila, así que dos
      // conversiones simultáneas se ponen en fila y la segunda ya ve la venta
      // de la primera. Antes la comprobación iba fuera de la transacción y tres
      // clics creaban tres ventas.
      const tomada = await manager
        .createQueryBuilder()
        .update(Cotizacion)
        .set({ estado: 'aceptada' })
        .where('id = :id AND usuario_id = :uid', { id: cot.id, uid: req.userId! })
        .execute();
      if (!tomada.affected) return null;
      const [yaVendida] = await manager.query(
        `SELECT 1 FROM ventas WHERE cotizacion_id = $1 AND estado <> 'cancelada' LIMIT 1`,
        [cot.id]
      );
      if (yaVendida) return null;

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
        subtotal:         r2(Number(cot.subtotal) - Number(cot.descuento_monto)),
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
      //
      // Como en el POS, cada línea va SIN impuesto y con el descuento ya
      // repartido, así que las líneas suman el subtotal de la venta (antes iban
      // antes del descuento y el margen por producto salía inflado).
      await manager.save(VentaItem, lineasDeVenta(cot).map((l) => manager.create(VentaItem, {
        venta_id:        v.id,
        item_pos_id:     null,
        nombre_snapshot: l.descripcion,
        precio_unitario: l.precio_unitario,
        cantidad:        l.cantidad,
        subtotal_linea:  l.subtotal_linea,
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

      // El impuesto cobrado se aparta como en el POS («IVA por pagar», hijo del
      // ingreso): sin él, la venta de una cotización inflaba la utilidad y el
      // IVA a declarar salía corto.
      if (Number(cot.impuesto_monto) > 0) {
        await manager.save(MovimientoContable, manager.create(MovimientoContable, {
          usuario_id:           req.userId!,
          creado_por_id:        req.trabajadorRealId ?? null,
          producto_id:          productoId,
          tipo:                 'egreso',
          descripcion:          `${cot.impuesto_nombre} por pagar — ${numeroTicket}`,
          categoria:            `${cot.impuesto_nombre} por pagar`,
          monto:                Number(cot.impuesto_monto),
          fecha:                v.fecha,
          parent_movimiento_id: mov.id,
          es_auto_generado:     true,
          tiene_cfdi:           true,
          fuente:               'cotizacion',
          referencia_tipo:      'cotizacion',
          referencia_id:        cot.id,
        }));
      }

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
