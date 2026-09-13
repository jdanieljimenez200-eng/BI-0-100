'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EVENTO_ADMIN_MFA } from '@/lib/api';
import {
  estadoSesionAdmin,
  iniciarEnrolamiento,
  confirmarEnrolamiento,
  verificarCodigoAdmin,
  cerrarSesionAdmin,
  expiracionSesionAdmin,
} from '@/lib/admin';

type Fase = 'comprobando' | 'enrolar' | 'escanear' | 'codigos' | 'verificar' | 'dentro';

function errorDe(e: unknown, porDefecto: string) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? porDefecto;
}

const campo =
  'w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30';

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-white/40 text-[11px] font-bold uppercase tracking-widest mb-2">Panel de administración</p>
        <h1 className="text-xl font-extrabold text-white mb-4">{titulo}</h1>
        {children}
      </div>
    </div>
  );
}

/**
 * Puerta del panel de administración.
 *
 * Nada de lo que hay dentro de /dashboard/admin se muestra hasta que la persona
 * ha presentado un código de su app de autenticación. Si nunca se ha enrolado,
 * la guía para hacerlo: contraseña → QR → primer código → códigos de
 * recuperación.
 *
 * La interfaz no es la barrera: el backend rechaza cada petición sin token de
 * admin. Esto solo evita enseñar un panel vacío lleno de errores.
 */
