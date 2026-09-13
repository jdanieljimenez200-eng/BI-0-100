'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, FileDown, Loader2, Lock, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import type {
  Area,
  AreaCitas,
  AreaClientes,
  AreaContabilidad,
  AreaCotizaciones,
  AreaInventario,
  AreaPersonal,
  AreaVentas,
  AreasVisibles,
  Panorama,
} from './areas/tipos';
import { AREAS } from './areas/tipos';
import { AREA_INFO, FormatoProvider } from './areas/ui';
import PanoramaView from './areas/PanoramaView';
import AreaVentasView from './areas/AreaVentasView';
import AreaInventarioView from './areas/AreaInventarioView';
import AreaCotizacionesView from './areas/AreaCotizacionesView';
import AreaClientesView from './areas/AreaClientesView';
import AreaCitasView from './areas/AreaCitasView';
import AreaPersonalView from './areas/AreaPersonalView';
import AreaContabilidadView from './areas/AreaContabilidadView';
import InformePdf from './InformePdf';

interface TaxCfg {
  simbolo: string;
  locale: string;
}

interface Props {
  productoId: string;
  productoNombre: string;
  taxCfg: TaxCfg;
}

type RangoPreset = 'hoy' | '7d' | '30d' | 'mes' | 'trimestre' | 'anio' | 'custom';
type Vista = 'panorama' | Area;

const PRESETS: { key: RangoPreset; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'mes', label: 'Este mes' },
  { key: 'trimestre', label: 'Trimestre' },
  { key: 'anio', label: 'Año' },
];

/** Fecha local YYYY-MM-DD. `toISOString` daría el día UTC, que de noche en México ya es mañana. */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function rangoDePreset(preset: RangoPreset): { desde: string; hasta: string } {
  const hoy = new Date();
  const hasta = iso(hoy);
  const haceDias = (n: number) => iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - n));
  switch (preset) {
    case 'hoy':
      return { desde: hasta, hasta };
    case '7d':
      return { desde: haceDias(6), hasta };
    case 'mes':
      return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta };
    case 'trimestre':
      return { desde: iso(new Date(hoy.getFullYear(), Math.floor(hoy.getMonth() / 3) * 3, 1)), hasta };
    case 'anio':
      return { desde: iso(new Date(hoy.getFullYear(), 0, 1)), hasta };
    default:
      return { desde: haceDias(29), hasta };
  }
}

/**
 * Reportes de todo el negocio, por área.
 *
 * Cada área corresponde a una herramienta. Las que la cuenta no tiene contratadas
 * (o que un trabajador no tiene permitidas) se ven en el menú con candado y no se
 * piden al servidor: el backend las rechazaría con 403 igualmente.
 */
