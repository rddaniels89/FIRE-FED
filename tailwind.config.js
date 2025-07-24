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
          50: '#fefbf3',
          100: '#fdf4e1',
          200: '#fae6c3',
          300: '#f6d199',
          400: '#f0b56d',
          500: '#e99c47',
          600: '#d88635',
          700: '#b56d2b',
          800: '#925729',
          900: '#784925',
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
        'sans': ['Inter', 'Open Sans', 'system-ui', 'sans-serif'],
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