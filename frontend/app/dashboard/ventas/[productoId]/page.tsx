'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api';
import { getImageUrl } from '@/lib/utils';
import { interpretarErrorApi } from '@/lib/apiError';
import AvisoErrorApi from '@/components/ui/AvisoErrorApi';
import { HelpTip } from '@/components/ui/HelpTip';
import VentasVideoUploader from '@/components/ventas/VentasVideoUploader';
import { BackButton } from '@/components/ui';
import { monedaDePais } from '@/lib/perfilNegocio';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoVenta = 'B2C_directo' | 'B2B' | 'hibrido' | 'servicios';
type Canal = 'directo' | 'marketplace' | 'redes_sociales' | 'telefono' | 'combinado';
type Equipo = 'solo_tu' | '1_2_personas' | '3_mas_personas';

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number | null;
  precio_esperado: number | null;
  imagen_url: string | null;
  video_url: string | null;
  pais: string | null;
}

// ─── Tu embudo de ventas (opcional; ver services/ventas/types.ts) ────────────

const CICLOS = [
  { value: 'mismo_dia', label: 'El mismo día' },
  { value: 'dias', label: 'Unos días' },
  { value: 'semanas', label: 'Semanas' },
  { value: 'meses', label: 'Meses' },
] as const;

const DECIDE = [
  { value: 'el_mismo', label: 'El mismo cliente' },
  { value: 'pareja_familia', label: 'Con su pareja o familia' },
  { value: 'dueno_empresa', label: 'El dueño de la empresa' },
  { value: 'compras_comite', label: 'Compras o un comité' },
] as const;

