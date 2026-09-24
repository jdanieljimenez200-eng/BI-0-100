/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#2C3E50',
          accent:  '#E74C3C',
          light:   '#ECF0F1',
          gold:    '#D4AF37',
          green:   '#27AE60',
        },
        // Sidebar oscuro semi-lujo
        sidebar: '#1A252F',
        canvas:  '#070E17',
        surface: '#0F1C2A',
        // Módulos — color, dark, light, muted.
        // FUENTE CANÓNICA: lib/moduleTheme.ts (`MODULE_THEME[x].hex`). Estos
        // tokens son el espejo estático para Tailwind; si cambia el hex allí,
        // hay que cambiarlo aquí. No introducir un tercer sistema de color.
        mercado: {
          DEFAULT: '#22D3EE',
          dark:    '#0E7490',
          light:   '#ECFEFF',
          muted:   '#A5F3FC',
        },
        marketing: {
          DEFAULT: '#F472B6',
          dark:    '#BE185D',
          light:   '#FDF2F8',
          muted:   '#FBCFE8',
        },
        ventas: {
          DEFAULT: '#FB923C',
          dark:    '#C2410C',
          light:   '#FFF7ED',
          muted:   '#FED7AA',
        },
        finanzas: {
          DEFAULT: '#34D399',
          dark:    '#047857',
          light:   '#ECFDF5',
          muted:   '#A7F3D0',
        },
        legal: {
          DEFAULT: '#A78BFA',
          dark:    '#6D28D9',
          light:   '#F5F3FF',
          muted:   '#DDD6FE',
        },
        ink: {
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
          500: '#64748B',
          300: '#CBD5E1',
          100: '#F1F5F9',
          50:  '#F8FAFC',
        },
      },
      fontFamily: {
        sans:    ['var(--font-tesla)', 'var(--font-jakarta)', 'Montserrat', 'system-ui', 'sans-serif'],
        display: ['var(--font-tesla)', 'var(--font-title)', 'Montserrat', 'system-ui', 'sans-serif'],
        title:   ['var(--font-tesla)', 'var(--font-title)', 'Montserrat', 'system-ui', 'sans-serif'],
        tesla:   ['var(--font-tesla)', 'Montserrat', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-mono)', 'DM Mono', 'ui-monospace', 'monospace'],
        serif:   ['var(--font-serif)', 'Playfair Display', 'Georgia', 'serif'],
      },
      /* Radios semánticos. Se resuelven vía custom properties definidas en
         app/globals.css, que el ThemeProvider re-tintea con data-radio.
         La escala numérica de Tailwind (rounded-lg/xl/2xl…) se deja intacta
         a propósito para no alterar pantallas fuera de alcance. */
      borderRadius: {
        control: 'var(--radius-control)',
        surface: 'var(--radius-surface)',
        pill:    'var(--radius-pill)',
      },
      /* Escala de elevación de 4 niveles, calibrada para lienzo oscuro.
         card / card-md / card-lg quedan como alias de compatibilidad. */
      boxShadow: {
        surface:  'var(--shadow-surface)',
        elevated: 'var(--shadow-elevated)',
        floating: 'var(--shadow-floating)',
        modal:    'var(--shadow-modal)',
        card:     'var(--shadow-surface)',
        'card-md':'var(--shadow-elevated)',
        'card-lg':'var(--shadow-floating)',
        'glow-blue':   '0 0 20px rgba(59,130,246,.2)',
        'glow-violet': '0 0 20px rgba(139,92,246,.2)',
        'glow-cyan':   '0 0 20px rgba(6,182,212,.2)',
        'glow-green':  '0 0 20px rgba(16,185,129,.2)',
      },
      backgroundImage: {
        'gradient-sidebar':    'linear-gradient(180deg,#1A252F 0%,#0F1C26 100%)',
        'gradient-hero':       'linear-gradient(135deg,#2C3E50 0%,#1A252F 100%)',
        'gradient-accent':     'linear-gradient(135deg,#E74C3C 0%,#C0392B 100%)',
        'gradient-mercado':    'linear-gradient(135deg,#22D3EE 0%,#0E7490 100%)',
        'gradient-marketing':  'linear-gradient(135deg,#F472B6 0%,#BE185D 100%)',
        'gradient-ventas':     'linear-gradient(135deg,#FB923C 0%,#C2410C 100%)',
        'gradient-finanzas':   'linear-gradient(135deg,#34D399 0%,#047857 100%)',
        'gradient-legal':      'linear-gradient(135deg,#A78BFA 0%,#6D28D9 100%)',
      },
      animation: {
        'fade-in':   'fadeIn .25s ease-out',
        'slide-up':  'slideUp .3s ease-out',
        'slide-in':  'slideIn .25s ease-out',
        'pulse-soft':'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from:{opacity:0},               to:{opacity:1} },
        slideUp:   { from:{opacity:0,transform:'translateY(12px)'}, to:{opacity:1,transform:'translateY(0)'} },
        slideIn:   { from:{opacity:0,transform:'translateX(-12px)'},to:{opacity:1,transform:'translateX(0)'} },
        pulseSoft: { '0%,100%':{opacity:1}, '50%':{opacity:.6} },
      },
    },
  },
  plugins: [],
};
