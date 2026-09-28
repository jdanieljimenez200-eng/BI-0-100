'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Phone,
  Clock,
  MessageSquare,
  MapPin,
  CheckCircle2,
  LogOut,
  UserX,
  Trash2,
  Plus,
  X,
} from 'lucide-react';
import api, { nuevaClaveIdempotencia } from '@/lib/api';
import MotionModal from '@/components/motion/MotionModal';
import { ProductoActivo } from '@/lib/productoActivo';
import { Lugar, Turno, desdeHace, horaCorta } from './tiposFila';
import LugaresPanel from './LugaresPanel';

const ERROR = (err: unknown, porDefecto: string) =>
  (err as { response?: { data?: { error?: string } } }).response?.data?.error || porDefecto;

/**
 * Fila de hoy: quien llega sin cita.
 *
 * Se anota el nombre, cuántos son y, cuando le toca, en qué lugar se le
 * atiende. El aviso puede ir por WhatsApp o quedarse en pantalla para llamarlo
 * de viva voz.
 */
export default function FilaHoy({
  producto,
  onAviso,
}: {
  producto: ProductoActivo;
  onAviso: (msg: string) => void;
}) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [sentando, setSentando] = useState<Turno | null>(null);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [personas, setPersonas] = useState('1');
  const [notas, setNotas] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [fila, sitios] = await Promise.all([
        api.get('/calendario/espera', { params: { producto_id: producto.id } }),
        api.get('/calendario/lugares', { params: { producto_id: producto.id } }),
      ]);
      setTurnos(fila.data.turnos);
      setLugares(sitios.data);
    } catch {
      onAviso('No se pudo cargar la fila');
    } finally {
      setCargando(false);
    }
  }, [producto.id, onAviso]);

  useEffect(() => { cargar(); }, [cargar]);

  // Varias personas pueden estar anotando desde la caja y desde la entrada: se
  // refresca solo, y solo mientras la pestaña está a la vista.
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) cargar(); }, 30_000);
    const alVolver = () => { if (!document.hidden) cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
  }, [cargar]);

  const reemplazar = (t: Turno) => setTurnos((prev) => prev.map((x) => (x.id === t.id ? t : x)));

  async function anotar() {
    const limpio = nombre.trim();
    if (!limpio || guardando) return;
    setGuardando(true);
    try {
      const r = await api.post(
        '/calendario/espera',
        {
          cliente_nombre: limpio,
          cliente_telefono: telefono.trim() || null,
          personas: Number(personas) || 1,
          notas: notas.trim() || null,
          producto_id: producto.id,
          negocio_id: producto.negocio_id,
        },
        // Con gente esperando, el doble toque en la tablet es cuestión de tiempo.
        { headers: { 'Idempotency-Key': nuevaClaveIdempotencia() } },
      );
      setTurnos((prev) => [...prev, r.data]);
      setNombre(''); setTelefono(''); setPersonas('1'); setNotas('');
      onAviso(`${r.data.cliente_nombre} está en la fila`);
    } catch (err) {
      onAviso(ERROR(err, 'No se pudo anotar'));
    } finally {
      setGuardando(false);
    }
  }

  async function llamar(turno: Turno) {
    try {
      const r = await api.post(`/calendario/espera/${turno.id}/llamar`, {});
      reemplazar(r.data.turno);
      if (r.data.whatsapp_url) window.open(r.data.whatsapp_url, '_blank', 'noopener');
      else onAviso(`${turno.cliente_nombre} no tiene teléfono: llámalo de viva voz`);
    } catch (err) {
      onAviso(ERROR(err, 'No se pudo llamar'));
    }
  }

  async function cambiarEstado(turno: Turno, estado: Turno['estado'], lugarId?: string) {
    try {
      const r = await api.post(`/calendario/espera/${turno.id}/estado`, {
        estado,
        ...(lugarId ? { lugar_id: lugarId } : {}),
      });
      reemplazar(r.data);
      setSentando(null);
      // La ocupación de los lugares la calcula el backend: hay que releerla.
      cargar();
    } catch (err) {
      onAviso(ERROR(err, 'No se pudo actualizar el turno'));
    }
  }

  async function borrar(turno: Turno) {
    if (!confirm(`¿Quitar a ${turno.cliente_nombre} de la fila?`)) return;
    try {
      await api.delete(`/calendario/espera/${turno.id}`);
      setTurnos((prev) => prev.filter((t) => t.id !== turno.id));
      cargar();
    } catch {
      onAviso('No se pudo quitar de la fila');
    }
  }

  const esperando = turnos.filter((t) => t.estado === 'esperando' || t.estado === 'llamado');
  const atendiendo = turnos.filter((t) => t.estado === 'atendido');
  const cerrados = turnos.filter((t) => t.estado === 'liberado' || t.estado === 'no_llego');
  const nombreLugar = (id: string | null) => lugares.find((l) => l.id === id)?.nombre ?? '';
  const libres = lugares.filter((l) => !l.ocupado_por);

  return (
    <div className="space-y-5">
      <LugaresPanel lugares={lugares} productoId={producto.id} onCambio={cargar} onAviso={onAviso} />

      {/* Alta rápida */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Anotar en la fila</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_90px_auto] gap-2">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') anotar(); }}
            placeholder="Nombre"
            maxLength={200}
            className="bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
          />
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Teléfono (opcional)"
            maxLength={30}
            inputMode="tel"
            className="bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
          />
          <input
            value={personas}
            onChange={(e) => setPersonas(e.target.value.replace(/\D/g, '').slice(0, 3))}
            placeholder="Personas"
            inputMode="numeric"
            title="Cuántas personas son"
            className="bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
          />
          <button
            type="button"
            onClick={anotar}
            disabled={!nombre.trim() || guardando}
            className="flex items-center justify-center gap-2 px-4 h-10 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Anotar</span>
          </button>
        </div>
        <input
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Nota (opcional): «junto a la ventana», «lleva prisa»…"
          maxLength={2000}
          className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-3 h-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
        />
      </div>

      {/* En espera */}
      <section>
        <h3 className="text-sm font-semibold text-white mb-2">
          En espera <span className="text-white/40 font-normal">({esperando.length})</span>
        </h3>
        {cargando ? (
          <p className="text-sm text-white/40">Cargando…</p>
        ) : esperando.length === 0 ? (
          <p className="text-sm text-white/40 bg-white/5 border border-white/10 rounded-2xl px-4 py-6 text-center">
            Nadie esperando. Cuando llegue gente sin reserva, anótala aquí.
          </p>
        ) : (
          <div className="space-y-2">
            {esperando.map((t, i) => (
              <div
                key={t.id}
                className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${
                  t.estado === 'llamado' ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/10 bg-white/5'
                }`}
              >
                <span className="w-7 h-7 rounded-full bg-white/10 text-xs font-bold flex items-center justify-center text-white/70">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    {t.cliente_nombre}
                    {t.personas > 1 && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-white/50">
                        <Users className="w-3 h-3" />
                        {t.personas}
                      </span>
                    )}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-white/45">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {t.estado === 'llamado'
                        ? `Llamado a las ${horaCorta(t.hora_llamado)}`
                        : `Esperando ${desdeHace(t.hora_llegada)}`}
                    </span>
                    {t.cliente_telefono && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {t.cliente_telefono}
                      </span>
                    )}
                    {t.notas && <span className="truncate italic">{t.notas}</span>}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => llamar(t)}
                    title={t.cliente_telefono ? 'Avisar por WhatsApp' : 'Marcar como llamado'}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-xs text-cyan-200 hover:bg-cyan-500/20 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{t.estado === 'llamado' ? 'Volver a llamar' : 'Llamar'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSentando(t)}
                    title="Asignarle un lugar"
                    className="flex items-center gap-1.5 px-3 h-8 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Pasar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => cambiarEstado(t, 'no_llego')}
                    title="No llegó"
                    className="p-2 rounded-xl text-white/40 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => borrar(t)}
                    title="Quitar de la fila"
                    className="p-2 rounded-xl text-white/40 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Atendiendo ahora */}
      {atendiendo.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-white mb-2">
            Atendiendo <span className="text-white/40 font-normal">({atendiendo.length})</span>
          </h3>
          <div className="space-y-2">
            {atendiendo.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    {t.cliente_nombre}
                    <span className="ml-2 text-[11px] text-emerald-200/80">{nombreLugar(t.lugar_id)}</span>
                  </p>
                  <p className="text-[11px] text-white/45">Desde hace {desdeHace(t.hora_atendido)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => cambiarEstado(t, 'liberado')}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-xl border border-white/15 text-xs text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Liberar</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cerrados hoy */}
      {cerrados.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-white/60 mb-2">
            Cerrados hoy <span className="text-white/35 font-normal">({cerrados.length})</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {cerrados.map((t) => (
              <span
                key={t.id}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] ${
                  t.estado === 'no_llego'
                    ? 'border-amber-500/25 bg-amber-500/10 text-amber-200/80'
                    : 'border-white/10 bg-white/5 text-white/45'
                }`}
              >
                {t.cliente_nombre}
                <span className="text-white/30">
                  {t.estado === 'no_llego' ? 'no llegó' : `salió ${horaCorta(t.hora_liberado)}`}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Elegir lugar para sentar */}
      <MotionModal isOpen={Boolean(sentando)} onClose={() => setSentando(null)} maxWidth="max-w-md">
        <div className="bg-[#0b1522] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold text-white">¿Dónde lo atiendes?</h3>
            <button type="button" aria-label="Cerrar" onClick={() => setSentando(null)} className="text-white/40 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-white/45 mb-4">
            {sentando?.cliente_nombre}
            {sentando && sentando.personas > 1 ? ` · ${sentando.personas} personas` : ''}
          </p>

          {lugares.length === 0 ? (
            <p className="text-sm text-white/45">
              Todavía no tienes lugares. Créalos arriba, en «Configurar».
            </p>
          ) : libres.length === 0 ? (
            <p className="text-sm text-amber-200/80">Todos los lugares están ocupados ahora mismo.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {libres.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => sentando && cambiarEstado(sentando, 'atendido', l.id)}
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-3 text-left hover:bg-emerald-500/15 transition-colors"
                >
                  <p className="text-sm font-medium text-white truncate">{l.nombre}</p>
                  {l.capacidad && <p className="text-[11px] text-white/45">{l.capacidad} personas</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      </MotionModal>
    </div>
  );
}
