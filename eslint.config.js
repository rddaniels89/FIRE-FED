import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    '.vite',
    'node_modules',
    'playwright-report',
    'test-results',
    'coverage',
    '.vercel',
    'devserver.log',
    'agent-tools',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // Node-only config files (not browser)
  {
    files: ['vite.config.js', 'playwright.config.js', 'postcss.config.js', 'tailwind.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Vercel serverless functions (Node runtime)
  {
    files: ['api/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Context files intentionally export hooks + providers; React Refresh rule is too strict here.
  {
    files: ['src/contexts/**/*.{js,jsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
