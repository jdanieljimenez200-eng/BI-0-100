'use client';

import { toast } from 'sonner';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  DollarSign,
  Share2,
  Printer,
  CheckCircle2,
  X,
  CreditCard,
  Banknote,
  Landmark,
  HelpCircle,
  TrendingUp,
  Hash,
  Sparkles,
  Download,
  Zap,
  Tag,
  User,
  Percent,
  Receipt,
  RotateCcw,
} from 'lucide-react';
import api, { hayRespuestaDelServidor, nuevaClaveIdempotencia } from '@/lib/api';
import RecetaEditor, { type RecetaEditorHandle } from './RecetaEditor';
import { getTaxConfig, TaxConfig } from '@/lib/taxConfig';
import { fechaLocal, hoyLocal } from '@/lib/fechaLocal';
import { abrirMenuPdf } from './MenuPdf';
import ProductoGate from '@/components/herramientas/ProductoGate';
import HerramientaGate from '@/components/herramientas/HerramientaGate';
import type { ProductoActivo } from '@/lib/productoActivo';
import { Breadcrumbs } from '@/components/ui';
import { calcularDesgloseComision, textoPorcentaje } from '@/lib/comisiones';
import { r2 } from '@/lib/dinero';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItemPOS {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number | string;
  categoria: string | null;
  emoji: string | null;
  activo: boolean;
  orden: number;
  negocio_id: string | null;
}

interface VentaItem {
  id: string;
  nombre_snapshot: string;
  precio_unitario: number | string;
  cantidad: number | string;
  subtotal_linea: number | string;
}

interface Venta {
  id: string;
  numero_ticket: string;
  fecha: string;
  subtotal: number | string;
  impuesto_monto: number | string;
  impuesto_tasa: number | string;
  impuesto_nombre: string;
  moneda: string;
  total: number | string;
  metodo_pago: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  notas: string | null;
  estado: string;
  items?: VentaItem[];
  movimiento_contable_id?: string | null;
  canal_cobro_id?: string | null;
  comision_monto?: number | string | null;
  comision_iva?: number | string | null;
  monto_neto?: number | string | null;
  producto_id: string;
  negocio_id: string | null;
}

interface CanalCobroMin {
  id: string;
  nombre: string;
  tipo: string;
  institucion?: string | null;
  /** Fracción: 0.036 = 3.6 %. */
  comision_porcentaje: number | string;
  comision_fija: number | string;
  aplica_iva_comision?: boolean | null;
  retencion_isr_porcentaje?: number | string | null;
  retencion_iva_porcentaje?: number | string | null;
  activo: boolean;
}

interface NegocioMin {
  id: string;
  nombre: string;
  emoji?: string | null;
}

interface CarritoLinea {
  item_pos_id: string | null;
  nombre: string;
  precio_unitario: number;
  cantidad: number;
}

