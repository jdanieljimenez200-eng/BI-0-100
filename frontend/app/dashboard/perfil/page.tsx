'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { motion } from 'framer-motion';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  plan: string;
  account_role: string;
  fecha_creacion: string;
}

export default function PerfilPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', email: '' });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    api.get('/auth/me')
      .then(({ data }) => {
        if (!vigente) return;
        setUsuario(data);
        setFormData({ nombre: data.name ?? data.nombre ?? '', email: data.email });
      })
      // Un fallo ya obsoleto no debe expulsar al usuario al login.
      .catch(() => { if (vigente) router.push('/auth/login'); })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [router]);

  const handleGuardar = async () => {
    if (!formData.nombre.trim() || !formData.email.trim()) {
      alert('Todos los campos son requeridos');
      return;
    }

    setGuardando(true);
    try {
      await api.put('/dashboard/perfil', {
        nombre: formData.nombre.trim(),
        email: formData.email.trim(),
      });
      const { data } = await api.get('/auth/me');
      setUsuario(data);
      localStorage.setItem('usuario', JSON.stringify(data));
      setEditando(false);
      alert('Perfil actualizado correctamente');
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Error al actualizar el perfil');
    } finally {
      setGuardando(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="space-y-4">
          <div className="h-8 w-48 bg-white/10 rounded-lg animate-pulse" />
          <div className="h-64 bg-white/5 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!usuario) return null;

  const fechaCreacion = new Date(usuario.fecha_creacion).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="max-w-2xl mx-auto pb-20">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <span className="w-5 h-[2px] rounded-full bg-brand-accent/60" />
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/25">
            Configuración
          </p>
        </div>
        <h1 className="text-4xl font-extrabold text-white mb-1">Mi Perfil</h1>
        <p className="text-sm text-white/40">Gestiona tu información personal y configuración de cuenta</p>
      </motion.div>

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-3xl border border-white/5 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0a1520 0%, #0c1522 100%)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* Header accent */}
        <div className="h-[2px] bg-gradient-to-r from-brand-accent/50 via-brand-accent to-transparent" />

        <div className="p-8">
          {/* Profile section */}
          <div className="mb-8 pb-8 border-b border-white/5">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Información Personal</h2>
                <p className="text-sm text-white/40">Actualiza tus datos personales</p>
              </div>
              <button
                onClick={() => (editando ? setEditando(false) : setEditando(true))}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  background: editando ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                  color: editando ? '#fca5a5' : '#93c5fd',
                  border: editando ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(59,130,246,0.3)',
                }}
              >
                {editando ? 'Cancelar' : 'Editar'}
              </button>
            </div>

            {editando ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Nombre</label>
                  <input
                    type="text"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:border-brand-accent focus:outline-none transition-colors"
                    placeholder="Tu nombre completo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:border-brand-accent focus:outline-none transition-colors"
                    placeholder="tu.email@ejemplo.com"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleGuardar}
                    disabled={guardando}
                    className="flex-1 px-4 py-3 rounded-lg bg-brand-accent text-white font-medium transition-all duration-200 active:scale-95 disabled:opacity-50"
                  >
                    {guardando ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center p-4 rounded-xl bg-white/3 border border-white/5">
                  <span className="text-sm text-white/60">Nombre</span>
                  <span className="text-sm font-medium text-white">{usuario.nombre}</span>
                </div>
                <div className="flex justify-between items-center p-4 rounded-xl bg-white/3 border border-white/5">
                  <span className="text-sm text-white/60">Email</span>
                  <span className="text-sm font-medium text-white">{usuario.email}</span>
                </div>
              </div>
            )}
          </div>

          {/* Account info */}
          <div className="mb-8 pb-8 border-b border-white/5">
            <h3 className="text-lg font-bold text-white mb-4">Información de Cuenta</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-4 rounded-xl bg-white/3 border border-white/5">
                <span className="text-sm text-white/60">Plan Actual</span>
                <span className="text-sm font-bold uppercase px-3 py-1 rounded-full bg-brand-accent/15 text-brand-accent border border-brand-accent/30">
                  {usuario.plan}
                </span>
              </div>
              <div className="flex justify-between items-center p-4 rounded-xl bg-white/3 border border-white/5">
                <span className="text-sm text-white/60">Rol</span>
                <span className="text-sm font-medium text-white capitalize">
                  {usuario.account_role === 'owner' ? 'Propietario' : 'Trabajador'}
                </span>
              </div>
              <div className="flex justify-between items-center p-4 rounded-xl bg-white/3 border border-white/5">
                <span className="text-sm text-white/60">Miembro desde</span>
                <span className="text-sm font-medium text-white">{fechaCreacion}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {usuario.plan === 'freemium' && (
              <Link
                href="/dashboard/billing"
                className="w-full px-4 py-3 rounded-xl bg-brand-accent/15 text-brand-accent border border-brand-accent/30 font-medium text-sm text-center transition-all duration-200 hover:bg-brand-accent/20 active:scale-95"
              >
                Mejorar Plan
              </Link>
            )}
            <button
              onClick={() => {
                api.post('/auth/logout', {}).catch(() => {});
                localStorage.removeItem('usuario');
                router.push('/');
              }}
              className="w-full px-4 py-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 font-medium text-sm transition-all duration-200 hover:bg-red-500/15 active:scale-95"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}