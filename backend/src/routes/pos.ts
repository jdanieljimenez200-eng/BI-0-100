import { Router, Response } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolCapability, requireHerramientaAccess } from '../middleware/requirePlan';
import { validateBody, exigirUuid } from '../middleware/validate';
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
import { descontarInventarioPorVenta, revertirInventarioPorVenta } from '../services/pos/inventarioVenta';
import { ah } from '../utils/asyncHandler';

const CrearItemPOSSchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es requerido'),
  descripcion: z.string().optional(),
  precio: z.number({ invalid_type_error: 'precio debe ser un número' }).min(0, 'precio debe ser un número >= 0'),
  categoria: z.string().optional(),
  imagen_url: z.string().optional(),
  emoji: z.string().optional(),
  negocio_id: z.string().uuid().nullable().optional(),
  orden: z.number().int().optional(),
});

const LineaCarritoSchema = z.object({
  item_pos_id: z.string().uuid().nullable().optional(),
  nombre: z.string().min(1, 'nombre del item es requerido'),
  precio_unitario: z.number().min(0, 'precio_unitario debe ser >= 0'),
  cantidad: z.number().positive('cantidad debe ser > 0'),
});

const CrearVentaSchema = z.object({
  producto_id: z.string().uuid('producto_id debe ser un UUID válido'),
  negocio_id: z.string().uuid().nullable().optional(),
  lineas: z.array(LineaCarritoSchema).min(1, 'El carrito debe tener al menos un producto'),
  metodo_pago: z.enum(['efectivo', 'tarjeta', 'transferencia', 'otro']).optional(),
  canal_cobro_id: z.string().uuid().nullable().optional(),
  cliente_nombre: z.string().optional(),
  cliente_telefono: z.string().optional(),
  // Vinculo con el CRM. Mutuamente excluyentes: o eliges un cliente que ya
  // existe, o lo das de alta en el momento. Sin ninguno de los dos, la venta
  // sigue funcionando como antes (publico general / texto libre).
  cliente_id: z.string().uuid().nullable().optional(),
  crear_cliente: z.object({
    nombre: z.string().trim().min(1, 'El nombre del cliente es requerido'),
    telefono: z.string().optional(),
    email: z.string().email('Email invalido').optional(),
  }).optional(),
  notas: z.string().optional(),
  aplicar_impuesto: z.boolean().optional(),
  fecha: z.string().optional(),
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
router.use(authenticate);
router.use(requireToolCapability('pos'));
// Desbloqueo por plan/selección para TODAS las rutas del POS (sin getCount: el
// tope de movimientos se aplica aparte, sólo al crear ventas). Sin esto, una
// cuenta que no tiene el POS activado podía leer y editar el catálogo.
router.use(requireHerramientaAccess('pos'));

// Límite freemium de movimientos del POS: cada venta cuenta como un movimiento.
// Se cuenta por la cuenta efectiva (owner) que requireToolCapability ya fijó en req.userId.
const contarVentasPOS = (cuentaId: string) =>
  AppDataSource.getRepository(Venta).count({ where: { usuario_id: cuentaId } });

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

  const item = repoItems().create({
    usuario_id: req.userId!,
    negocio_id: negocio_id ?? null,
    nombre: nombre.trim(),
    descripcion: descripcion?.trim() ?? null,
    precio: Math.round(precio * 100) / 100,
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
router.patch('/catalogo/:id', ah(async (req: AuthRequest, res: Response) => {
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
    cantidad: z.number().positive('cantidad debe ser > 0'),
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

// ═══════════════════════════════════════════════════════════════════════════
// VENTAS — crear, listar, ver detalle. Integración Finanzas automática.
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/pos/ventas?producto_id=...&desde=2026-01-01&hasta=2026-05-30
router.get('/ventas', ah(async (req: AuthRequest, res: Response) => {
  const { producto_id, desde, hasta } = req.query as Record<string, string | undefined>;

  const qb = repoVentas()
    .createQueryBuilder('v')
    .leftJoinAndSelect('v.items', 'items')
    .where('v.usuario_id = :uid', { uid: req.userId })
    .orderBy('v.fecha', 'DESC')
    .addOrderBy('v.fecha_creacion', 'DESC');

  if (producto_id) qb.andWhere('v.producto_id = :pid', { pid: producto_id });
  if (desde)       qb.andWhere('v.fecha >= :desde', { desde });
  if (hasta)       qb.andWhere('v.fecha <= :hasta', { hasta });

  const ventas = await qb.limit(200).getMany();
  res.json(ventas);
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
router.post('/ventas', requireHerramientaAccess('pos', contarVentasPOS), validateBody(CrearVentaSchema), ah(async (req: AuthRequest, res: Response) => {
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
    aplicar_impuesto?: boolean; // default true
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

  // 2. Calcular totales — si aplicar_impuesto=false, forzamos tasa 0
  let totales;
  try {
    totales = calcularTotalesVenta(lineas, pais);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Carrito inválido' });
    return;
  }

  const aplicaImpuesto = aplicar_impuesto !== false; // default true
  if (!aplicaImpuesto) {
    totales = {
      ...totales,
      impuesto_monto: 0,
      impuesto_tasa: 0,
      total: totales.subtotal,
    };
  }

  const fechaVenta = fecha || new Date().toISOString().slice(0, 10);

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
        desgloseComision = calcularDesgloseComision(totales.total, canalCobro, getTaxConfig(pais).consumo.tasa);
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

// DELETE /api/pos/ventas/:id — cancela venta y borra movimientos asociados
router.delete('/ventas/:id', ah(async (req: AuthRequest, res: Response) => {
  const venta = await repoVentas().findOne({ where: { id: req.params.id, usuario_id: req.userId! } });
  if (!venta) {
    res.status(404).json({ error: 'Venta no encontrada' });
    return;
  }

  await AppDataSource.transaction(async manager => {
    if (venta.movimiento_contable_id) {
      await manager.delete(MovimientoContable, { parent_movimiento_id: venta.movimiento_contable_id, usuario_id: req.userId! });
      await manager.delete(MovimientoContable, { id: venta.movimiento_contable_id, usuario_id: req.userId! });
    }
    // Devolver al almacen lo que consumio la venta. Sin esto el stock queda
    // descontado para siempre y el movimiento sobrevive huerfano (la FK es ON
    // DELETE SET NULL, asi que no se borraria solo).
    await revertirInventarioPorVenta(manager, req.userId!, venta.id);

    // Si la venta nacio de una cotizacion, esa cotizacion vuelve a estar
    // pendiente: dejarla como 'aceptada' sin venta detras inflaria la tasa de
    // conversion con un cierre que ya no existe.
    if (venta.cotizacion_id) {
      await manager.update(
        Cotizacion,
        { id: venta.cotizacion_id, usuario_id: req.userId! },
        { estado: 'enviada' },
      );
    }

    await manager.remove(Venta, venta); // cascade borra venta_items
  });

  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════════════════════
// TICKET — HTML compartible + WhatsApp link
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/pos/ventas/:id/whatsapp — devuelve el wa.me link listo
router.get('/ventas/:id/whatsapp', ah(async (req: AuthRequest, res: Response) => {
  const venta = await repoVentas().findOne({
    where: { id: req.params.id, usuario_id: req.userId! },
    relations: ['negocio', 'producto'],
  });
  if (!venta) {
    res.status(404).json({ error: 'Venta no encontrada' });
    return;
  }

  const cfg = getTaxConfig(venta.producto?.pais || 'MX');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const ticketUrl = `${frontendUrl}/ticket/${venta.id}`;

  const link = buildWhatsAppLink({
    telefono:       venta.cliente_telefono,
    nombreNegocio:  venta.negocio?.nombre || 'Mi Negocio',
    numeroTicket:   venta.numero_ticket,
    total:          Number(venta.total),
    moneda:         venta.moneda,
    simbolo:        cfg.simbolo,
    ticketUrl,
  });

  res.json({ whatsapp_url: link, ticket_url: ticketUrl });
}));

export default router;