export default function PuertaAdmin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>('comprobando');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [password, setPassword] = useState('');
  const [qr, setQr] = useState<{ qr: string; secreto: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [usarRecuperacion, setUsarRecuperacion] = useState(false);
  const [codigosRecuperacion, setCodigosRecuperacion] = useState<string[]>([]);
  const [guardados, setGuardados] = useState(false);
  const [expira, setExpira] = useState<Date | null>(null);

  const decidir = useCallback(async () => {
    if (expiracionSesionAdmin()) {
      setExpira(expiracionSesionAdmin());
      setFase('dentro');
      return;
    }
    try {
      const estado = await estadoSesionAdmin();
      setFase(estado.enrolado ? 'verificar' : 'enrolar');
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      // Sin rol de administración: aquí no hay nada que ver.
      if (status === 401 || status === 403) router.push('/dashboard');
      else setError('No se pudo comprobar tu acceso al panel.');
    }
  }, [router]);

  useEffect(() => {
    decidir();
  }, [decidir]);

  // Si el backend rechaza el token (caducado, cerrado desde otra pestaña), se
  // vuelve a pedir el código sin perder la página.
  useEffect(() => {
    const alRechazar = () => {
      setExpira(null);
      setCodigo('');
      setFase('verificar');
    };
    window.addEventListener(EVENTO_ADMIN_MFA, alRechazar);
    return () => window.removeEventListener(EVENTO_ADMIN_MFA, alRechazar);
  }, []);

  // Aviso de caducidad: al llegar la hora, se vuelve a pedir el código.
  useEffect(() => {
    if (fase !== 'dentro' || !expira) return;
    const t = setTimeout(() => setFase('verificar'), Math.max(0, expira.getTime() - Date.now()));
    return () => clearTimeout(t);
  }, [fase, expira]);

  const enviar = async (accion: () => Promise<void>) => {
    setOcupado(true);
    setError(null);
    try {
      await accion();
    } finally {
      setOcupado(false);
    }
  };

  if (fase === 'comprobando') {
    return <p className="p-8 text-white/40 text-sm">{error ?? 'Comprobando acceso…'}</p>;
  }

  if (fase === 'enrolar') {
    return (
      <Tarjeta titulo="Activa la verificación en dos pasos">
        <p className="text-white/50 text-sm leading-relaxed mb-4">
          El panel de administración exige un código de una app de autenticación (Google Authenticator,
          1Password, Authy…) además de tu contraseña. Así, si alguien consigue tu contraseña, no le basta
          para entrar aquí.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(async () => {
              try {
                const datos = await iniciarEnrolamiento(password);
                setQr({ qr: datos.qr, secreto: datos.secreto });
                setPassword('');
                setFase('escanear');
              } catch (err) {
                setError(errorDe(err, 'No se pudo empezar.'));
              }
            });
          }}
        >
          <label className="block text-xs font-semibold text-white/50 mb-1.5" htmlFor="pw-admin">
            Confirma tu contraseña
          </label>
          <input
            id="pw-admin"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={campo}
          />
          {error && <p className="text-rose-300 text-xs mt-2">{error}</p>}
          <button
            type="submit"
            disabled={ocupado || !password}
            className="mt-4 w-full py-2.5 rounded-xl bg-white text-[#070E17] font-bold text-sm disabled:opacity-50"
          >
            Continuar
          </button>
        </form>
      </Tarjeta>
    );
  }

  if (fase === 'escanear' && qr) {
    return (
      <Tarjeta titulo="Escanea el código con tu app">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr.qr} alt="Código QR para la app de autenticación" className="mx-auto rounded-lg bg-white p-2 w-48 h-48" />
        <details className="mt-3">
          <summary className="text-white/40 text-xs cursor-pointer">¿No puedes escanearlo? Escribe la clave</summary>
          <code className="block mt-2 text-white/70 text-xs break-all bg-white/5 rounded-lg p-2 font-mono">
            {qr.secreto}
          </code>
        </details>
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            enviar(async () => {
              try {
                const datos = await confirmarEnrolamiento(codigo);
                setCodigosRecuperacion(datos.codigos_recuperacion);
                setQr(null);
                setCodigo('');
                setExpira(new Date(datos.expira_en));
                setFase('codigos');
              } catch (err) {
                setError(errorDe(err, 'Código incorrecto.'));
              }
            });
          }}
        >
          <label className="block text-xs font-semibold text-white/50 mb-1.5" htmlFor="codigo-alta">
            Código de 6 cifras que muestra la app
          </label>
          <input
            id="codigo-alta"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
            className={`${campo} text-center tracking-[0.4em] font-mono text-lg`}
          />
          {error && <p className="text-rose-300 text-xs mt-2">{error}</p>}
          <button
            type="submit"
            disabled={ocupado || codigo.length !== 6}
            className="mt-4 w-full py-2.5 rounded-xl bg-white text-[#070E17] font-bold text-sm disabled:opacity-50"
          >
            Activar
          </button>
        </form>
      </Tarjeta>
    );
  }

  if (fase === 'codigos') {
    return (
      <Tarjeta titulo="Guarda tus códigos de recuperación">
        <p className="text-white/50 text-sm leading-relaxed mb-4">
          Si pierdes el móvil, cada uno de estos códigos te deja entrar una vez. <strong className="text-white/80">No se
          volverán a mostrar.</strong> Guárdalos en tu gestor de contraseñas.
        </p>
        <ul className="grid grid-cols-2 gap-2 mb-4">
          {codigosRecuperacion.map((c) => (
            <li key={c} className="font-mono text-sm text-white/80 bg-white/5 rounded-lg px-3 py-1.5 text-center">
              {c}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(codigosRecuperacion.join('\n'))}
          className="w-full py-2 rounded-lg border border-white/15 text-white/70 text-xs font-bold hover:bg-white/5"
        >
          Copiar los diez
        </button>
        <label className="flex items-center gap-2 mt-4 cursor-pointer">
          <input type="checkbox" checked={guardados} onChange={(e) => setGuardados(e.target.checked)} />
          <span className="text-white/60 text-xs">Los he guardado en un lugar seguro</span>
        </label>
        <button
          type="button"
          disabled={!guardados}
          onClick={() => {
            setCodigosRecuperacion([]);
            setFase('dentro');
          }}
          className="mt-4 w-full py-2.5 rounded-xl bg-white text-[#070E17] font-bold text-sm disabled:opacity-40"
        >
          Entrar al panel
        </button>
      </Tarjeta>
    );
  }

  if (fase === 'verificar') {
    return (
      <Tarjeta titulo="Verifica tu identidad">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(async () => {
              try {
                const datos = await verificarCodigoAdmin(
                  usarRecuperacion ? { codigo_recuperacion: codigo } : { codigo }
                );
                setCodigo('');
                setExpira(new Date(datos.expira_en));
                setFase('dentro');
              } catch (err) {
                setError(errorDe(err, 'Código incorrecto.'));
              }
            });
          }}
        >
          <label className="block text-xs font-semibold text-white/50 mb-1.5" htmlFor="codigo-admin">
            {usarRecuperacion ? 'Código de recuperación' : 'Código de 6 cifras de tu app de autenticación'}
          </label>
          <input
            id="codigo-admin"
            autoFocus
            inputMode={usarRecuperacion ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            maxLength={usarRecuperacion ? 12 : 6}
            value={codigo}
            onChange={(e) =>
              setCodigo(usarRecuperacion ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ''))
            }
            className={`${campo} text-center tracking-[0.3em] font-mono text-lg`}
          />
          {error && <p className="text-rose-300 text-xs mt-2">{error}</p>}
          <button
            type="submit"
            disabled={ocupado || (usarRecuperacion ? codigo.length < 10 : codigo.length !== 6)}
            className="mt-4 w-full py-2.5 rounded-xl bg-white text-[#070E17] font-bold text-sm disabled:opacity-50"
          >
            Entrar
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setUsarRecuperacion((v) => !v);
            setCodigo('');
            setError(null);
          }}
          className="mt-3 text-white/40 hover:text-white/70 text-xs"
        >
          {usarRecuperacion ? 'Usar el código de la app' : 'He perdido el móvil: usar un código de recuperación'}
        </button>
      </Tarjeta>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end gap-3 px-6 pt-4 text-[11px] text-white/30">
        {expira && (
          <span>
            Sesión de administración hasta las{' '}
            {expira.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <button
          type="button"
          onClick={async () => {
            await cerrarSesionAdmin();
            setExpira(null);
            setFase('verificar');
          }}
          className="text-white/50 hover:text-white font-semibold"
        >
          Cerrar sesión de admin
        </button>
      </div>
      {children}
    </>
  );
}
