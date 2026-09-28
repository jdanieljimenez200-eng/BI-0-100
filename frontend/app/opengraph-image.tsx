import { ImageResponse } from 'next/og';

// Imagen que muestran WhatsApp, LinkedIn, X o Slack al compartir un enlace.
// El layout apuntaba a `/og-image.png`, que no existía: los enlaces salían sin
// vista previa. Se genera en el build (ruta estática) con el estilo de la marca.

export const alt = 'BI 0 A 100 — Valida tu negocio en minutos';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const AREAS = ['Mercado', 'Marketing', 'Finanzas', 'Legal', 'Operación'];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#0B0B0D',
          color: '#FFFFFF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: '#1C1C1E',
              border: '2px solid rgba(255,255,255,0.14)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            BI
          </div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>BI 0 A 100</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            Valida tu negocio en minutos
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: 'rgba(255,255,255,0.6)', maxWidth: 900 }}>
            Viabilidad comercial, operativa y legal con tus números reales.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          {AREAS.map((a) => (
            <div
              key={a}
              style={{
                display: 'flex',
                padding: '10px 20px',
                borderRadius: 999,
                background: '#1C1C1E',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 22,
                color: 'rgba(255,255,255,0.75)',
              }}
            >
              {a}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
