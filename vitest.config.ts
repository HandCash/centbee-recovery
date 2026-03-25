import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'lib/**/*.spec.ts',
      'lib/**/*.spec.tsx',
      'app/**/*.spec.ts',
      'app/**/*.spec.tsx',
      '__tests__/**/*.spec.ts',
      '__tests__/**/*.spec.tsx',
    ],
    exclude: ['node_modules', '.next', 'e2e'],
    coverage: {
      provider: 'v8',
      include: [
        'lib/wallet/**/*.ts',
        'app/components/**/*.tsx',
        'app/start/**/*.tsx',
      ],
      exclude: [
        'lib/wallet/wordlists/**',
        'lib/wallet/types/**',
        '**/*.spec.ts',
        '**/*.spec.tsx',
      ],
      thresholds: {
        lines: 80,
        functions: 70,
        branches: 70,
        statements: 80,
      },
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
