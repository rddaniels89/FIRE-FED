/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f4f8',
          100: '#d9e4f0',
          200: '#b6cde6',
          300: '#85a8d8',
          400: '#5b7fc7',
          500: '#3b5eb5',
          600: '#2e4a96',
          700: '#253d7a',
          800: '#1f3266',
          900: '#1a2b55',
        },
        gold: {
          50: '#fbf9f2',
          100: '#f5eeda',
          200: '#e9dcb4',
          300: '#d8c486',
          400: '#c5a95c',
          500: '#b3923f',
          600: '#977932',
          700: '#79612a',
          800: '#634e27',
          900: '#524123',
        },
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        }
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
      boxShadow: {
        // A fine border carries the edge; the shadow only lifts the surface off
        // the page. The previous shadow-md on every card, on top of a border,
        // read as heavy and uniform.
        soft: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        card: '0 1px 2px 0 rgb(15 23 42 / 0.03), 0 4px 12px -4px rgb(15 23 42 / 0.06)',
        lift: '0 2px 4px -1px rgb(15 23 42 / 0.05), 0 12px 28px -8px rgb(15 23 42 / 0.12)',
        inset: 'inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
} 