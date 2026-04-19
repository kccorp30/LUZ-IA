/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./src/**/*.{html,js}"
  ],
  theme: {
    extend: {
      // ── PALETA LUZ IA ── identidad street food premium
      colors: {
        // Fondos profundos con personalidad
        bg: {
          base: '#0a0710',      // negro violáceo profundo
          surface: '#13101d',   // superficie nivel 1
          elevated: '#1a1628',  // superficie nivel 2
          overlay: '#221d33',   // superficie nivel 3
        },
        // Acento principal — naranja ámbar street food
        brand: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',  // principal
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
        // Acento secundario — violeta IA (para LUZ)
        luz: {
          50:  '#f3f1ff',
          100: '#ebe5ff',
          200: '#d9ceff',
          300: '#bea6ff',
          400: '#9f75ff',
          500: '#8547ff',  // principal
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        // Estados — verde éxito
        success: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        // Estados — rojo peligro/alerta
        danger: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
        // Estados — amber advertencia
        warning: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        // Glass / transparencias
        glass: {
          white: 'rgba(255,255,255,0.06)',
          light: 'rgba(255,255,255,0.10)',
          strong: 'rgba(255,255,255,0.14)',
          border: 'rgba(255,255,255,0.10)',
          'border-strong': 'rgba(255,255,255,0.18)',
        },
      },
      // ── TIPOGRAFÍA ── distintiva, no genérica
      fontFamily: {
        // Display — bold, condensada, street food energy
        display: ['"Barlow Condensed"', 'Impact', 'sans-serif'],
        // Body — humanista, legible, premium
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        // Mono — para precios, IDs, stats
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        // Brand — para LUZ IA y headers especiales
        brand: ['"Syne"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        'display-sm': ['2rem',   { lineHeight: '2.25rem', letterSpacing: '-0.02em', fontWeight: '800' }],
        'display':    ['2.75rem',{ lineHeight: '2.75rem', letterSpacing: '-0.03em', fontWeight: '900' }],
        'display-lg': ['3.5rem', { lineHeight: '3.5rem',  letterSpacing: '-0.03em', fontWeight: '900' }],
      },
      letterSpacing: {
        'tightest': '-0.04em',
        'widest-plus': '0.18em',
      },
      // ── BORDES ── consistencia en toda la app
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      // ── SOMBRAS ── profundidad y glow
      boxShadow: {
        'glow-brand':  '0 0 24px rgba(249,115,22,0.4), 0 0 60px rgba(249,115,22,0.15)',
        'glow-luz':    '0 0 24px rgba(133,71,255,0.45), 0 0 60px rgba(133,71,255,0.15)',
        'glow-success':'0 0 24px rgba(16,185,129,0.35)',
        'glow-danger': '0 0 24px rgba(239,68,68,0.4)',
        'card':        '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        'card-hover':  '0 16px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1)',
        'floating':    '0 24px 64px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12)',
        'inset-soft':  'inset 0 1px 0 rgba(255,255,255,0.08)',
      },
      // ── BACKDROP BLUR ── glassmorphism premium
      backdropBlur: {
        'xs': '4px',
        'xl2': '28px',
        'xl3': '40px',
      },
      // ── SPACING ── extra
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
      // ── ANIMACIONES ── premium motion
      animation: {
        // Entradas
        'fade-in':        'fadeIn 0.4s ease-out forwards',
        'fade-in-up':     'fadeInUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
        'fade-in-down':   'fadeInDown 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
        'scale-in':       'scaleIn 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
        'slide-up':       'slideUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards',
        'slide-down':     'slideDown 0.4s cubic-bezier(0.16,1,0.3,1) forwards',
        // Continuas
        'pulse-glow':     'pulseGlow 2s ease-in-out infinite',
        'pulse-ring':     'pulseRing 2.5s cubic-bezier(0.4,0,0.6,1) infinite',
        'shimmer':        'shimmer 2.5s linear infinite',
        'float':          'float 4s ease-in-out infinite',
        'blob-float':     'blobFloat 10s ease-in-out infinite',
        'spin-slow':      'spin 8s linear infinite',
        'bounce-sm':      'bounceSm 1.5s ease-in-out infinite',
        // Feedback
        'shake':          'shake 0.4s cubic-bezier(0.36,0.07,0.19,0.97)',
        'tada':           'tada 0.6s ease-in-out',
        // Loaders
        'skeleton':       'skeleton 1.8s ease-in-out infinite',
        'typing':         'typing 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:     { from: { opacity: '0' }, to: { opacity: '1' } },
        fadeInUp:   { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        fadeInDown: { from: { opacity: '0', transform: 'translateY(-16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:    { from: { opacity: '0', transform: 'scale(0.92)' }, to: { opacity: '1', transform: 'scale(1)' } },
        slideUp:    { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        slideDown:  { from: { transform: 'translateY(-100%)' }, to: { transform: 'translateY(0)' } },
        pulseGlow:  { '0%,100%': { boxShadow: '0 0 0 0 rgba(249,115,22,0.6)' }, '50%': { boxShadow: '0 0 0 16px rgba(249,115,22,0)' } },
        pulseRing:  { '0%': { transform: 'scale(0.95)', opacity: '0.6' }, '100%': { transform: 'scale(1.6)', opacity: '0' } },
        shimmer:    { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        float:      { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        blobFloat:  { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '33%': { transform: 'translate(30px,-40px) scale(1.08)' }, '66%': { transform: 'translate(-20px,25px) scale(0.95)' } },
        bounceSm:   { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-4px)' } },
        shake:      { '10%,90%': { transform: 'translateX(-2px)' }, '20%,80%': { transform: 'translateX(3px)' }, '30%,50%,70%': { transform: 'translateX(-6px)' }, '40%,60%': { transform: 'translateX(6px)' } },
        tada:       { '0%': { transform: 'scale(1)' }, '10%,20%': { transform: 'scale(0.94) rotate(-3deg)' }, '30%,50%,70%,90%': { transform: 'scale(1.1) rotate(3deg)' }, '40%,60%,80%': { transform: 'scale(1.1) rotate(-3deg)' }, '100%': { transform: 'scale(1)' } },
        skeleton:   { '0%,100%': { opacity: '0.4' }, '50%': { opacity: '0.8' } },
        typing:     { '0%,60%,100%': { transform: 'translateY(0)', opacity: '0.4' }, '30%': { transform: 'translateY(-6px)', opacity: '1' } },
      },
      // ── TRANSICIONES ── timing curves premium
      transitionTimingFunction: {
        'smooth':  'cubic-bezier(0.16, 1, 0.3, 1)',
        'bounce':  'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
      // ── BG GRADIENTES REUTILIZABLES ──
      backgroundImage: {
        'gradient-brand':   'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        'gradient-luz':     'linear-gradient(135deg, #8547ff 0%, #6d28d9 50%, #4f46e5 100%)',
        'gradient-success': 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        'gradient-danger':  'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        'gradient-mesh':    'radial-gradient(at 10% 0%, rgba(133,71,255,0.18) 0px, transparent 50%), radial-gradient(at 90% 10%, rgba(249,115,22,0.15) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(16,185,129,0.10) 0px, transparent 50%)',
        'shimmer-gradient': 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
