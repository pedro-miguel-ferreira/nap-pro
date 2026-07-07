import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import { makeTmpDir } from './helpers';

const APP_DIR = path.join(__dirname, '..');

test('app launches and window exists', async () => {
  // Isolated state dir — never touch the real ~/.nap-pro (recents list).
  const app = await electron.launch({
    args: [APP_DIR],
    env: { ...process.env, NAP_TEST: '1', NAP_PRO_STATE_DIR: path.join(makeTmpDir(), '.nap-pro-state') },
  });

  const window = await app.firstWindow();
  expect(window).toBeTruthy();

  const title = await window.title();
  expect(title).toBe('NAP v3');

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
