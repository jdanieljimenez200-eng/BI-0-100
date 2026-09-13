'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import FormularioFicha, { type FicherosFicha } from '@/components/network/FormularioFicha';
import { crearFicha, subirAvatar, subirDocumento, type DatosFicha } from '@/lib/network';
import { useHaySesion } from '@/lib/useSesion';

/**
 * Alta de un experto en la red.
 *
 * La ficha entra como pendiente y no la ve nadie hasta que un admin la aprueba.
 * Eso se dice aquí arriba, antes de pedirle a alguien que rellene veinte campos.
 */
export default function RegistroExpertoPage() {
  const router = useRouter();
  const haySesion = useHaySesion();

  /**
   * Crea la ficha y DESPUÉS sube los ficheros, porque la subida necesita el id.
   *
   * Si la ficha se crea pero un fichero falla, no se lanza el error: el
   * formulario diría "no pudimos guardar la ficha", el usuario la volvería a
   * enviar y se toparía con un 409 por duplicada. La ficha existe; lo que falta
   * se reintenta desde su panel, y allí se le dice exactamente qué.
   */
  const guardar = async (datos: DatosFicha, ficheros: FicherosFicha) => {
    const { experto } = await crearFicha(datos);

    const fallos: string[] = [];
    if (ficheros.documento) {
      try {
        await subirDocumento(experto.id, ficheros.documento);
      } catch {
        fallos.push('documento');
      }
    }
    if (ficheros.avatar) {
      try {
        await subirAvatar(experto.id, ficheros.avatar);
      } catch {
        fallos.push('foto');
      }
    }

    const qs = new URLSearchParams({ alta: 'ok' });
    if (fallos.length) qs.set('fallo', fallos.join(','));
    router.push(`/network/mis-fichas?${qs.toString()}`);
  };

  return (
    <main className="min-h-screen bg-[#070E17] text-white">
      <Navbar />

      <section className="pt-32 pb-10 px-6">
        <div className="max-w-[760px] mx-auto">
          <Link
            href="/network"
            className="text-white/40 hover:text-white text-xs font-semibold transition-colors"
          >
            ← Directorio
          </Link>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-5 mb-4">
            Preséntate como experto
          </h1>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-2">
            <p className="text-white/60 text-sm leading-relaxed">
              Tu ficha pasa por una revisión manual antes de aparecer en el directorio. Mientras esté
              en revisión no la ve nadie más que tú.
            </p>
            <p className="text-white/40 text-xs leading-relaxed">
              La insignia de acreditación comprobada la concede quien revisa, después de mirar tu
              documento. No se obtiene rellenando campos ni pagando. Aparecer en los primeros puestos
              sí se puede pagar, y en ese caso la ficha sale etiquetada como patrocinada.
            </p>
          </div>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-[760px] mx-auto">
          {haySesion ? (
            <FormularioFicha alGuardar={guardar} textoBoton="Enviar a revisión" />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
              <p className="text-white font-bold mb-2">Necesitas una cuenta</p>
              <p className="text-white/40 text-sm max-w-md mx-auto">
                La ficha queda ligada a tu cuenta para que puedas editarla, ver su estado y darte de
                baja cuando quieras.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                <Link
                  href="/auth/signup"
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
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
