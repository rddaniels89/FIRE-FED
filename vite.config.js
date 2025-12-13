import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          reactVendor: ['react', 'react-dom', 'react-router-dom'],
          supabaseVendor: ['@supabase/supabase-js'],
          chartsVendor: ['chart.js', 'react-chartjs-2'],
          telemetryVendor: ['@sentry/react', 'posthog-js'],
          jspdfVendor: ['jspdf'],
          html2canvasVendor: ['html2canvas'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    restoreMocks: true,
    clearMocks: true,
    exclude: [
      'tests/e2e/**',
      'playwright-report/**',
      'test-results/**',
      'node_modules/**',
    ],
  },
})
