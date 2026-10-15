import { Router, Response } from 'express';
import { z } from 'zod';
import { Brackets, In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess, permiteAccion } from '../middleware/requirePlan';
import { validateBody, exigirUuid, esUuid, fechaISO } from '../middleware/validate';
import { ItemPOS } from '../models/ItemPOS';
import { Venta } from '../models/Venta';
import { VentaItem } from '../models/VentaItem';
import { Producto } from '../models/Producto';
import { Negocio } from '../models/Negocio';
import { MovimientoContable } from '../models/MovimientoContable';
import { ItemPOSInsumo } from '../models/ItemPOSInsumo';
import { InsumoInventario } from '../models/InsumoInventario';
import { Cotizacion } from '../models/Cotizacion';
import { CanalCobro } from '../models/CanalCobro';
import {
  calcularTotalesVenta,
  buildWhatsAppLink,
  CarritoLinea,
} from '../services/pos/posService';
import {
  calcularDesgloseComision,
  registrarAsientosComisionTransaccional,
} from '../services/contabilidad/comisionesService';
import { getTaxConfig } from '../utils/taxConfig';
import { siguienteFolioVenta } from '../utils/folios';
import { resolverClienteParaVenta } from '../services/crm/resolverCliente';
import { descontarInventarioPorVenta, devolverInventarioPorCancelacion } from '../services/pos/inventarioVenta';
import { auditarDinero } from '../services/auditoria/auditoriaDinero';
import { ah } from '../utils/asyncHandler';
import { hoyDePeticion } from '../utils/fechaLocal';
import { idempotente } from '../middleware/idempotency';
import { leerLimite, paginar, responderPagina } from '../utils/paginacion';
import { cantidad, dinero, MAX_DINERO, MAX_ENTERO } from '../utils/limitesNumericos';
import { r2 } from '../utils/dinero';

// Topes = columnas de `items_pos`, `venta_items`, `ventas` y `clientes`. Un
// texto más largo pasaba la validación y el INSERT respondía 500.
const CrearItemPOSSchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es requerido').max(255),
  descripcion: z.string().optional(),
  precio: dinero('precio'),
  categoria: z.string().max(100).optional(),
  imagen_url: z.string().max(500).optional(),
  emoji: z.string().refine((e) => [...e].length <= 8, 'emoji demasiado largo').optional(),
  negocio_id: z.string().uuid().nullable().optional(),
  orden: z.number().int().min(-MAX_ENTERO).max(MAX_ENTERO).optional(),
});

const LineaCarritoSchema = z.object({
  item_pos_id: z.string().uuid().nullable().optional(),
  nombre: z.string().min(1, 'nombre del item es requerido').max(255),
  precio_unitario: dinero('precio_unitario'),
  cantidad: cantidad('cantidad').refine((c) => c > 0, 'cantidad debe ser > 0'),
});

const CrearVentaSchema = z.object({
  producto_id: z.string().uuid('producto_id debe ser un UUID válido'),
  negocio_id: z.string().uuid().nullable().optional(),
  lineas: z.array(LineaCarritoSchema).min(1, 'El carrito debe tener al menos un producto'),
  metodo_pago: z.enum(['efectivo', 'tarjeta', 'transferencia', 'otro']).optional(),
  canal_cobro_id: z.string().uuid().nullable().optional(),
  cliente_nombre: z.string().max(200).optional(),
  cliente_telefono: z.string().max(30).optional(),
  // Vinculo con el CRM. Mutuamente excluyentes: o eliges un cliente que ya
  // existe, o lo das de alta en el momento. Sin ninguno de los dos, la venta
  // sigue funcionando como antes (publico general / texto libre).
  cliente_id: z.string().uuid().nullable().optional(),
  crear_cliente: z.object({
    nombre: z.string().trim().min(1, 'El nombre del cliente es requerido').max(200),
    telefono: z.string().max(30).optional(),
    email: z.string().email('Email invalido').max(200).optional(),
  }).optional(),
  notas: z.string().optional(),
  aplicar_impuesto: z.boolean().optional(),
  fecha: fechaISO('fecha inválida (YYYY-MM-DD)').optional(),
});

/**
 * Error de negocio lanzado DENTRO de la transaccion de venta para abortarla.
 * Se traduce a la respuesta HTTP fuera; cualquier otro error sube tal cual.
 */
class VentaError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'VentaError';
  }
}

const router = Router();
exigirUuid(router, 'id');
exigirUuid(router, 'productoId');
router.use(authenticate);
router.use(requireToolCapability('pos'));
// Desbloqueo por plan/selección para TODAS las rutas del POS (sin getCount: el
// tope de movimientos se aplica aparte, sólo al crear ventas). Sin esto, una
// cuenta que no tiene el POS activado podía leer y editar el catálogo.
router.use(requireHerramientaAccess('pos'));

// Límite freemium de movimientos del POS: cada venta cuenta como un movimiento.
// Se cuenta por la cuenta efectiva (owner) que requireToolCapability ya fijó en req.userId.
// Una venta cancelada no ocupa cuota del plan: antes se borraba y dejaba el
// hueco libre, y cancelar no debe costar más que equivocarse.
const contarVentasPOS = (cuentaId: string) =>
  AppDataSource.getRepository(Venta).count({ where: { usuario_id: cuentaId, estado: 'completada' } });



