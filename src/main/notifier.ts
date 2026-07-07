import { Notification } from 'electron';
import type { BrowserWindow } from 'electron';

/**
 * System notifications for the moments that matter when the app isn't
 * focused: a run finishing (either way), a stage stalling, an agent blocked
 * on a permission approval. Clicking a notification focuses the window.
 *
 * Disabled in NAP_TEST so Playwright runs never post to the user's
 * notification center.
 */

let targetWindow: BrowserWindow | null = null;
let notificationsEnabled = false;

export function initNotifier(win: BrowserWindow, opts: { enabled: boolean }): void {
  targetWindow = win;
  notificationsEnabled = opts.enabled;
}

export function notify(title: string, body: string): void {
  if (!notificationsEnabled || !Notification.isSupported()) return;
  const notification = new Notification({ title, body });
  notification.on('click', () => {
    if (targetWindow && !targetWindow.isDestroyed()) {
      if (targetWindow.isMinimized()) targetWindow.restore();
      targetWindow.show();
      targetWindow.focus();
    }
  });
  notification.show();
}
