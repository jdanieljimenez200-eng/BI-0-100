"use client";

import { useEffect, useRef } from "react";
import { useScroll, useSpring, useReducedMotion } from "framer-motion";

// ─── Tipos e Interfaces ───────────────────────────────────────────────────────

interface Star {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  twinkleSpeed: number;
  phase: number;
  layer: number; // 0: lejana, 1: media, 2: cercana
}

interface WindowPoint {
  relX: number;
  relY: number;
  color: string;
  phase: number;
  speed: number;
}

interface Building {
  x: number;
  width: number;
  height: number;
  color: string;
  strokeColor: string;
  hasSpire: boolean;
  spireHeight: number;
  windows: WindowPoint[];
  layer: "far" | "near";
}

export default function AmbientBackground() {
  const shouldReduce = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Sincronización Suave del Scroll (Física de Resorte) ────────────────────
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    damping: 26,
    stiffness: 90,
    mass: 0.6,
  });

  // ── Motor Gráfico Cinemático en Canvas (60-120 FPS) ────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    let stars: Star[] = [];
    let farBuildings: Building[] = [];
    let nearBuildings: Building[] = [];

    // Generador de estrellas: Puntos sólidos limpios (estilo cosmos puro)
    const initStars = () => {
      stars = [];
      const STAR_COUNT = Math.min(220, Math.floor((width * height) / 7500));

      for (let i = 0; i < STAR_COUNT; i++) {
        const layer = Math.random() < 0.6 ? 0 : Math.random() < 0.88 ? 1 : 2;

        const size =
          layer === 0
            ? 0.75 + Math.random() * 0.35
            : layer === 1
            ? 1.05 + Math.random() * 0.4
            : 1.4 + Math.random() * 0.5;

        const baseAlpha =
          layer === 0
            ? 0.35 + Math.random() * 0.25
            : layer === 1
            ? 0.55 + Math.random() * 0.25
            : 0.75 + Math.random() * 0.2;

        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size,
          baseAlpha,
          twinkleSpeed: 0.008 + Math.random() * 0.016,
          phase: Math.random() * Math.PI * 2,
          layer,
        });
      }
    };

    // Generador del Skyline Urbano en Dos Capas (Descenso a la Tierra / Cota 0)
    const initBuildings = () => {
      farBuildings = [];
      nearBuildings = [];

      // 1. Capa Lejana (Rascacielos imponentes de fondo con siluetas nítidas)
      let currentX = -60;
      const targetWidth = width + 120;

      while (currentX < targetWidth) {
        const bWidth = 65 + Math.random() * 85;
        const bHeight = 360 + Math.random() * 320; // 360px a 680px de altura
        const hasSpire = Math.random() < 0.6;
        const spireHeight = hasSpire ? 45 + Math.random() * 80 : 0;

        const color = "rgb(14, 22, 36)";
        const strokeColor = "rgba(148, 163, 184, 0.12)";

        const windows: WindowPoint[] = [];
        const cols = Math.floor(bWidth / 10);
        const rows = Math.floor((bHeight - 35) / 14);

        for (let c = 1; c < cols; c++) {
          for (let r = 1; r < rows; r++) {
            if (Math.random() < 0.42) {
              const rand = Math.random();
              const winColor =
                rand < 0.65
                  ? "rgba(251, 191, 36, 0.85)"
                  : rand < 0.90
                  ? "rgba(186, 230, 253, 0.85)"
                  : "rgba(52, 211, 153, 0.80)";

              windows.push({
                relX: (c / cols) * bWidth,
                relY: (r / rows) * (bHeight - 25),
                color: winColor,
                phase: Math.random() * Math.PI * 2,
                speed: 0.01 + Math.random() * 0.02,
              });
            }
          }
        }

        farBuildings.push({
          x: currentX,
          width: bWidth,
          height: bHeight,
          color,
          strokeColor,
          hasSpire,
          spireHeight,
          windows,
          layer: "far",
        });

        currentX += bWidth - 14 + Math.random() * 10;
      }

      // 2. Capa Cercana (Edificios en primer plano, ventanas ultra nítidas y balizas activas)
      currentX = -40;
      while (currentX < targetWidth) {
        const bWidth = 50 + Math.random() * 70;
        const bHeight = 240 + Math.random() * 260; // 240px a 500px de altura
        const hasSpire = Math.random() < 0.45;
        const spireHeight = hasSpire ? 35 + Math.random() * 65 : 0;

        const color = "rgb(20, 30, 50)";
        const strokeColor = "rgba(148, 163, 184, 0.22)";

        const windows: WindowPoint[] = [];
        const cols = Math.floor(bWidth / 9);
        const rows = Math.floor((bHeight - 25) / 13);

        for (let c = 1; c < cols; c++) {
          for (let r = 1; r < rows; r++) {
            if (Math.random() < 0.52) {
              const rand = Math.random();
              const winColor =
                rand < 0.70
                  ? "rgba(251, 191, 36, 0.95)"
                  : "rgba(224, 242, 254, 0.95)";

              windows.push({
                relX: (c / cols) * bWidth,
                relY: (r / rows) * (bHeight - 20),
                color: winColor,
                phase: Math.random() * Math.PI * 2,
                speed: 0.01 + Math.random() * 0.02,
              });
            }
          }
        }

        nearBuildings.push({
          x: currentX,
          width: bWidth,
          height: bHeight,
          color,
          strokeColor,
          hasSpire,
          spireHeight,
          windows,
          layer: "near",
        });

        currentX += bWidth - 10 + Math.random() * 12;
      }
    };

    const handleResize = () => {
      if (!canvas) return;
      dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);

      initStars();
      initBuildings();
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    // ── Bucle de Renderizado ────────────────────────────────────────────────
    let time = 0;

    const render = () => {
      time += 1;
      ctx.clearRect(0, 0, width, height);

      // Progreso normalizado del scroll (0 en Hero / Espacio ➔ 1 en Footer / Suelo)
      const scrollVal = Math.max(0, Math.min(1, smoothProgress.get()));

      // ── 1. GRADIENTE ATMOSFÉRICO DE PANTALLA COMPLETA (Transición 100 ➔ 0) ──
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      skyGrad.addColorStop(0, "#050811");
      skyGrad.addColorStop(0.4, "#070E17");

      // Suave dispersión atmosférica nocturna conforme bajamos
      const atmosScatter = Math.sin(Math.max(0, Math.min(1, scrollVal)) * Math.PI * 0.75);
      if (atmosScatter > 0.02) {
        skyGrad.addColorStop(1, `rgba(10, 22, 44, ${0.45 * atmosScatter})`);
      } else {
        skyGrad.addColorStop(1, "#070E17");
      }

      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // ── 2. LIMBO ATMOSFÉRICO PLANETARIO EN EL HERO (Órbita / Cota 100 ➔ 75) ──
      const earthAlpha = Math.max(0, Math.min(1, (0.32 - scrollVal) / 0.32));
      if (earthAlpha > 0.01) {
        ctx.save();
        const planetRadius = Math.max(width, height) * 1.6;
        const planetCenterY = height + planetRadius * 0.90 + scrollVal * (height * 0.6);

        const limbGrad = ctx.createRadialGradient(
          width / 2,
          planetCenterY,
          planetRadius * 0.95,
          width / 2,
          planetCenterY,
          planetRadius * 1.04
        );
        limbGrad.addColorStop(0, `rgba(4, 7, 14, ${0.95 * earthAlpha})`);
        limbGrad.addColorStop(0.60, `rgba(4, 8, 16, ${0.85 * earthAlpha})`);
        limbGrad.addColorStop(0.74, `rgba(14, 116, 144, ${0.15 * earthAlpha})`);
        limbGrad.addColorStop(0.82, `rgba(56, 189, 248, ${0.32 * earthAlpha})`);
        limbGrad.addColorStop(0.90, `rgba(96, 165, 250, ${0.18 * earthAlpha})`);
        limbGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = limbGrad;
        ctx.beginPath();
        ctx.arc(width / 2, planetCenterY, planetRadius * 1.04, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ── 3. VELO ATMOSFÉRICO ESTRATOSFÉRICO ULTRA-SUTIL (Cota 60 ➔ 30) ──
      const stratFactor = Math.sin(Math.max(0, Math.min(1, (scrollVal - 0.18) / 0.55)) * Math.PI);
      if (stratFactor > 0.05) {
        ctx.save();
        const veilY = height * 0.58 + Math.sin(time * 0.002) * 30;
        const veilGrad = ctx.createLinearGradient(0, veilY - 220, 0, veilY + 220);
        veilGrad.addColorStop(0, "rgba(56, 189, 248, 0)");
        veilGrad.addColorStop(0.5, `rgba(56, 189, 248, ${0.03 * stratFactor})`);
        veilGrad.addColorStop(1, "rgba(56, 189, 248, 0)");

        ctx.fillStyle = veilGrad;
        ctx.fillRect(0, veilY - 220, width, 440);
        ctx.restore();
      }

      // ── 4. ESTRELLAS: PUNTOS SÓLIDOS PUROS A LO LARGO DE TODA LA PÁGINA ──
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];

        const parallaxFactor = s.layer === 0 ? 0.08 : s.layer === 1 ? 0.16 : 0.28;
        let drawY = s.y - (scrollVal * height * parallaxFactor);
        drawY = ((drawY % height) + height) % height;

        const twinkle = Math.sin(time * s.twinkleSpeed + s.phase) * 0.14;
        const alpha = Math.max(0.25, Math.min(1, s.baseAlpha + twinkle));

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, drawY, s.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── 5. SKYLINE DE LA CIUDAD EN COTA 0 (Aparece majestuosamente al descender) ──
      // Emerge desde scroll 0.22 y se consolida al llegar a Herramientas, Precios y Footer
      const cityProgress = Math.max(0, Math.min(1, (scrollVal - 0.22) / 0.62));
      if (cityProgress > 0.01) {
        // Curva hermite suave
        const easedCity = cityProgress * cityProgress * (3 - 2 * cityProgress);
        ctx.save();

        // 5a. Resplandor Ambiental de la Metrópolis (Iluminación urbana ascendente)
        const cityGlowGrad = ctx.createLinearGradient(0, height, 0, height - 520);
        cityGlowGrad.addColorStop(0, `rgba(245, 158, 11, ${0.16 * easedCity})`);
        cityGlowGrad.addColorStop(0.22, `rgba(56, 189, 248, ${0.10 * easedCity})`);
        cityGlowGrad.addColorStop(0.60, `rgba(30, 58, 138, ${0.05 * easedCity})`);
        cityGlowGrad.addColorStop(1, "transparent");
        ctx.fillStyle = cityGlowGrad;
        ctx.fillRect(0, height - 520, width, 520);

        // 5b. Capa Trasera de Edificios (Rascacielos de fondo con paralaje profundo)
        const farElevation = (1 - easedCity) * 140;
        const farGroundY = height + 10 + farElevation;

        for (let i = 0; i < farBuildings.length; i++) {
          const b = farBuildings[i];
          const bTop = farGroundY - b.height;

          // Cuerpo del edificio
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x, bTop, b.width, b.height + 40);

          // Contorno arquitectónico
          ctx.strokeStyle = `rgba(148, 163, 184, ${0.12 * easedCity})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(b.x, bTop, b.width, b.height + 40);

          // Remate superior iluminado (borde de azotea)
          ctx.fillStyle = `rgba(224, 242, 254, ${0.22 * easedCity})`;
          ctx.fillRect(b.x, bTop, b.width, 1.5);

          // Antena con baliza roja de advertencia aeronáutica
          if (b.hasSpire) {
            const spireX = b.x + b.width / 2;
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 * easedCity})`;
            ctx.beginPath();
            ctx.moveTo(spireX, bTop);
            ctx.lineTo(spireX, bTop - b.spireHeight);
            ctx.stroke();

            const beaconFlash = (Math.sin(time * 0.05 + i * 1.5) + 1) / 2;
            if (beaconFlash > 0.5) {
              // Núcleo brillante
              ctx.fillStyle = `rgba(239, 68, 68, ${beaconFlash * easedCity})`;
              ctx.beginPath();
              ctx.arc(spireX, bTop - b.spireHeight, 1.8, 0, Math.PI * 2);
              ctx.fill();

              // Halo difuso
              ctx.fillStyle = `rgba(239, 68, 68, ${beaconFlash * easedCity * 0.35})`;
              ctx.beginPath();
              ctx.arc(spireX, bTop - b.spireHeight, 4.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // Matriz de ventanas distantes
          for (let w = 0; w < b.windows.length; w++) {
            const win = b.windows[w];
            const winY = bTop + win.relY;
            if (winY < farGroundY - 5) {
              const shimmer = Math.sin(time * win.speed + win.phase) * 0.16;
              const alphaMatch = win.color.match(/[\d.]+\)$/);
              const baseAlpha = alphaMatch ? parseFloat(alphaMatch[0]) : 0.8;
              const finalAlpha = Math.max(0.1, Math.min(1, (baseAlpha + shimmer) * easedCity));
              ctx.fillStyle = win.color.replace(/[\d.]+\)$/, `${finalAlpha})`);
              ctx.fillRect(b.x + win.relX, winY, 2.2, 3.2);
            }
          }
        }

        // 5c. Capa Delantera de Edificios (Primer plano con máximo contraste y detalle)
        const nearElevation = (1 - easedCity) * 90;
        const nearGroundY = height + 5 + nearElevation;

        for (let i = 0; i < nearBuildings.length; i++) {
          const b = nearBuildings[i];
          const bTop = nearGroundY - b.height;

          // Cuerpo del edificio
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x, bTop, b.width, b.height + 40);

          // Contorno de alta definición
          ctx.strokeStyle = `rgba(148, 163, 184, ${0.20 * easedCity})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(b.x, bTop, b.width, b.height + 40);

          // Remate nítido en el borde superior de la azotea
          ctx.fillStyle = `rgba(224, 242, 254, ${0.35 * easedCity})`;
          ctx.fillRect(b.x, bTop, b.width, 1.5);

          // Antena / aguja con luz de baliza parpadeante nítida
          if (b.hasSpire) {
            const spireX = b.x + b.width / 2;
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.26 * easedCity})`;
            ctx.beginPath();
            ctx.moveTo(spireX, bTop);
            ctx.lineTo(spireX, bTop - b.spireHeight);
            ctx.stroke();

            const beaconFlash = (Math.sin(time * 0.07 + i) + 1) / 2;
            if (beaconFlash > 0.45) {
              // Núcleo intenso
              ctx.fillStyle = `rgba(239, 68, 68, ${beaconFlash * easedCity})`;
              ctx.beginPath();
              ctx.arc(spireX, bTop - b.spireHeight, 2.2, 0, Math.PI * 2);
              ctx.fill();

              // Halo de advertencia nocturna
              ctx.fillStyle = `rgba(239, 68, 68, ${beaconFlash * easedCity * 0.4})`;
              ctx.beginPath();
              ctx.arc(spireX, bTop - b.spireHeight, 6, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // Matriz de ventanas iluminadas en primer plano
          for (let w = 0; w < b.windows.length; w++) {
            const win = b.windows[w];
            const winY = bTop + win.relY;
            if (winY < nearGroundY - 5) {
              const shimmer = Math.sin(time * win.speed + win.phase) * 0.20;
              const alphaMatch = win.color.match(/[\d.]+\)$/);
              const baseAlpha = alphaMatch ? parseFloat(alphaMatch[0]) : 0.9;
              const finalAlpha = Math.max(0.15, Math.min(1, (baseAlpha + shimmer) * easedCity));
              ctx.fillStyle = win.color.replace(/[\d.]+\)$/, `${finalAlpha})`);
              ctx.fillRect(b.x + win.relX, winY, 2.8, 4.0);
            }
          }
        }

        ctx.restore();
      }

      if (!shouldReduce) {
        animId = requestAnimationFrame(render);
      }
    };

    if (shouldReduce) {
      render();
    } else {
      animId = requestAnimationFrame(render);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [shouldReduce, smoothProgress]);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden select-none z-0"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Grano cinematográfico sutil de alta fidelidad */}
      <svg
        className="fixed inset-0 w-full h-full opacity-[0.025] mix-blend-overlay pointer-events-none z-10"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="cinematic-grain-sky">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#cinematic-grain-sky)" />
      </svg>
    </div>
  );
}
