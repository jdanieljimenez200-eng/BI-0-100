'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Plus,
  Sparkles,
  Wrench,
  User,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Traza la curva cóncava continua (C1) del scoop notch.
 * Crea un fillet orgánico suave idéntico al diseño de referencia.
 */
export function generateScoopPath(
  width: number,
  height: number,
  notchCenterX: number,
  notchWidth = 84,
  notchDepth = 30,
  cornerRadius = 24
) {
  const halfW = notchWidth / 2;
  const leftX = notchCenterX - halfW;
  const rightX = notchCenterX + halfW;

  return [
    // Inicia en la esquina superior izquierda
    `M ${cornerRadius} 0`,
    // Línea hasta antes del notch
    `L ${leftX} 0`,
    // Curva de bajada suave al fondo del notch (cradle)
    `C ${leftX + halfW * 0.45} 0, ${notchCenterX - halfW * 0.35} ${notchDepth}, ${notchCenterX} ${notchDepth}`,
    // Curva de subida suave de regreso al borde superior
    `C ${notchCenterX + halfW * 0.35} ${notchDepth}, ${rightX - halfW * 0.45} 0, ${rightX} 0`,
    // Línea hasta la esquina superior derecha
    `L ${width - cornerRadius} 0`,
    // Esquina superior derecha redondeada
    `A ${cornerRadius} ${cornerRadius} 0 0 1 ${width} ${cornerRadius}`,
    // Borde derecho
    `L ${width} ${height - cornerRadius}`,
    // Esquina inferior derecha
    `A ${cornerRadius} ${cornerRadius} 0 0 1 ${width - cornerRadius} ${height}`,
    // Borde inferior
    `L ${cornerRadius} ${height}`,
    // Esquina inferior izquierda
    `A ${cornerRadius} ${cornerRadius} 0 0 1 0 ${height - cornerRadius}`,
    // Borde izquierdo
    `L 0 ${cornerRadius}`,
    // Esquina superior izquierda
    `A ${cornerRadius} ${cornerRadius} 0 0 1 ${cornerRadius} 0`,
    'Z',
  ].join(' ');
}

/**
 * Traza la curva del notch para una barra vertical (corte hacia adentro en el lateral derecho).
 */
export function generateVerticalScoopPath(
  width: number,
  height: number,
  notchCenterY: number,
  notchHeight = 76,
  notchDepth = 22,
  cornerRadius = 24
) {
  const halfH = notchHeight / 2;
  const topY = notchCenterY - halfH;
  const bottomY = notchCenterY + halfH;

  return [
    `M ${cornerRadius} 0`,
    `L ${width - cornerRadius} 0`,
    `A ${cornerRadius} ${cornerRadius} 0 0 1 ${width} ${cornerRadius}`,
    // Borde derecho hasta el notch
    `L ${width} ${topY}`,
    // Bajada cóncava hacia adentro
    `C ${width} ${topY + halfH * 0.45}, ${width - notchDepth} ${notchCenterY - halfH * 0.35}, ${width - notchDepth} ${notchCenterY}`,
    // Subida cóncava de regreso al borde
    `C ${width - notchDepth} ${notchCenterY + halfH * 0.35}, ${width} ${bottomY - halfH * 0.45}, ${width} ${bottomY}`,
    `L ${width} ${height - cornerRadius}`,
    `A ${cornerRadius} ${cornerRadius} 0 0 1 ${width - cornerRadius} ${height}`,
    `L ${cornerRadius} ${height}`,
    `A ${cornerRadius} ${cornerRadius} 0 0 1 0 ${height - cornerRadius}`,
    `L 0 ${cornerRadius}`,
    `A ${cornerRadius} ${cornerRadius} 0 0 1 ${cornerRadius} 0`,
    'Z',
  ].join(' ');
}

/**
 * Botón circular elevado ("FAB") con resplandor luminoso suave y compresión táctil elástica.
 */
export function ElevatedCircularButton({
  href,
  onClick,
  icon: Icon = Plus,
  label = 'Nuevo Análisis',
  isActive = false,
  size = 'md',
  className,
}: {
  href?: string;
  onClick?: () => void;
  icon?: LucideIcon;
  label?: string;
  isActive?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-14 h-14',
  }[size];

  const iconSizes = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-7 h-7',
  }[size];

  const content = (
    <motion.div
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
      className={cn(
        'group relative flex items-center justify-center rounded-full cursor-pointer select-none transition-all duration-300',
        sizeClasses,
        'bg-gradient-to-tr from-orange-500 via-amber-500 to-amber-300 text-[#070E17]',
        'shadow-[0_8px_24px_rgba(249,115,22,0.45),0_2px_6px_rgba(0,0,0,0.4)]',
        'hover:shadow-[0_12px_32px_rgba(249,115,22,0.65),0_0_20px_rgba(251,146,60,0.5)]',
        'border-2 border-white/30',
        className
      )}
      title={label}
    >
      {/* Halo de luz de fondo */}
      <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 opacity-40 blur-md group-hover:opacity-75 transition-opacity" />

      {/* Icono central con micro-rotación */}
      <Icon
        className={cn(
          iconSizes,
          'relative z-10 transition-transform duration-300 ease-out text-[#070E17]',
          'group-hover:rotate-90 group-hover:scale-110'
        )}
        strokeWidth={2.6}
      />
    </motion.div>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} aria-label={label}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-label={label} className="outline-none">
      {content}
    </button>
  );
}