/** Categoría de los asientos que revierten una venta cancelada. */
const CATEGORIA_CANCELACION = 'Cancelaciones';

const repoItems = () => AppDataSource.getRepository(ItemPOS);
const repoVentas = () => AppDataSource.getRepository(Venta);
const repoVentaItems = () => AppDataSource.getRepository(VentaItem);
const repoProductos = () => AppDataSource.getRepository(Producto);
const repoNegocios = () => AppDataSource.getRepository(Negocio);
const repoMovs = () => AppDataSource.getRepository(MovimientoContable);

// ═══════════════════════════════════════════════════════════════════════════
// CATÁLOGO — items vendibles del POS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/pos/catalogo?negocio_id=...
router.get('/catalogo', ah(async (req: AuthRequest, res: Response) => {
  const negocioId = req.query.negocio_id as string | undefined;
  const items = await repoItems().find({
    where: negocioId
      ? { usuario_id: req.userId!, negocio_id: negocioId }
      : { usuario_id: req.userId! },
    order: { orden: 'ASC', fecha_creacion: 'DESC' },
  });
  res.json(items);
}));

// POST /api/pos/catalogo
router.post('/catalogo', validateBody(CrearItemPOSSchema), ah(async (req: AuthRequest, res: Response) => {
  const { nombre, descripcion, precio, categoria, imagen_url, emoji, negocio_id, orden } = req.body as {
    nombre: string;
    descripcion?: string;
    precio: number;
    categoria?: string;
    imagen_url?: string;
    emoji?: string;
    negocio_id?: string | null;
    orden?: number;
  };

  if (!nombre?.trim()) {
    res.status(400).json({ error: 'nombre es requerido' });
    return;
  }
  if (typeof precio !== 'number' || precio < 0 || !isFinite(precio)) {
    res.status(400).json({ error: 'precio debe ser un número >= 0' });
    return;
  }
  if (negocio_id && !(await repoNegocios().exists({ where: { id: negocio_id, usuario_id: req.userId! } }))) {
    res.status(404).json({ error: 'Negocio no encontrado' });
    return;
  }

  const item = repoItems().create({
    usuario_id: req.userId!,
    negocio_id: negocio_id ?? null,
    nombre: nombre.trim(),
    descripcion: descripcion?.trim() ?? null,
    precio: r2(precio),
    categoria: categoria?.trim() ?? null,
    imagen_url: imagen_url ?? null,
    emoji: emoji ?? null,
    activo: true,
    orden: orden ?? 0,
  });

  await repoItems().save(item);
  res.status(201).json(item);
}));

// PATCH /api/pos/catalogo/:id
const EditarItemPOSSchema = CrearItemPOSSchema.omit({ negocio_id: true }).partial().extend({ activo: z.boolean().optional() });

router.patch('/catalogo/:id', validateBody(EditarItemPOSSchema), ah(async (req: AuthRequest, res: Response) => {
  const item = await repoItems().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!item) {
    res.status(404).json({ error: 'Item no encontrado' });
    return;
  }

  const updatable = ['nombre', 'descripcion', 'precio', 'categoria', 'imagen_url', 'emoji', 'activo', 'orden'] as const;
  for (const k of updatable) {
    if (k in req.body) {
      const value = req.body[k];
      if (k === 'precio' && (typeof value !== 'number' || value < 0)) continue;
      (item as unknown as Record<string, unknown>)[k] = value;
    }
  }

  await repoItems().save(item);
  res.json(item);
}));

