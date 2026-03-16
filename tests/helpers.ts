import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

export const APP_DIR = path.join(__dirname, '..');

/** Default Electron launch args for tests */
export const ELECTRON_LAUNCH_ARGS = [APP_DIR];

/** Wait for shell to produce at least one non-empty line (prompt ready) */
export async function waitForShellReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const id = (window as any).useTerminalStore?.getState()?.activeTerminalId;
      if (!id) return false;
      const entry = (window as any).getTerminal(id);
      if (!entry) return false;
      const buf = entry.terminal.buffer.active;
      for (let i = 0; i < buf.length; i++) {
        if (buf.getLine(i)?.translateToString().trim()) return true;
      }
      return false;
    },
    undefined,
    { timeout: 15_000 },
  );
}

/** Get active terminal ID from store */
export async function getActiveId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => (window as any).useTerminalStore.getState().activeTerminalId,
  );
}

/** Wait for text to appear anywhere in a terminal's xterm buffer */
export async function waitForText(
  page: Page,
  id: string,
  text: string,
  timeout = 10_000,
): Promise<void> {
  await page.waitForFunction(
    ([id, text]: [string, string]) => {
      const entry = (window as any).getTerminal(id);
      if (!entry) return false;
      const buf = entry.terminal.buffer.active;
      for (let i = 0; i < buf.length; i++) {
        if (buf.getLine(i)?.translateToString().includes(text)) return true;
      }
      return false;
    },
    [id, text] as [string, string],
    { timeout },
  );
}

/** Create a new terminal via store, set it active, return its id */
export async function createTerminal(page: Page, name: string): Promise<string> {
  return page.evaluate((n) => {
    const store = (window as any).useTerminalStore;
    const id = store.getState().createTerminal(n);
    store.getState().setActive(id);
    return id;
  }, name);
}

/** Write data to a terminal's pty */
export async function ptyWrite(page: Page, id: string, data: string): Promise<void> {
  await page.evaluate(
    ([tid, d]) => window.electronAPI.pty.write(tid, d),
    [id, data] as const,
  );
}

/** Read the active buffer length of a terminal */
export async function bufferLength(page: Page, id: string): Promise<number> {
  return page.evaluate((tid) => {
    const entry = (window as any).getTerminal(tid);
    return entry?.terminal.buffer.active.length ?? 0;
  }, id);
}

/** Read a specific line from a terminal's buffer */
export async function bufferLine(page: Page, id: string, lineIndex: number): Promise<string> {
  return page.evaluate(
    ([tid, idx]) => {
      const entry = (window as any).getTerminal(tid);
      return entry?.terminal.buffer.active.getLine(idx)?.translateToString(true) ?? '';
    },
    [id, lineIndex] as const,
  );
}

/** Get terminal metadata from store */
export async function getTerminalMeta(page: Page, id: string) {
  return page.evaluate(
    (tid) =>
      (window as any).useTerminalStore
        .getState()
        .terminals.find((t: any) => t.id === tid),
    id,
  );
}
