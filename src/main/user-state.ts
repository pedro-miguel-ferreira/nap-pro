import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

/**
 * App-level state stored at `~/.nap-pro/state.json` — survives across project
 * switches and Electron restarts. Holds the recent-projects list rendered on
 * the landing screen.
 *
 * Visible to plain `ls ~/.nap-pro/` so it's easy to inspect / hand-edit when
 * something looks off. Avoided `app.getPath('userData')` deliberately because
 * Mac hides it under `~/Library/Application Support/` which slows debugging.
 */

/**
 * Override the state directory via `NAP_PRO_STATE_DIR` env var. Useful for
 * tests (point at a temp dir) without monkey-patching the module.
 */
function getStateDir(): string {
  return process.env['NAP_PRO_STATE_DIR'] || path.join(os.homedir(), '.nap-pro');
}

function getStateFile(): string {
  return path.join(getStateDir(), 'state.json');
}

export interface RecentProject {
  /** Absolute path to the project root (where `.nap/` lives). */
  path: string;
  /** Display name — defaults to the basename of `path`. */
  displayName: string;
  /** Unix millis. Used to sort the recent list newest-first. */
  lastOpenedAt: number;
}

export interface UserState {
  recentProjects: RecentProject[];
}

const EMPTY_STATE: UserState = { recentProjects: [] };
const MAX_RECENT = 20;

/** Read the user-state file. Missing or malformed → returns empty state. */
export async function readUserState(): Promise<UserState> {
  try {
    const text = await fsPromises.readFile(getStateFile(), 'utf-8');
    const parsed = JSON.parse(text) as Partial<UserState>;
    return {
      recentProjects: Array.isArray(parsed.recentProjects)
        ? parsed.recentProjects.filter(isValidRecent)
        : [],
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

/** Persist the user state. Creates `~/.nap-pro/` if missing. */
export async function writeUserState(state: UserState): Promise<void> {
  await fsPromises.mkdir(getStateDir(), { recursive: true });
  await fsPromises.writeFile(getStateFile(), JSON.stringify(state, null, 2) + '\n');
}

/**
 * Bump a project to the top of the recent list, capping at MAX_RECENT.
 * Idempotent — same path twice keeps a single entry with refreshed timestamp.
 */
export async function recordProjectOpen(projectPath: string): Promise<void> {
  const state = await readUserState();
  const filtered = state.recentProjects.filter((p) => p.path !== projectPath);
  const next: RecentProject = {
    path: projectPath,
    displayName: path.basename(projectPath),
    lastOpenedAt: Date.now(),
  };
  state.recentProjects = [next, ...filtered].slice(0, MAX_RECENT);
  await writeUserState(state);
}

/** Drop a project from the recent list (e.g. user clicked the X). */
export async function forgetProject(projectPath: string): Promise<void> {
  const state = await readUserState();
  state.recentProjects = state.recentProjects.filter((p) => p.path !== projectPath);
  await writeUserState(state);
}

/** Exposed for tests. */
export const _internals = {
  getStateDir,
  getStateFile,
  MAX_RECENT,
};

function isValidRecent(p: unknown): p is RecentProject {
  if (!p || typeof p !== 'object') return false;
  const r = p as Record<string, unknown>;
  return (
    typeof r.path === 'string' &&
    typeof r.displayName === 'string' &&
    typeof r.lastOpenedAt === 'number'
  );
}