// DELETE /api/pos/catalogo/:id
router.delete('/catalogo/:id', ah(async (req: AuthRequest, res: Response) => {
  const item = await repoItems().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!item) {
    res.status(404).json({ error: 'Item no encontrado' });
    return;
  }
  await repoItems().remove(item);
  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECETA (BOM) — que insumos consume cada item del catalogo
// ═══════════════════════════════════════════════════════════════════════════

const RecetaSchema = z.object({
  insumos: z.array(z.object({
    insumo_id: z.string().uuid('insumo_id debe ser un UUID valido'),
    // item_pos_insumos.cantidad es numeric(12,3).
    cantidad: cantidad('cantidad').refine((c) => c > 0, 'cantidad debe ser > 0'),
  })).max(50, 'Maximo 50 insumos por receta'),
});

// GET /api/pos/catalogo/:id/receta
router.get('/catalogo/:id/receta', ah(async (req: AuthRequest, res: Response) => {
  const item = await repoItems().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!item) {
    res.status(404).json({ error: 'Item no encontrado' });
    return;
  }

  const receta = await AppDataSource.getRepository(ItemPOSInsumo)
    .createQueryBuilder('r')
    .leftJoin(InsumoInventario, 'i', 'i.id = r.insumo_id')
    .select([
      'r.id AS id',
      'r.insumo_id AS insumo_id',
      'r.cantidad AS cantidad',
      'i.nombre AS insumo_nombre',
      'i.unidad AS unidad',
      'i.costo_promedio AS costo_promedio',
      'i.stock_actual AS stock_actual',
    ])
    .where('r.usuario_id = :uid', { uid: req.userId! })
    .andWhere('r.item_pos_id = :itemId', { itemId: item.id })
    .orderBy('i.nombre', 'ASC')
    .getRawMany();

  // Costo unitario del item = suma de (cantidad x costo promedio del insumo).
  const costo_unitario = receta.reduce(
    (acc, r) => acc + Number(r.cantidad ?? 0) * Number(r.costo_promedio ?? 0),
    0,
  );

  res.json({ receta, costo_unitario: Math.round(costo_unitario * 10000) / 10000 });
}));

// PUT /api/pos/catalogo/:id/receta — reemplaza la receta completa.
//
// Reemplazo total en vez de altas/bajas sueltas: el editor del front trabaja
// sobre la lista entera, y asi no existen estados intermedios donde la receta
// quede a medias mientras alguien cobra.
router.put('/catalogo/:id/receta', validateBody(RecetaSchema), ah(async (req: AuthRequest, res: Response) => {
  const item = await repoItems().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!item) {
    res.status(404).json({ error: 'Item no encontrado' });
    return;
  }

  const { insumos } = req.body as { insumos: { insumo_id: string; cantidad: number }[] };

  // Un insumo repetido se descontaria dos veces al vender.
  const ids = insumos.map((i) => i.insumo_id);
  if (new Set(ids).size !== ids.length) {
    res.status(400).json({ error: 'Hay insumos repetidos en la receta' });
    return;
  }

  // Todos los insumos deben ser de esta cuenta.
  if (ids.length > 0) {
    const validos = await AppDataSource.getRepository(InsumoInventario).count({
      where: { id: In(ids), usuario_id: req.userId! },
    });
    if (validos !== ids.length) {
      res.status(404).json({ error: 'Algun insumo no existe o no pertenece a tu cuenta' });
      return;
    }
  }

  await AppDataSource.transaction(async manager => {
    await manager.delete(ItemPOSInsumo, { item_pos_id: item.id, usuario_id: req.userId! });
    if (insumos.length > 0) {
      await manager.save(ItemPOSInsumo, insumos.map((i) => manager.create(ItemPOSInsumo, {
        usuario_id:  req.userId!,
        item_pos_id: item.id,
        insumo_id:   i.insumo_id,
        cantidad:    i.cantidad,
      })));
    }
  });

  res.json({ ok: true, insumos: insumos.length });
}));

// GET /api/pos/canales?producto_id=… — medios de cobro activos para el selector
// de la caja. Es la misma lista que GET /contabilidad/:productoId/canales, pero
// con el permiso del POS: un cajero sin Contabilidad recibía 403, no podía
// elegir la terminal con la que cobraba y la comisión de su venta no se
// registraba. Solo lectura y solo los campos que usa el selector.
router.get('/canales', ah(async (req: AuthRequest, res: Response) => {
  const productoId = typeof req.query.producto_id === 'string' ? req.query.producto_id : '';
  if (!esUuid(productoId)) return res.status(400).json({ error: 'producto_id requerido' });
  const canales = await AppDataSource.getRepository(CanalCobro)
    .createQueryBuilder('c')
    .select(['c.id', 'c.nombre', 'c.tipo_canal', 'c.institucion', 'c.comision_porcentaje', 'c.comision_fija', 'c.activo'])
    .where('c.usuario_id = :uid', { uid: req.userId! })
    .andWhere('(c.producto_id = :productoId OR c.producto_id IS NULL)', { productoId })
    .andWhere('c.activo = true')
    .orderBy('c.tipo_canal', 'ASC')
    .addOrderBy('c.nombre', 'ASC')
    .getMany();
  res.json(canales);
}));

// ═══════════════════════════════════════════════════════════════════════════
// VENTAS — crear, listar, ver detalle. Integración Finanzas automática.
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/pos/ventas?producto_id=...&desde=2026-01-01&hasta=2026-05-30
router.get('/ventas', ah(async (req: AuthRequest, res: Response) => {
  const { producto_id, desde, hasta } = req.query as Record<string, string | undefined>;

  if (
    (producto_id && !esUuid(producto_id)) ||
    (desde && !fechaISO().safeParse(desde).success) ||
    (hasta && !fechaISO().safeParse(hasta).success)
  ) {
    res.status(400).json({ error: 'Filtros inválidos (producto_id UUID, fechas YYYY-MM-DD)' });
    return;
  }

  // Sin join en la consulta paginada: con `leftJoinAndSelect(items)` + LIMIT,
  // TypeORM limitaba FILAS unidas y con 2 ítems por venta salían 100 ventas
  // (y la última podía venir con ítems incompletos). Los ítems van aparte.
  const qb = repoVentas().createQueryBuilder('v').where('v.usuario_id = :uid', { uid: req.userId });
  if (producto_id) qb.andWhere('v.producto_id = :pid', { pid: producto_id });
  if (desde)       qb.andWhere('v.fecha >= :desde', { desde });
  if (hasta)       qb.andWhere('v.fecha <= :hasta', { hasta });

  const pagina = await paginar(
    qb,
    [{ expr: 'v.fecha', tipo: 'date' }, { expr: 'v.fecha_creacion', tipo: 'timestamp' }, { expr: 'v.id', tipo: 'uuid' }],
    req.query.antes,
    leerLimite(req.query.limite)
  );
  if (!pagina) { res.status(400).json({ error: 'Cursor de paginación inválido' }); return; }

  const ids = pagina.filas.map((v) => v.id);
  const items = ids.length ? await repoVentaItems().find({ where: { venta_id: In(ids) } }) : [];
  const porVenta = new Map<string, VentaItem[]>();
  for (const it of items) porVenta.set(it.venta_id, [...(porVenta.get(it.venta_id) ?? []), it]);
  for (const v of pagina.filas) v.items = porVenta.get(v.id) ?? [];
  responderPagina(res, pagina);
}));

