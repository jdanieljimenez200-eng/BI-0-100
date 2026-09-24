'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  CheckCircle2,
  History,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import HerramientaGate from '@/components/herramientas/HerramientaGate';
import { Breadcrumbs, SearchInput } from '@/components/ui';

// ─── Tipos (espejo de /api/mantenimientos) ───────────────────────────────────

type Intensidad = 'bajo' | 'normal' | 'intenso';
type Estado = 'sin_registro' | 'al_dia' | 'proximo' | 'vencido';

interface TipoCatalogo {
  clave: string;
  label: string;
  emoji: string;
  categoria: string;
  intervalo_base_dias: number;
  nota: string;
}

interface Equipo {
  id: string;
  nombre: string;
  tipo_clave: string;
  tipo_label: string | null;
  nota_servicio: string | null;
  emoji: string | null;
  ubicacion: string | null;
  intensidad_uso: Intensidad;
  intervalo_dias: number;
  intervalo_origen: 'catalogo' | 'ia' | 'manual';
  fecha_ultimo: string | null;
  notas: string | null;
  estado: Estado;
  proximo_en: string | null;
  dias_restantes: number | null;
}

interface Resumen {
  total: number;
  vencidos: number;
  proximos: number;
  al_dia: number;
  sin_registro: number;
}

interface Sugerencia {
  clave: string;
  label: string;
  emoji: string;
  intervalo_dias: number;
  origen: 'catalogo' | 'ia' | 'manual';
  nota: string;
}

interface RegistroHistorial {
  id: string;
  fecha: string;
  costo: number | null;
  responsable: string | null;
  notas: string | null;
  movimiento_contable_id: string | null;
}

const INTENSIDADES: { valor: Intensidad; label: string; ayuda: string }[] = [
  { valor: 'bajo', label: 'Poco uso', ayuda: 'De vez en cuando o por temporada' },
  { valor: 'normal', label: 'Uso normal', ayuda: 'La jornada habitual del negocio' },
  { valor: 'intenso', label: 'Uso intenso', ayuda: 'Todo el día o varios turnos' },
];

const ESTILO_ESTADO: Record<Estado, { etiqueta: string; chip: string; punto: string }> = {
  vencido: { etiqueta: 'Vencido', chip: 'border-red-500/30 bg-red-500/10 text-red-200', punto: 'bg-red-400' },
  proximo: { etiqueta: 'Ya toca', chip: 'border-amber-500/30 bg-amber-500/10 text-amber-200', punto: 'bg-amber-400' },
  al_dia: { etiqueta: 'Al día', chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200', punto: 'bg-emerald-400' },
  sin_registro: { etiqueta: 'Sin registro', chip: 'border-white/15 bg-white/5 text-white/60', punto: 'bg-white/40' },
};

const hoyISO = () => new Date().toISOString().slice(0, 10);

function textoProximo(equipo: Equipo): string {
  if (equipo.estado === 'sin_registro') return 'Registra el último servicio para activar el aviso';
  const dias = equipo.dias_restantes ?? 0;
  if (dias < 0) {
    const atraso = Math.abs(dias);
    return `Vencido hace ${atraso} ${atraso === 1 ? 'día' : 'días'} (tocaba el ${equipo.proximo_en})`;
  }
  if (dias === 0) return 'Toca hoy';
  return `En ${dias} ${dias === 1 ? 'día' : 'días'} (${equipo.proximo_en})`;
}

function mensajeDeError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: string } } })?.response?.data;
  return data?.error ?? fallback;
}

// ─── Alta de equipo ──────────────────────────────────────────────────────────

