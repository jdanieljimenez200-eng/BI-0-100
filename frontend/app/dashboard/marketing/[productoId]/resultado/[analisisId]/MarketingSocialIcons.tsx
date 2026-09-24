'use client';

import React from 'react';

// ─── SVGs de Plataformas Sociales Oficiales ───────────────────────────────────

export function IconYouTube({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function IconInstagram({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function IconTikTok({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.49 6.27 6.27 0 0 0 1.95-4.48V8.62a8.28 8.28 0 0 0 4.82 1.52v-3.45z" />
    </svg>
  );
}

export function IconFacebook({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function IconWhatsApp({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.978-.276-.1-.477-.15-.678.15-.2.301-.777.978-.953 1.178-.175.2-.351.226-.652.075-.301-.15-1.272-.469-2.423-1.496-.896-.799-1.501-1.786-1.677-2.087-.176-.301-.019-.464.132-.614.136-.135.301-.351.452-.527.15-.176.2-.301.301-.502.1-.2.05-.376-.025-.527-.075-.15-.678-1.634-.929-2.238-.244-.588-.493-.509-.678-.518l-.577-.01c-.2 0-.527.075-.803.376s-1.054 1.029-1.054 2.509c0 1.48 1.079 2.909 1.229 3.109.151.2 2.124 3.243 5.146 4.549.719.311 1.28.497 1.718.636.722.23 1.378.197 1.898.12.579-.086 1.78-.727 2.03-1.43.251-.703.251-1.305.176-1.43-.076-.126-.277-.2-.578-.351zM12.042.001C5.394.001.002 5.393.002 12.04c0 2.124.554 4.197 1.606 6.02L.002 24l6.102-1.6c1.769.965 3.766 1.474 5.938 1.474 6.649 0 12.041-5.392 12.041-12.04C24.083 5.393 18.691.001 12.042.001zm0 22.041c-1.849 0-3.662-.497-5.243-1.436l-.376-.223-3.896 1.022 1.04-3.799-.245-.39A9.972 9.972 0 0 1 2.04 12.04c0-5.515 4.486-10.002 10.002-10.002 5.516 0 10.002 4.487 10.002 10.002 0 5.516-4.486 10.002-10.002 10.002z" />
    </svg>
  );
}

export function IconLinkedIn({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
    </svg>
  );
}

export function IconTwitterX({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function IconPinterest({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345-.09.375-.293 1.199-.334 1.369-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146 1.124.347 2.317.535 3.554.535 6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z" />
    </svg>
  );
}

export function IconGoogleAds({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

export function IconTelegram({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export function IconThreads({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.186 24C5.467 24 0 18.533 0 11.814 0 5.095 5.467-.372 12.186-.372c6.645 0 12.062 5.342 12.186 11.986h-2.911c-.12-4.97-4.14-8.991-9.275-8.991-5.185 0-9.406 4.221-9.406 9.406s4.221 9.406 9.406 9.406c3.784 0 7.026-2.228 8.472-5.465l2.67 1.157C20.932 21.366 16.892 24 12.186 24z" />
    </svg>
  );
}

export function IconDefaultChannel({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

// ─── Normalizador y Metadatos de Plataformas ──────────────────────────────────

export interface PlatformMeta {
  key: string;
  name: string;
  emoji?: string;
  badge: string;
  color: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  icon: (props: { className?: string }) => React.ReactElement;
}

export function getPlatformMeta(rawName?: string | null): PlatformMeta {
  const norm = (rawName || '').trim().toLowerCase();

  if (norm.includes('youtube') || norm === 'yt') {
    return {
      key: 'youtube',
      name: norm.includes('short') ? 'YouTube Shorts' : 'YouTube',
      emoji: '',
      badge: 'YT',
      color: '#FF0000',
      bgClass: 'bg-red-500/15',
      borderClass: 'border-red-500/40',
      textClass: 'text-red-400',
      icon: IconYouTube,
    };
  }

  if (norm.includes('instagram') || norm.includes('reel') || norm === 'ig') {
    return {
      key: 'instagram',
      name: norm.includes('reel') ? 'Instagram Reels' : 'Instagram',
      emoji: '',
      badge: 'IG',
      color: '#E1306C',
      bgClass: 'bg-pink-500/15',
      borderClass: 'border-pink-500/40',
      textClass: 'text-pink-400',
      icon: IconInstagram,
    };
  }

  if (norm.includes('tiktok') || norm === 'tt') {
    return {
      key: 'tiktok',
      name: 'TikTok',
      emoji: '',
      badge: 'TT',
      color: '#00F2FE',
      bgClass: 'bg-cyan-500/15',
      borderClass: 'border-cyan-500/40',
      textClass: 'text-cyan-300',
      icon: IconTikTok,
    };
  }

  if (norm.includes('facebook') || norm === 'fb') {
    return {
      key: 'facebook',
      name: 'Facebook',
      emoji: '',
      badge: 'FB',
      color: '#1877F2',
      bgClass: 'bg-blue-500/15',
      borderClass: 'border-blue-500/40',
      textClass: 'text-blue-400',
      icon: IconFacebook,
    };
  }

  if (norm.includes('whatsapp') || norm === 'wa') {
    return {
      key: 'whatsapp',
      name: 'WhatsApp',
      emoji: '',
      badge: 'WA',
      color: '#25D366',
      bgClass: 'bg-emerald-500/15',
      borderClass: 'border-emerald-500/40',
      textClass: 'text-emerald-400',
      icon: IconWhatsApp,
    };
  }

  if (norm.includes('linkedin') || norm === 'li') {
    return {
      key: 'linkedin',
      name: 'LinkedIn',
      emoji: '',
      badge: 'LI',
      color: '#0A66C2',
      bgClass: 'bg-sky-500/15',
      borderClass: 'border-sky-500/40',
      textClass: 'text-sky-400',
      icon: IconLinkedIn,
    };
  }

  if (norm.includes('twitter') || norm === 'x' || norm === 'tw') {
    return {
      key: 'x',
      name: 'X (Twitter)',
      emoji: '',
      badge: 'X',
      color: '#E7E9EA',
      bgClass: 'bg-slate-500/15',
      borderClass: 'border-slate-500/40',
      textClass: 'text-slate-300',
      icon: IconTwitterX,
    };
  }

  if (norm.includes('pinterest') || norm === 'pt') {
    return {
      key: 'pinterest',
      name: 'Pinterest',
      emoji: '',
      badge: 'PT',
      color: '#E60023',
      bgClass: 'bg-red-500/15',
      borderClass: 'border-red-500/40',
      textClass: 'text-red-400',
      icon: IconPinterest,
    };
  }

  if (norm.includes('google') || norm.includes('ads') || norm.includes('sem')) {
    return {
      key: 'google',
      name: 'Google Ads',
      emoji: '',
      badge: 'GA',
      color: '#4285F4',
      bgClass: 'bg-blue-500/15',
      borderClass: 'border-blue-500/40',
      textClass: 'text-blue-400',
      icon: IconGoogleAds,
    };
  }

  if (norm.includes('telegram') || norm === 'tg') {
    return {
      key: 'telegram',
      name: 'Telegram',
      emoji: '',
      badge: 'TG',
      color: '#229ED9',
      bgClass: 'bg-sky-500/15',
      borderClass: 'border-sky-500/40',
      textClass: 'text-sky-400',
      icon: IconTelegram,
    };
  }

  if (norm.includes('threads') || norm === 'th') {
    return {
      key: 'threads',
      name: 'Threads',
      emoji: '',
      badge: 'TH',
      color: '#FFFFFF',
      bgClass: 'bg-zinc-500/15',
      borderClass: 'border-zinc-500/40',
      textClass: 'text-zinc-300',
      icon: IconThreads,
    };
  }

  if (norm.includes('email') || norm.includes('correo') || norm.includes('newsletter')) {
    return {
      key: 'email',
      name: 'Email Marketing',
      emoji: '',
      badge: 'EM',
      color: '#F59E0B',
      bgClass: 'bg-amber-500/15',
      borderClass: 'border-amber-500/40',
      textClass: 'text-amber-400',
      icon: IconDefaultChannel,
    };
  }

  // Fallback
  return {
    key: 'general',
    name: rawName || 'Canal Digital',
    emoji: '',
    badge: (rawName || 'SM').slice(0, 2).toUpperCase(),
    color: '#8B5CF6',
    bgClass: 'bg-purple-500/15',
    borderClass: 'border-purple-500/40',
    textClass: 'text-purple-400',
    icon: IconDefaultChannel,
  };
}

// ─── Componente Badge de Plataforma ──────────────────────────────────────────

interface PlatformBadgeProps {
  plataforma?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showEmoji?: boolean;
  showName?: boolean;
  className?: string;
}

export function PlatformBadge({
  plataforma,
  size = 'sm',
  showIcon = true,
  showEmoji = false,
  showName = true,
  className = '',
}: PlatformBadgeProps) {
  const meta = getPlatformMeta(plataforma);
  const IconComponent = meta.icon;

  const sizeClasses = {
    xs: 'text-[9px] px-1.5 py-0.5 gap-1 rounded',
    sm: 'text-[11px] px-2.5 py-1 gap-1.5 rounded-lg',
    md: 'text-[13px] px-3.5 py-1.5 gap-2 rounded-xl font-bold',
    lg: 'text-sm px-4 py-2 gap-2.5 rounded-2xl font-black',
  }[size];

  const iconSizes = {
    xs: 'w-2.5 h-2.5',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  return (
    <span
      className={`inline-flex items-center border transition-all duration-200 ${meta.bgClass} ${meta.borderClass} ${meta.textClass} ${sizeClasses} ${className}`}
      title={meta.name}
    >
      {showIcon && (
        <span className="flex-shrink-0">
          <IconComponent className={iconSizes} />
        </span>
      )}
      {showEmoji && meta.emoji && (
        <span className="leading-none select-none text-[110%]" aria-hidden="true">
          {meta.emoji}
        </span>
      )}
      {showName && (
        <span className="font-semibold tracking-wide truncate">{meta.name}</span>
      )}
    </span>
  );
}