// GET /api/pos/ventas/:id
router.get('/ventas/:id', ah(async (req: AuthRequest, res: Response) => {
  const venta = await repoVentas().findOne({
    where: { id: req.params.id, usuario_id: req.userId! },
    relations: ['items', 'producto', 'negocio'],
  });
  if (!venta) {
    res.status(404).json({ error: 'Venta no encontrada' });
    return;
  }
  res.json(venta);
}));

// POST /api/pos/ventas — crea venta + items + movimientos contables
router.post('/ventas', idempotente('pos_venta'), requireHerramientaAccess('pos', contarVentasPOS), validateBody(CrearVentaSchema), ah(async (req: AuthRequest, res: Response) => {
  const {
    producto_id,
    negocio_id,
    lineas,
    metodo_pago,
    canal_cobro_id,
    cliente_nombre,
    cliente_telefono,
    cliente_id,
    crear_cliente,
    notas,
    aplicar_impuesto,
    fecha,
  } = req.body as {
    producto_id: string;
    negocio_id?: string | null;
    lineas: CarritoLinea[];
    metodo_pago?: 'efectivo' | 'tarjeta' | 'transferencia' | 'otro';
    canal_cobro_id?: string | null;
    cliente_nombre?: string;
    cliente_telefono?: string;
    cliente_id?: string | null;
    crear_cliente?: { nombre: string; telefono?: string; email?: string };
    notas?: string;
    aplicar_impuesto?: boolean; // sin él, lo que diga el punto de cobro
    fecha?: string;
  };

  if (!producto_id) {
    res.status(400).json({ error: 'producto_id es requerido (define el país y el impuesto aplicable)' });
    return;
  }

  // 1. Validar que el producto pertenece al usuario y obtener su país
  const producto = await repoProductos().findOne({ where: { id: producto_id, usuario_id: req.userId! } });
  if (!producto) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }
  const pais = (producto.pais || 'MX').toUpperCase();
  if (negocio_id && !(await repoNegocios().exists({ where: { id: negocio_id, usuario_id: req.userId! } }))) {
    res.status(404).json({ error: 'Negocio no encontrado' });
    return;
  }

  // 1.b El precio lo manda el catálogo, no el cliente.
  //
  // Antes se cobraba el `precio_unitario` del cuerpo aunque la línea viniera de
  // un item del catálogo, y el `item_pos_id` ni siquiera se comprobaba como
  // propio: un cajero podía cobrar lo que quisiera (o enlazar un item ajeno,
  // que además no descontaba inventario). Ahora el item tiene que ser de la
  // cuenta, y cobrar otro precio exige el permiso `precio_libre`.
  const idsCatalogo = [...new Set(
    (lineas ?? []).map((l) => l.item_pos_id).filter((id): id is string => typeof id === 'string'),
  )];
  const precioCatalogoPorItem = new Map<string, number>();
  if (idsCatalogo.length > 0) {
    const itemsCatalogo = await repoItems().find({
      where: { id: In(idsCatalogo), usuario_id: req.userId! },
    });
    if (itemsCatalogo.length !== idsCatalogo.length) {
      res.status(404).json({ error: 'Algún producto del carrito no está en tu catálogo' });
      return;
    }
    for (const item of itemsCatalogo) precioCatalogoPorItem.set(item.id, Number(item.precio));
  }

  const fueraDeCatalogo = (lineas ?? []).filter((l) => {
    if (!l.item_pos_id) return false;
    const precioLista = precioCatalogoPorItem.get(l.item_pos_id);
    return precioLista !== undefined && Math.abs(Number(l.precio_unitario) - precioLista) >= 0.01;
  });
  if (fueraDeCatalogo.length > 0 && !(await permiteAccion(req, 'precio_libre'))) {
    const ejemplo = fueraDeCatalogo[0];
    res.status(403).json({
      error: `El precio de "${ejemplo.nombre}" no coincide con el del catálogo (${precioCatalogoPorItem.get(ejemplo.item_pos_id!)}). Actualiza el catálogo o pide permiso para cobrar otro precio.`,
      permiso: 'precio_libre',
    });
    return;
  }

  // 2. Totales. El precio del catálogo es el precio al público con el impuesto
  // dentro; si el negocio lo cobra (configuración del punto de cobro, o
  // `aplicar_impuesto` si viene) se desglosa, y si no, el total es el mismo
  // sin impuesto registrado.
  let totales;
  try {
    totales = calcularTotalesVenta(lineas, pais, {
      cobraImpuesto: aplicar_impuesto ?? producto.cobra_impuesto_consumo,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Carrito inválido' });
    return;
  }

  // El total de un carrito de líneas válidas aún puede desbordar numeric(12,2).
  if (totales.total > MAX_DINERO) {
    res.status(400).json({ error: 'El total de la venta es demasiado grande' });
    return;
  }

  const hoy = await hoyDePeticion(req);
  const fechaVenta = fecha || hoy;

  // 3+4. Generar folio y crear registros en una sola transacción atómica.
  // El advisory lock serializa la generación de número de ticket por usuario,
  // igual que cotizaciones — evita duplicados bajo requests concurrentes.
  let resultadoTx;
  try {
    resultadoTx = await AppDataSource.transaction(async manager => {
      const numeroTicket = await siguienteFolioVenta(manager, req.userId!);

      // Vinculo con el CRM. Se resuelve DENTRO de la transaccion para que la
      // validacion de pertenencia del cliente no tenga ventana de carrera.
      const resCliente = await resolverClienteParaVenta(manager, {
        usuarioId:     req.userId!,
        trabajadorId:  req.trabajadorRealId ?? null,
        negocioId:     negocio_id ?? null,
        productoId:    producto_id,
        clienteId:     cliente_id ?? null,
        crearCliente:  crear_cliente ?? null,
        nombreLibre:   cliente_nombre ?? null,
        telefonoLibre: cliente_telefono ?? null,
        hoy,
      });
      if (!resCliente.ok) throw new VentaError(resCliente.status, resCliente.error);

      // Calcular comisiones de terminal o canal si se especificó
      let canalCobro: CanalCobro | null = null;
      let desgloseComision = null;
      if (canal_cobro_id) {
        canalCobro = await manager.findOne(CanalCobro, {
          where: { id: canal_cobro_id, usuario_id: req.userId!, activo: true },
        });
        // Ignorarlo en silencio cobraba la venta sin descontar la comisión.
        if (!canalCobro) throw new VentaError(404, 'Canal de cobro no encontrado');
        // El IVA de la comisión lo cobra la terminal según su país, no según el
        // impuesto de la venta (que puede ser 0 % si el producto está exento).
        // Las retenciones de plataformas van sobre la venta sin el impuesto
        // que ya trae el precio (totales.impuesto_monto; 0 si no se cobra).
        desgloseComision = calcularDesgloseComision(
          totales.total,
          canalCobro,
          getTaxConfig(pais).consumo.tasa,
          totales.impuesto_monto
        );
      }

      const descripcionMov = `${numeroTicket} — ${totales.lineas.length} item(s)${resCliente.cliente_nombre ? ` — ${resCliente.cliente_nombre}` : ''}${canalCobro ? ` [${canalCobro.nombre}]` : ''}`;

      const v = manager.create(Venta, {
        usuario_id:         req.userId!,
        creado_por_id:      req.trabajadorRealId ?? null,
        producto_id,
        negocio_id:         negocio_id ?? null,
        numero_ticket:      numeroTicket,
        fecha:              fechaVenta,
        subtotal:           totales.subtotal,
        impuesto_monto:     totales.impuesto_monto,
        impuesto_tasa:      totales.impuesto_tasa,
        impuesto_nombre:    totales.impuesto_nombre,
        moneda:             totales.moneda,
        total:              totales.total,
        metodo_pago:        metodo_pago || (canalCobro?.tipo_canal === 'delivery' ? 'otro' : canalCobro?.tipo_canal === 'terminal' ? 'tarjeta' : 'efectivo'),
        canal_cobro_id:     canalCobro?.id ?? null,
        comision_monto:     desgloseComision?.comisionBase ?? 0,
        comision_iva:       desgloseComision?.comisionIva ?? 0,
        monto_neto:         desgloseComision?.montoNeto ?? totales.total,
        cliente_id:         resCliente.cliente_id,
        cliente_nombre:     resCliente.cliente_nombre,
        cliente_telefono:   resCliente.cliente_telefono,
        notas:              notas?.trim() || null,
        estado:             'completada',
      });
      await manager.save(Venta, v);

      const ventaItems = totales.lineas.map((l) =>
        manager.create(VentaItem, {
          venta_id:        v.id,
          item_pos_id:     l.item_pos_id ?? null,
          nombre_snapshot: l.nombre,
          precio_unitario: l.precio_unitario,
          precio_catalogo: l.item_pos_id ? precioCatalogoPorItem.get(l.item_pos_id) ?? null : null,
          cantidad:        l.cantidad,
          subtotal_linea:  l.subtotal_linea,
        })
      );
      await manager.save(VentaItem, ventaItems);

      // Almacen: expande la receta de cada item, descuenta stock y devuelve el
      // costo unitario de cada linea. Va dentro de la transaccion a proposito: si
      // el descuento falla, la venta no debe existir.
      const inv = await descontarInventarioPorVenta(manager, {
        usuarioId:    req.userId!,
        trabajadorId: req.trabajadorRealId ?? null,
        ventaId:      v.id,
        productoId:   producto_id,
        numeroTicket,
        fecha:        fechaVenta,
        lineas:       totales.lineas.map((l) => ({
          item_pos_id: l.item_pos_id ?? null,
          nombre:      l.nombre,
          cantidad:    l.cantidad,
        })),
      });

      // Congelar el costo en la linea. Sin esto el margen historico se pierde en
      // cuanto cambie el costo promedio de cualquier insumo.
      //
      // Los indices de `costoUnitarioPorLinea` y de `ventaItems` coinciden
      // porque ambos se construyen recorriendo `totales.lineas` en el mismo
      // orden; el servicio devuelve siempre una entrada por linea.
      const conCosto: VentaItem[] = [];
      ventaItems.forEach((item, i) => {
        const costo = inv.costoUnitarioPorLinea[i];
        if (costo === null || costo === undefined) return;
        item.costo_unitario_snapshot = costo;
        conCosto.push(item);
      });
      if (conCosto.length > 0) await manager.save(VentaItem, conCosto);

      const movPadre = manager.create(MovimientoContable, {
        usuario_id:           req.userId!,
        creado_por_id:        req.trabajadorRealId ?? null,
        producto_id,
        tipo:                 'ingreso',
        descripcion:          descripcionMov,
        categoria:            'Ventas POS',
        monto:                totales.total,
        fecha:                fechaVenta,
        parent_movimiento_id: null,
        es_auto_generado:     false,
        tiene_cfdi:           true,
        // Sigue siendo una venta del POS (filtros y etiquetas); el canal va en canal_cobro_id.
        fuente:               'pos',
        batch_id:             null,
        referencia_tipo:      'venta',
        referencia_id:        v.id,
        canal_cobro_id:       canalCobro?.id ?? null,
        canal_nombre_snapshot: canalCobro?.nombre ?? null,
        institucion_snapshot: canalCobro?.institucion ?? null,
        monto_bruto:          desgloseComision ? desgloseComision.montoBruto : null,
        comision_monto:       desgloseComision ? desgloseComision.comisionBase : null,
        comision_iva:         desgloseComision ? desgloseComision.comisionIva : null,
        retencion_monto:      desgloseComision ? (desgloseComision.retencionIsr + desgloseComision.retencionIva) : null,
        monto_neto:           desgloseComision ? desgloseComision.montoNeto : totales.total,
        // Solo queda por cobrar lo que deposita un tercero días después; efectivo
        // y canales de liquidación inmediata ya están en caja.
        estado_liquidacion:   canalCobro && canalCobro.dias_liquidacion > 0 ? 'pendiente' : 'liquidado',
        fecha_liquidacion:    canalCobro && canalCobro.dias_liquidacion > 0 ? null : fechaVenta,
      });
      await manager.save(MovimientoContable, movPadre);

      // Si hay comisiones de terminal o delivery, registrar egresos automáticos hijos
      if (desgloseComision && canalCobro) {
        await registrarAsientosComisionTransaccional(manager, {
          movPadre,
          canal: canalCobro,
          desglose: desgloseComision,
          usuarioId: req.userId!,
          productoId: producto_id,
          fecha: fechaVenta,
          creadoPorId: req.trabajadorRealId,
          fuente: 'pos',
          referenciaTipo: 'venta',
          referenciaId: v.id,
        });
      }

      if (totales.impuesto_monto > 0) {
        const movImpuesto = manager.create(MovimientoContable, {
          usuario_id:           req.userId!,
          creado_por_id:        req.trabajadorRealId ?? null,
          producto_id,
          tipo:                 'egreso',
          descripcion:          `${totales.impuesto_nombre} por pagar — ${numeroTicket}`,
          categoria:            `${totales.impuesto_nombre} por pagar`,
          monto:                totales.impuesto_monto,
          fecha:                fechaVenta,
          parent_movimiento_id: movPadre.id,
          es_auto_generado:     true,
          tiene_cfdi:           true,
          fuente:               'pos',
          batch_id:             null,
          referencia_tipo:      'venta',
          referencia_id:        v.id,
        });
        await manager.save(MovimientoContable, movImpuesto);
      }

      v.movimiento_contable_id = movPadre.id;
      await manager.save(Venta, v);

      // Un descuento del cajero deja de ser invisible.
      if (fueraDeCatalogo.length > 0) {
        await auditarDinero(manager, req, {
          accion:     'precio_fuera_de_catalogo',
          entidad:    'venta',
          entidadId:  v.id,
          productoId: producto_id,
          montoAntes: r2(fueraDeCatalogo.reduce(
            (suma, l) => suma + (precioCatalogoPorItem.get(l.item_pos_id!) ?? 0) * Number(l.cantidad), 0)),
          montoDespues: r2(fueraDeCatalogo.reduce(
            (suma, l) => suma + Number(l.precio_unitario) * Number(l.cantidad), 0)),
          detalle: {
            numero_ticket: numeroTicket,
            lineas: fueraDeCatalogo.map((l) => ({
              nombre: l.nombre,
              precio_catalogo: precioCatalogoPorItem.get(l.item_pos_id!) ?? null,
              precio_cobrado: Number(l.precio_unitario),
              cantidad: Number(l.cantidad),
            })),
          },
        });
      }

      return { venta: v, movPadreId: movPadre.id, advertencias: inv.advertencias };
    });
  } catch (err) {
    if (err instanceof VentaError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
  const { venta, movPadreId, advertencias } = resultadoTx;

  // 6. Construir respuesta enriquecida
  const cfg = getTaxConfig(pais);
  const ventaCompleta = await repoVentas().findOne({
    where: { id: venta.id },
    relations: ['items', 'cliente'],
  });

  res.status(201).json({
    venta: ventaCompleta,
    // Stock que no alcanzaba. La venta se completo igual: el cobro es real
    // aunque el inventario este mal capturado. El front las pinta en el ticket.
    advertencias,
    tax_config: {
      pais: cfg.pais,
      nombre_pais: cfg.nombre,
      moneda: cfg.moneda,
      simbolo: cfg.simbolo,
      locale: cfg.locale,
      impuesto: cfg.consumo,
    },
    movimiento_contable_id: movPadreId,
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// CANCELACIÓN — nunca se borra una venta
// ═══════════════════════════════════════════════════════════════════════════

const CancelarVentaSchema = z.object({
  motivo: z.string().trim().max(300).optional(),
});

/**
 * Cancela una venta: la deja en `estado = 'cancelada'`, le genera asientos
 * contables INVERSOS, devuelve la mercancía al almacén con movimientos de
 * entrada y deja constancia en la auditoría de dinero.
 *
 * Antes esto era un DELETE: la venta, sus ítems y sus asientos desaparecían sin
 * rastro, y cualquier trabajador con acceso al POS podía hacerlo. Ese es el
 * fraude de caja de manual (cobrar, borrar la venta y quedarse el efectivo), y
 * además descuadraba Contabilidad contra Reportes. Ahora hace falta el permiso
 * `cancelar_ventas` y todo queda registrado.
 *
 * Los asientos inversos llevan la fecha de HOY, no la de la venta: un cierre de
 * mes ya entregado no se toca hacia atrás.
 */
async function cancelarVenta(req: AuthRequest, res: Response): Promise<void> {
  if (!(await permiteAccion(req, 'cancelar_ventas'))) {
    res.status(403).json({
      error: 'No tienes permiso para cancelar ventas. Pídeselo al dueño de la cuenta.',
      permiso: 'cancelar_ventas',
    });
    return;
  }

  const motivo = ((req.body as { motivo?: string } | undefined)?.motivo ?? '').trim() || null;
  const hoy = await hoyDePeticion(req);

  try {
    const ventaCancelada = await AppDataSource.transaction(async manager => {
      // El bloqueo de fila evita que dos cancelaciones simultáneas generen dos
      // juegos de asientos inversos.
      const venta = await manager.findOne(Venta, {
        where: { id: req.params.id, usuario_id: req.userId! },
        lock: { mode: 'pessimistic_write' },
      });
      if (!venta) throw new VentaError(404, 'Venta no encontrada');
      if (venta.estado === 'cancelada') throw new VentaError(409, 'La venta ya está cancelada');

      // Asientos inversos: mismo importe, tipo contrario. Se excluyen los que ya
      // son una cancelación para no invertir una inversión. Además de los que
      // referencian la venta, entra su asiento principal con sus hijos: los de
      // una venta que nació de una cotización referencian la cotización, y antes
      // cancelarla dejaba su ingreso vivo en Contabilidad.
      const asientos = await manager
        .createQueryBuilder(MovimientoContable, 'm')
        .where('m.usuario_id = :uid', { uid: req.userId! })
        .andWhere(new Brackets((qb) => {
          qb.where("m.referencia_tipo = 'venta' AND m.referencia_id = :ventaId", { ventaId: venta.id });
          if (venta.movimiento_contable_id) {
            qb.orWhere('(m.id = :principal OR m.parent_movimiento_id = :principal)', { principal: venta.movimiento_contable_id });
          }
        }))
        .getMany();
      const inversos = asientos
        .filter((mov) => mov.categoria !== CATEGORIA_CANCELACION)
        .map((mov) =>
          manager.create(MovimientoContable, {
            usuario_id:           req.userId!,
            creado_por_id:        req.trabajadorRealId ?? null,
            producto_id:          mov.producto_id,
            tipo:                 mov.tipo === 'ingreso' ? 'egreso' : 'ingreso',
            descripcion:          `Cancelación ${venta.numero_ticket} — ${mov.descripcion}`.slice(0, 255),
            categoria:            CATEGORIA_CANCELACION,
            monto:                mov.monto,
            fecha:                hoy,
            parent_movimiento_id: null,
            // Qué revierte: los agregados restan el reverso de la clase del original.
            revierte_movimiento_id: mov.id,
            es_auto_generado:     true,
            tiene_cfdi:           false,
            fuente:               mov.fuente,
            batch_id:             null,
            referencia_tipo:      'venta',
            referencia_id:        venta.id,
            canal_cobro_id:       mov.canal_cobro_id,
            canal_nombre_snapshot: mov.canal_nombre_snapshot,
            institucion_snapshot: mov.institucion_snapshot,
            estado_liquidacion:   'liquidado',
            fecha_liquidacion:    hoy,
          }),
        );
      if (inversos.length > 0) await manager.save(MovimientoContable, inversos);

      await devolverInventarioPorCancelacion(manager, {
        usuarioId:    req.userId!,
        trabajadorId: req.trabajadorRealId ?? null,
        ventaId:      venta.id,
        numeroTicket: venta.numero_ticket,
        fecha:        hoy,
      });

      // La cotización de origen vuelve a estar pendiente: dejarla como
      // 'aceptada' sin venta detrás inflaría la tasa de conversión.
      if (venta.cotizacion_id) {
        await manager.update(
          Cotizacion,
          { id: venta.cotizacion_id, usuario_id: req.userId! },
          { estado: 'enviada' },
        );
      }

      venta.estado = 'cancelada';
      venta.cancelada_por_id = req.trabajadorRealId ?? req.userId!;
      venta.motivo_cancelacion = motivo;
      venta.fecha_cancelacion = new Date();
      await manager.save(Venta, venta);

      await auditarDinero(manager, req, {
        accion:      'venta_cancelada',
        entidad:     'venta',
        entidadId:   venta.id,
        productoId:  venta.producto_id,
        montoAntes:  Number(venta.total),
        montoDespues: 0,
        motivo,
        detalle: {
          numero_ticket: venta.numero_ticket,
          fecha_venta: venta.fecha,
          asientos_inversos: inversos.length,
        },
      });

      return venta;
    });

    res.json({ ok: true, venta: ventaCancelada });
  } catch (err) {
    if (err instanceof VentaError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
}

// POST /api/pos/ventas/:id/cancelar — forma recomendada (admite motivo)
router.post('/ventas/:id/cancelar', validateBody(CancelarVentaSchema), ah(cancelarVenta));

// DELETE /api/pos/ventas/:id — alias histórico. Ya NO borra: cancela igual que
// la ruta de arriba. Se mantiene para no romper clientes antiguos.
router.delete('/ventas/:id', ah(cancelarVenta));

// ═══════════════════════════════════════════════════════════════════════════
// PUNTO DE COBRO — si el negocio cobra el impuesto al consumo
// ═══════════════════════════════════════════════════════════════════════════

const PuntoCobroSchema = z.object({ cobra_impuesto: z.boolean() });

const puntoCobroDe = (producto: Producto) => {
  const cfg = getTaxConfig(producto.pais || 'MX');
  return {
    producto_id: producto.id,
    cobra_impuesto: producto.cobra_impuesto_consumo,
    impuesto: { nombre: cfg.consumo.nombre, tasa: cfg.consumo.tasa },
  };
};

// GET /api/pos/punto-cobro/:productoId
router.get('/punto-cobro/:productoId', ah(async (req: AuthRequest, res: Response) => {
  const producto = await repoProductos().findOne({ where: { id: req.params.productoId, usuario_id: req.userId! } });
  if (!producto) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }
  res.json({ ...puntoCobroDe(producto), puede_cambiar: !req.trabajadorRealId });
}));

// PATCH /api/pos/punto-cobro/:productoId — solo el dueño: es su régimen fiscal.
router.patch('/punto-cobro/:productoId', validateBody(PuntoCobroSchema), ah(async (req: AuthRequest, res: Response) => {
  if (req.trabajadorRealId) {
    res.status(403).json({ error: 'Solo el dueño de la cuenta puede cambiar si el negocio cobra impuestos.' });
    return;
  }
  const producto = await repoProductos().findOne({ where: { id: req.params.productoId, usuario_id: req.userId! } });
  if (!producto) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }
  producto.cobra_impuesto_consumo = (req.body as { cobra_impuesto: boolean }).cobra_impuesto;
  await repoProductos().update(producto.id, { cobra_impuesto_consumo: producto.cobra_impuesto_consumo });
  res.json({ ...puntoCobroDe(producto), puede_cambiar: true });
}));

// ═══════════════════════════════════════════════════════════════════════════
// TICKET — enlace de WhatsApp con el ticket en el texto
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/pos/ventas/:id/whatsapp — devuelve el wa.me link listo
router.get('/ventas/:id/whatsapp', ah(async (req: AuthRequest, res: Response) => {
  const venta = await repoVentas().findOne({
    where: { id: req.params.id, usuario_id: req.userId! },
    relations: ['negocio', 'producto', 'items'],
  });
  if (!venta) {
    res.status(404).json({ error: 'Venta no encontrada' });
    return;
  }

  const cfg = getTaxConfig(venta.producto?.pais || 'MX');
  const impuesto = Number(venta.impuesto_monto);

  const link = buildWhatsAppLink({
    telefono:       venta.cliente_telefono,
    pais:           venta.producto?.pais,
    nombreNegocio:  venta.negocio?.nombre || venta.producto?.nombre || '',
    numeroTicket:   venta.numero_ticket,
    fecha:          venta.fecha,
    lineas:         (venta.items ?? []).map((it) => ({
      nombre:   it.nombre_snapshot,
      cantidad: Number(it.cantidad),
      importe:  r2(Number(it.precio_unitario) * Number(it.cantidad)),
    })),
    total:          Number(venta.total),
    impuesto:       impuesto > 0 ? { nombre: venta.impuesto_nombre || cfg.consumo.nombre, monto: impuesto } : null,
    moneda:         venta.moneda,
    simbolo:        cfg.simbolo,
    locale:         cfg.locale,
  });

  res.json({ whatsapp_url: link });
}));

export default router;
