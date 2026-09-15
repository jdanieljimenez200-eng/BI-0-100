'use client';

import { useEffect, useState } from 'react';
import { errorLegible, metricasFicha, type MetricasPerfil } from '@/lib/network';

/**
 * Lo que rinde el perfil en los últimos 30 días. Las visitas y los clics se
 * cuentan una vez por visitante al día, así que recargar no los infla.
 */
export default function MetricasFicha({ expertoId }: { expertoId: string }) {
  const [datos, setDatos] = useState<MetricasPerfil | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    metricasFicha(expertoId)
      .then(setDatos)
      .catch((e) => setError(errorLegible(e, 'No pudimos cargar tus estadísticas.')));
  }, [expertoId]);

  if (error) return <p className="text-rose-300 text-xs">{error}</p>;
  if (!datos) return <p className="text-white/40 text-sm">Cargando estadísticas…</p>;

  const t = datos.totales;
  const contactos = t.clics_whatsapp + t.clics_telefono + t.clics_email + t.clics_web;
  const maximo = Math.max(1, ...datos.serie.map((d) => d.vistas));

  const tarjetas = [
    { titulo: 'Apariciones', valor: t.impresiones, detalle: `${t.impresiones_impulsadas.toLocaleString('es-MX')} promocionadas` },
    { titulo: 'Visitas al perfil', valor: t.vistas, detalle: 'personas distintas por día' },
    { titulo: 'Contactos', valor: contactos, detalle: `${t.clics_whatsapp} por WhatsApp` },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tarjetas.map((c) => (
          <div key={c.titulo} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-white/45 text-[11px] font-semibold">{c.titulo}</p>
            <p className="text-white text-2xl font-extrabold mt-1">{c.valor.toLocaleString('es-MX')}</p>
            <p className="text-white/30 text-[11px] mt-0.5">{c.detalle}</p>
          </div>
        ))}
      </div>

      {datos.serie.length === 0 ? (
        <p className="text-white/40 text-sm">
          Aún no hay actividad en los últimos {datos.dias} días. Completa tus fotos y servicios, y considera un impulso
          para empezar a aparecer arriba.
        </p>
      ) : (
        <div>
          <p className="text-white/40 text-[11px] font-semibold mb-2">Visitas por día</p>
          <div className="flex items-end gap-1 h-24" role="img" aria-label="Visitas diarias al perfil">
            {datos.serie.map((d) => (
              <div
                key={d.fecha}
                title={`${d.fecha}: ${d.vistas} visitas`}
                className="flex-1 min-w-[4px] rounded-t bg-emerald-400/60"
                style={{ height: `${Math.max(4, (d.vistas / maximo) * 100)}%` }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {[
          ['WhatsApp', t.clics_whatsapp],
          ['Llamadas', t.clics_telefono],
          ['Correo', t.clics_email],
          ['Sitio web', t.clics_web],
        ].map(([canal, n]) => (
          <div key={canal as string} className="rounded-lg bg-white/[0.03] py-2">
            <p className="text-white font-bold">{n as number}</p>
            <p className="text-white/35 text-[10px]">{canal}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
