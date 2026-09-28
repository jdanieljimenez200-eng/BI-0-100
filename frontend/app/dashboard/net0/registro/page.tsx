'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles, Check, ArrowLeft, ShieldCheck } from 'lucide-react';
import FormularioFicha, { type FicherosFicha } from '@/components/network/FormularioFicha';
import EditorContenido from '@/components/network/EditorContenido';
import {
  crearFicha,
  subirAvatar,
  subirDocumento,
  misFichas,
  type DatosFicha,
  type FichaPropia,
  type CupoNet0,
  type NegocioDisponibleNet0,
} from '@/lib/network';
import { useHaySesion } from '@/lib/useSesion';
import { ENTRADA_SEGURA, MOTION_SPRINGS } from '@/lib/motion/tokens';

const PASOS = ['Tus datos', 'Fotos y servicios', 'Listo'];

export default function RegistroNet0Page() {
  const haySesion = useHaySesion();
  const shouldReduce = useReducedMotion();
  const [paso, setPaso] = useState(0);
  const [ficha, setFicha] = useState<FichaPropia | null>(null);
  const [fallos, setFallos] = useState<string[]>([]);
  const [bienvenida, setBienvenida] = useState(false);
  const [cupo, setCupo] = useState<CupoNet0 | null>(null);
  const [negociosDisponibles, setNegociosDisponibles] = useState<NegocioDisponibleNet0[]>([]);
  const [cargandoCupo, setCargandoCupo] = useState(true);

  useEffect(() => {
    setBienvenida(new URLSearchParams(window.location.search).get('bienvenida') === '1');
  }, []);

  useEffect(() => {
    if (!haySesion) {
      setCargandoCupo(false);
      return;
    }
    misFichas()
      .then((res) => {
        if ('cupo' in res && res.cupo) {
          setCupo(res.cupo);
          setNegociosDisponibles(res.negocios_disponibles || []);
        }
      })
      .catch(() => {})
      .finally(() => setCargandoCupo(false));
  }, [haySesion]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [paso]);

  const guardar = async (datos: DatosFicha, ficheros: FicherosFicha) => {
    const { experto } = await crearFicha(datos);

    const fallidos: string[] = [];
    if (ficheros.documento) {
      try {
        await subirDocumento(experto.id, ficheros.documento);
      } catch {
        fallidos.push('el documento');
      }
    }
    if (ficheros.avatar) {
      try {
        experto.avatar_url = await subirAvatar(experto.id, ficheros.avatar);
      } catch {
        fallidos.push('la foto');
      }
    }
    setFallos(fallidos);
    setFicha(experto);
    setPaso(1);
  };

  return (
    <motion.div
      {...ENTRADA_SEGURA}
      initial={shouldReduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION_SPRINGS.gentle}
      className="w-full max-w-4xl mx-auto space-y-8 pb-16"
    >
      {/* ── Encabezado y Navegación de Regreso ── */}
      <div className="space-y-4">
        <Link
          href="/dashboard/net0"
          className="inline-flex items-center gap-2 text-xs font-sans font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver al Directorio Net0</span>
        </Link>

        <div>
          <h1 className="text-2xl sm:text-3xl font-sans font-extrabold tracking-tight text-white">
            {bienvenida ? 'Cuenta creada. Ahora arma tu perfil en Net0' : 'Crea tu perfil profesional en Net0'}
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm font-sans mt-2 max-w-2xl leading-relaxed">
            Los negocios y emprendedores de la plataforma te encontrarán en el directorio y en sus recomendaciones operativas para contactarte directo por WhatsApp. Sin comisiones.
          </p>
        </div>

        {/* Indicador de Pasos */}
        <ol className="flex items-center gap-2 pt-2" aria-label="Pasos">
          {PASOS.map((nombre, i) => (
            <li key={nombre} className="flex items-center gap-2 flex-1 min-w-0">
              <span
                className={`w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold font-sans border transition-all ${
                  i < paso
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : i === paso
                      ? 'bg-white text-[#070E17] border-white shadow-sm'
                      : 'border-white/15 text-white/40'
                }`}
                aria-current={i === paso ? 'step' : undefined}
              >
                {i < paso ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <span className={`text-xs font-sans font-semibold truncate ${i === paso ? 'text-white' : 'text-white/40'}`}>
                {nombre}
              </span>
              {i < PASOS.length - 1 && <span className="hidden sm:block flex-1 h-px bg-white/10" />}
            </li>
          ))}
        </ol>
      </div>

      {/* ── Contenido del Formulario ── */}
      <div>
        {!haySesion ? (
          <div className="rounded-2xl border border-white/10 bg-[#090E17]/80 backdrop-blur-xl p-8 sm:p-10 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center mx-auto text-zinc-300">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-white font-sans font-bold text-lg">Necesitas iniciar sesión</h3>
            <p className="text-zinc-400 text-xs sm:text-sm font-sans max-w-md mx-auto leading-relaxed">
              El perfil de Net0 queda vinculado a tu cuenta para que puedas editarlo, ver tus estadísticas de contacto y gestionar tus servicios.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                href="/auth/signup?tipo=experto"
                className="px-5 py-2.5 rounded-xl bg-white text-[#070E17] font-sans font-bold text-xs sm:text-sm hover:bg-slate-100 transition-colors shadow-sm"
              >
                Crear cuenta de especialista
              </Link>
              <Link
                href="/auth/login"
                className="px-5 py-2.5 rounded-xl border border-white/15 text-white/80 font-sans font-semibold text-xs sm:text-sm hover:bg-white/5 transition-colors"
              >
                Ya tengo cuenta
              </Link>
            </div>
          </div>
        ) : cupo && !cupo.puede_crear ? (
          <div className="rounded-2xl border border-white/10 bg-[#090E17]/80 backdrop-blur-xl p-8 sm:p-10 text-center space-y-5 max-w-xl mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-sans font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                Límite de perfiles alcanzado ({cupo.fichas_actuales} de {cupo.limite_permitido})
              </span>
              <h3 className="text-xl sm:text-2xl font-sans font-extrabold text-white">
                Has alcanzado el límite de perfiles en Net0
              </h3>
              <p className="text-zinc-400 text-xs sm:text-sm font-sans leading-relaxed">
                {cupo.negocios_activos === 0
                  ? 'Las cuentas independientes cuentan con 2 perfiles base para ofrecer o contratar servicios. Si operas múltiples empresas, marcas o proyectos, crea y valida tus negocios con IA en BI 0 A 100 para desbloquear 1 perfil profesional por cada negocio activo.'
                  : `Tienes ${cupo.fichas_actuales} perfiles para tus ${cupo.negocios_activos} negocios registrados. Para habilitar un perfil adicional en el directorio Net0, crea y analiza un nuevo negocio con IA en la plataforma.`}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
              <Link
                href="/dashboard/nuevo"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#070E17] font-sans font-bold text-xs sm:text-sm hover:bg-slate-100 transition-all shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-[#070E17]" />
                <span>Validar un nuevo negocio con IA</span>
              </Link>
              <Link
                href="/dashboard/net0/mis-fichas"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/15 text-white/80 font-sans font-semibold text-xs sm:text-sm hover:bg-white/5 transition-all"
              >
                <span>Gestionar mis perfiles actuales</span>
              </Link>
            </div>
          </div>
        ) : paso === 0 ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-sans text-zinc-400 leading-relaxed">
              <span>
                Tu perfil pasa por una revisión para asegurar la calidad de la red Net0. La insignia de verificación comprobada se otorga al validar tus acreditaciones; salir destacado es opcional mediante impulsos territoriales.
              </span>
              {cupo && (
                <span className="shrink-0 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300 font-medium">
                  Perfil {cupo.fichas_actuales + 1} de {cupo.limite_permitido} disponibles
                </span>
              )}
            </div>
            <FormularioFicha
              alGuardar={guardar}
              textoBoton="Guardar y seguir a fotos"
              negociosDisponibles={negociosDisponibles}
            />
          </div>
        ) : paso === 1 && ficha ? (
          <div className="space-y-6">
            {fallos.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs font-sans text-amber-200/80">
                Tu perfil se guardó correctamente, pero hubo un fallo al subir {fallos.join(' ni ')}. Podrás reintentarlo en cualquier momento desde «Mis perfiles».
              </div>
            )}
            <p className="text-zinc-300 text-sm font-sans">
              Un perfil con fotografías de trabajos reales y servicios detallados genera hasta 4 veces más conversiones por WhatsApp. Puedes agregarlos ahora o completarlos después.
            </p>
            <EditorContenido expertoId={ficha.id} portadaUrl={ficha.portada_url} />
            <div className="flex flex-wrap items-center gap-3 pt-4">
              <button
                type="button"
                onClick={() => setPaso(2)}
                className="px-6 py-2.5 rounded-xl bg-white text-[#070E17] font-sans font-bold text-xs sm:text-sm hover:bg-slate-100 transition-all shadow-sm cursor-pointer"
              >
                Terminar y publicar
              </button>
              <button
                type="button"
                onClick={() => setPaso(2)}
                className="text-zinc-400 hover:text-white text-xs font-sans font-semibold transition-colors cursor-pointer"
              >
                Lo haré después
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-8 sm:p-12 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto text-emerald-400">
              <Sparkles className="w-7 h-7" />
            </div>
            <h2 className="text-xl sm:text-2xl font-sans font-extrabold text-white">
              Perfil enviado a revisión en Net0
            </h2>
            <p className="text-zinc-400 text-xs sm:text-sm font-sans max-w-md mx-auto leading-relaxed">
              Te notificaremos en cuanto tu ficha quede activa en el directorio. Desde tu panel puedes seguir editando tus servicios, consultar estadísticas y activar impulsos en tu ciudad.
            </p>
            <div className="pt-4">
              <Link
                href="/dashboard/net0/mis-fichas"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#070E17] font-sans font-bold text-xs sm:text-sm hover:bg-slate-100 transition-all shadow-md"
              >
                <span>Ir a mis perfiles Net0</span>
                <Check className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
