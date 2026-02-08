import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    root: './src',
    include: ['**/__tests__/**/*.ts', '**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      include: ['**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.test.ts', '**/*.spec.ts', 'test/**'],
    },
    setupFiles: ['./test/setup.ts'],
  },
});