function Pildoras<T extends string>({
  opciones,
  valor,
  onChange,
  nombre,
}: {
  opciones: readonly { value: T; label: string }[];
  valor: T | '';
  onChange: (v: T | '') => void;
  nombre: string;
}) {
  return (
    <div role="radiogroup" aria-label={nombre} className="flex flex-wrap gap-2 mt-1">
      {opciones.map((o) => {
        const activo = valor === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={activo}
            // Volver a pulsar la opción elegida la deja sin responder.
            onClick={() => onChange(activo ? '' : o.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              activo
                ? 'bg-ventas/15 border-ventas/40 text-white'
                : 'bg-white/[0.03] border-white/10 text-white/50 hover:border-white/20 hover:text-white/80'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Vector Icons (0 Emojis) ──────────────────────────────────────────────────

function IconBag(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  );
}

function IconBriefcase(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="20" height="14" x="2" y="7" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function IconHybrid(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="12" r="3"/><path d="m8.5 7.5 7 3.5"/><path d="m8.5 16.5 7-3.5"/>
    </svg>
  );
}

function IconServices(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}

function IconStore(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/>
    </svg>
  );
}

function IconCart(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
    </svg>
  );
}

function IconSocial(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>
    </svg>
  );
}

function IconChat(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function IconOmni(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  );
}

function IconUser(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function IconTeamSmall(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IconTeamStructure(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><rect x="16" y="13" width="7" height="8" rx="1"/>
    </svg>
  );
}

function IconBox(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
    </svg>
  );
}

// ─── Opciones ─────────────────────────────────────────────────────────────────

const TIPOS_VENTA: { value: TipoVenta; icon: React.ReactNode; titulo: string; desc: string }[] = [
  { value: 'B2C_directo', icon: <IconBag className="w-4 h-4" />, titulo: 'B2C Directo', desc: 'Venta directa al consumidor final' },
  { value: 'B2B', icon: <IconBriefcase className="w-4 h-4" />, titulo: 'B2B Corporativo', desc: 'Negociación directa con empresas' },
  { value: 'hibrido', icon: <IconHybrid className="w-4 h-4" />, titulo: 'Modelo Híbrido', desc: 'Consumidores y cuentas corporativas' },
  { value: 'servicios', icon: <IconServices className="w-4 h-4" />, titulo: 'Servicios Profesionales', desc: 'Proyectos, consultoría o fee recurrente' },
];

const CANALES: { value: Canal; icon: React.ReactNode; titulo: string; desc: string }[] = [
  { value: 'directo', icon: <IconStore className="w-4 h-4" />, titulo: 'Directo / Físico', desc: 'Punto propio o venta presencial' },
  { value: 'marketplace', icon: <IconCart className="w-4 h-4" />, titulo: 'Marketplace', desc: 'Plataformas externas e intermediadas' },
  { value: 'redes_sociales', icon: <IconSocial className="w-4 h-4" />, titulo: 'Canales Digitales', desc: 'Tráfico social y funnels outbound' },
  { value: 'telefono', icon: <IconChat className="w-4 h-4" />, titulo: 'Conversacional / CRM', desc: 'WhatsApp, llamadas y cierre asistido' },
  { value: 'combinado', icon: <IconOmni className="w-4 h-4" />, titulo: 'Omnicanal', desc: 'Multi-atribución sincronizada' },
];

const EQUIPOS: { value: Equipo; icon: React.ReactNode; titulo: string; desc: string }[] = [
  { value: 'solo_tu', icon: <IconUser className="w-4 h-4" />, titulo: 'Unipersonal', desc: 'Fundador/ejecutor único de ventas' },
  { value: '1_2_personas', icon: <IconTeamSmall className="w-4 h-4" />, titulo: 'Equipo Núcleo (1–2)', desc: 'Célula comercial reducida' },
  { value: '3_mas_personas', icon: <IconTeamStructure className="w-4 h-4" />, titulo: 'Equipo Estructurado (3+)', desc: 'Fuerza de ventas con roles definidos' },
];

const EJEMPLOS_OBJETIVO = [
  'Duplicar el ratio de cierre en etapas de negociación',
  'Estandarizar el protocolo de seguimiento por WhatsApp',
  'Transicionar de B2C a venta corporativa B2B de alto ticket',
];

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-white/5 border border-white/10 text-white placeholder-white/25 rounded-xl ' +
  'px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ventas/40 ' +
  'focus:border-ventas/40 transition';

// ─── Micro-components ─────────────────────────────────────────────────────────

function Block({
  n, title, subtitle, children,
}: {
  n: number; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0F1C2A] rounded-2xl border border-white/10 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-ventas/20 text-ventas text-xs font-bold flex items-center justify-center flex-shrink-0">
          {n}
        </span>
        <div>
          <h2 className="text-sm font-bold text-white">{title}</h2>
          {subtitle && <p className="text-[11px] text-white/40 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6 space-y-6">{children}</div>
    </div>
  );
}

function Field({
  label, required, optional, hint, help, error, children,
}: {
  label: string; required?: boolean; optional?: boolean;
  hint?: string; help?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-white/80 mb-1.5">
        {label}
        {required && <span className="text-brand-accent ml-0.5">*</span>}
        {optional && <span className="text-white/30 font-normal ml-1">(opcional)</span>}
        {help && <HelpTip text={help} label={label} />}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-white/30 mt-1.5 leading-snug">{hint}</p>}
      {error && <p className="text-xs text-brand-accent mt-1.5">{error}</p>}
    </div>
  );
}

function OptionCard({
  activo,
  onClick,
  icon,
  titulo,
  desc,
}: {
  activo: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  titulo: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`text-left p-3.5 rounded-xl border transition-all ${
        activo
          ? 'border-ventas bg-ventas/10 shadow-[0_0_15px_rgba(249,115,22,0.12)]'
          : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`p-1.5 rounded-lg ${activo ? 'bg-ventas/20 text-ventas' : 'bg-white/5 text-white/60'}`}>
          {icon}
        </div>
        <p className={`text-xs font-bold leading-tight ${activo ? 'text-white' : 'text-white/80'}`}>
          {titulo}
        </p>
      </div>
      <p className="text-[11px] text-white/45 leading-relaxed">{desc}</p>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VentasScopePage() {
  const router = useRouter();
  const { productoId } = useParams<{ productoId: string }>();

  const [producto, setProducto] = useState<Producto | null>(null);
  const [tipoVenta, setTipoVenta] = useState<TipoVenta>('B2C_directo');
  const [canalPrincipal, setCanalPrincipal] = useState<Canal>('directo');
  const [ticketPromedio, setTicketPromedio] = useState<number>(0);
  const [unidadesPreview, setUnidadesPreview] = useState<number>(60);
  const [tamanoEquipo, setTamanoEquipo] = useState<Equipo>('solo_tu');
  const [objetivoVentas, setObjetivoVentas] = useState('');
  // Embudo: vacío = no declarado (el análisis lo dice y trabaja con supuestos).
  const [contactosMes, setContactosMes] = useState('');
  const [cierreDeDiez, setCierreDeDiez] = useState('');
  const [cicloVenta, setCicloVenta] = useState<(typeof CICLOS)[number]['value'] | ''>('');
  const [quienDecide, setQuienDecide] = useState<(typeof DECIDE)[number]['value'] | ''>('');
  const [objeciones, setObjeciones] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ ticketPromedio?: string; embudo?: string }>({});

  useEffect(() => {
    // Navegar de un producto a otro reutiliza este componente y relanza el
    // efecto: sin este flag, la respuesta del producto anterior puede llegar
    // después y pintarse bajo el producto nuevo.
    let vigente = true;
    api.get(`/productos/${productoId}`)
      .then(({ data }) => {
        if (!vigente) return;
        setProducto(data);
        const precio = Number(data?.precio);
        if (Number.isFinite(precio) && precio > 0) setTicketPromedio(Math.round(precio));
        // El alta guarda el equipo como número de personas; aquí es un tramo.
        const personas = Number(data?.tamano_equipo);
        if (Number.isFinite(personas) && personas > 0) {
          setTamanoEquipo(personas <= 1 ? 'solo_tu' : personas <= 2 ? '1_2_personas' : '3_mas_personas');
        }
      })
      // Sin el flag, el fallo de una petición ya obsoleta sacaría al usuario
      // del producto que acaba de abrir.
      .catch(() => { if (vigente) router.push('/dashboard'); });
    return () => { vigente = false; };
  }, [productoId, router]);

  const proyeccionMes = ticketPromedio > 0 ? ticketPromedio * unidadesPreview : 0;

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError('');
    setUpgradeRequired(false);
    setFieldErrors({});

    if (ticketPromedio <= 0) {
      setFieldErrors({ ticketPromedio: 'El ticket promedio debe ser mayor a 0.' });
      return;
    }
    const contactos = contactosMes.trim() === '' ? undefined : Number(contactosMes);
    const deDiez = cierreDeDiez.trim() === '' ? undefined : Number(cierreDeDiez);
    if (contactos !== undefined && (!Number.isInteger(contactos) || contactos < 0)) {
      setFieldErrors({ embudo: 'Los contactos al mes deben ser un número entero.' });
      return;
    }
    if (deDiez !== undefined && (!Number.isFinite(deDiez) || deDiez < 0 || deDiez > 10)) {
      setFieldErrors({ embudo: 'De cada 10 que preguntan, compran entre 0 y 10.' });
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/ventas/analizar', {
        producto_id: productoId,
        tipo_venta: tipoVenta,
        canal_principal: canalPrincipal,
        ticket_promedio: ticketPromedio,
        tamano_equipo: tamanoEquipo,
        objetivo_ventas: objetivoVentas || undefined,
        contactos_mes: contactos,
        tasa_cierre_pct: deDiez === undefined ? undefined : deDiez * 10,
        ciclo_venta: cicloVenta || undefined,
        quien_decide: quienDecide || undefined,
        objeciones_frecuentes: objeciones.trim() || undefined,
      });
      router.push(`/dashboard/ventas/${productoId}/resultado/${data.analisis_id}`);
    } catch (err: unknown) {
      const interpretado = interpretarErrorApi(
        err,
        'Error al iniciar el análisis de ventas. Revisa tus datos.',
      );
      setError(interpretado.mensaje);
      setUpgradeRequired(interpretado.upgradeRequired);
      setLoading(false);
    }
  };

  if (!producto) {
    return <div className="flex items-center justify-center h-64 text-white/40 text-sm">Cargando...</div>;
  }

  const imgUrl = getImageUrl(producto.imagen_url);
  // Moneda del país del producto: antes todo decía MXN.
  const moneda = monedaDePais(producto.pais) || 'MXN';

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto animate-fade-in">

      {/* Header */}
      <div className="mb-8">
        <BackButton
          href={`/dashboard/producto/${productoId}`}
          label="Ficha del producto"
          className="mb-4"
        />
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-ventas/10 border border-ventas/20 text-ventas text-[11px] font-mono font-semibold uppercase tracking-wider mb-2">
          RevOps & Protocolos de Conversión
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          Configuración de Estrategia Comercial
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Estructura los parámetros operativos para calibrar protocolos de negociación, objeciones y matrices de conversión.
        </p>

        {/* Producto Card */}
        <div className="bg-[#0F1C2A] rounded-2xl p-5 mt-6 flex items-center gap-4 border border-white/8 shadow-sm">
          <div className="w-14 h-14 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
            {imgUrl
              ? <img src={imgUrl} alt={producto.nombre} className="w-full h-full object-cover" />
              : <IconBox className="w-6 h-6 text-white/40" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white truncate">{producto.nombre}</p>
            <p className="text-sm text-white/50">
              {producto.categoria}{producto.precio_esperado ? ` · ${Number(producto.precio_esperado).toLocaleString('es-MX')} ${moneda}` : ''}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

        {/* BLOQUE 1 - Tipo de venta */}
        <Block n={1} title="Modelo de Venta" subtitle="Define la dinámica de interacción según la naturaleza del comprador">
          <Field label="Segmento de venta" required help="Define si comercializas a consumidor final (B2C), corporativos (B2B), modelo mixto o servicios profesionales. Modela la estructura de negociación y objeciones.">
            <div className="grid grid-cols-2 gap-3 mt-1">
              {TIPOS_VENTA.map((t) => (
                <OptionCard
                  key={t.value}
                  activo={tipoVenta === t.value}
                  onClick={() => setTipoVenta(t.value)}
                  icon={t.icon}
                  titulo={t.titulo}
                  desc={t.desc}
                />
              ))}
            </div>
          </Field>
        </Block>

        {/* BLOQUE 2 - Canal de cierre */}
        <Block n={2} title="Canal de Cierre" subtitle="Parametriza los protocolos según el punto de conversión real">
          <Field label="Canal principal" required help="El medio donde efectivamente cierras y cobras la mayoría de transacciones. Calibra los protocolos de seguimiento y argumentación.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mt-1">
              {CANALES.map((c) => (
                <OptionCard
                  key={c.value}
                  activo={canalPrincipal === c.value}
                  onClick={() => setCanalPrincipal(c.value)}
                  icon={c.icon}
                  titulo={c.titulo}
                  desc={c.desc}
                />
              ))}
            </div>
          </Field>
        </Block>

        {/* BLOQUE 3 - Ticket promedio */}
        <Block n={3} title="Ticket Promedio" subtitle="Valor medio por transacción comercial">
          <Field label="Ticket promedio por venta" required hint="Utilizado para modelar escenarios de facturación y calibrar sensibilidad de precio." help="El monto promedio cobrado por transacción normal. Calibra la matriz de objeciones y la justificación de valor." error={fieldErrors.ticketPromedio}>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={ticketPromedio || ''}
                onChange={(e) => { setTicketPromedio(Number(e.target.value)); setFieldErrors({}); }}
                className={`${inputCls} font-mono tabular-nums`}
                placeholder="ej. 350"
              />
              <span className="text-sm text-white/50 whitespace-nowrap">{moneda}</span>
            </div>
          </Field>

          {/* Proyección rápida */}
          <div className="bg-white/5 border border-white/8 rounded-xl px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Potencial mensual estimado</span>
              <span className="text-sm font-bold text-ventas font-mono tabular-nums">
                {proyeccionMes.toLocaleString('es-MX')} {moneda}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={10}
                max={500}
                step={10}
                value={unidadesPreview}
                onChange={(e) => setUnidadesPreview(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-ventas"
              />
              <span className="w-24 shrink-0 text-right text-xs text-white/40 tabular-nums">{unidadesPreview} u/mes</span>
            </div>
            <p className="text-[10px] text-white/30 leading-relaxed border-t border-white/5 pt-2">
              Simulación base preliminar — el análisis estructurará escenarios de conversión y viabilidad por tramos.
            </p>
          </div>
        </Block>

        {/* BLOQUE 4 - Equipo */}
        <Block n={4} title="Estructura Operativa" subtitle="Define la capacidad para estructurar protocolos directos o delegables">
          <Field label="Tamaño del equipo comercial" required help="Indica quién ejecuta la venta. En esquema unipersonal, prioriza eficiencia de tiempo. Con equipo, estructura protocolos reproducibles y control de conversión.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mt-1">
              {EQUIPOS.map((q) => (
                <OptionCard
                  key={q.value}
                  activo={tamanoEquipo === q.value}
                  onClick={() => setTamanoEquipo(q.value)}
                  icon={q.icon}
                  titulo={q.titulo}
                  desc={q.desc}
                />
              ))}
            </div>
          </Field>
        </Block>

        {/* BLOQUE 5 - Objetivo */}
        <Block n={5} title="Objetivo Comercial Prioritario" subtitle="Focaliza los protocolos hacia tu hito de conversión inmediato">
          <Field label="Hito u objetivo estratégico" optional hint="Permite calibrar la estrategia hacia metas concretas de expansión, ticket o conversión." help="Describe tu meta concreta: duplicar ratio de conversión, estandarizar cierre o expandir a cuentas B2B.">
            <textarea
              rows={3}
              maxLength={300}
              value={objetivoVentas}
              onChange={(e) => setObjetivoVentas(e.target.value)}
              placeholder='Ej: "Escalar conversión 3x en 6 meses, protocolizar cierre en cuentas corporativas B2B, optimizar margen sin descuentos…"'
              className={`${inputCls} resize-none`}
            />
            <div className="mt-2 flex items-center justify-between">
              <div className="flex flex-wrap gap-1.5">
                {EJEMPLOS_OBJETIVO.map((ej) => (
                  <button
                    key={ej}
                    type="button"
                    onClick={() => setObjetivoVentas(ej)}
                    className="rounded-full border border-white/[0.09] px-2.5 py-1 text-[11px] text-white/45 transition-colors hover:border-ventas/40 hover:text-ventas"
                  >
                    {ej}
                  </button>
                ))}
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-white/25">{objetivoVentas.length}/300</span>
            </div>
          </Field>
        </Block>

        {/* BLOQUE 6 - Embudo */}
        <Block n={6} title="Tu embudo de ventas" subtitle="Opcional — con estos datos los tips atacan tu cuello de botella real">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="¿Cuántas personas te preguntan al mes?" optional help="Mensajes, llamadas o visitas de gente interesada en un mes típico. Dice si te faltan clientes o si se te escapan los que ya llegan.">
              <input
                type="number" min={0} step={1} inputMode="numeric"
                value={contactosMes}
                onChange={(e) => { setContactosMes(e.target.value); setFieldErrors({}); }}
                className={`${inputCls} font-mono tabular-nums`}
                placeholder="ej. 80"
              />
            </Field>
            <Field label="De cada 10 que preguntan, ¿cuántos compran?" optional help="Tu tasa de cierre. Si de 10 compran 3, escribe 3.">
              <input
                type="number" min={0} max={10} step={0.5} inputMode="decimal"
                value={cierreDeDiez}
                onChange={(e) => { setCierreDeDiez(e.target.value); setFieldErrors({}); }}
                className={`${inputCls} font-mono tabular-nums`}
                placeholder="ej. 3"
              />
            </Field>
          </div>
          <Field label="¿Cuánto tarda un cliente desde que pregunta hasta que paga?" optional>
            <Pildoras nombre="Ciclo de venta" opciones={CICLOS} valor={cicloVenta} onChange={setCicloVenta} />
          </Field>
          <Field label="¿Quién decide la compra?" optional>
            <Pildoras nombre="Quién decide" opciones={DECIDE} valor={quienDecide} onChange={setQuienDecide} />
          </Field>
          <Field label="¿Qué te dicen para no comprar?" optional hint="Con sus palabras: las rebatidas usarán estas objeciones reales.">
            <textarea
              rows={2}
              maxLength={400}
              value={objeciones}
              onChange={(e) => setObjeciones(e.target.value)}
              placeholder='Ej: "Lo voy a pensar", "En el tianguis está más barato"'
              className={`${inputCls} resize-none`}
            />
          </Field>
          {fieldErrors.embudo && <p className="text-xs text-brand-accent">{fieldErrors.embudo}</p>}
        </Block>

        {/* BLOQUE 7 - Vídeo de venta */}
        <Block n={7} title="Material Audiovisual" subtitle="Opcional: registro de pitch o demostración técnica vinculado al producto">
          <Field
            label="Demostración o pitch grabado"
            optional
            hint="Con plan Negocio puedes transcribirlo y evaluarlo en el Evaluador de Guiones."
            help="Sube el vídeo con el que muestras el producto a clientes (demo, unboxing o pitch estructurado). Con plan Negocio, podrás transcribirlo y pedirle al Evaluador de Guiones que lo califique como un guion más."
          >
            <VentasVideoUploader
              productoId={productoId}
              videoUrl={producto.video_url}
              onChange={(url) =>
                setProducto((p) => (p ? { ...p, video_url: url } : p))
              }
              disabled={loading}
            />
          </Field>
        </Block>

        <AvisoErrorApi mensaje={error} upgradeRequired={upgradeRequired} />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ventas text-white py-4 rounded-xl font-bold hover:opacity-90 transition disabled:opacity-40 shadow-[0_0_20px_rgba(249,115,22,0.25)] mt-2 text-sm flex items-center justify-center gap-2"
        >
          {loading ? (
            'Estructurando Arquitectura Comercial...'
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
              </svg>
              <span>Generar Arquitectura Comercial</span>
            </>
          )}
        </button>
        <p className="text-center text-[11px] text-white/30">
          Revenue Operations · Protocolos de Negociación · Matriz de Objeciones · Pipeline de Conversión
        </p>

      </form>
    </div>
  );
}