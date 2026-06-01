import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  readUserState,
  writeUserState,
  recordProjectOpen,
  forgetProject,
  _internals,
} from '../src/main/user-state';

const ORIG_ENV = process.env['NAP_PRO_STATE_DIR'];
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-state-test-'));
  process.env['NAP_PRO_STATE_DIR'] = tmpDir;
});

afterEach(() => {
  if (ORIG_ENV === undefined) {
    delete process.env['NAP_PRO_STATE_DIR'];
  } else {
    process.env['NAP_PRO_STATE_DIR'] = ORIG_ENV;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readUserState', () => {
  it('returns empty state when no file exists', async () => {
    const state = await readUserState();
    expect(state.recentProjects).toEqual([]);
  });

  it('returns empty state when the file is malformed', async () => {
    await fsPromises.writeFile(path.join(tmpDir, 'state.json'), 'not json');
    const state = await readUserState();
    expect(state.recentProjects).toEqual([]);
  });

  it('filters out malformed recent entries', async () => {
    await fsPromises.writeFile(
      path.join(tmpDir, 'state.json'),
      JSON.stringify({
        recentProjects: [
          { path: '/good', displayName: 'good', lastOpenedAt: 1 },
          { path: '/no-name', lastOpenedAt: 2 }, // missing displayName
          'totally-bogus',
        ],
      }),
    );
    const state = await readUserState();
    expect(state.recentProjects).toHaveLength(1);
    expect(state.recentProjects[0].path).toBe('/good');
  });
});

describe('writeUserState', () => {
  it('creates the state dir if missing', async () => {
    process.env['NAP_PRO_STATE_DIR'] = path.join(tmpDir, 'nested', 'deeper');
    expect(fs.existsSync(path.join(tmpDir, 'nested'))).toBe(false);

    await writeUserState({ recentProjects: [] });

    expect(fs.existsSync(path.join(tmpDir, 'nested', 'deeper', 'state.json'))).toBe(true);
  });

  it('round-trips state through write + read', async () => {
    const input = {
      recentProjects: [
        { path: '/x', displayName: 'x', lastOpenedAt: 1000 },
        { path: '/y', displayName: 'y', lastOpenedAt: 2000 },
      ],
    };
    await writeUserState(input);
    const back = await readUserState();
    expect(back).toEqual(input);
  });
});

describe('recordProjectOpen', () => {
  it('prepends a new project to the recent list', async () => {
    await recordProjectOpen('/Users/x/proj-a');
    const state = await readUserState();
    expect(state.recentProjects).toHaveLength(1);
    expect(state.recentProjects[0].path).toBe('/Users/x/proj-a');
    expect(state.recentProjects[0].displayName).toBe('proj-a');
  });

  it('bumps an existing project to the top instead of duplicating', async () => {
    await recordProjectOpen('/a');
    await recordProjectOpen('/b');
    await recordProjectOpen('/a'); // re-open
    const state = await readUserState();
    expect(state.recentProjects.map((p) => p.path)).toEqual(['/a', '/b']);
  });

  it('caps the list at MAX_RECENT', async () => {
    for (let i = 0; i < _internals.MAX_RECENT + 5; i++) {
      await recordProjectOpen(`/proj-${i}`);
    }
    const state = await readUserState();
    expect(state.recentProjects).toHaveLength(_internals.MAX_RECENT);
    // Most-recent first
    expect(state.recentProjects[0].path).toBe(`/proj-${_internals.MAX_RECENT + 4}`);
  });
});

describe('forgetProject', () => {
  it('removes the project from the recent list', async () => {
    await recordProjectOpen('/keep');
    await recordProjectOpen('/drop');
    await forgetProject('/drop');
    const state = await readUserState();
    expect(state.recentProjects.map((p) => p.path)).toEqual(['/keep']);
  });

  it('is a no-op when the project is not in the list', async () => {
    await recordProjectOpen('/keep');
    await forgetProject('/never-was-there');
    const state = await readUserState();
    expect(state.recentProjects).toHaveLength(1);
  });
});
