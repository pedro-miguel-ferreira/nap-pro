import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  DEFAULT_PERMISSIONS_SETTINGS,
  ensurePermissionsSettingsFile,
} from '../src/main/permissions-config';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nap-perms-test-'));
}

describe('ensurePermissionsSettingsFile', () => {
  it('seeds defaults when the file does not exist', async () => {
    const cwd = makeTmpDir();
    const p = await ensurePermissionsSettingsFile(cwd);
    expect(p).toBe(path.join(cwd, '.nap', 'permissions.json'));
    const body = JSON.parse(await fsPromises.readFile(p, 'utf-8'));
    expect(body).toEqual(DEFAULT_PERMISSIONS_SETTINGS);
  });

  it('does NOT overwrite an existing file (user edits are authoritative)', async () => {
    const cwd = makeTmpDir();
    const napDir = path.join(cwd, '.nap');
    await fsPromises.mkdir(napDir, { recursive: true });
    const settingsPath = path.join(napDir, 'permissions.json');
    const userEdited = {
      permissions: {
        defaultMode: 'acceptEdits',
        deny: ['Bash(curl:*)'],
      },
    };
    await fsPromises.writeFile(settingsPath, JSON.stringify(userEdited));

    const p = await ensurePermissionsSettingsFile(cwd);
    expect(p).toBe(settingsPath);
    const after = JSON.parse(await fsPromises.readFile(p, 'utf-8'));
    expect(after).toEqual(userEdited);
  });

  it('creates .nap/ if missing', async () => {
    const cwd = makeTmpDir();
    // Confirm pre-state
    expect(fs.existsSync(path.join(cwd, '.nap'))).toBe(false);
    await ensurePermissionsSettingsFile(cwd);
    expect(fs.existsSync(path.join(cwd, '.nap'))).toBe(true);
  });
});

describe('DEFAULT_PERMISSIONS_SETTINGS', () => {
  it('uses bypassPermissions as the default mode', () => {
    expect(DEFAULT_PERMISSIONS_SETTINGS.permissions.defaultMode).toBe('bypassPermissions');
  });

  it('denies PR merge + close', () => {
    const deny = DEFAULT_PERMISSIONS_SETTINGS.permissions.deny ?? [];
    expect(deny).toContain('Bash(gh pr merge:*)');
    expect(deny).toContain('Bash(gh pr close:*)');
  });

  it('asks (not denies) for recursive folder removal', () => {
    const ask = DEFAULT_PERMISSIONS_SETTINGS.permissions.ask ?? [];
    expect(ask).toContain('Bash(rm -rf:*)');
    expect(ask).toContain('Bash(rmdir:*)');
  });
});