interface ClienteMin {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const n = (v: unknown) => Number(v ?? 0);

function fmtMoney(value: number, simbolo: string, locale: string): string {
  return `${simbolo}${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}


/**
 * Lo que pagó el cliente por la línea (precio del catálogo × cantidad). En la
 * venta, `subtotal_linea` va sin impuesto (para márgenes); en el ticket se
 * muestra lo que se cobró.
 */
const importeLinea = (it: { precio_unitario: unknown; cantidad: unknown }) => r2(n(it.precio_unitario) * n(it.cantidad));

/** Línea de impuesto del ticket: incluido en el total, o que el negocio no lo cobra. */
function textoImpuesto(venta: { impuesto_monto: unknown; impuesto_nombre?: string | null }, taxCfg: TaxConfig): string {
  const monto = n(venta.impuesto_monto);
  return monto > 0
    ? `Incluye ${venta.impuesto_nombre || taxCfg.consumo.nombre}: ${fmtMoney(monto, taxCfg.simbolo, taxCfg.locale)}`
    : `Sin ${taxCfg.consumo.nombre}`;
}

/** Title-case + trim. "  tacos AL pastor " → "Tacos Al Pastor" */
function toTitleCase(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

/** Sugerencias comunes de categorías */
const CATEGORIAS_SUGERIDAS = [
  'Comidas',
  'Bebidas',
  'Postres',
  'Entradas',
  'Promociones',
  'Servicios',
];

/** Imprime un ticket térmico estándar de 80mm / 58mm en una ventana emergente */
function imprimirTicketTermico(venta: Venta, taxCfg: TaxConfig, negocioNombre: string) {
  const printWin = window.open('', '_blank', 'width=420,height=650');
  if (!printWin) {
    toast.error('Por favor habilita las ventanas emergentes (popups) para imprimir el ticket.');
    return;
  }

  const itemsHtml = (venta.items || [])
    .map(
      (it) => `
      <tr>
        <td style="text-align:left; padding: 3px 0; vertical-align: top;">
          ${Number(it.cantidad)}x ${it.nombre_snapshot}
        </td>
        <td style="text-align:right; padding: 3px 0; font-family: monospace; white-space: nowrap; vertical-align: top;">
          ${fmtMoney(importeLinea(it), taxCfg.simbolo, taxCfg.locale)}
        </td>
      </tr>
    `
    )
    .join('');

  printWin.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Ticket ${venta.numero_ticket}</title>
        <style>
          @page { size: 80mm auto; margin: 3mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Courier New", Courier, monospace;
            font-size: 12px;
            line-height: 1.35;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 8px 12px;
            max-width: 320px;
            margin-left: auto;
            margin-right: auto;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .double-divider { border-top: 2px dashed #000; margin: 10px 0; }
          table { width: 100%; border-collapse: collapse; }
          .total-row { font-size: 15px; font-weight: bold; }
          @media print {
            body { max-width: 100%; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div class="bold" style="font-size: 16px; text-transform: uppercase;">${negocioNombre}</div>
          <div style="font-size: 11px; margin-top: 2px; letter-spacing: 1px;">COMPROBANTE DE VENTA</div>
          <div style="font-size: 12px; font-weight: bold; margin-top: 2px;">TICKET: ${venta.numero_ticket}</div>
          <div style="font-size: 10px; color: #333; margin-top: 2px;">${venta.fecha}</div>
          ${venta.cliente_nombre ? `<div style="font-size: 11px; margin-top: 3px;">Cliente: <strong>${venta.cliente_nombre}</strong></div>` : ''}
          ${venta.cliente_telefono ? `<div style="font-size: 10px; color: #444;">Tel: ${venta.cliente_telefono}</div>` : ''}
        </div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr style="border-bottom: 1px solid #ddd; font-size: 10px; text-transform: uppercase;">
              <th style="text-align: left; padding-bottom: 3px;">Desc.</th>
              <th style="text-align: right; padding-bottom: 3px;">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="divider"></div>

        <table>
          <tr class="total-row">
            <td>TOTAL:</td>
            <td class="text-right" style="font-family: monospace;">${fmtMoney(Number(venta.total), taxCfg.simbolo, taxCfg.locale)}</td>
          </tr>
          <tr>
            <td colspan="2" style="color: #444; font-size: 11px; padding-top: 3px;">${textoImpuesto(venta, taxCfg)}</td>
          </tr>
        </table>

        <div class="divider"></div>

        <div style="font-size: 11px;">
          <div>Método de Pago: <span class="bold" style="text-transform: uppercase;">${venta.metodo_pago}</span></div>
          ${venta.notas ? `<div style="margin-top: 4px; font-style: italic; color: #444;">Notas: ${venta.notas}</div>` : ''}
        </div>

        <div class="double-divider"></div>

        <div class="text-center" style="font-size: 11px; margin-top: 8px;">
          <div class="bold">¡Gracias por su compra!</div>
          <div style="font-size: 9px; color: #666; margin-top: 3px;">Comprobante simplificado para fines de control</div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  printWin.document.close();
}

// ─── Page (wrapper con gate) ───────────────────────────────────────────────────

export default function PosPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('usuario')) {
      router.push('/auth/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <HerramientaGate herramienta="pos" nombre="Punto de Venta" acento="emerald">
      <ProductoGate herramienta="Punto de Venta" acento="emerald">
        {({ producto, cambiarProducto }) => (
          <PosInner producto={producto} cambiarProducto={cambiarProducto} />
        )}
      </ProductoGate>
    </HerramientaGate>
  );
}

// ─── Herramienta (con el producto global ya resuelto) ──────────────────────────

function PosInner({
  producto,
  cambiarProducto,
}: {
  producto: ProductoActivo;
  cambiarProducto: () => void;
}) {
  const [negocios, setNegocios] = useState<NegocioMin[]>([]);
  const [items, setItems] = useState<ItemPOS[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  // Cursor de la siguiente página del historial (cabecera X-Siguiente del API).
  const [siguienteVentas, setSiguienteVentas] = useState<string | null>(null);
  const [cargandoMasVentas, setCargandoMasVentas] = useState(false);
  const [crmClientes, setCrmClientes] = useState<ClienteMin[]>([]);
  const [tab, setTab] = useState<'vender' | 'catalogo' | 'historial'>('vender');
  const [loading, setLoading] = useState(false);

  // Filtros y búsquedas
  const [searchVender, setSearchVender] = useState('');
  const [selectedCategoria, setSelectedCategoria] = useState<string>('todas');
  const [searchCatalogo, setSearchCatalogo] = useState('');
  const [searchHistorial, setSearchHistorial] = useState('');
  const [filtroPeriodoHistorial, setFiltroPeriodoHistorial] = useState<'todos' | 'hoy' | '7dias' | 'mes'>('todos');
  const [filtroMetodoHistorial, setFiltroMetodoHistorial] = useState<'todos' | 'efectivo' | 'tarjeta' | 'transferencia' | 'otro'>('todos');

  // Carrito & Descuento
  const [carrito, setCarrito] = useState<CarritoLinea[]>([]);
  // Clave del cobro en curso: un doble clic o un reintento tras un corte de red
  // mandan la misma y el servidor no duplica la venta. Se renueva al responder.
  const claveCobro = useRef(nuevaClaveIdempotencia());
  const [descuentoTipo, setDescuentoTipo] = useState<'ninguno' | '5' | '10' | '15' | 'custom'>('ninguno');
  const [descuentoCustomMonto, setDescuentoCustomMonto] = useState('');

  // Checkout modal
  const [showCheckout, setShowCheckout] = useState(false);
  // Si el negocio cobra el impuesto al consumo (lo guarda el servidor por punto
  // de cobro y solo lo cambia el dueño). El precio del catálogo siempre lo
  // incluye: esto solo decide si se desglosa y registra.
  const [puntoCobro, setPuntoCobro] = useState<{ cobra_impuesto: boolean; puede_cambiar: boolean } | null>(null);
  const [guardandoPuntoCobro, setGuardandoPuntoCobro] = useState(false);
  const cobraImpuesto = puntoCobro?.cobra_impuesto ?? true;
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta' | 'transferencia' | 'otro'>('efectivo');
  const [montoRecibido, setMontoRecibido] = useState<string>('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  // id real del CRM. null = publico general o nombre escrito a mano: la venta
  // se guarda igual, pero no alimenta los reportes de recurrencia.
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [altaCliente, setAltaCliente] = useState<{ nombre: string; telefono: string } | null>(null);
  const [avisosVenta, setAvisosVenta] = useState<string[]>([]);
  const [notas, setNotas] = useState('');
  const [cobroEnCurso, setCobroEnCurso] = useState(false);
  const [ventaResultado, setVentaResultado] = useState<Venta | null>(null);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [canalesCobro, setCanalesCobro] = useState<CanalCobroMin[]>([]);
  const [canalCobroId, setCanalCobroId] = useState<string | null>(null);

  // Concepto libre / Venta rápida
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customItem, setCustomItem] = useState({ nombre: '', precio: '' });

  // Form de item del catálogo
  const [itemForm, setItemForm] = useState<{
    id?: string;
    nombre: string;
    descripcion: string;
    precio: string;
    categoria: string;
    emoji: string;
  }>({ nombre: '', descripcion: '', precio: '', categoria: '', emoji: '' });
  const [showItemForm, setShowItemForm] = useState(false);
  const [guardandoItem, setGuardandoItem] = useState(false);
  // Error o aviso del modal del producto: antes un fallo al guardar no decía nada.
  const [avisoItem, setAvisoItem] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const recetaRef = useRef<RecetaEditorHandle>(null);

  // Detalle de venta seleccionada
  const [ventaDetalle, setVentaDetalle] = useState<Venta | null>(null);

  const negocioId = producto.negocio_id;
  const taxCfg = useMemo(() => getTaxConfig(producto.pais ?? 'MX'), [producto.pais]);

  // Negocios
  useEffect(() => {
    api.get('/negocios').then(({ data }) => setNegocios((data || []) as NegocioMin[])).catch(() => {});
  }, []);

  // Clientes del CRM (para auto-completar ventas en 1 clic)
  const cargarClientesCRM = useCallback(async () => {
    try {
      const { data } = await api.get('/clientes', { params: { producto_id: producto.id } });
      const raw = (data || []) as Array<{ id: string; nombre: string; telefono?: string | null; email?: string | null }>;
      setCrmClientes(
        raw.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          telefono: c.telefono ?? null,
          email: c.email ?? null,
        }))
      );
    } catch {
      /* el selector se queda con lo que ya tenia */
    }
  }, [producto.id]);

  useEffect(() => {
    void cargarClientesCRM();
  }, [cargarClientesCRM]);

  // Canales de cobro para comisiones automáticas en el POS. Van por /pos (con el
  // permiso de la caja), no por /contabilidad: un cajero sin Contabilidad
  // recibía 403 y no podía elegir con qué terminal cobraba.
  useEffect(() => {
    api
      .get(`/pos/canales?producto_id=${producto.id}`)
      .then(({ data }) => setCanalesCobro(Array.isArray(data) ? data.filter((c: CanalCobroMin) => c.activo) : []))
      .catch(() => setCanalesCobro([]));
  }, [producto.id]);

  // Si el punto de cobro cobra el impuesto. Si no carga, se asume que sí (el
  // servidor decide con su propia configuración al registrar la venta).
  useEffect(() => {
    let vigente = true;
    api
      .get(`/pos/punto-cobro/${producto.id}`)
      .then(({ data }) => { if (vigente) setPuntoCobro({ cobra_impuesto: data.cobra_impuesto !== false, puede_cambiar: Boolean(data.puede_cambiar) }); })
      .catch(() => { if (vigente) setPuntoCobro(null); });
    return () => { vigente = false; };
  }, [producto.id]);

  const cambiarCobroImpuesto = useCallback(async (cobra: boolean) => {
    setGuardandoPuntoCobro(true);
    try {
      const { data } = await api.patch(`/pos/punto-cobro/${producto.id}`, { cobra_impuesto: cobra });
      setPuntoCobro({ cobra_impuesto: data.cobra_impuesto !== false, puede_cambiar: true });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error ?? 'No se pudo guardar el cambio. Intenta de nuevo.');
    } finally {
      setGuardandoPuntoCobro(false);
    }
  }, [producto.id]);

  // Items + ventas del producto activo
  useEffect(() => {
    // Cambiar de negocio o de producto relanza esta carga: sin el flag, el
    // catálogo del negocio anterior puede llegar tarde y mostrarse como si
    // fuera el del actual, con precios que no corresponden.
    let vigente = true;
    const negParam = negocioId ? `?negocio_id=${negocioId}` : '';
    setLoading(true);
    Promise.all([
      api.get(`/pos/catalogo${negParam}`).catch(() => ({ data: [] })),
      api.get(`/pos/ventas?producto_id=${producto.id}`).catch(() => ({ data: [], headers: {} })),
    ])
      .then(([itemsRes, ventasRes]) => {
        if (!vigente) return;
        setItems((itemsRes.data || []) as ItemPOS[]);
        setVentas((ventasRes.data || []) as Venta[]);
        setSiguienteVentas(((ventasRes.headers as Record<string, string | undefined>)?.['x-siguiente']) ?? null);
      })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [producto.id, negocioId]);

  // Categorías ya creadas por el usuario (dedupe case-insensitive)
  const categoriasExistentes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const it of items) {
      const raw = (it.categoria ?? '').trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, toTitleCase(raw));
    }
    return Array.from(seen.values()).sort();
  }, [items]);

  // Lista combinada de categorías para picker
  const categoriasParaPicker = useMemo(() => {
    const existKeys = new Set(categoriasExistentes.map((c) => c.toLowerCase()));
    const sugeridas = CATEGORIAS_SUGERIDAS.filter((s) => !existKeys.has(s.toLowerCase()));
    return [...categoriasExistentes, ...sugeridas];
  }, [categoriasExistentes]);

  // Conteo de items activos por categoría
  const conteoPorCategoria = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of items) {
      if (!it.activo) continue;
      const cat = (it.categoria ?? '').trim().toLowerCase();
      map[cat] = (map[cat] || 0) + 1;
    }
    return map;
  }, [items]);

  // Items filtrados para venta
  const itemsParaVender = useMemo(() => {
    return items.filter((i) => {
      if (!i.activo) return false;
      const matchesCat =
        selectedCategoria === 'todas' ||
        (i.categoria && i.categoria.toLowerCase() === selectedCategoria.toLowerCase());
      const query = searchVender.toLowerCase().trim();
      const matchesSearch =
        !query ||
        i.nombre.toLowerCase().includes(query) ||
        (i.descripcion && i.descripcion.toLowerCase().includes(query)) ||
        (i.emoji && i.emoji.toLowerCase().includes(query));
      return matchesCat && matchesSearch;
    });
  }, [items, selectedCategoria, searchVender]);

  // Items filtrados para catálogo
  const itemsParaCatalogo = useMemo(() => {
    const query = searchCatalogo.toLowerCase().trim();
    if (!query) return items;
    return items.filter(
      (i) =>
        i.nombre.toLowerCase().includes(query) ||
        (i.categoria && i.categoria.toLowerCase().includes(query)) ||
        (i.descripcion && i.descripcion.toLowerCase().includes(query))
    );
  }, [items, searchCatalogo]);

  // Ventas filtradas para historial con filtros temporales y de método
  const ventasFiltradas = useMemo(() => {
    const query = searchHistorial.toLowerCase().trim();
    // Día local: `v.fecha` es el día local de la venta, y en UTC «hoy» cambia a
    // mañana desde las 18:00 en México (el filtro se quedaba vacío por la tarde).
    const hoyStr = hoyLocal();
    const hace7dias = new Date();
    hace7dias.setDate(hace7dias.getDate() - 7);
    const hace7diasStr = fechaLocal(hace7dias);
    const mesStr = hoyStr.slice(0, 7); // YYYY-MM

    return ventas.filter((v) => {
      const matchesText =
        !query ||
        v.numero_ticket.toLowerCase().includes(query) ||
        (v.cliente_nombre && v.cliente_nombre.toLowerCase().includes(query)) ||
        v.metodo_pago.toLowerCase().includes(query);
      if (!matchesText) return false;

      if (filtroMetodoHistorial !== 'todos' && v.metodo_pago !== filtroMetodoHistorial) {
        return false;
      }

      if (filtroPeriodoHistorial === 'hoy') {
        return v.fecha && v.fecha.startsWith(hoyStr);
      }
      if (filtroPeriodoHistorial === '7dias') {
        return v.fecha && v.fecha >= hace7diasStr;
      }
      if (filtroPeriodoHistorial === 'mes') {
        return v.fecha && v.fecha.startsWith(mesStr);
      }

      return true;
    });
  }, [ventas, searchHistorial, filtroPeriodoHistorial, filtroMetodoHistorial]);

  // Métricas operacionales globales y de hoy
  const metricasOperacionales = useMemo(() => {
    const validas = ventas.filter((v) => v.estado !== 'cancelada');
    const totalHistorico = validas.reduce((acc, v) => acc + n(v.total), 0);
    const countHistorico = validas.length;

    const hoy = hoyLocal();
    const ventasHoy = validas.filter((v) => v.fecha?.startsWith(hoy));
    const totalHoy = ventasHoy.reduce((acc, v) => acc + n(v.total), 0);
    const countHoy = ventasHoy.length;
    const ticketPromedio = countHoy > 0 ? totalHoy / countHoy : (countHistorico > 0 ? totalHistorico / countHistorico : 0);

    const porMetodo = validas.reduce(
      (acc, v) => {
        acc[v.metodo_pago] = (acc[v.metodo_pago] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const itemsActivos = items.filter((i) => i.activo).length;

    return {
      totalHistorico,
      countHistorico,
      totalHoy,
      countHoy,
      ticketPromedio,
      porMetodo,
      itemsActivos,
    };
  }, [ventas, items]);

  // Totales del carrito con soporte para descuentos por porcentaje o monto fijo
  const totales = useMemo(() => {
    const subtotalBruto = carrito.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0);

    let descuentoMonto = 0;
    if (descuentoTipo === '5') descuentoMonto = subtotalBruto * 0.05;
    else if (descuentoTipo === '10') descuentoMonto = subtotalBruto * 0.1;
    else if (descuentoTipo === '15') descuentoMonto = subtotalBruto * 0.15;
    else if (descuentoTipo === 'custom') {
      const parsed = Number(descuentoCustomMonto);
      if (Number.isFinite(parsed) && parsed > 0) {
        descuentoMonto = Math.min(subtotalBruto, parsed);
      }
    }

    // El precio del catálogo ya incluye el impuesto (así se le muestra al
    // público): el total es lo de los artículos menos el descuento, y el
    // impuesto se desglosa dentro. Mismo cálculo que `calcularTotalesVenta`.
    const totalFinal = r2(Math.max(0, subtotalBruto - descuentoMonto));
    const tasa = cobraImpuesto ? taxCfg.consumo.tasa : 0;
    const imp = tasa > 0 ? r2(totalFinal - totalFinal / (1 + tasa)) : 0;

    return {
      subtotalBruto: r2(subtotalBruto),
      descuentoMonto: r2(descuentoMonto),
      impuesto: imp,
      total: totalFinal,
      itemsCount: carrito.reduce((s, l) => s + l.cantidad, 0),
    };
  }, [carrito, descuentoTipo, descuentoCustomMonto, cobraImpuesto, taxCfg]);

  // Cambio en efectivo
  const calculoCambio = useMemo(() => {
    const recibido = Number(montoRecibido);
    if (!Number.isFinite(recibido) || recibido <= 0) return null;
    const cambio = Math.round((recibido - totales.total) * 100) / 100;
    return {
      recibido,
      cambio,
      esSuficiente: cambio >= 0,
      faltante: cambio < 0 ? Math.abs(cambio) : 0,
    };
  }, [montoRecibido, totales.total]);

  // ── Acciones Carrito ─────────────────────────────────────────────────────

  const agregarAlCarrito = useCallback((it: ItemPOS) => {
    setCarrito((prev) => {
      const exist = prev.find((l) => l.item_pos_id === it.id);
      if (exist) {
        return prev.map((l) => (l.item_pos_id === it.id ? { ...l, cantidad: l.cantidad + 1 } : l));
      }
      return [...prev, { item_pos_id: it.id, nombre: it.nombre, precio_unitario: n(it.precio), cantidad: 1 }];
    });
  }, []);

  const modificarCantidadItem = useCallback((itId: string, delta: number) => {
    setCarrito((prev) => {
      const existIdx = prev.findIndex((l) => l.item_pos_id === itId);
      if (existIdx === -1) return prev;
      const copy = [...prev];
      const nuevaCantidad = copy[existIdx].cantidad + delta;
      if (nuevaCantidad <= 0) {
        return copy.filter((_, i) => i !== existIdx);
      }
      copy[existIdx] = { ...copy[existIdx], cantidad: nuevaCantidad };
      return copy;
    });
  }, []);

  const agregarConceptoLibre = useCallback(() => {
    const precioNum = Number(customItem.precio);
    if (!customItem.nombre.trim() || !Number.isFinite(precioNum) || precioNum <= 0) {
      toast.error('Ingresa un nombre y precio válido mayor a 0.');
      return;
    }
    setCarrito((prev) => [
      ...prev,
      {
        item_pos_id: null,
        nombre: customItem.nombre.trim(),
        precio_unitario: precioNum,
        cantidad: 1,
      },
    ]);
    setCustomItem({ nombre: '', precio: '' });
    setShowCustomItemModal(false);
  }, [customItem]);

  const cambiarCantidad = useCallback((idx: number, delta: number) => {
    setCarrito((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], cantidad: Math.max(0, copy[idx].cantidad + delta) };
      return copy.filter((l) => l.cantidad > 0);
    });
  }, []);

  const quitarDelCarrito = useCallback((idx: number) => {
    setCarrito((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const vaciarCarrito = useCallback(() => {
    setCarrito([]);
    setMontoRecibido('');
    setDescuentoTipo('ninguno');
    setDescuentoCustomMonto('');
  }, []);

  // Seleccionar cliente rápido del CRM
  const seleccionarClienteCRM = useCallback((c: ClienteMin) => {
    setClienteId(c.id);
    setClienteNombre(c.nombre);
    if (c.telefono) setClienteTelefono(c.telefono);
    setAltaCliente(null);
  }, []);

  const limpiarCliente = useCallback(() => {
    setClienteId(null);
    setClienteNombre('');
    setClienteTelefono('');
    setAltaCliente(null);
  }, []);

  // ── Cobrar ──────────────────────────────────────────────────────────────
  const ejecutarCobro = useCallback(
    async (options?: { metodo_pago_override?: 'efectivo' | 'tarjeta' | 'transferencia' | 'otro'; exacto?: boolean }) => {
      if (carrito.length === 0) return;
      setCobroEnCurso(true);

      const metodoAUsar = options?.metodo_pago_override ?? metodoPago;

      let lineasFinales = carrito;
      let notasFinales = notas.trim();

      if (totales.descuentoMonto > 0 && totales.subtotalBruto > 0) {
        const factor = (totales.subtotalBruto - totales.descuentoMonto) / totales.subtotalBruto;
        lineasFinales = carrito.map((l) => ({
          ...l,
          precio_unitario: Math.max(0, Math.round(l.precio_unitario * factor * 100) / 100),
        }));
        const descNota = `Descuento aplicado: ${fmtMoney(totales.descuentoMonto, taxCfg.simbolo, taxCfg.locale)}`;
        notasFinales = notasFinales ? `${notasFinales} · ${descNota}` : descNota;
      }

      try {
        const { data } = await api.post(`/pos/ventas`, {
          producto_id: producto.id,
          negocio_id: negocioId,
          lineas: lineasFinales,
          metodo_pago: metodoAUsar,
          cliente_nombre: clienteNombre.trim() || undefined,
          cliente_telefono: clienteTelefono.trim() || undefined,
          // Excluyentes: o un cliente que ya existe, o uno nuevo creado aqui.
          cliente_id: clienteId ?? undefined,
          crear_cliente:
            !clienteId && altaCliente?.nombre.trim()
              ? { nombre: altaCliente.nombre.trim(), telefono: altaCliente.telefono.trim() || undefined }
              : undefined,
          notas: notasFinales || undefined,
          // Si se cobra impuesto lo decide el punto de cobro en el servidor.
          canal_cobro_id: canalCobroId || undefined,
        }, { headers: { 'Idempotency-Key': claveCobro.current } });
        claveCobro.current = nuevaClaveIdempotencia();

        // Stock que no alcanzaba. La venta se completo igual: se avisa, no se
        // bloquea, porque el cobro es real aunque el inventario este mal.
        setAvisosVenta(Array.isArray(data?.advertencias) ? data.advertencias : []);

        const ventaCreada = data.venta as Venta;
        setVentaResultado(ventaCreada);

        try {
          const wa = await api.get(`/pos/ventas/${ventaCreada.id}/whatsapp`);
          setWaUrl(wa.data.whatsapp_url);
        } catch {
          setWaUrl(null);
        }

        api.get(`/pos/ventas?producto_id=${producto.id}`).then(({ data: d, headers }) => {
          setVentas(d as Venta[]);
          setSiguienteVentas((headers as Record<string, string | undefined>)['x-siguiente'] ?? null);
        });

        setCarrito([]);
        setClienteNombre('');
        setClienteTelefono('');
        setClienteId(null);
        // Si se dio de alta un cliente en el cobro, recargar el CRM para que
        // aparezca en el selector de la siguiente venta.
        if (altaCliente) {
          setAltaCliente(null);
          void cargarClientesCRM();
        }
        setNotas('');
        setMetodoPago('efectivo');
        setCanalCobroId(null);
        setMontoRecibido('');
        setDescuentoTipo('ninguno');
        setDescuentoCustomMonto('');
        setShowCheckout(false);
      } catch (err: unknown) {
        // Si el servidor respondió (p. ej. validación), el próximo intento es otro cobro.
        if (hayRespuestaDelServidor(err)) claveCobro.current = nuevaClaveIdempotencia();
        const resp = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
        const msg = resp?.error ?? resp?.message ?? (err instanceof Error ? err.message : null) ?? 'No se pudo cobrar';
        toast.error(`Error al cobrar: ${msg}`, { duration: 10000 });
      } finally {
        setCobroEnCurso(false);
      }
    },
    [
      carrito,
      producto.id,
      negocioId,
      metodoPago,
      canalCobroId,
      clienteNombre,
      clienteTelefono,
      clienteId,
      altaCliente,
      cargarClientesCRM,
      notas,
      totales,
      taxCfg,
    ]
  );

  const cobroRapidoEfectivo = useCallback(() => {
    ejecutarCobro({ metodo_pago_override: 'efectivo', exacto: true });
  }, [ejecutarCobro]);

  // ── Catálogo CRUD & Toggles Rápidos ──────────────────────────────────────

  const toggleItemActivo = useCallback(
    async (it: ItemPOS) => {
      const nuevoActivo = !it.activo;
      setItems((prev) => prev.map((i) => (i.id === it.id ? { ...i, activo: nuevoActivo } : i)));
      try {
        await api.patch(`/pos/catalogo/${it.id}`, { activo: nuevoActivo });
      } catch {
        setItems((prev) => prev.map((i) => (i.id === it.id ? { ...i, activo: it.activo } : i)));
      }
    },
    []
  );

  const guardarItem = useCallback(async () => {
    if (!itemForm.nombre.trim() || !itemForm.precio) return;
    const precioNum = Number(itemForm.precio);
    if (!Number.isFinite(precioNum) || precioNum < 0) {
      toast.error('El precio debe ser un número válido mayor o igual a 0.');
      return;
    }

    let categoriaFinal: string | undefined = undefined;
    const rawCat = itemForm.categoria.trim();
    if (rawCat) {
      const key = rawCat.toLowerCase();
      const existente = categoriasExistentes.find((c) => c.toLowerCase() === key);
      categoriaFinal = existente ?? toTitleCase(rawCat);
    }

    const payload = {
      nombre: itemForm.nombre.trim(),
      descripcion: itemForm.descripcion || undefined,
      precio: precioNum,
      categoria: categoriaFinal,
      emoji: itemForm.emoji || undefined,
      negocio_id: negocioId,
    };

    setGuardandoItem(true);
    setAvisoItem(null);
    try {
      if (itemForm.id) {
        const { data } = await api.patch(`/pos/catalogo/${itemForm.id}`, payload);
        setItems((prev) => prev.map((i) => (i.id === itemForm.id ? (data as ItemPOS) : i)));
        // La receta pendiente también se guarda; si falla, el modal sigue abierto con el aviso.
        const recetaOk = (await recetaRef.current?.guardarPendiente()) ?? true;
        if (!recetaOk) return;
      } else {
        const { data } = await api.post(`/pos/catalogo`, payload);
        const nuevo = data as ItemPOS;
        setItems((prev) => [nuevo, ...prev]);
        // Con insumos en el almacén, el modal sigue abierto para definir la receta
        // ahora: si se cerraba, había que descubrir «Editar» para hacerlo.
        if (recetaRef.current?.hayInsumos()) {
          setItemForm((f) => ({ ...f, id: nuevo.id }));
          setAvisoItem({ tipo: 'info', texto: 'Producto creado. Indica qué insumos consume cada venta y pulsa «Guardar cambios».' });
          return;
        }
      }
      setShowItemForm(false);
      setItemForm({ nombre: '', descripcion: '', precio: '', categoria: '', emoji: '' });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      setAvisoItem({ tipo: 'error', texto: e.response?.data?.error ?? e.response?.data?.message ?? 'No se pudo guardar el producto. Intenta de nuevo.' });
    } finally {
      setGuardandoItem(false);
    }
  }, [itemForm, negocioId, categoriasExistentes]);

  const editarItem = useCallback((it: ItemPOS) => {
    setAvisoItem(null);
    setItemForm({
      id: it.id,
      nombre: it.nombre,
      descripcion: it.descripcion ?? '',
      precio: String(n(it.precio)),
      categoria: it.categoria ?? '',
      emoji: it.emoji ?? '',
    });
    setShowItemForm(true);
  }, []);

  const eliminarItem = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar este item del catálogo?')) return;
    await api.delete(`/pos/catalogo/${id}`).catch(() => {});
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // ── PDF y Compartir ───────────────────────────────────────────────────

  const descargarMenuPdf = useCallback(() => {
    if (items.filter((i) => i.activo).length === 0) return;
    const negocio = negocios.find((ng) => ng.id === producto.negocio_id) ?? null;
    const nombreNegocio = negocio?.nombre ?? producto.nombre;
    abrirMenuPdf({
      items,
      negocioNombre: nombreNegocio,
      negocioEmoji: negocio?.emoji ?? null,
      slogan: null,
      productoNombre: producto.nombre,
      telefonoContacto: null,
      paletaColores: null,
      taxCfg: {
        simbolo: taxCfg.simbolo,
        moneda: taxCfg.moneda,
        locale: taxCfg.locale,
        nombre: taxCfg.nombre,
        consumo: { nombre: taxCfg.consumo.nombre, tasa: taxCfg.consumo.tasa },
      },
    });
  }, [items, producto, negocios, taxCfg]);

  const compartirMenuWhatsApp = useCallback(() => {
    const negocio = negocios.find((ng) => ng.id === producto.negocio_id) ?? null;
    const nombre = negocio?.nombre ?? producto.nombre;
    const msg =
      `Hola. Te comparto el menú de *${nombre}*.

` +
      `Aquí tienes nuestros productos y precios actualizados. Dime qué te interesa y preparamos tu orden.`;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }, [producto, negocios]);

  // ── Ver Detalle & WhatsApp de Venta ────────────────────────────────────

  const verDetalleVenta = useCallback(async (v: Venta) => {
    try {
      const { data } = await api.get(`/pos/ventas/${v.id}`);
      setVentaDetalle(data as Venta);
    } catch {
      setVentaDetalle(v);
    }
  }, []);

  // ── Cancelar una venta ──────────────────────────────────────────────────
  // El backend ya lo hacía todo (asientos inversos con fecha de hoy, devolución
  // al almacén, auditoría y permiso `cancelar_ventas` para cajeros), pero ningún
  // botón lo llamaba: una venta hecha por error no se podía anular.
  const [cancelandoVenta, setCancelandoVenta] = useState(false);
  // Confirmación de la cancelación dentro del detalle de la venta. Antes era un
  // window.prompt: en navegadores que no lo soportan (algunos dentro de apps)
  // el botón no hacía nada y el error ni se veía.
  const [cancelacion, setCancelacion] = useState<{ ventaId: string; motivo: string; error: string | null } | null>(null);

  const cancelarVenta = useCallback(async (v: Venta, motivo: string) => {
    setCancelandoVenta(true);
    try {
      const { data } = await api.post(`/pos/ventas/${v.id}/cancelar`, { motivo: motivo.trim() || undefined });
      const cancelada = { ...v, ...(data?.venta ?? {}), estado: 'cancelada' } as Venta;
      setVentas((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...cancelada } : x)));
      setVentaDetalle(cancelada);
      setCancelacion(null);
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { error?: string } } };
      const error =
        ax.response?.status === 403
          ? 'No tienes permiso para cancelar ventas. Pídeselo al dueño de la cuenta.'
          : `No se pudo cancelar la venta: ${ax.response?.data?.error ?? 'error de conexión'}`;
      setCancelacion((c) => (c ? { ...c, error } : c));
    } finally {
      setCancelandoVenta(false);
    }
  }, []);

  const compartirVentaWhatsApp = useCallback(async (v: Venta) => {
    try {
      const { data } = await api.get(`/pos/ventas/${v.id}/whatsapp`);
      window.open(data.whatsapp_url, '_blank');
    } catch {
      toast.error('No se pudo generar el enlace de WhatsApp');
    }
  }, []);

  // ── Exportar Historial a CSV ──────────────────────────────────────────

  const exportarHistorialCsv = useCallback(() => {
    if (ventasFiltradas.length === 0) {
      toast.info('No hay ventas para exportar con los filtros actuales.');
      return;
    }

    const headers = ['Ticket', 'Fecha', 'Cliente', 'Teléfono', 'Método de Pago', 'Subtotal', 'Impuesto', 'Total', 'Moneda', 'Estado', 'Notas'];
    const rows = ventasFiltradas.map((v) => [
      `"${v.numero_ticket}"`,
      `"${v.fecha}"`,
      `"${(v.cliente_nombre || '').replace(/"/g, '""')}"`,
      `"${(v.cliente_telefono || '').replace(/"/g, '""')}"`,
      `"${v.metodo_pago}"`,
      Number(v.subtotal).toFixed(2),
      Number(v.impuesto_monto).toFixed(2),
      Number(v.total).toFixed(2),
      `"${v.moneda}"`,
      `"${v.estado}"`,
      `"${(v.notas || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ventas-pos-${producto.nombre.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [ventasFiltradas, producto.nombre]);

  const nombreNegocioActual = useMemo(() => {
    const negocio = negocios.find((ng) => ng.id === producto.negocio_id) ?? null;
    return negocio?.nombre ?? producto.nombre;
  }, [negocios, producto]);

  return (
    <div className="relative px-4 sm:px-6 py-8 max-w-7xl mx-auto pb-28">
      {/* Ambient glows */}
      <div className="fixed top-[-10%] right-[-8%] w-[50vh] h-[50vh] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed bottom-[-12%] left-[-10%] w-[40vh] h-[40vh] bg-blue-500/8 rounded-full blur-[120px] pointer-events-none" />

      {/* Breadcrumb */}
      <Breadcrumbs
        showBack
        backHref="/dashboard/herramientas"
        backLabel="Herramientas"
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Herramientas', href: '/dashboard/herramientas' },
          { label: 'Punto de Venta' },
        ]}
        className="mb-4"
      />

      {/* Header Bar */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Punto de Venta</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Terminal En Línea
            </span>
          </div>
          <p className="text-sm text-white/50">
            Registro de ventas de alta velocidad sincronizado en tiempo real con Finanzas y CRM.
          </p>
        </div>

        {/* Producto Activo Selector Card */}
        <div className="bg-[#0F1C2A]/90 border border-white/10 rounded-2xl p-3.5 w-full sm:w-auto sm:min-w-[290px] shadow-lg backdrop-blur-md">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40 mb-1">Punto de Cobro Activo:</p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white text-sm font-bold truncate">{producto.nombre}</p>
              <p className="text-[11px] text-emerald-400/90 font-mono">
                {producto.pais} · {cobraImpuesto
                  ? `${taxCfg.consumo.nombre} ${Math.round(taxCfg.consumo.tasa * 1000) / 10}% incluido`
                  : `sin ${taxCfg.consumo.nombre}`} ({taxCfg.moneda})
              </p>
            </div>
            <button
              onClick={cambiarProducto}
              className="flex-shrink-0 text-xs font-semibold text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 rounded-xl px-3 py-1.5 hover:bg-emerald-500/20 transition-all shadow-sm"
            >
              Cambiar
            </button>
          </div>
          {/* Si el negocio cobra el impuesto: lo decide su régimen, no cada ticket. */}
          {puntoCobro?.puede_cambiar && (
            <label className="mt-2.5 flex cursor-pointer select-none items-start gap-2 border-t border-white/[0.06] pt-2.5 text-[11px] text-white/60">
              <input
                type="checkbox"
                checked={cobraImpuesto}
                disabled={guardandoPuntoCobro}
                onChange={(e) => void cambiarCobroImpuesto(e.target.checked)}
                className="mt-0.5 accent-emerald-500"
              />
              <span>
                Cobro {taxCfg.consumo.nombre} en mis ventas
                <span className="block text-[10px] text-white/35">
                  Desmárcalo si tu régimen no lo cobra (p. ej. monotributo, Nuevo RUS o no responsable de IVA).
                </span>
              </span>
            </label>
          )}
        </div>
      </div>

      {/* Operational KPI Dashboard Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="p-4 rounded-2xl border border-white/10 bg-gradient-to-br from-[#0F1C2A] to-[#0c1622] relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between text-xs text-white/50 mb-1">
            <span className="font-medium">Ventas de Hoy</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-white">
            {fmtMoney(metricasOperacionales.totalHoy, taxCfg.simbolo, taxCfg.locale)}
          </p>
          <p className="text-[11px] text-emerald-400/90 mt-1 font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            {metricasOperacionales.countHoy} cobro(s) registrados hoy
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-white/10 bg-gradient-to-br from-[#0F1C2A] to-[#0c1622] relative overflow-hidden group hover:border-blue-500/30 transition-all">
          <div className="flex items-center justify-between text-xs text-white/50 mb-1">
            <span className="font-medium">Ticket Promedio</span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-white">
            {fmtMoney(metricasOperacionales.ticketPromedio, taxCfg.simbolo, taxCfg.locale)}
          </p>
          <p className="text-[11px] text-white/40 mt-1">Por cada transacción</p>
        </div>

        <div className="p-4 rounded-2xl border border-white/10 bg-gradient-to-br from-[#0F1C2A] to-[#0c1622] relative overflow-hidden group hover:border-purple-500/30 transition-all">
          <div className="flex items-center justify-between text-xs text-white/50 mb-1">
            <span className="font-medium">Catálogo Activo</span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Tag className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-white">
            {metricasOperacionales.itemsActivos}
          </p>
          <p className="text-[11px] text-white/40 mt-1">
            En {categoriasExistentes.length} categoría(s)
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-white/10 bg-gradient-to-br from-[#0F1C2A] to-[#0c1622] relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between text-xs text-white/50 mb-1">
            <span className="font-medium">Sincronización</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-emerald-300">
            100%
          </p>
          <p className="text-[11px] text-white/40 mt-1">
            Contabilidad & CRM activos
          </p>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex gap-2 mb-6 border-b border-white/10 overflow-x-auto scrollbar-none pb-1 shrink-0">
        {[
          { key: 'vender', label: 'Caja Registradora (Vender)', icon: ShoppingCart, count: totales.itemsCount },
          { key: 'catalogo', label: 'Menú / Catálogo', icon: Tag, count: items.length },
          { key: 'historial', label: 'Historial de Ventas', icon: Receipt, count: ventas.length },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`text-sm px-4 py-3 font-semibold transition-all border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${
                active
                  ? 'text-emerald-300 border-emerald-400'
                  : 'text-white/60 border-transparent hover:text-white/90'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
              {t.count !== undefined && t.count > 0 && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══ TAB: VENDER ══ */}
      {tab === 'vender' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8 space-y-4">
            {/* Search & Action Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchVender}
                  onChange={(e) => setSearchVender(e.target.value)}
                  placeholder="Buscar producto o servicio por nombre..."
                  className="w-full bg-[#0F1C2A] border border-white/10 rounded-xl pl-10 pr-8 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 outline-none transition-colors"
                />
                {searchVender && (
                  <button
                    type="button"
                    onClick={() => setSearchVender('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowCustomItemModal(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all shadow-sm whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Concepto Libre
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <button
                onClick={() => setSelectedCategoria('todas')}
                className={`px-3 py-1.5 rounded-xl border font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  selectedCategoria === 'todas'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                    : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20'
                }`}
              >
                <span>Todas</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-white/70">
                  {items.filter((i) => i.activo).length}
                </span>
              </button>

              {categoriasExistentes.map((cat) => {
                const count = conteoPorCategoria[cat.toLowerCase()] || 0;
                const active = selectedCategoria.toLowerCase() === cat.toLowerCase();
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategoria(cat)}
                    className={`px-3 py-1.5 rounded-xl border font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                      active
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                        : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-white/70">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Catalog Grid */}
            {itemsParaVender.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center bg-white/[0.02]">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3 text-white/40">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <p className="text-white/80 text-base font-bold mb-1">
                  {searchVender ? 'Sin resultados para la búsqueda' : 'No hay artículos disponibles en esta categoría'}
                </p>
                <p className="text-white/40 text-xs mb-5 max-w-sm mx-auto">
                  {searchVender
                    ? 'Prueba con otro término o limpia los filtros de búsqueda.'
                    : 'Agrega o activa productos en la pestaña de Menú / Catálogo para comenzar.'}
                </p>
                {searchVender ? (
                  <button
                    onClick={() => {
                      setSearchVender('');
                      setSelectedCategoria('todas');
                    }}
                    className="text-xs font-semibold text-emerald-300 border border-emerald-500/30 px-4 py-2 rounded-xl hover:bg-emerald-500/10 transition-colors"
                  >
                    Restablecer Filtros
                  </button>
                ) : (
                  <button
                    onClick={() => setTab('catalogo')}
                    className="text-xs font-bold text-white bg-emerald-500 px-4 py-2 rounded-xl hover:bg-emerald-400 transition-colors shadow-lg"
                  >
                    Ir al Catálogo de Productos →
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {itemsParaVender.map((it) => {
                  const enCarrito = carrito.find((c) => c.item_pos_id === it.id);
                  const cantEnCarrito = enCarrito?.cantidad || 0;

                  return (
                    <div
                      key={it.id}
                      onClick={() => agregarAlCarrito(it)}
                      className={`group relative rounded-2xl border p-4 text-left transition-all cursor-pointer flex flex-col justify-between select-none ${
                        cantEnCarrito > 0
                          ? 'border-emerald-500/50 bg-gradient-to-br from-[#0e211e] to-[#0b1523] shadow-[0_0_24px_rgba(16,185,129,0.18)]'
                          : 'border-white/8 bg-gradient-to-br from-[#0d121a] to-[#0b1420] hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.12)]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-mono font-bold">
                            <DollarSign className="w-4 h-4" />
                          </div>

                          {cantEnCarrito > 0 ? (
                            <div
                              className="flex items-center gap-1 bg-emerald-500/25 border border-emerald-500/40 rounded-lg p-0.5 shadow-sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => modificarCantidadItem(it.id, -1)}
                                className="w-5 h-5 rounded flex items-center justify-center text-emerald-200 hover:bg-emerald-500/40 transition-colors"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-5 text-center text-xs font-bold text-white">
                                {cantEnCarrito}
                              </span>
                              <button
                                type="button"
                                onClick={() => modificarCantidadItem(it.id, 1)}
                                className="w-5 h-5 rounded flex items-center justify-center text-emerald-200 hover:bg-emerald-500/40 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="w-7 h-7 rounded-xl bg-white/5 border border-white/10 text-white/40 group-hover:text-emerald-300 group-hover:border-emerald-500/40 group-hover:bg-emerald-500/10 flex items-center justify-center text-xs font-bold transition-all">
                              <Plus className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-semibold text-white leading-snug line-clamp-2 mb-1 group-hover:text-emerald-200 transition-colors">
                          {it.nombre}
                        </p>
                        {it.categoria && (
                          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2 font-medium">
                            {it.categoria}
                          </p>
                        )}
                        {it.descripcion && (
                          <p className="text-xs text-white/40 line-clamp-1 mb-2">
                            {it.descripcion}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
                        <p className="text-emerald-300 font-bold text-sm tracking-tight">
                          {fmtMoney(n(it.precio), taxCfg.simbolo, taxCfg.locale)}
                        </p>
                        {cantEnCarrito > 0 && (
                          <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                            en ticket
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sticky Register Cart Panel */}
          <div className="xl:col-span-4">
            <div className="rounded-3xl border border-white/10 bg-[#0F1C2A] p-5 xl:sticky xl:top-20 max-h-[calc(100vh-6rem)] flex flex-col shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">Ticket Actual</h3>
                    <p className="text-[10px] text-white/40">{totales.itemsCount} artículo(s)</p>
                  </div>
                </div>

                {carrito.length > 0 && (
                  <button
                    onClick={vaciarCarrito}
                    className="text-[11px] font-semibold text-white/40 hover:text-red-400 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Vaciar
                  </button>
                )}
              </div>

              {carrito.length === 0 ? (
                <div className="text-center py-14 space-y-3 my-auto">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/30">
                    <ShoppingCart className="w-6 h-6" />
                  </div>
                  <p className="text-sm text-white/60 font-semibold">Caja Vacía</p>
                  <p className="text-xs text-white/30 max-w-[220px] mx-auto">
                    Toca cualquier producto del catálogo a la izquierda o agrega un concepto libre.
                  </p>
                </div>
              ) : (
                <>
                  {/* Quick Client CRM Selector */}
                  <div className="mb-3 shrink-0">
                    <div className="flex items-center justify-between text-[11px] text-white/50 mb-1">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-emerald-400" />
                        Cliente:
                      </span>
                      {(clienteNombre || altaCliente) && (
                        <button
                          onClick={limpiarCliente}
                          className="text-white/40 hover:text-red-400 text-[10px]"
                        >
                          Quitar
                        </button>
                      )}
                    </div>

                    {clienteNombre ? (
                      <div className="flex items-center justify-between bg-white/[0.04] border border-emerald-500/30 rounded-xl px-3 py-1.5 text-xs text-white">
                        <span className="font-semibold truncate">{clienteNombre}</span>
                        <span className="text-[10px] text-emerald-300 font-mono">
                          {clienteTelefono || 'Sin teléfono'}
                        </span>
                      </div>
                    ) : altaCliente ? (
                      /* Alta rapida: crear el cliente sin salir del cobro. Se
                         envia junto a la venta, asi que si el cobro falla no
                         queda un cliente huerfano en el CRM. */
                      <div className="space-y-1.5 bg-white/[0.04] border border-emerald-500/30 rounded-xl p-2">
                        <input
                          autoFocus
                          value={altaCliente.nombre}
                          onChange={(e) => setAltaCliente({ ...altaCliente, nombre: e.target.value })}
                          placeholder="Nombre del cliente *"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-emerald-500/40"
                        />
                        <input
                          value={altaCliente.telefono}
                          onChange={(e) => setAltaCliente({ ...altaCliente, telefono: e.target.value })}
                          placeholder="Teléfono (opcional)"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-emerald-500/40"
                        />
                        <p className="text-[10px] text-white/40 leading-snug">
                          Se guardará en tu CRM al cobrar.
                        </p>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        <select
                          onChange={(e) => {
                            const c = crmClientes.find((cl) => cl.id === e.target.value);
                            if (c) seleccionarClienteCRM(c);
                          }}
                          defaultValue=""
                          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white/70 outline-none focus:border-emerald-500/40"
                        >
                          <option value="" disabled className="bg-[#0F1C2A] text-white/50">
                            Público general
                          </option>
                          {crmClientes.map((c) => (
                            <option key={c.id} value={c.id} className="bg-[#0F1C2A] text-white">
                              {c.nombre} {c.telefono ? `(${c.telefono})` : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => setAltaCliente({ nombre: '', telefono: '' })}
                          title="Nuevo cliente"
                          className="shrink-0 px-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/25 transition-colors"
                        >
                          + Nuevo
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Line Items List */}
                  <div className="space-y-2 overflow-y-auto pr-1 flex-1 min-h-[120px] max-h-[220px]">
                    {carrito.map((l, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs bg-white/[0.03] border border-white/8 rounded-xl p-2.5 hover:border-white/15 transition-all"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold truncate">{l.nombre}</p>
                          <p className="text-white/40 text-[10px] font-mono">
                            {fmtMoney(l.precio_unitario, taxCfg.simbolo, taxCfg.locale)} c/u
                          </p>
                        </div>
                        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => cambiarCantidad(i, -1)}
                            aria-label="Disminuir cantidad"
                            className="w-5 h-5 rounded text-white/70 hover:bg-white/10 flex items-center justify-center transition-colors"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <span className="w-5 text-center text-white text-xs font-bold">{l.cantidad}</span>
                          <button
                            type="button"
                            onClick={() => cambiarCantidad(i, 1)}
                            aria-label="Aumentar cantidad"
                            className="w-5 h-5 rounded text-white/70 hover:bg-white/10 flex items-center justify-center transition-colors"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <div className="text-right min-w-[55px]">
                          <p className="text-emerald-300 font-mono font-bold">
                            {fmtMoney(l.precio_unitario * l.cantidad, taxCfg.simbolo, taxCfg.locale)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => quitarDelCarrito(i)}
                          aria-label="Eliminar del ticket"
                          className="text-white/30 hover:text-red-400 p-1 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Promo / Discount Presets Bar */}
                  <div className="pt-3 border-t border-white/10 shrink-0">
                    <div className="flex items-center justify-between text-[11px] text-white/50 mb-1.5">
                      <span className="flex items-center gap-1 font-medium">
                        <Percent className="w-3 h-3 text-amber-400" />
                        Descuento / Promoción:
                      </span>
                      {descuentoTipo !== 'ninguno' && (
                        <span className="text-amber-400 font-bold font-mono">
                          -{fmtMoney(totales.descuentoMonto, taxCfg.simbolo, taxCfg.locale)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-[11px]">
                      {[
                        { key: 'ninguno', label: '0%' },
                        { key: '5', label: '5%' },
                        { key: '10', label: '10%' },
                        { key: '15', label: '15%' },
                        { key: 'custom', label: 'Monto $' },
                      ].map((d) => {
                        const active = descuentoTipo === d.key;
                        return (
                          <button
                            key={d.key}
                            type="button"
                            onClick={() => setDescuentoTipo(d.key as typeof descuentoTipo)}
                            className={`py-1 rounded-lg font-semibold border transition-all text-center ${
                              active
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                                : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20'
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                    {descuentoTipo === 'custom' && (
                      <div className="mt-1.5 relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 text-xs">
                          {taxCfg.simbolo}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={descuentoCustomMonto}
                          onChange={(e) => setDescuentoCustomMonto(e.target.value)}
                          placeholder="Monto de descuento..."
                          className="w-full bg-white/5 border border-amber-500/30 rounded-xl pl-7 pr-3 py-1 text-xs text-white outline-none font-mono"
                        />
                      </div>
                    )}
                  </div>

                  {/* Totals Summary */}
                  <div className="border-t border-white/10 pt-3 space-y-1.5 shrink-0 text-xs">
                    {totales.descuentoMonto > 0 && (
                      <>
                        <div className="flex justify-between text-white/60">
                          <span>Artículos</span>
                          <span className="font-mono">{fmtMoney(totales.subtotalBruto, taxCfg.simbolo, taxCfg.locale)}</span>
                        </div>
                        <div className="flex justify-between text-amber-400 font-medium">
                          <span>Descuento aplicado</span>
                          <span className="font-mono">-{fmtMoney(totales.descuentoMonto, taxCfg.simbolo, taxCfg.locale)}</span>
                        </div>
                      </>
                    )}

                    <div className="flex justify-between text-base font-extrabold text-white pt-2 border-t border-white/10">
                      <span>Total</span>
                      <span className="text-emerald-300 font-mono text-lg">
                        {fmtMoney(totales.total, taxCfg.simbolo, taxCfg.locale)}
                      </span>
                    </div>

                    {/* El impuesto va dentro del precio: se informa, no se suma. */}
                    <div className="flex justify-between text-white/45">
                      <span>
                        {cobraImpuesto
                          ? `Incluye ${taxCfg.consumo.nombre} ${Math.round(taxCfg.consumo.tasa * 1000) / 10}%`
                          : `Sin ${taxCfg.consumo.nombre} (no lo cobras)`}
                      </span>
                      {cobraImpuesto && (
                        <span className="font-mono">{fmtMoney(totales.impuesto, taxCfg.simbolo, taxCfg.locale)}</span>
                      )}
                    </div>
                  </div>

                  <p className="my-3 text-[10px] leading-relaxed text-white/35 shrink-0">
                    Los precios del catálogo ya incluyen {taxCfg.consumo.nombre}: el cliente paga lo que ve.
                    {puntoCobro?.puede_cambiar ? ' Si tu régimen no cobra este impuesto, cámbialo arriba en el punto de cobro.' : ''}
                  </p>

                  {/* Dual Action Buttons */}
                  <div className="space-y-2 shrink-0">
                    <button
                      onClick={() => setShowCheckout(true)}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-sm shadow-[0_4px_24px_rgba(16,185,129,0.35)] hover:shadow-[0_6px_32px_rgba(16,185,129,0.5)] transition-all flex items-center justify-center gap-2"
                    >
                      <DollarSign className="w-4 h-4" />
                      Cobrar {fmtMoney(totales.total, taxCfg.simbolo, taxCfg.locale)}
                    </button>

                    <button
                      onClick={cobroRapidoEfectivo}
                      disabled={cobroEnCurso}
                      className="w-full py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold text-xs transition-all flex items-center justify-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      Cobro Rápido en Efectivo (Exacto)
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: CATÁLOGO ══ */}
      {tab === 'catalogo' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchCatalogo}
                onChange={(e) => setSearchCatalogo(e.target.value)}
                placeholder="Buscar por concepto o categoría..."
                className="w-full bg-[#0F1C2A] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-emerald-500/50 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={compartirMenuWhatsApp}
                className="text-xs font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-3 py-2 rounded-xl hover:bg-emerald-500/20 transition flex items-center gap-1.5 shadow-sm"
              >
                <Share2 className="w-3.5 h-3.5" />
                Compartir Menú WhatsApp
              </button>
              <button
                onClick={descargarMenuPdf}
                disabled={items.filter((i) => i.activo).length === 0}
                className="text-xs font-semibold border border-blue-500/40 bg-blue-500/10 text-blue-300 px-3 py-2 rounded-xl hover:bg-blue-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                Descargar Carta PDF
              </button>
              <button
                onClick={() => {
                  setItemForm({ nombre: '', descripcion: '', precio: '', categoria: '', emoji: '' });
                  setAvisoItem(null);
                  setShowItemForm(true);
                }}
                className="text-xs font-bold bg-emerald-500 text-white px-4 py-2 rounded-xl hover:bg-emerald-400 transition flex items-center gap-1.5 shadow-[0_2px_12px_rgba(16,185,129,0.3)]"
              >
                <Plus className="w-3.5 h-3.5" />
                Nuevo Producto
              </button>
            </div>
          </div>

          {itemsParaCatalogo.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center bg-white/[0.02]">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3 text-white/40">
                <DollarSign className="w-6 h-6" />
              </div>
              <p className="text-white/70 text-sm font-semibold">No se encontraron artículos en el catálogo</p>
              <p className="text-white/40 text-xs mt-1">Crea tu primer producto para comenzar a registrar ventas.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {itemsParaCatalogo.map((it) => (
                <div
                  key={it.id}
                  className={`rounded-2xl border p-4 flex flex-col justify-between transition-all ${
                    it.activo
                      ? 'border-white/10 bg-[#0F1C2A]'
                      : 'border-white/5 bg-[#0F1C2A]/50 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 flex-shrink-0 text-xs font-bold font-mono">
                        <DollarSign className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{it.nombre}</p>
                        {it.categoria && (
                          <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
                            {it.categoria}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleItemActivo(it)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                          it.activo
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : 'bg-white/5 border-white/10 text-white/40'
                        }`}
                      >
                        {it.activo ? 'Activo' : 'Pausado'}
                      </button>
                    </div>

                    {it.descripcion && (
                      <p className="text-xs text-white/50 mb-3 line-clamp-2">{it.descripcion}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/5">
                    <p className="text-emerald-300 font-bold text-sm font-mono">
                      {fmtMoney(n(it.precio), taxCfg.simbolo, taxCfg.locale)}
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => editarItem(it)}
                        className="text-xs text-white/60 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => eliminarItem(it.id)}
                        className="text-xs text-red-400/80 hover:text-red-300 px-2.5 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                      >
                        Borrar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: HISTORIAL ══ */}
      {tab === 'historial' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchHistorial}
                  onChange={(e) => setSearchHistorial(e.target.value)}
                  placeholder="Buscar por ticket, cliente o método..."
                  className="w-full bg-[#0F1C2A] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-emerald-500/50 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              {[
                { key: 'todos', label: 'Todo el Historial' },
                { key: 'hoy', label: 'Hoy' },
                { key: '7dias', label: '7 Días' },
                { key: 'mes', label: 'Este Mes' },
              ].map((p) => {
                const active = filtroPeriodoHistorial === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setFiltroPeriodoHistorial(p.key as typeof filtroPeriodoHistorial)}
                    className={`px-3 py-1.5 rounded-xl border font-semibold transition-all whitespace-nowrap ${
                      active
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                        : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}

              <button
                onClick={exportarHistorialCsv}
                className="text-xs font-bold border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-3 py-1.5 rounded-xl hover:bg-emerald-500/20 transition flex items-center gap-1.5 shadow-sm whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-white/40 text-[11px] mr-1">Método:</span>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'efectivo', label: 'Efectivo' },
              { key: 'tarjeta', label: 'Tarjeta' },
              { key: 'transferencia', label: 'Transf.' },
              { key: 'otro', label: 'Otro' },
            ].map((m) => {
              const active = filtroMetodoHistorial === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => setFiltroMetodoHistorial(m.key as typeof filtroMetodoHistorial)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                    active
                      ? 'bg-white/20 text-white border-white/30'
                      : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {loading ? (
            <p className="text-white/40 text-sm py-12 text-center">Cargando transacciones…</p>
          ) : ventasFiltradas.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center bg-white/[0.02]">
              <p className="text-white/70 text-sm font-semibold">No hay ventas registradas con estos filtros</p>
              <p className="text-white/40 text-xs mt-1">Realiza un cobro en la caja registradora o amplía los filtros.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {ventasFiltradas.map((v) => (
                <div
                  key={v.id}
                  className="rounded-2xl border border-white/8 bg-[#0F1C2A] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-white/15 transition-all shadow-md"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-mono text-sm font-bold text-white tracking-wide">{v.numero_ticket}</p>
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {v.metodo_pago}
                      </span>
                      {v.estado === 'cancelada' && (
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-medium">
                          cancelada
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/40">
                      {v.fecha} · {v.items?.length ?? 0} artículo(s)
                      {v.cliente_nombre && (
                        <span className="text-white/70 font-medium"> · Cliente: {v.cliente_nombre}</span>
                      )}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-bold text-emerald-300 font-mono">
                      {fmtMoney(n(v.total), taxCfg.simbolo, taxCfg.locale)}
                    </p>
                    <p className="text-[10px] text-white/40 font-mono">
                      {v.impuesto_nombre} {fmtMoney(n(v.impuesto_monto), taxCfg.simbolo, taxCfg.locale)}
                    </p>
                  </div>

                  <div className="flex gap-1.5 items-center">
                    <button
                      onClick={() => verDetalleVenta(v)}
                      className="text-xs border border-white/10 text-white/70 px-3 py-1.5 rounded-xl hover:border-white/30 hover:text-white transition-colors"
                    >
                      Detalle
                    </button>
                    <button
                      onClick={() => imprimirTicketTermico(v, taxCfg, nombreNegocioActual)}
                      className="text-xs border border-blue-500/30 text-blue-300 px-3 py-1.5 rounded-xl hover:bg-blue-500/10 transition-colors flex items-center gap-1"
                    >
                      <Printer className="w-3 h-3" />
                      Ticket
                    </button>
                    <button
                      onClick={() => compartirVentaWhatsApp(v)}
                      className="text-xs border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-xl hover:bg-emerald-500/10 transition-colors flex items-center gap-1"
                    >
                      <Share2 className="w-3 h-3" />
                      WhatsApp
                    </button>
                  </div>
                </div>
              ))}
              {siguienteVentas && (
                <div className="pt-2 text-center">
                  <button
                    onClick={async () => {
                      setCargandoMasVentas(true);
                      try {
                        const { data, headers } = await api.get('/pos/ventas', {
                          params: { producto_id: producto.id, antes: siguienteVentas },
                        });
                        setVentas((prev) => [...prev, ...((data || []) as Venta[])]);
                        setSiguienteVentas((headers as Record<string, string | undefined>)['x-siguiente'] ?? null);
                      } catch { /* se puede reintentar */ }
                      finally { setCargandoMasVentas(false); }
                    }}
                    disabled={cargandoMasVentas}
                    className="text-xs font-semibold text-violet-300 border border-violet-500/30 px-4 py-2 rounded-lg hover:bg-violet-500/10 disabled:opacity-50"
                  >
                    {cargandoMasVentas ? 'Cargando…' : 'Cargar ventas anteriores'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ MODAL: CHECKOUT ══ */}
      <AnimatePresence>
        {showCheckout && !ventaResultado && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => !cobroEnCurso && setShowCheckout(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0F1C2A] border border-white/15 rounded-3xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Confirmar Cobro</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCheckout(false)}
                  aria-label="Cerrar modal"
                  className="text-white/40 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-white/50 mb-4">
                {totales.itemsCount} artículo(s) · Total: <span className="text-emerald-300 font-bold font-mono">{fmtMoney(totales.total, taxCfg.simbolo, taxCfg.locale)}</span>
              </p>

              <div className="space-y-4 mb-5">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1.5 font-bold">
                    Método de Pago
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { key: 'efectivo', label: 'Efectivo', icon: Banknote },
                      { key: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
                      { key: 'transferencia', label: 'Transf.', icon: Landmark },
                      { key: 'otro', label: 'Otro', icon: HelpCircle },
                    ].map((m) => {
                      const Icon = m.icon;
                      const isSel = metodoPago === m.key;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => setMetodoPago(m.key as typeof metodoPago)}
                          className={`px-2 py-2.5 rounded-xl text-xs font-semibold flex flex-col items-center gap-1.5 transition-all border ${
                            isSel
                              ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-sm'
                              : 'border-white/10 text-white/50 hover:border-white/20'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {canalesCobro.length > 0 && (
                  <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 block font-bold">
                      Canal de Cobro / Terminal / Delivery (Opcional)
                    </label>
                    <select
                      value={canalCobroId ?? ''}
                      onChange={(e) => setCanalCobroId(e.target.value || null)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-emerald-500/50 outline-none"
                    >
                      <option value="" className="bg-[#0b132b] text-white/60">
                        Directo / Sin comisión de canal
                      </option>
                      {canalesCobro.map((c) => (
                        <option key={c.id} value={c.id} className="bg-[#0b132b] text-white">
                          {c.nombre} {c.institucion ? `(${c.institucion})` : ''} · {textoPorcentaje(c.comision_porcentaje, taxCfg.locale)}{Number(c.comision_fija) > 0 ? ` + ${fmtMoney(Number(c.comision_fija), taxCfg.simbolo, taxCfg.locale)}` : ''}
                        </option>
                      ))}
                    </select>
                    {canalCobroId && (() => {
                      const sel = canalesCobro.find((c) => c.id === canalCobroId);
                      if (!sel) return null;
                      // La misma cuenta que hace el servidor al cobrar (lib/comisiones.ts):
                      // IVA del país, solo si la terminal lo cobra, y retenciones sin IVA.
                      const d = calcularDesgloseComision(totales.total, sel, taxCfg.consumo.tasa, totales.impuesto);
                      const retenciones = r2(d.retencionIsr + d.retencionIva);
                      return (
                        <div className="pt-1 space-y-0.5 text-[11px]">
                          <div className="flex items-center justify-between text-emerald-400">
                            <span className="text-white/50">
                              Comisión{d.comisionIva > 0 ? ' con IVA' : ''}: -{fmtMoney(r2(d.comisionBase + d.comisionIva), taxCfg.simbolo, taxCfg.locale)}
                            </span>
                            <span className="font-semibold font-mono">Te llega: {fmtMoney(d.montoNeto, taxCfg.simbolo, taxCfg.locale)}</span>
                          </div>
                          {retenciones > 0 && (
                            <p className="text-white/40">Incluye {fmtMoney(retenciones, taxCfg.simbolo, taxCfg.locale)} de retenciones de impuestos de la app.</p>
                          )}
                          <p className="text-white/30">Con la tarifa que guardaste para este canal; si tu contrato cambió, actualízala en Contabilidad.</p>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {metodoPago === 'efectivo' && (
                  <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 block font-bold">
                      Monto Recibido en Efectivo
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-semibold">
                        {taxCfg.simbolo}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={montoRecibido}
                        onChange={(e) => setMontoRecibido(e.target.value)}
                        placeholder={String(totales.total)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-sm text-white font-mono focus:border-emerald-500/50 outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setMontoRecibido(String(totales.total))}
                        className="text-[11px] px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-medium hover:bg-emerald-500/20 transition-colors"
                      >
                        Exacto
                      </button>
                      {[100, 200, 500, 1000].map((den) => (
                        <button
                          key={den}
                          type="button"
                          onClick={() => setMontoRecibido(String(den))}
                          className="text-[11px] px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-colors font-mono"
                        >
                          ${den}
                        </button>
                      ))}
                    </div>

                    {calculoCambio && (
                      <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                        <span className="text-white/60">
                          {calculoCambio.esSuficiente ? 'Cambio a devolver:' : 'Monto faltante:'}
                        </span>
                        <span
                          className={`font-mono font-bold text-sm ${
                            calculoCambio.esSuficiente ? 'text-emerald-300' : 'text-amber-400'
                          }`}
                        >
                          {calculoCambio.esSuficiente
                            ? fmtMoney(calculoCambio.cambio, taxCfg.simbolo, taxCfg.locale)
                            : `Faltan ${fmtMoney(calculoCambio.faltante, taxCfg.simbolo, taxCfg.locale)}`}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1 font-bold">
                      Cliente (Opcional)
                    </label>
                    <input
                      type="text"
                      value={clienteNombre}
                      onChange={(e) => setClienteNombre(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none"
                      placeholder="Ej. Juan Pérez"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1 font-bold">
                      Teléfono WhatsApp
                    </label>
                    <input
                      type="text"
                      value={clienteTelefono}
                      onChange={(e) => setClienteTelefono(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none font-mono"
                      placeholder="+52 55 1234 5678"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1 font-bold">
                    Notas o Referencia
                  </label>
                  <input
                    type="text"
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none"
                    placeholder="Factura, mesa, especificaciones..."
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowCheckout(false)}
                  disabled={cobroEnCurso}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-xs font-semibold hover:bg-white/5 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => ejecutarCobro()}
                  disabled={cobroEnCurso}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-xs disabled:opacity-50 transition shadow-[0_4px_15px_rgba(16,185,129,0.3)] flex items-center justify-center gap-1.5"
                >
                  {cobroEnCurso ? (
                    'Procesando cobro…'
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar y Cobrar
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ MODAL: RECIBO DIGITAL TÉRMICO (VENTA EXITOSA) ══ */}
      <AnimatePresence>
        {ventaResultado && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[#0F1C2A] border border-emerald-500/30 rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col"
            >
              {/* Stock que no alcanzaba. La venta SI se registro: esto informa,
                  no revierte nada. Bloquear el cobro por un inventario mal
                  capturado costaria la venta real. */}
              {avisosVenta.length > 0 && (
                <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <p className="text-[11px] font-semibold text-amber-300 mb-1">
                    Revisa tu inventario
                  </p>
                  <ul className="space-y-1">
                    {avisosVenta.map((a, i) => (
                      <li key={i} className="text-[11px] leading-snug text-amber-100/80">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-[#132232] border border-white/10 rounded-2xl p-5 mb-5 font-mono text-xs text-white/80 shadow-inner">
                <div className="text-center border-b border-dashed border-white/20 pb-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 mx-auto mb-2 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-white font-bold text-sm uppercase tracking-wide">
                    {nombreNegocioActual}
                  </h4>
                  <p className="text-[11px] text-emerald-400 font-bold mt-0.5">
                    TICKET {ventaResultado.numero_ticket}
                  </p>
                  <p className="text-[10px] text-white/40">{ventaResultado.fecha}</p>
                  {ventaResultado.cliente_nombre && (
                    <p className="text-[11px] text-white/70 mt-1">
                      Cliente: <strong>{ventaResultado.cliente_nombre}</strong>
                    </p>
                  )}
                </div>

                <div className="space-y-1 mb-3 border-b border-dashed border-white/20 pb-3">
                  {ventaResultado.items?.map((it) => (
                    <div key={it.id} className="flex justify-between text-[11px]">
                      <span className="truncate pr-2">{Number(it.cantidad)}x {it.nombre_snapshot}</span>
                      <span className="font-bold">{fmtMoney(importeLinea(it), taxCfg.simbolo, taxCfg.locale)}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between text-sm font-bold text-white">
                    <span>TOTAL PAGADO</span>
                    <span className="text-emerald-300 font-extrabold">
                      {fmtMoney(n(ventaResultado.total), taxCfg.simbolo, taxCfg.locale)}
                    </span>
                  </div>
                  <p className="text-white/50">{textoImpuesto(ventaResultado, taxCfg)}</p>
                </div>

                <div className="mt-3 pt-2 border-t border-dashed border-white/20 flex items-center justify-between text-[10px] text-white/50 uppercase">
                  <span>Método: {ventaResultado.metodo_pago}</span>
                  <span className="text-emerald-400 font-semibold">Sincronizado</span>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => imprimirTicketTermico(ventaResultado, taxCfg, nombreNegocioActual)}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir Ticket (Impresora Térmica)
                </button>

                {waUrl && (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 transition"
                  >
                    <Share2 className="w-4 h-4" />
                    Enviar Ticket por WhatsApp
                  </a>
                )}

                <button
                  onClick={() => {
                    setVentaResultado(null);
                    setWaUrl(null);
                  }}
                  className="w-full py-2.5 rounded-xl border border-white/10 text-white/70 text-xs font-semibold hover:bg-white/5 transition flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Listo / Nueva Venta
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ MODAL: CONCEPTO LIBRE ══ */}
      <AnimatePresence>
        {showCustomItemModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowCustomItemModal(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0F1C2A] border border-white/15 rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Concepto Libre / Venta Rápida</h3>
                  <p className="text-xs text-white/40">Agrega un servicio o producto manual al ticket actual.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomItemModal(false)}
                  aria-label="Cerrar modal"
                  className="text-white/40 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor="pos-custom-nombre" className="text-[10px] uppercase tracking-wider text-white/40 block mb-1 font-bold">
                    Descripción del concepto *
                  </label>
                  <input
                    id="pos-custom-nombre"
                    type="text"
                    value={customItem.nombre}
                    onChange={(e) => setCustomItem({ ...customItem, nombre: e.target.value })}
                    placeholder="Ej. Servicio especial express"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="pos-custom-precio" className="text-[10px] uppercase tracking-wider text-white/40 block mb-1 font-bold">
                    Precio Unitario ({taxCfg.simbolo}) *
                  </label>
                  <input
                    id="pos-custom-precio"
                    type="number"
                    min="0"
                    step="0.01"
                    value={customItem.precio}
                    onChange={(e) => setCustomItem({ ...customItem, precio: e.target.value })}
                    placeholder="1200"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setShowCustomItemModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 text-xs font-semibold hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  onClick={agregarConceptoLibre}
                  disabled={!customItem.nombre.trim() || !customItem.precio}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs disabled:opacity-40 transition shadow-md"
                >
                  Agregar al Ticket
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ MODAL: PRODUCTO DEL CATÁLOGO ══ */}
      <AnimatePresence>
        {showItemForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowItemForm(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0F1C2A] border border-white/15 rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">{itemForm.id ? 'Editar Producto' : 'Nuevo Producto'}</h3>
                <button
                  type="button"
                  onClick={() => setShowItemForm(false)}
                  aria-label="Cerrar modal"
                  className="text-white/40 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor="pos-item-nombre" className="text-[10px] uppercase tracking-wider text-white/40 block mb-1 font-bold">
                    Nombre del Producto *
                  </label>
                  <input
                    id="pos-item-nombre"
                    type="text"
                    value={itemForm.nombre}
                    onChange={(e) => setItemForm({ ...itemForm, nombre: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none"
                    placeholder="Ej. Café Espresso Doble"
                  />
                </div>

                <div>
                  <label htmlFor="pos-item-descripcion" className="text-[10px] uppercase tracking-wider text-white/40 block mb-1 font-bold">
                    Descripción (Opcional)
                  </label>
                  <textarea
                    id="pos-item-descripcion"
                    value={itemForm.descripcion}
                    onChange={(e) => setItemForm({ ...itemForm, descripcion: e.target.value })}
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none resize-none"
                    placeholder="Detalles del producto o presentación"
                  />
                </div>

                <div>
                  <label htmlFor="pos-item-precio" className="text-[10px] uppercase tracking-wider text-white/40 block mb-1 font-bold">
                    Precio de Venta ({taxCfg.simbolo}) *
                  </label>
                  <input
                    id="pos-item-precio"
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemForm.precio}
                    onChange={(e) => setItemForm({ ...itemForm, precio: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none font-mono"
                    placeholder="65.00"
                  />
                </div>

                {/* Receta: lo que conecta este producto con el almacen. Sin
                    ella la venta no descuenta stock ni hay margen real. */}
                <RecetaEditor
                  ref={recetaRef}
                  itemPosId={itemForm.id ?? null}
                  simbolo={taxCfg.simbolo}
                  locale={taxCfg.locale}
                />

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Categoría</label>
                    {itemForm.categoria.trim() && (
                      <button
                        type="button"
                        onClick={() => setItemForm({ ...itemForm, categoria: '' })}
                        className="text-[10px] text-white/40 hover:text-red-400"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {categoriasParaPicker.map((cat) => {
                      const selected = itemForm.categoria.trim().toLowerCase() === cat.toLowerCase();
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setItemForm({ ...itemForm, categoria: cat })}
                          className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                            selected
                              ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200 font-semibold'
                              : 'border-white/10 bg-white/5 text-white/60 hover:border-emerald-500/40 hover:text-white'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    value={itemForm.categoria}
                    onChange={(e) => setItemForm({ ...itemForm, categoria: e.target.value })}
                    list="cat-suggestions"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none"
                    placeholder="O escribe una categoría personalizada..."
                  />
                  <datalist id="cat-suggestions">
                    {categoriasParaPicker.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>

              {avisoItem && (
                <p
                  role={avisoItem.tipo === 'error' ? 'alert' : 'status'}
                  className={`mt-4 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
                    avisoItem.tipo === 'error'
                      ? 'border-red-500/30 bg-red-500/10 text-red-300'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  }`}
                >
                  {avisoItem.texto}
                </p>
              )}

              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setShowItemForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 text-xs font-semibold hover:bg-white/5"
                >
                  {avisoItem?.tipo === 'info' ? 'Sin receta por ahora' : 'Cancelar'}
                </button>
                <button
                  onClick={guardarItem}
                  disabled={guardandoItem || !itemForm.nombre.trim() || !itemForm.precio}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs disabled:opacity-40 transition shadow-md"
                >
                  {itemForm.id ? 'Guardar Cambios' : 'Crear Producto'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ MODAL: DETALLE DE VENTA ══ */}
      <AnimatePresence>
        {ventaDetalle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setVentaDetalle(null)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0F1C2A] border border-white/15 rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-mono text-base font-bold text-white">{ventaDetalle.numero_ticket}</p>
                  <p className="text-xs text-white/50 capitalize">
                    {ventaDetalle.fecha} · Método: {ventaDetalle.metodo_pago}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVentaDetalle(null)}
                  aria-label="Cerrar modal"
                  className="text-white/40 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {ventaDetalle.cliente_nombre && (
                <p className="text-xs text-white/70 mb-3 bg-white/5 px-3 py-2 rounded-xl">
                  Cliente: <span className="font-semibold text-white">{ventaDetalle.cliente_nombre}</span>
                  {ventaDetalle.cliente_telefono && (
                    <span className="text-white/40 ml-2 font-mono">{ventaDetalle.cliente_telefono}</span>
                  )}
                </p>
              )}

              <div className="space-y-1.5 mb-4 border-y border-white/10 py-3">
                {ventaDetalle.items?.map((i) => (
                  <div key={i.id} className="flex justify-between text-xs text-white/70">
                    <span>
                      {n(i.cantidad)} × {i.nombre_snapshot}
                    </span>
                    <span className="font-mono">{fmtMoney(importeLinea(i), taxCfg.simbolo, taxCfg.locale)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-white">Total</span>
                  <span className="text-emerald-300 font-mono">
                    {fmtMoney(n(ventaDetalle.total), taxCfg.simbolo, taxCfg.locale)}
                  </span>
                </div>
                <p className="text-white/50">{textoImpuesto(ventaDetalle, taxCfg)}</p>

                {ventaDetalle.comision_monto !== null && ventaDetalle.comision_monto !== undefined && Number(ventaDetalle.comision_monto) > 0 && (
                  <div className="pt-2 border-t border-white/10 space-y-1 text-xs">
                    <div className="flex justify-between text-amber-300/80">
                      <span>Comisión de canal (c/IVA)</span>
                      <span className="font-mono">
                        -{fmtMoney((Number(ventaDetalle.comision_monto) || 0) + (Number(ventaDetalle.comision_iva) || 0), taxCfg.simbolo, taxCfg.locale)}
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold text-emerald-400">
                      <span>Ingreso Neto Cobrado</span>
                      <span className="font-mono">
                        {fmtMoney(Number(ventaDetalle.monto_neto) || 0, taxCfg.simbolo, taxCfg.locale)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {ventaDetalle.notas && (
                <p className="text-xs text-white/50 italic mt-3 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                  &ldquo;{ventaDetalle.notas}&rdquo;
                </p>
              )}

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => imprimirTicketTermico(ventaDetalle, taxCfg, nombreNegocioActual)}
                  className="flex-1 py-2.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-bold hover:bg-blue-500/25 transition flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir Ticket
                </button>
                <button
                  onClick={() => compartirVentaWhatsApp(ventaDetalle)}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/25 transition flex items-center justify-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
              </div>

              {ventaDetalle.estado === 'cancelada' ? (
                <p className="mt-3 text-center text-xs text-red-300/80 bg-red-500/[0.06] border border-red-500/20 rounded-xl py-2">
                  Venta cancelada — se devolvió el stock y se registraron los asientos inversos.
                </p>
              ) : cancelacion?.ventaId === ventaDetalle.id ? (
                <div className="mt-3 space-y-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3">
                  <p className="text-[11px] leading-relaxed text-red-200/90">
                    ¿Cancelar la venta {ventaDetalle.numero_ticket}? El stock vuelve al almacén y se registran los asientos
                    contables inversos con fecha de hoy. La venta no se borra: queda marcada como cancelada.
                  </p>
                  <label htmlFor="pos-motivo-cancelacion" className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
                    Motivo (opcional)
                  </label>
                  <input
                    id="pos-motivo-cancelacion"
                    type="text"
                    maxLength={300}
                    value={cancelacion.motivo}
                    onChange={(e) => setCancelacion({ ...cancelacion, motivo: e.target.value, error: null })}
                    placeholder="Ej. el cliente devolvió el producto"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none focus:border-red-400/40"
                  />
                  {cancelacion.error && (
                    <p role="alert" className="text-[11px] text-red-300">{cancelacion.error}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCancelacion(null)}
                      disabled={cancelandoVenta}
                      className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 text-xs font-semibold hover:bg-white/5 disabled:opacity-50"
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelarVenta(ventaDetalle, cancelacion.motivo)}
                      disabled={cancelandoVenta}
                      className="flex-1 py-2 rounded-lg bg-red-500/80 text-white text-xs font-bold hover:bg-red-500 disabled:opacity-50"
                    >
                      {cancelandoVenta ? 'Cancelando…' : 'Sí, cancelar venta'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCancelacion({ ventaId: ventaDetalle.id, motivo: '', error: null })}
                  className="mt-3 w-full py-2 rounded-xl border border-red-500/25 text-red-300/90 text-xs font-semibold hover:bg-red-500/10 transition"
                >
                  Cancelar venta
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
