'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { Sparkles, Check } from 'lucide-react';
import FormularioFicha, { type FicherosFicha } from '@/components/network/FormularioFicha';
import EditorContenido from '@/components/network/EditorContenido';
import { crearFicha, subirAvatar, subirDocumento, type DatosFicha, type FichaPropia } from '@/lib/network';
import { useHaySesion } from '@/lib/useSesion';

/**
 * Alta de un experto en tres pasos: datos, fotos y servicios, y listo.
 *
 * El perfil se crea al terminar el primer paso (la galería necesita su id) y
 * entra como pendiente: no lo ve nadie hasta que se aprueba. Eso se dice arriba,
 * antes de pedir que se rellene nada.
 */

const PASOS = ['Tus datos', 'Fotos y servicios', 'Listo'];

export default function RegistroExpertoPage() {
  const haySesion = useHaySesion();
  const [paso, setPaso] = useState(0);
  const [ficha, setFicha] = useState<FichaPropia | null>(null);
  const [fallos, setFallos] = useState<string[]>([]);
  const [bienvenida, setBienvenida] = useState(false);

  useEffect(() => {
    setBienvenida(new URLSearchParams(window.location.search).get('bienvenida') === '1');
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [paso]);

  /**
   * Crea el perfil y DESPUÉS sube los ficheros, porque la subida necesita el id.
   *
   * Si el perfil se crea pero un fichero falla, no se lanza el error: el
   * formulario diría "no pudimos guardar", el usuario lo volvería a enviar y se
   * toparía con un 409 por duplicado. Se avanza y se dice qué falta.
   */
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
    <main className="min-h-screen bg-[#070E17] text-white">
      <Navbar />

      <section className="pt-32 pb-8 px-6">
        <div className="max-w-[820px] mx-auto">
          <Link href="/network" className="text-white/40 hover:text-white text-xs font-semibold transition-colors">
            ← Directorio
          </Link>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-5 mb-3">
            {bienvenida ? 'Cuenta creada. Ahora arma tu perfil' : 'Crea tu perfil de experto'}
          </h1>
          <p className="text-white/50 text-sm max-w-xl leading-relaxed">
            Los negocios que validan su idea en 0 a 100 te encuentran en el directorio y en sus resultados de análisis, y te
            escriben directo por WhatsApp. La plataforma no cobra comisión por tus trabajos.
          </p>

          <ol className="flex items-center gap-2 mt-8" aria-label="Pasos">
            {PASOS.map((nombre, i) => (
              <li key={nombre} className="flex items-center gap-2 flex-1 min-w-0">
                <span
                  className={`w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold border ${
                    i < paso
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : i === paso
                        ? 'bg-white text-[#070E17] border-white'
                        : 'border-white/15 text-white/40'
                  }`}
                  aria-current={i === paso ? 'step' : undefined}
                >
                  {i < paso ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <span className={`text-xs font-semibold truncate ${i === paso ? 'text-white' : 'text-white/40'}`}>{nombre}</span>
                {i < PASOS.length - 1 && <span className="hidden sm:block flex-1 h-px bg-white/10" />}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-[820px] mx-auto">
          {!haySesion ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
              <p className="text-white font-bold mb-2">Necesitas una cuenta</p>
              <p className="text-white/40 text-sm max-w-md mx-auto">
                El perfil queda ligado a tu cuenta para que puedas editarlo, ver sus estadísticas y darte de baja cuando
                quieras.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                <Link
                  href="/auth/signup?tipo=experto"
                  className="px-5 py-2.5 rounded-xl bg-white text-[#070E17] font-bold text-sm hover:bg-white/90 transition-colors"
                >
                  Crear cuenta
                </Link>
                <Link
                  href="/auth/login"
                  className="px-5 py-2.5 rounded-xl border border-white/15 text-white/70 font-semibold text-sm hover:bg-white/5 transition-colors"
                >
                  Ya tengo cuenta
                </Link>
              </div>
            </div>
          ) : paso === 0 ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-6">
                <p className="text-white/50 text-xs leading-relaxed">
                  Tu perfil pasa por una revisión manual antes de aparecer. La insignia de acreditación comprobada la
                  concede quien revisa tu documento; no se obtiene pagando. Salir arriba sí se puede pagar con un impulso,
                  y en ese caso tu perfil lleva la etiqueta «Promocionado».
                </p>
              </div>
              <FormularioFicha alGuardar={guardar} textoBoton="Guardar y seguir" />
            </>
          ) : paso === 1 && ficha ? (
            <div className="space-y-6">
              {fallos.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="text-amber-200/80 text-xs">
                    Tu perfil se guardó, pero no se pudo subir {fallos.join(' ni ')}. Puedes volver a intentarlo desde tu
                    panel, en «Datos del perfil».
                  </p>
                </div>
              )}
              <p className="text-white/55 text-sm">
                Un perfil con fotos de trabajos reales y servicios con precio recibe muchos más contactos. Puedes agregarlos
                ahora o después desde tu panel.
              </p>
              <EditorContenido expertoId={ficha.id} portadaUrl={ficha.portada_url} />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setPaso(2)}
                  className="px-6 py-3 rounded-xl bg-white text-[#070E17] font-bold text-sm hover:bg-white/90 transition-colors"
                >
                  Terminar
                </button>
                <button onClick={() => setPaso(2)} className="text-white/40 hover:text-white/70 text-xs font-semibold">
                  Lo hago después
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3 text-emerald-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="text-white font-extrabold text-xl">Perfil enviado a revisión</p>
              <p className="text-white/50 text-sm max-w-md mx-auto mt-2 leading-relaxed">
                Te avisamos por correo cuando esté publicado. Desde tu panel puedes seguir editándolo, ver cuántas personas
                lo visitan y, cuando esté aprobado, impulsarlo para salir arriba en tu ciudad.
              </p>
              <Link
                href="/network/mis-fichas"
                className="inline-block mt-6 px-6 py-3 rounded-xl bg-white text-[#070E17] font-bold text-sm hover:bg-white/90"
              >
                Ir a mi panel
              </Link>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
