'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { interpretarErrorApi } from '@/lib/apiError';
import { TIPOS_ARCO } from '@/lib/arco';
import type { TipoArco } from '@/lib/admin';

const FECHA = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' });

/**
 * Canal público para ejercer los derechos ARCO (LFPDPPP). Página sin sesión: no
 * llama a ningún endpoint autenticado. La identidad se confirma después por
 * correo, así que aquí no se piden copias de identificaciones.
 */
export default function ArcoPage() {
  const [form, setForm] = useState({ nombre: '', email: '', descripcion: '' });
  const [tipo, setTipo] = useState<TipoArco | null>(null);
  const [relacion, setRelacion] = useState<'titular' | 'representante'>('titular');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState<{ folio: string; fecha: string } | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipo) {
      setError('Elige qué derecho quieres ejercer.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const { data } = await api.post('/privacidad/arco', { ...form, tipo, relacion });
      setHecho({ folio: data.folio, fecha: FECHA.format(new Date(data.fecha_limite_respuesta)) });
    } catch (err) {
      setError(interpretarErrorApi(err, 'No pudimos registrar tu solicitud. Inténtalo de nuevo.').mensaje);
    } finally {
      setEnviando(false);
    }
  };

  const campo =
    'w-full rounded-xl border border-white/[0.09] bg-[#161618] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-colors hover:border-white/20 focus:border-white/30';

  return (
    <main className="min-h-screen bg-[#03070C] px-4 py-16 text-white sm:px-6">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="flex items-center justify-between border-b border-white/10 pb-6">
          <Link href="/" className="text-sm font-bold text-white/50 transition-colors hover:text-white">
            ← Volver al inicio
          </Link>
          <Link href="/privacidad" className="text-xs font-semibold text-white/40 hover:text-white">
            Aviso de privacidad
          </Link>
        </div>

        <div className="space-y-3">
          <span className="text-xs font-bold uppercase tracking-widest text-[#10B981]">Privacidad</span>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Ejerce tus derechos sobre tus datos</h1>
          <p className="text-sm leading-relaxed text-white/60">
            Puedes pedirnos acceso, rectificación, cancelación u oposición sobre tus datos personales, revocar tu
            consentimiento o limitar su uso. Es gratis. Te daremos un folio y responderemos en un máximo de 20 días; si
            procede, lo haremos efectivo en los 15 días siguientes.
          </p>
          <p className="text-xs leading-relaxed text-white/40">
            Si eres cliente o paciente de un negocio que usa BI 0 A 100, ese negocio es el responsable de tus datos:
            puedes escribirle directamente. Si nos escribes a nosotros, le haremos llegar tu solicitud.
          </p>
        </div>

        {hecho ? (
          <div role="status" className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-6">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
              <p className="font-bold text-emerald-300">Solicitud registrada</p>
            </div>
            <p className="text-sm leading-relaxed text-white/70">
              Tu folio es <strong className="font-mono text-white">{hecho.folio}</strong>. Te enviamos un acuse a tu
              correo. Antes de atenderla confirmaremos tu identidad por ese medio. Te responderemos a más tardar el{' '}
              <strong className="text-white">{hecho.fecha}</strong>.
            </p>
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-6" noValidate>
            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-white/80">¿Qué quieres hacer?</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
                {TIPOS_ARCO.map((t) => {
                  const activo = tipo === t.valor;
                  return (
                    <button
                      key={t.valor}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      onClick={() => setTipo(t.valor)}
                      disabled={enviando}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        activo
                          ? 'border-white/25 bg-[#252528] ring-1 ring-white/10'
                          : 'border-white/[0.07] bg-[#141416] hover:border-white/15'
                      }`}
                    >
                      <span className="block text-sm font-semibold text-white">{t.titulo}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-white/50">{t.detalle}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="arco-nombre" className="mb-2 block text-xs font-semibold text-white/70">
                  Nombre completo
                </label>
                <input
                  id="arco-nombre"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  maxLength={150}
                  autoComplete="name"
                  disabled={enviando}
                  className={campo}
                />
              </div>
              <div>
                <label htmlFor="arco-email" className="mb-2 block text-xs font-semibold text-white/70">
                  Correo (el de tu cuenta, si tienes)
                </label>
                <input
                  id="arco-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  maxLength={254}
                  autoComplete="email"
                  disabled={enviando}
                  className={campo}
                />
              </div>
            </div>

            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-white/70">Presentas la solicitud</legend>
              <div className="flex flex-wrap gap-4 text-sm text-white/80">
                {(['titular', 'representante'] as const).map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="relacion"
                      checked={relacion === r}
                      onChange={() => setRelacion(r)}
                      disabled={enviando}
                      className="accent-emerald-500"
                    />
                    {r === 'titular' ? 'Por mí mismo' : 'En nombre de otra persona'}
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="arco-descripcion" className="mb-2 block text-xs font-semibold text-white/70">
                Describe tu solicitud
              </label>
              <textarea
                id="arco-descripcion"
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                maxLength={4000}
                rows={5}
                disabled={enviando}
                placeholder="Qué datos y qué quieres que hagamos con ellos. Si pides una corrección, escribe el dato correcto."
                className={campo}
              />
              <p className="mt-1.5 text-xs text-white/35">
                No adjuntes identificaciones aquí: te las pediremos por correo para confirmar que eres tú.
              </p>
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#0A0A0C] transition-all hover:bg-white/90 active:scale-[0.98] disabled:opacity-50"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Enviar solicitud
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
