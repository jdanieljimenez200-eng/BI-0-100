'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

interface Star {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  twinkleSpeed: number;
  phase: number;
  layer: number; // 0: lejana, 1: media, 2: cercana
  vx: number;
  vy: number;
}

interface ShootingStar {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  alpha: number;
  active: boolean;
}

interface CityLight {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: string;
}

export default function AuthBackground() {
  const shouldReduce = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    let stars: Star[] = [];
    let shootingStar: ShootingStar | null = null;
    let shootingStarTimer = 0;
    let cityLights: CityLight[] = [];

    // Seguimiento suave del mouse para paralaje de 3 capas
    let targetMouseX = 0;
    let targetMouseY = 0;
    let currentMouseX = 0;
    let currentMouseY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      targetMouseX = ((e.clientX - rect.left) / width - 0.5) * 2;
      targetMouseY = ((e.clientY - rect.top) / height - 0.5) * 2;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const parent = canvas.parentElement;
      if (!parent || e.touches.length === 0) return;
      const rect = parent.getBoundingClientRect();
      targetMouseX = ((e.touches[0].clientX - rect.left) / width - 0.5) * 2;
      targetMouseY = ((e.touches[0].clientY - rect.top) / height - 0.5) * 2;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    // Inicializador del campo estelar (puntos blancos sólidos nítidos)
    const initStars = () => {
      stars = [];
      const count = Math.min(130, Math.floor((width * height) / 5000));

      for (let i = 0; i < count; i++) {
        const layer = Math.random() < 0.6 ? 0 : Math.random() < 0.88 ? 1 : 2;
        const size = layer === 0 ? 0.8 : layer === 1 ? 1.15 : 1.5;
        const baseAlpha = layer === 0 ? 0.4 : layer === 1 ? 0.65 : 0.9;
        const x = Math.random() * width;
        const y = Math.random() * height;

        stars.push({
          x,
          y,
          size,
          baseAlpha,
          twinkleSpeed: 0.01 + Math.random() * 0.02,
          phase: Math.random() * Math.PI * 2,
          layer,
          vx: (Math.random() - 0.5) * 0.04,
          vy: -0.02 - Math.random() * 0.04, // deriva cósmica ascendente muy lenta
        });
      }
    };

    // Luces de ciudades en la Tierra nocturna (planeta en la parte inferior)
    const initCityLights = () => {
      cityLights = [];
      const planetCenterX = width * 0.4;
      const planetCenterY = height * 1.38;
      const planetRadius = height * 0.88;

      const CLUSTERS = 5;
      for (let c = 0; c < CLUSTERS; c++) {
        const clusterAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
        const clusterDist = planetRadius - 8 - Math.random() * 38;
        const cx = planetCenterX + Math.cos(clusterAngle) * clusterDist;
        const cy = planetCenterY + Math.sin(clusterAngle) * clusterDist;

        const pointsInCluster = 7 + Math.floor(Math.random() * 10);
        for (let p = 0; p < pointsInCluster; p++) {
          const offsetX = (Math.random() - 0.5) * 40;
          const offsetY = (Math.random() - 0.5) * 24;
          const warm = Math.random() < 0.85;

          cityLights.push({
            x: cx + offsetX,
            y: cy + offsetY,
            radius: 0.75 + Math.random() * 0.85,
            alpha: 0.35 + Math.random() * 0.45,
            color: warm ? 'rgba(251, 191, 36,' : 'rgba(244, 244, 245,', // ámbar dorado o blanco cálido
          });
        }
      }
    };

    const spawnShootingStar = () => {
      const angle = Math.PI * 0.24; // ~43 grados hacia abajo y a la derecha
      shootingStar = {
        x: Math.random() * (width * 0.7),
        y: Math.random() * (height * 0.35),
        length: 70 + Math.random() * 50,
        speed: 10 + Math.random() * 5,
        angle,
        alpha: 0.9,
        active: true,
      };
    };

    const handleResize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const parent = canvas.parentElement;
      width = parent ? parent.clientWidth : window.innerWidth;
      height = parent ? parent.clientHeight : window.innerHeight;

      if (width === 0 || height === 0) return;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      initStars();
      initCityLights();
    };

    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    window.addEventListener('resize', handleResize);

    let lastTime = performance.now();

    // ── Bucle de Renderizado Cinemático ────────────────────────────────────
    const render = (time: number) => {
      const delta = Math.min(time - lastTime, 40);
      lastTime = time;

      // Interpolación suave del mouse
      currentMouseX += (targetMouseX - currentMouseX) * 0.04;
      currentMouseY += (targetMouseY - currentMouseY) * 0.04;

      // 1. Limpieza con degradado cósmico profundo exclusivo del panel
      const deepSky = ctx.createLinearGradient(0, 0, 0, height);
      deepSky.addColorStop(0, '#05070C');
      deepSky.addColorStop(0.5, '#070A11');
      deepSky.addColorStop(1, '#090D16');
      ctx.fillStyle = deepSky;
      ctx.fillRect(0, 0, width, height);

      // 2. Curvatura de la Tierra y Atmósfera (Cota 100 a 0)
      const planetCenterX = width * 0.4;
      const planetCenterY = height * 1.38;
      const planetRadius = height * 0.88;

      // Resplandor externo de la exosfera (sin cajas ni bordes duros)
      const exoGrad = ctx.createRadialGradient(
        planetCenterX,
        planetCenterY,
        planetRadius - 20,
        planetCenterX,
        planetCenterY,
        planetRadius + 120
      );
      exoGrad.addColorStop(0, 'rgba(56, 189, 248, 0.16)');
      exoGrad.addColorStop(0.35, 'rgba(14, 116, 144, 0.08)');
      exoGrad.addColorStop(0.7, 'rgba(6, 40, 70, 0.025)');
      exoGrad.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.arc(planetCenterX, planetCenterY, planetRadius + 120, 0, Math.PI * 2);
      ctx.fillStyle = exoGrad;
      ctx.fill();

      // Disco planetario con superficie nocturna
      ctx.save();
      ctx.beginPath();
      ctx.arc(planetCenterX, planetCenterY, planetRadius, 0, Math.PI * 2);
      ctx.clip();

      const globeGrad = ctx.createRadialGradient(
        planetCenterX,
        planetCenterY - planetRadius * 0.8,
        planetRadius * 0.1,
        planetCenterX,
        planetCenterY,
        planetRadius
      );
      globeGrad.addColorStop(0, '#0B111A');
      globeGrad.addColorStop(0.8, '#060A10');
      globeGrad.addColorStop(1, '#030508');
      ctx.fillStyle = globeGrad;
      ctx.fillRect(0, 0, width, height);

      // Luces de ciudades titilantes en la Tierra
      for (let i = 0; i < cityLights.length; i++) {
        const cl = cityLights[i];
        const pulse = 0.8 + Math.sin(time * 0.002 + i) * 0.2;
        ctx.beginPath();
        ctx.arc(cl.x, cl.y, cl.radius, 0, Math.PI * 2);
        ctx.fillStyle = `${cl.color} ${cl.alpha * pulse})`;
        ctx.fill();
      }
      ctx.restore();

      // Línea de limbo atmosférico nítida (estratosfera)
      ctx.beginPath();
      ctx.arc(planetCenterX, planetCenterY, planetRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.24)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // 3. Estrellas Sólidas con Paralaje y Deriva Cósmica
      const layerMultipliers = [5, 12, 22];

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        if (!shouldReduce) {
          star.x += star.vx;
          star.y += star.vy;

          if (star.y < -10) star.y = height + 10;
          if (star.x < -10) star.x = width + 10;
          if (star.x > width + 10) star.x = -10;

          star.phase += star.twinkleSpeed;
        }

        const offsetX = currentMouseX * layerMultipliers[star.layer];
        const offsetY = currentMouseY * layerMultipliers[star.layer];
        const renderX = star.x + offsetX;
        const renderY = star.y + offsetY;

        const twinkle = 0.75 + Math.sin(star.phase) * 0.25;
        const finalAlpha = Math.min(1, star.baseAlpha * twinkle);

        ctx.beginPath();
        ctx.arc(renderX, renderY, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${finalAlpha})`;
        ctx.fill();
      }

      // 4. Estrella Fugaz Periódica
      if (!shouldReduce) {
        shootingStarTimer += delta;
        if (shootingStarTimer > 6500) {
          spawnShootingStar();
          shootingStarTimer = Math.random() * 2000;
        }

        if (shootingStar && shootingStar.active) {
          shootingStar.x += Math.cos(shootingStar.angle) * shootingStar.speed;
          shootingStar.y += Math.sin(shootingStar.angle) * shootingStar.speed;
          shootingStar.alpha -= 0.02;

          if (shootingStar.alpha <= 0) {
            shootingStar.active = false;
          } else {
            const tailX = shootingStar.x - Math.cos(shootingStar.angle) * shootingStar.length;
            const tailY = shootingStar.y - Math.sin(shootingStar.angle) * shootingStar.length;

            const meteorGrad = ctx.createLinearGradient(
              tailX,
              tailY,
              shootingStar.x,
              shootingStar.y
            );
            meteorGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            meteorGrad.addColorStop(0.7, `rgba(186, 230, 253, ${shootingStar.alpha * 0.5})`);
            meteorGrad.addColorStop(1, `rgba(255, 255, 255, ${shootingStar.alpha})`);

            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(shootingStar.x, shootingStar.y);
            ctx.strokeStyle = meteorGrad;
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(shootingStar.x, shootingStar.y, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${shootingStar.alpha})`;
            ctx.fill();
          }
        }
      }

      if (!shouldReduce) {
        animId = requestAnimationFrame(render);
      }
    };

    if (shouldReduce) {
      render(0);
    } else {
      animId = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [shouldReduce]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
    />
  );
}
