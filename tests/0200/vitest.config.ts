import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/0200/**/*.test.ts'],
    setupFiles: ['tests/0200/setup.ts'],
  },
});