/**
 * Tarjeta Hero con corte curvo orgánico (Scoop Notch) y botón circular flotante para el Sidebar extendido.
 */
export function SidebarScoopHero({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  return (
    <div className="relative mx-1.5 my-2 pt-5 pb-3 px-3.5 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.02] shadow-[0_8px_24px_rgba(0,0,0,0.3)] overflow-visible">
      {/* Botón circular flotante centrado sobre la hendidura superior */}
      <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-20">
        <ElevatedCircularButton
          href="/dashboard/nuevo"
          onClick={onNavigate}
          icon={Plus}
          label="Crear nuevo análisis con IA"
          size="md"
        />
      </div>

      <div className="pt-2 text-center space-y-1">
        <Link
          href="/dashboard/nuevo"
          onClick={onNavigate}
          className="group block"
        >
          <span className="block text-xs font-sans font-bold text-white group-hover:text-orange-300 transition-colors tracking-tight">
            Nuevo Análisis IA
          </span>
          <span className="block text-[11px] font-sans text-zinc-400 font-normal">
            Validar producto o negocio
          </span>
        </Link>
      </div>
    </div>
  );
}

/**
 * Barra flotante inferior para dispositivos móviles (inspirada 1:1 en la imagen de referencia).
 * Incluye el corte curvo cóncavo orgánico y el botón circular flotante central.
 */
export function MobileCurvedBottomDock({
  onOpenDrawer,
}: {
  onOpenDrawer?: () => void;
}) {
  const pathname = usePathname();

  const navItems = [
    { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard, exact: true },
    { href: '/dashboard/progreso', label: 'Cerebros', icon: Sparkles, exact: false },
    // El centro está reservado para el botón circular flotante (+)
    { href: '/dashboard/herramientas', label: 'Herramientas', icon: Wrench, exact: false },
    { href: '/dashboard/perfil', label: 'Perfil', icon: User, exact: false },
  ];

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <nav
      aria-label="Navegación principal móvil"
      className="fixed bottom-3 inset-x-3 z-40 lg:hidden pointer-events-auto max-w-md mx-auto"
    >
      <div className="relative">
        {/* Superficie SVG con corte curvo orgánico idéntico a la imagen */}
        <svg
          viewBox="0 0 380 64"
          preserveAspectRatio="none"
          className="w-full h-16 drop-shadow-[0_12px_32px_rgba(0,0,0,0.65)]"
        >
          <path
            d={generateScoopPath(380, 64, 190, 78, 26, 28)}
            fill="#0C101A"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="1.2"
          />
        </svg>

        {/* Botón Circular Elevado Central (+) en el Scoop Notch */}
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-20">
          <ElevatedCircularButton
            href="/dashboard/nuevo"
            icon={Plus}
            label="Nuevo Análisis"
            size="md"
          />
        </div>

        {/* Fila de Iconos de Navegación */}
        <div className="absolute inset-0 flex items-center justify-between px-6 z-10">
          {/* Lado izquierdo (2 items) */}
          <div className="flex items-center gap-7">
            {navItems.slice(0, 2).map((item) => {
              const active = isActive(item.href, item.exact);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group relative p-2 flex flex-col items-center justify-center outline-none"
                  aria-label={item.label}
                >
                  <Icon
                    className={cn(
                      'w-5 h-5 transition-transform duration-200 group-hover:scale-115 active:scale-90',
                      active ? 'text-emerald-400' : 'text-zinc-400 group-hover:text-white'
                    )}
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                  {active && (
                    <motion.span
                      layoutId="mobile-dock-dot"
                      className="absolute -bottom-1 w-1 h-1 rounded-full bg-emerald-400"
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Espaciador central para dar cabida al botón circular */}
          <div className="w-14" />

          {/* Lado derecho (2 items) */}
          <div className="flex items-center gap-7">
            {navItems.slice(2, 4).map((item) => {
              const active = isActive(item.href, item.exact);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group relative p-2 flex flex-col items-center justify-center outline-none"
                  aria-label={item.label}
                >
                  <Icon
                    className={cn(
                      'w-5 h-5 transition-transform duration-200 group-hover:scale-115 active:scale-90',
                      active ? 'text-emerald-400' : 'text-zinc-400 group-hover:text-white'
                    )}
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                  {active && (
                    <motion.span
                      layoutId="mobile-dock-dot"
                      className="absolute -bottom-1 w-1 h-1 rounded-full bg-emerald-400"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
