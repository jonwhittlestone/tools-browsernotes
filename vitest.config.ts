import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    root: '.',
    include: [
      'src/**/__tests__/**/*.ts',
      'src/**/*.{test,spec}.ts',
      'web/**/__tests__/**/*.ts',
      'web/**/*.{test,spec}.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.test.ts', '**/*.spec.ts', 'test/**'],
    },
    setupFiles: ['./src/test/setup.ts'],
  },
});