export default function ReportesPanel({ productoId, productoNombre, taxCfg }: Props) {
  const [preset, setPreset] = useState<RangoPreset>('30d');
  const [rango, setRango] = useState(() => rangoDePreset('30d'));
  const [ambito, setAmbito] = useState<'producto' | 'todos'>('producto');
  const [vista, setVista] = useState<Vista>('panorama');

  const [areas, setAreas] = useState<AreasVisibles | null>(null);
  const [datos, setDatos] = useState<{ vista: Vista; valor: unknown } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [informe, setInforme] = useState(false);

  const params = useMemo(
    () => ({ producto_id: ambito === 'todos' ? 'todos' : productoId, desde: rango.desde, hasta: rango.hasta }),
    [ambito, productoId, rango.desde, rango.hasta],
  );

  useEffect(() => {
    api
      .get('/reportes/areas')
      .then(({ data }) => setAreas((data as { areas: AreasVisibles }).areas))
      .catch(() => setAreas(null));
  }, []);

  const cargar = useCallback(async () => {
    if (vista !== 'panorama' && areas && !areas[vista]) return;
    setCargando(true);
    setError(null);
    try {
      const ruta = vista === 'panorama' ? '/reportes/panorama' : `/reportes/area/${vista}`;
      const { data } = await api.get(ruta, { params });
      setDatos({ vista, valor: data });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo cargar el reporte');
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [vista, params, areas]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const aplicarPreset = (p: RangoPreset) => {
    setPreset(p);
    setRango(rangoDePreset(p));
  };

  const bloqueada = vista !== 'panorama' && areas !== null && !areas[vista];
  // Solo se pinta lo que corresponde a la vista actual: al cambiar de área no se
  // renderizan por un instante los datos de la anterior con la forma equivocada.
  const valor = datos && datos.vista === vista ? datos.valor : null;
  const ambitoNombre = ambito === 'todos' ? 'Todos mis productos' : productoNombre;

  return (
    <FormatoProvider simbolo={taxCfg.simbolo} locale={taxCfg.locale}>
      <div className="space-y-5">
        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => aplicarPreset(p.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  preset === p.key ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/50 hover:text-white/80'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5">
            <input
              type="date"
              value={rango.desde}
              max={rango.hasta}
              onChange={(e) => {
                if (!e.target.value) return;
                setPreset('custom');
                setRango((r) => ({ ...r, desde: e.target.value }));
              }}
              className="bg-transparent text-xs text-white/70 outline-none"
            />
            <span className="text-white/25">→</span>
            <input
              type="date"
              value={rango.hasta}
              min={rango.desde}
              onChange={(e) => {
                if (!e.target.value) return;
                setPreset('custom');
                setRango((r) => ({ ...r, hasta: e.target.value }));
              }}
              className="bg-transparent text-xs text-white/70 outline-none"
            />
          </div>

          <select
            value={ambito}
            onChange={(e) => setAmbito(e.target.value as 'producto' | 'todos')}
            className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/70 outline-none focus:border-emerald-500/40"
          >
            <option value="producto" className="bg-[#0F1C2A]">
              {productoNombre}
            </option>
            <option value="todos" className="bg-[#0F1C2A]">
              Todos mis productos
            </option>
          </select>

          <div className="ml-auto flex gap-2">
            <button
              onClick={() => void cargar()}
              disabled={cargando}
              className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/60 transition-colors hover:text-white disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${cargando ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button
              onClick={() => setInforme(true)}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              <FileDown className="h-3.5 w-3.5" />
              Descargar PDF
            </button>
          </div>
        </div>

        {/* ── Áreas ───────────────────────────────────────────────────────── */}
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Áreas del reporte">
          {(['panorama', ...AREAS] as Vista[]).map((v) => {
            const info = AREA_INFO[v];
            const Icono = info.icono;
            const disponible = v === 'panorama' || !areas || areas[v];
            const activa = vista === v;
            return (
              <button
                key={v}
                onClick={() => setVista(v)}
                title={disponible ? undefined : `${info.herramienta}: no contratada`}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  activa
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-white'
                    : disponible
                      ? 'border-white/8 bg-white/[0.02] text-white/55 hover:text-white/85'
                      : 'border-dashed border-white/8 text-white/30 hover:text-white/50'
                }`}
              >
                <Icono className={`h-3.5 w-3.5 ${activa ? info.color : ''}`} />
                {info.label}
                {!disponible && <Lock className="h-3 w-3" />}
              </button>
            );
          })}
        </nav>

        {bloqueada ? (
          <NoContratada area={vista as Area} />
        ) : (
          <>
            {error && (
              <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {!valor && cargando && (
              <div className="flex h-64 items-center justify-center gap-2 text-sm text-white/40">
                <Loader2 className="h-4 w-4 animate-spin" />
                Calculando reporte…
              </div>
            )}

            {valor !== null && (
              <div className={cargando ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                {vista === 'panorama' && <PanoramaView d={valor as Panorama} abrir={setVista} />}
                {vista === 'ventas' && <AreaVentasView d={valor as AreaVentas} />}
                {vista === 'inventario' && <AreaInventarioView d={valor as AreaInventario} />}
                {vista === 'cotizaciones' && <AreaCotizacionesView d={valor as AreaCotizaciones} />}
                {vista === 'clientes' && <AreaClientesView d={valor as AreaClientes} />}
                {vista === 'citas' && <AreaCitasView d={valor as AreaCitas} />}
                {vista === 'personal' && <AreaPersonalView d={valor as AreaPersonal} />}
                {vista === 'contabilidad' && <AreaContabilidadView d={valor as AreaContabilidad} />}
              </div>
            )}
          </>
        )}

        {informe && <InformePdf params={params} ambitoNombre={ambitoNombre} onClose={() => setInforme(false)} />}
      </div>
    </FormatoProvider>
  );
}

function NoContratada({ area }: { area: Area }) {
  const info = AREA_INFO[area];
  const Icono = info.icono;
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/40">
        <Icono className="h-6 w-6" />
      </div>
      <p className="mb-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-white/70">
        <Lock className="h-3.5 w-3.5" /> {info.herramienta} no está contratada
      </p>
      <p className="mx-auto mb-4 max-w-sm text-xs text-white/40">
        El reporte de {info.label.toLowerCase()} se arma con los datos de esa herramienta. Actívala y aparecerá aquí, y también en el PDF.
      </p>
      <Link
        href="/dashboard/herramientas"
        className="inline-block rounded-lg border border-emerald-500/40 px-4 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/10"
      >
        Ver herramientas
      </Link>
    </div>
  );
}