function FormularioAlta({
  catalogo,
  onCreado,
  onCerrar,
}: {
  catalogo: TipoCatalogo[];
  onCreado: () => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<TipoCatalogo | null>(null);
  const [intensidad, setIntensidad] = useState<Intensidad>('normal');
  const [fechaUltimo, setFechaUltimo] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [sugerencia, setSugerencia] = useState<Sugerencia | null>(null);
  const [intervaloManual, setIntervaloManual] = useState('');
  const [estimando, setEstimando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return catalogo.slice(0, 12);
    return catalogo.filter((t) => t.label.toLowerCase().includes(q) || t.clave.includes(q)).slice(0, 12);
  }, [busqueda, catalogo]);

  // El intervalo se pide al backend, que es quien manda: el catálogo responde
  // gratis y, si no reconoce el objeto, la estimación con IA cuesta 1 crédito.
  const pedirSugerencia = useCallback(
    async (texto: string, intensidadUso: Intensidad, permitirIa: boolean) => {
      const limpio = texto.trim();
      if (limpio.length < 2) { setSugerencia(null); return; }
      if (!permitirIa) {
        // Consulta del catálogo mientras se escribe: nunca llama a la IA ni cobra.
        try {
          const { data } = await api.post('/mantenimientos/sugerencia', {
            texto: limpio,
            intensidad_uso: intensidadUso,
            permitir_ia: false,
          });
          setSugerencia(data.sugerencia ?? null);
        } catch {
          setSugerencia(null);
        }
        return;
      }
      setEstimando(true);
      setError(null);
      try {
        const { data } = await api.post('/mantenimientos/sugerencia', {
          texto: limpio,
          intensidad_uso: intensidadUso,
          permitir_ia: true,
        });
        setSugerencia(data.sugerencia);
      } catch (err) {
        setError(mensajeDeError(err, 'No pudimos estimar el intervalo. Escríbelo a mano.'));
      } finally {
        setEstimando(false);
      }
    },
    []
  );

  // Al elegir tipo o cambiar intensidad se consulta el catálogo (sin IA).
  useEffect(() => {
    const texto = tipo?.label ?? nombre;
    const t = setTimeout(() => void pedirSugerencia(texto, intensidad, false), 350);
    return () => clearTimeout(t);
  }, [tipo, nombre, intensidad, pedirSugerencia]);

  const intervaloFinal = intervaloManual ? Number(intervaloManual) : sugerencia?.intervalo_dias ?? null;
  const puedeGuardar = nombre.trim().length > 0 && !!intervaloFinal && !guardando;

  const guardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await api.post('/mantenimientos', {
        nombre: nombre.trim(),
        tipo_clave: tipo?.clave ?? sugerencia?.clave,
        intensidad_uso: intensidad,
        intervalo_dias: intervaloFinal,
        fecha_ultimo: fechaUltimo || null,
        ubicacion: ubicacion.trim() || null,
      });
      onCreado();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el equipo.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-orange-500/20 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">¿A qué le das mantenimiento?</h2>
        <button onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1.5 text-white/50 hover:bg-white/5 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/50">Nombre</label>
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Refrigerador de la cocina"
        className="mb-4 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder-white/30 focus:border-orange-400/50 focus:outline-none"
      />

      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/50">Tipo de equipo</label>
      <div className="mb-2">
        <SearchInput
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Busca: refrigerador, tanque de gas, tijeras…"
        />
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {filtrados.map((t) => (
          <button
            key={t.clave}
            onClick={() => {
              setTipo(t);
              setIntervaloManual('');
              if (!nombre.trim()) setNombre(t.label);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              tipo?.clave === t.clave
                ? 'border-orange-400/50 bg-orange-500/15 text-orange-200'
                : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20'
            }`}
          >
            <span className="mr-1">{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/50">¿Cuánto lo usas?</label>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {INTENSIDADES.map((i) => (
          <button
            key={i.valor}
            onClick={() => { setIntensidad(i.valor); setIntervaloManual(''); }}
            className={`rounded-xl border p-3 text-left transition-colors ${
              intensidad === i.valor
                ? 'border-orange-400/50 bg-orange-500/10'
                : 'border-white/10 bg-white/[0.02] hover:border-white/20'
            }`}
          >
            <span className="block text-sm font-semibold text-white">{i.label}</span>
            <span className="block text-[11px] text-white/45">{i.ayuda}</span>
          </button>
        ))}
      </div>

      {/* Respuesta de la app: cada cuánto */}
      <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-4">
        {sugerencia ? (
          <>
            <p className="text-sm text-white">
              <span className="font-semibold text-orange-200">Cada ~{sugerencia.intervalo_dias} días</span>
              {sugerencia.origen === 'ia' && (
                <span className="ml-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200">
                  estimado con IA
                </span>
              )}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/55">{sugerencia.nota}</p>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-white/60">
              {nombre.trim().length > 1
                ? 'No lo tenemos en el catálogo.'
                : 'Escribe el nombre o elige un tipo para ver cada cuánto.'}
            </p>
            {nombre.trim().length > 1 && (
              <button
                onClick={() => void pedirSugerencia(nombre, intensidad, true)}
                disabled={estimando}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
              >
                {estimando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Estimar con IA (1 crédito)
              </button>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px] text-white/40">o escríbelo tú:</span>
          <input
            type="number"
            min={1}
            max={3650}
            value={intervaloManual}
            onChange={(e) => setIntervaloManual(e.target.value)}
            placeholder="días"
            className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-white placeholder-white/30 focus:border-orange-400/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/50">
            Último mantenimiento (opcional)
          </label>
          <input
            type="date"
            max={hoyISO()}
            value={fechaUltimo}
            onChange={(e) => setFechaUltimo(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white focus:border-orange-400/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/50">Ubicación (opcional)</label>
          <input
            value={ubicacion}
            onChange={(e) => setUbicacion(e.target.value)}
            placeholder="Cocina, sucursal centro…"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-orange-400/50 focus:outline-none"
          />
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

      <button
        onClick={() => void guardar()}
        disabled={!puedeGuardar}
        className="inline-flex items-center gap-2 rounded-xl border border-orange-400/40 bg-orange-500/15 px-4 py-2.5 text-sm font-semibold text-orange-100 transition-colors hover:bg-orange-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Guardar equipo
      </button>
    </div>
  );
}

// ─── Registrar un mantenimiento hecho ────────────────────────────────────────

function FormularioRegistro({ equipo, onListo, onCerrar }: { equipo: Equipo; onListo: () => void; onCerrar: () => void }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [costo, setCosto] = useState('');
  const [responsable, setResponsable] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await api.post(`/mantenimientos/${equipo.id}/registrar`, {
        fecha,
        costo: costo ? Number(costo) : null,
        responsable: responsable.trim() || null,
        notas: notas.trim() || null,
      });
      onListo();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo registrar el mantenimiento.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
      <p className="mb-3 text-sm font-semibold text-white">Registrar mantenimiento de {equipo.nombre}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-white/45">Fecha</label>
          <input
            type="date"
            max={hoyISO()}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-emerald-400/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-white/45">Costo (opcional)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={costo}
            onChange={(e) => setCosto(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-emerald-400/50 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-white/40">Si lo capturas, se registra como egreso en Reportes.</p>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-white/45">Quién lo hizo (opcional)</label>
          <input
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            placeholder="Técnico o proveedor"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-emerald-400/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-white/45">Notas (opcional)</label>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Qué se hizo"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-emerald-400/50 focus:outline-none"
          />
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => void guardar()}
          disabled={guardando}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Guardar
        </button>
        <button onClick={onCerrar} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/60 hover:bg-white/5">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Pantalla ────────────────────────────────────────────────────────────────

function MantenimientosContenido() {
  const [catalogo, setCatalogo] = useState<TipoCatalogo[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [historialDe, setHistorialDe] = useState<string | null>(null);
  const [historial, setHistorial] = useState<{ registros: RegistroHistorial[]; total: number } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get('/mantenimientos');
      setEquipos(data.equipos);
      setResumen(data.resumen);
    } catch (err) {
      setError(mensajeDeError(err, 'No pudimos cargar tus equipos.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    api.get('/mantenimientos/catalogo').then(({ data }) => setCatalogo(data.tipos)).catch(() => setCatalogo([]));
  }, [cargar]);

  const verHistorial = async (equipoId: string) => {
    if (historialDe === equipoId) { setHistorialDe(null); return; }
    setHistorialDe(equipoId);
    setHistorial(null);
    try {
      const { data } = await api.get(`/mantenimientos/${equipoId}/historial`);
      setHistorial({ registros: data.historial, total: data.gasto_total });
    } catch {
      setHistorial({ registros: [], total: 0 });
    }
  };

  const eliminar = async (equipo: Equipo) => {
    if (!confirm(`¿Quitar "${equipo.nombre}" de la lista? Se borra también su historial.`)) return;
    try {
      await api.delete(`/mantenimientos/${equipo.id}`);
      void cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo eliminar el equipo.'));
    }
  };

  // Primero lo que urge: vencidos, luego los que ya tocan.
  const ordenados = useMemo(() => {
    const peso: Record<Estado, number> = { vencido: 0, proximo: 1, sin_registro: 2, al_dia: 3 };
    return [...equipos].sort(
      (a, b) => peso[a.estado] - peso[b.estado] || (a.dias_restantes ?? 9999) - (b.dias_restantes ?? 9999)
    );
  }, [equipos]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B1408] via-[#0A0F17] to-[#070B12]">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0A0F17]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3.5">
          <Breadcrumbs
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Herramientas', href: '/dashboard/herramientas' },
              { label: 'Mantenimientos' },
            ]}
          />
          <button
            onClick={() => setMostrarAlta((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-orange-400/30 bg-orange-500/10 px-3.5 py-1.5 text-xs font-semibold text-orange-200 transition-colors hover:bg-orange-500/20 active:scale-[0.98]"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar equipo
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-7">
        <p className="mb-5 text-sm text-white/55">
          Registra lo que necesita servicio y te decimos cada cuánto conviene dárselo, según el equipo y cuánto lo usas.
        </p>

        {resumen && resumen.total > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ['Vencidos', resumen.vencidos, 'text-red-400'],
              ['Ya tocan', resumen.proximos, 'text-amber-400'],
              ['Al día', resumen.al_dia, 'text-emerald-400'],
              ['Sin registro', resumen.sin_registro, 'text-white/60'],
            ] as const).map(([etiqueta, valor, color]) => (
              <div key={etiqueta} className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl transition-all hover:border-white/20">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                <p className={`text-2xl font-bold font-mono tabular-nums tracking-tight ${color}`}>{valor}</p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-white/45">{etiqueta}</p>
              </div>
            ))}
          </div>
        )}

        {mostrarAlta && (
          <div className="mb-6">
            <FormularioAlta
              catalogo={catalogo}
              onCerrar={() => setMostrarAlta(false)}
              onCreado={() => { setMostrarAlta(false); void cargar(); }}
            />
          </div>
        )}

        {error && <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

        {cargando ? (
          <div className="flex items-center gap-2 py-12 text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando equipos…
          </div>
        ) : ordenados.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
            <Wrench className="mx-auto mb-3 h-8 w-8 text-white/25" />
            <p className="text-white">Aún no registras nada</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
              Empieza por lo que más te dolería que fallara: el tanque de gas, el refrigerador, la parrilla.
            </p>
            <button
              onClick={() => setMostrarAlta(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-orange-400/40 bg-orange-500/15 px-4 py-2 text-sm font-semibold text-orange-100 hover:bg-orange-500/25"
            >
              <Plus className="h-4 w-4" />
              Agregar el primero
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {ordenados.map((equipo) => {
              const estilo = ESTILO_ESTADO[equipo.estado];
              return (
                <article key={equipo.id} className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4.5 backdrop-blur-xl transition-all hover:border-white/20">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <div className="flex flex-wrap items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
                      {equipo.emoji ? (
                        <span className="text-xl" aria-hidden>{equipo.emoji}</span>
                      ) : (
                        <Wrench className="h-5 w-5 text-orange-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white tracking-tight">{equipo.nombre}</h3>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${estilo.chip}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${estilo.punto}`} />
                          {estilo.etiqueta}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-white/60">
                        <CalendarClock className="h-3.5 w-3.5 text-white/35" />
                        {textoProximo(equipo)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/40">
                        Cada <span className="font-mono tabular-nums">{equipo.intervalo_dias}</span> días · {INTENSIDADES.find((i) => i.valor === equipo.intensidad_uso)?.label}
                        {equipo.ubicacion ? ` · ${equipo.ubicacion}` : ''}
                        {equipo.intervalo_origen === 'ia' ? ' · intervalo estimado con IA' : ''}
                        {equipo.intervalo_origen === 'manual' ? ' · intervalo tuyo' : ''}
                      </p>
                      {equipo.nota_servicio && <p className="mt-1 text-[11px] text-white/35">{equipo.nota_servicio}</p>}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setRegistrando(registrando === equipo.id ? null : equipo.id)}
                        className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 active:scale-[0.98]"
                      >
                        Ya le di mantenimiento
                      </button>
                      <button
                        onClick={() => void verHistorial(equipo.id)}
                        aria-label={`Historial de ${equipo.nombre}`}
                        className="rounded-xl border border-white/10 p-1.5 text-white/50 transition-colors hover:bg-white/5 hover:text-white active:scale-[0.98]"
                      >
                        <History className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void eliminar(equipo)}
                        aria-label={`Eliminar ${equipo.nombre}`}
                        className="rounded-xl border border-white/10 p-1.5 text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-300 active:scale-[0.98]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {registrando === equipo.id && (
                    <FormularioRegistro
                      equipo={equipo}
                      onCerrar={() => setRegistrando(null)}
                      onListo={() => { setRegistrando(null); void cargar(); if (historialDe === equipo.id) void verHistorial(equipo.id); }}
                    />
                  )}

                  {historialDe === equipo.id && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
                      {!historial ? (
                        <p className="text-sm text-white/45">Cargando historial…</p>
                      ) : historial.registros.length === 0 ? (
                        <p className="text-sm text-white/45">Todavía no hay mantenimientos registrados.</p>
                      ) : (
                        <>
                          <p className="mb-2 text-xs uppercase tracking-wide text-white/45">
                            Historial · gasto total <span className="font-mono tabular-nums font-semibold text-white/80">${historial.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                          </p>
                          <ul className="space-y-2">
                            {historial.registros.map((r) => (
                              <li key={r.id} className="flex flex-wrap items-baseline gap-2 text-sm text-white/70">
                                <span className="font-mono tabular-nums text-xs text-white/50">{r.fecha}</span>
                                <span>{r.notas ?? 'Mantenimiento'}</span>
                                {r.responsable && <span className="text-white/45">· {r.responsable}</span>}
                                {r.costo !== null && (
                                  <span className="ml-auto font-mono tabular-nums font-semibold text-white/85">
                                    ${Number(r.costo).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Sin ProductoGate a propósito: los equipos son del negocio, no de un producto
 * concreto. Obligar a elegir producto para registrar el refrigerador sería una
 * pregunta que el usuario no puede responder.
 */
export default function MantenimientosPage() {
  return (
    <HerramientaGate herramienta="mantenimientos" nombre="Mantenimientos" acento="amber">
      <MantenimientosContenido />
    </HerramientaGate>
  );
}
