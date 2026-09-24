'use client';

/**
 * AuthMountain — Fondo de montaña tipo Everest para la pantalla de login.
 * SVG generativo con capas de cordillera, niebla volumétrica, estrellas
 * y un sutil resplandor de amanecer en la cima. Puramente decorativo.
 */

import { useEffect, useState, useMemo } from 'react';

/* ── helpers ─────────────────────────────────────────────────────────── */

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateStars(count: number, w: number, h: number, seed = 42) {
  const rng = seededRandom(seed);
  return Array.from({ length: count }, () => ({
    cx: rng() * w,
    cy: rng() * h * 0.55,       // solo mitad superior
    r: 0.3 + rng() * 1.0,
    opacity: 0.15 + rng() * 0.55,
    delay: rng() * 6,
  }));
}

/* ── componente ──────────────────────────────────────────────────────── */

export default function AuthMountain() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const W = 960;
  const H = 540;

  const stars = useMemo(() => generateStars(65, W, H), []);

  if (!mounted) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, #050A12, #0B1120)',
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          {/* Cielo nocturno con aurora boreal sutil */}
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#030810" />
            <stop offset="25%" stopColor="#0A1628" />
            <stop offset="50%" stopColor="#0E1F3A" />
            <stop offset="75%" stopColor="#101D30" />
            <stop offset="100%" stopColor="#0C1522" />
          </linearGradient>

          {/* Resplandor de amanecer detrás de la cima */}
          <radialGradient id="sunGlow" cx="0.5" cy="0.48" r="0.35" fx="0.5" fy="0.48">
            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.12" />
            <stop offset="30%" stopColor="#F97316" stopOpacity="0.06" />
            <stop offset="60%" stopColor="#EA580C" stopOpacity="0.03" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>

          {/* Aurora sutil cyan */}
          <radialGradient id="auroraGlow" cx="0.35" cy="0.25" r="0.45">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.04" />
            <stop offset="50%" stopColor="#06B6D4" stopOpacity="0.02" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>

          {/* Montaña trasera lejana (más clara) */}
          <linearGradient id="mtnFarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E293B" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>

          {/* Montaña media */}
          <linearGradient id="mtnMidGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1A2744" />
            <stop offset="40%" stopColor="#111B30" />
            <stop offset="100%" stopColor="#0A1220" />
          </linearGradient>

          {/* Montaña principal (Everest) */}
          <linearGradient id="mtnMainGrad" x1="0.4" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#CBD5E1" stopOpacity="0.9" />
            <stop offset="15%" stopColor="#94A3B8" stopOpacity="0.7" />
            <stop offset="35%" stopColor="#475569" stopOpacity="0.5" />
            <stop offset="60%" stopColor="#1E293B" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>

          {/* Nieve en la cima */}
          <linearGradient id="snowGrad" x1="0.45" y1="0" x2="0.55" y2="1">
            <stop offset="0%" stopColor="#F8FAFC" stopOpacity="0.85" />
            <stop offset="40%" stopColor="#E2E8F0" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#94A3B8" stopOpacity="0" />
          </linearGradient>

          {/* Niebla baja */}
          <linearGradient id="fogGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="transparent" stopOpacity="0" />
            <stop offset="40%" stopColor="#0C1522" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0C1522" stopOpacity="0.95" />
          </linearGradient>

          {/* Filtro de resplandor para estrellas */}
          <filter id="starGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Filtro suave para la nieve */}
          <filter id="snowSoft" x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {/* ── 1. Cielo ─────────────────────────────────────────── */}
        <rect width={W} height={H} fill="url(#skyGrad)" />

        {/* ── 2. Aurora / Glow ambiental ────────────────────────── */}
        <rect width={W} height={H} fill="url(#auroraGlow)" />
        <rect width={W} height={H} fill="url(#sunGlow)" />

        {/* ── 3. Estrellas ─────────────────────────────────────── */}
        <g filter="url(#starGlow)">
          {stars.map((s, i) => (
            <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#E2E8F0" opacity={s.opacity}>
              <animate
                attributeName="opacity"
                values={`${s.opacity};${s.opacity * 0.3};${s.opacity}`}
                dur={`${3 + s.delay}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
        </g>

        {/* ── 4. Cordillera lejana (fondo) ─────────────────────── */}
        <path
          d="M0,380 L60,340 L120,310 L160,325 L200,290 L250,305 L300,270 L340,285 L380,260 L420,275 L460,250 L500,265 L540,245 L580,258 L620,240 L660,255 L700,235 L740,250 L780,270 L820,255 L860,275 L900,260 L960,290 L960,540 L0,540 Z"
          fill="url(#mtnFarGrad)"
          opacity="0.5"
        />

        {/* ── 5. Cordillera media ──────────────────────────────── */}
        <path
          d="M0,420 L80,370 L130,350 L180,365 L220,330 L270,348 L310,310 L350,328 L400,295 L430,315 L470,285 L510,305 L540,275 L570,295 L600,265 L640,282 L680,260 L720,278 L760,295 L800,280 L840,300 L880,285 L920,305 L960,320 L960,540 L0,540 Z"
          fill="url(#mtnMidGrad)"
          opacity="0.65"
        />

        {/* ── 6. Monte Everest (cima principal, centro) ────────── */}
        <path
          d="M280,420 L340,350 L380,300 L410,265 L435,235 L455,210 L470,185 L480,160 L490,185 L500,210 L515,235 L535,260 L555,285 L585,310 L620,340 L680,390 L680,540 L280,540 Z"
          fill="url(#mtnMainGrad)"
        />

        {/* Crestas de roca / textura en la montaña principal */}
        <path
          d="M410,265 L430,280 L445,255 L455,210 L465,250 L480,270 L500,255 L515,235 L530,268 L545,280 L555,285"
          fill="none"
          stroke="#334155"
          strokeWidth="0.8"
          opacity="0.3"
        />
        <path
          d="M380,300 L405,310 L420,290 L435,285 L450,305 L470,300 L490,315 L505,295 L520,305 L540,290 L560,310 L585,310"
          fill="none"
          stroke="#1E293B"
          strokeWidth="0.6"
          opacity="0.25"
        />

        {/* ── 7. Nieve en la cima del Everest ─────────────────── */}
        <path
          d="M455,210 L465,195 L475,172 L480,160 L485,172 L490,190 L500,210 L495,215 L488,205 L480,195 L472,205 L465,215 Z"
          fill="url(#snowGrad)"
          filter="url(#snowSoft)"
        />
        {/* Nieve en cresta secundaria */}
        <path
          d="M468,185 L475,170 L480,160 L485,170 L492,185 L488,188 L480,178 L475,185 Z"
          fill="#F1F5F9"
          opacity="0.6"
        />

        {/* ── 8. Montaña primer plano izquierda (silueta oscura) ─ */}
        <path
          d="M0,460 L60,410 L100,390 L140,400 L180,375 L220,390 L260,405 L300,420 L300,540 L0,540 Z"
          fill="#080E18"
          opacity="0.85"
        />

        {/* ── 9. Montaña primer plano derecha ──────────────────── */}
        <path
          d="M660,460 L700,420 L740,395 L780,405 L820,385 L860,400 L900,410 L940,425 L960,435 L960,540 L660,540 Z"
          fill="#060C16"
          opacity="0.8"
        />

        {/* ── 10. Niebla volumétrica baja ──────────────────────── */}
        <rect x="0" y={H * 0.6} width={W} height={H * 0.4} fill="url(#fogGrad)" />

        {/* Capas de neblina horizontal animada */}
        <ellipse cx="200" cy="400" rx="300" ry="30" fill="#0F172A" opacity="0.25">
          <animate attributeName="cx" values="200;250;200" dur="20s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.25;0.15;0.25" dur="20s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx="700" cy="420" rx="250" ry="25" fill="#0F172A" opacity="0.2">
          <animate attributeName="cx" values="700;650;700" dur="25s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.2;0.12;0.2" dur="25s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx="480" cy="380" rx="200" ry="20" fill="#1E293B" opacity="0.12">
          <animate attributeName="cx" values="480;520;480" dur="18s" repeatCount="indefinite" />
        </ellipse>

        {/* ── 11. Resplandor dorado en la cima ─────────────────── */}
        <circle cx="480" cy="160" r="60" fill="#F59E0B" opacity="0.04">
          <animate attributeName="r" values="60;70;60" dur="8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.04;0.07;0.04" dur="8s" repeatCount="indefinite" />
        </circle>
        <circle cx="480" cy="160" r="30" fill="#FCD34D" opacity="0.06">
          <animate attributeName="r" values="30;38;30" dur="6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.06;0.10;0.06" dur="6s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
}
