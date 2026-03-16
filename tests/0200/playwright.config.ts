import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 60000,
  retries: 0,
  workers: 1, // Electron tests must run sequentially
});
