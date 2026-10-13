import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5199, strictPort: true },
  preview: { port: 5198, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    pool: 'threads',
    maxWorkers: 1,
  },
});
