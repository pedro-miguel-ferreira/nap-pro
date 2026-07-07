import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join, resolve as pathResolve, sep as pathSep } from 'path';
import * as fsSync from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readUserState, recordProjectOpen, forgetProject } from './user-state';
import { scaffoldProject, findTemplatesDir } from './project-init';

const execFileAsync = promisify(execFile);

/**
 * Reject paths that point into system / OS-managed directories. Treats the
 * renderer as untrusted — any IPC handler that mkdirs or writes based on a
 * renderer-supplied path goes through here first.
 */
const FORBIDDEN_PARENT_ROOTS = [
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/var',
  '/System',
  '/Library',
  '/private/etc',
  '/private/var',
  '/dev',
  '/proc',
  '/sys',
];

function isPathUnderForbiddenRoot(p: string): boolean {
  const abs = pathResolve(p);
  return FORBIDDEN_PARENT_ROOTS.some(
    (root) => abs === root || abs.startsWith(root + pathSep),
  );
}

/**
 * True when `target` is inside (or equal to) `containerCwd`. Path-traversal
 * guard for `shell.openPath` — without it, the renderer could ask main to
 * reveal arbitrary filesystem locations.
 */
function isPathInside(target: string, containerCwd: string): boolean {
  const t = pathResolve(target);
  const c = pathResolve(containerCwd);
  return t === c || t.startsWith(c + pathSep);
}

/**
 * Pull a CLI-style override out of argv. Used by `app.relaunch({args})` so we
 * don't rely on env-var mutation propagating across the relaunch boundary
 * (Electron makes no guarantee that a mutated `process.env` is inherited by
 * the respawned process).
 */
function getArgvFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

/**
 * Switch the app to a different project: relaunch ourselves with `--nap-cwd
 * <path>` in argv. If agents are mid-flight, ask the user first — a hard
 * SIGTERM mid-workflow loses conversation state and leaves the registry in
 * an abandoned "running" state.
 */
async function switchProject(target: string): Promise<{ ok: boolean; message?: string }> {
  if (ptySpawner && ptySpawner.runningCount() > 0) {
    const choice = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Cancel', 'Switch anyway'],
      defaultId: 0,
      cancelId: 0,
      message: 'Agents are running.',
      detail:
        `Switching projects will terminate ${ptySpawner.runningCount()} running agent(s) and ` +
        `abandon any in-flight workflows. Their conversation state will be lost.`,
    });
    if (choice.response !== 1) {
      return { ok: false, message: 'cancelled' };
    }
  }
  // Strip any prior --nap-cwd from argv so we don't accumulate them on repeat switches.
  const cleaned = stripArgvFlag(process.argv.slice(1), '--nap-cwd');
  app.relaunch({ args: [...cleaned, '--nap-cwd', target] });
  app.quit();
  return { ok: true };
}

function stripArgvFlag(argv: string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag) {
      i++; // skip flag value too
      continue;
    }
    out.push(argv[i]);
  }
  return out;
}
import { createModel } from './model';
import { NodeFileSystem } from './filesystem';
import { NodePtySpawner } from './node-pty-spawner';
import { startAgents, RESUME_FAIL_THRESHOLD_MS } from './coordinators';
import { startSocketServer, stopSocketServer } from './socket-server';
import { createRequestHandler } from './socket-handler';
import { setWriter, enqueue } from './message-queue';
import { initNotifier, notify } from './notifier';
import { getServerSocketPath } from '../shared/constants';
import type { AppSnapshot } from '../shared/bridge-types';
import { getHeadSha, getChangedFiles, getFileDiff } from './git-helpers';
import { ActivityLogger, type ActivityEvent } from './activity-log';
import {
  runWorkflow,
  resumeWorkflowRun,
  defaultTemplatePrompt,
  enumerateNapkinScaffolding,
} from './workflow-runner';
import { replayAgent } from './replay';
import { WorkflowRegistry } from './workflow-registry';
import { WorkflowWatcher } from './workflow-watcher';
import { computeStageStats } from './stage-stats';
import { getAgentCost, totalCost } from './cost-helpers';
import { validateIdentifier } from '../shared/identifiers';
import { validateWorkflow } from '../shared/workflow-validation';
import { buildClaudeArgs, setPermissionsSettingsPath } from './claude-args';
import { ensurePermissionsSettingsFile } from './permissions-config';
import { isResumeMissingSession } from './resume-detection';

let ptySpawner: NodePtySpawner | null = null;
// Module-level model ref — set inside app.whenReady once the project is
// loaded. Project-level IPC handlers (registered before whenReady) need
// access to the model to do worktree lookups, etc.
let projectModel: import('./model').NapModel | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1e1e1e',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  win.once('ready-to-show', () => {
    if (!process.env['NAP_TEST'] || process.env['HEADED']) win.show();
  });

  return win;
}

// ── Project-level IPC handlers (registered before any project is loaded) ──
//
// These power the landing screen and the "open another project" affordance.
// They don't depend on a running project so they're safe to register globally.
// Project switching is done by setting NAP_CWD on this process's env, calling
// app.relaunch(), then app.quit() — the new process boots into the picked
// project. Brief window flicker; cleaner than threading nullable state through
// every existing handler.

ipcMain.handle('project:list-recent', async () => {
  const state = await readUserState();
  return { recents: state.recentProjects };
});

ipcMain.handle('project:forget', async (_event, projectPath: string) => {
  await forgetProject(projectPath);
  return { ok: true };
});

ipcMain.handle('project:pick-dir', async (_event, opts: { title?: string } = {}) => {
  const result = await dialog.showOpenDialog({
    title: opts.title || 'Pick a folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false };
  return { ok: true, path: result.filePaths[0] };
});

ipcMain.handle('dialog:pick-files', async (_event, opts: { title?: string } = {}) => {
  // Native multi-select file picker — used by the spec-docs list so long
  // paths never have to be typed or pasted at all.
  const cwd = process.env['NAP_CWD'];
  const pickResult = await dialog.showOpenDialog({
    title: opts.title || 'Pick files',
    defaultPath: cwd || undefined,
    properties: ['openFile', 'multiSelections'],
  });
  if (pickResult.canceled || pickResult.filePaths.length === 0) return { ok: false };
  return { ok: true, paths: pickResult.filePaths };
});

ipcMain.handle('project:open', async (_event, projectPath: string) => {
  // Validate: dir must exist and contain .nap/nepics (proves it's initialized).
  if (typeof projectPath !== 'string' || !projectPath) {
    return { ok: false, message: 'invalid path' };
  }
  if (!fsSync.existsSync(projectPath)) {
    return { ok: false, message: `path does not exist: ${projectPath}` };
  }
  const napNepics = join(projectPath, '.nap', 'nepics');
  if (!fsSync.existsSync(napNepics)) {
    return {
      ok: false,
      message: 'not a nap-pro project (missing .nap/nepics/) — use "New project" to initialize',
    };
  }
  await recordProjectOpen(projectPath);
  return switchProject(projectPath);
});

ipcMain.handle(
  'project:create',
  async (_event, opts: { parentDir: string; name: string }) => {
    const parent = opts?.parentDir;
    const name = opts?.name?.trim();
    if (typeof parent !== 'string' || !parent) {
      return { ok: false, message: 'parent directory is required' };
    }
    if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
      return { ok: false, message: 'name must be alphanumeric (with - _ .)' };
    }
    // The renderer is untrusted: reject system roots and require the parent to
    // already exist (we don't auto-create the parent — only the project dir).
    if (isPathUnderForbiddenRoot(parent)) {
      return { ok: false, message: `refusing to create projects under ${parent}` };
    }
    if (!fsSync.existsSync(parent)) {
      return { ok: false, message: `parent directory does not exist: ${parent}` };
    }
    if (!fsSync.statSync(parent).isDirectory()) {
      return { ok: false, message: `parent is not a directory: ${parent}` };
    }
    const target = join(parent, name);
    if (fsSync.existsSync(target)) {
      // Allow only if it's empty — otherwise refuse to clobber.
      const contents = fsSync.readdirSync(target);
      if (contents.length > 0) {
        return { ok: false, message: `directory exists and is not empty: ${target}` };
      }
    } else {
      fsSync.mkdirSync(target);
    }
    // git init + empty commit so `git worktree add` works later. Best-effort:
    // pass explicit user.email/name so it succeeds on machines without global
    // git config. Async to avoid blocking the main thread.
    try {
      await execFileAsync('git', ['init', '-q'], { cwd: target });
      await execFileAsync(
        'git',
        ['-c', 'user.email=nap-pro@local', '-c', 'user.name=nap-pro',
         'commit', '--allow-empty', '-q', '-m', 'init'],
        { cwd: target },
      );
    } catch (err) {
      // Don't fail the whole create — the user can re-init git later. Log it.
      const e = err as { message?: string };
      // eslint-disable-next-line no-console
      console.warn(`[nap-pro] project:create — git init failed (continuing): ${e.message ?? err}`);
    }
    let templatesDir: string;
    try {
      templatesDir = findTemplatesDir(__dirname);
    } catch (err) {
      const e = err as { message?: string };
      return { ok: false, message: e.message ?? 'templates not found' };
    }
    const scaffold = scaffoldProject({ cwd: target, templatesDir });
    if (!scaffold.ok) {
      return { ok: false, message: scaffold.message ?? 'scaffold failed' };
    }
    await recordProjectOpen(target);
    const switched = await switchProject(target);
    return switched.ok ? { ok: true, path: target } : switched;
  },
);

// Roots the markdown viewer/editor may touch: the project cwd plus every
// worktree the model tracks — napkin worktrees and per-agent overrides
// (stage replays). All of these are dirs nap-pro itself created.
function getFileAccessRoots(cwd: string): string[] {
  if (!projectModel) return [cwd];
  const napkins = projectModel.getNapkins();
  const agentWorktrees = [
    ...napkins.flatMap((n) => n.agents),
    ...projectModel.getArchitects(),
  ].map((a) => a.worktreePath);
  const napkinWorktrees = napkins.map((n) => n.worktreePath);
  const trackedWorktrees = [...napkinWorktrees, ...agentWorktrees].filter(
    (wp): wp is string => !!wp,
  );
  return [cwd, ...trackedWorktrees];
}

/**
 * Whether the markdown viewer/editor may touch this path. Two tiers:
 *   1. Project cwd + tracked worktrees — full access, including `.nap/` and
 *      other dot-dirs (napkin scaffolding lives there).
 *   2. Anywhere else under the user's home — allowed, EXCEPT paths with a
 *      hidden (dot-prefixed) segment. Agents routinely reference files in
 *      other repos and other nap projects' worktrees; the dot-segment rule
 *      keeps ~/.ssh, ~/.aws, other projects' .git/.nap internals off-limits.
 */
function isFileAccessAllowed(p: string, cwd: string): boolean {
  if (getFileAccessRoots(cwd).some((root) => isPathInside(p, root))) return true;
  const home = os.homedir();
  if (!isPathInside(p, home)) return false;
  const relFromHome = pathResolve(p).slice(pathResolve(home).length + 1);
  return !relFromHome.split(pathSep).some((segment) => segment.startsWith('.'));
}

ipcMain.handle('file:read', async (_event, p: string) => {
  // Read an arbitrary file's contents — used by the in-app markdown viewer
  // for napkin scaffolding files, response.md, design.md, agent-edited files
  // inside worktrees, cross-project references, etc. Security clamp:
  // see isFileAccessAllowed.
  const cwd = process.env['NAP_CWD'];
  if (!cwd) return { error: true, message: 'no project loaded' };
  if (typeof p !== 'string' || !p) {
    return { error: true, message: 'invalid path' };
  }

  if (!isFileAccessAllowed(p, cwd)) {
    return {
      error: true,
      message: 'refusing to read paths outside your home directory or inside hidden dirs',
    };
  }
  if (!fsSync.existsSync(p)) {
    return { error: true, message: `path does not exist: ${p}` };
  }
  try {
    const fsP = await import('fs/promises');
    const content = await fsP.readFile(p, 'utf-8');
    return { ok: true, content };
  } catch (err) {
    const e = err as { message?: string };
    return { error: true, message: e.message ?? 'read failed' };
  }
});

ipcMain.handle('file:write', async (_event, p: string, content: string) => {
  // Write a file's contents — used by the markdown editor to save user edits.
  // Same security clamp as `file:read`: see isFileAccessAllowed.
  const cwd = process.env['NAP_CWD'];
  if (!cwd) return { error: true, message: 'no project loaded' };
  if (typeof p !== 'string' || !p) {
    return { error: true, message: 'invalid path' };
  }
  if (typeof content !== 'string') {
    return { error: true, message: 'content must be a string' };
  }
  if (!isFileAccessAllowed(p, cwd)) {
    return {
      error: true,
      message: 'refusing to write paths outside your home directory or inside hidden dirs',
    };
  }
  try {
    const fsP = await import('fs/promises');
    await fsP.writeFile(p, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    const e = err as { message?: string };
    return { error: true, message: e.message ?? 'write failed' };
  }
});

ipcMain.handle('project:reveal', async (_event, p?: string) => {
  // Reveal a path in Finder/Explorer. Default: current project's nepic dir
  // (where all agent files live). Pass an explicit path to reveal a specific
  // napkin folder, agent home dir, etc. Renderer-supplied paths are clamped
  // to within the current project's cwd to prevent enumeration of arbitrary
  // filesystem locations.
  const cwd = process.env['NAP_CWD'];
  if (!cwd) return { ok: false, message: 'no project loaded' };
  const target = p || join(cwd, '.nap', 'nepics');
  if (typeof target !== 'string') {
    return { ok: false, message: 'invalid path' };
  }
  if (!isPathInside(target, cwd)) {
    return {
      ok: false,
      message: 'refusing to reveal paths outside the current project',
    };
  }
  if (!fsSync.existsSync(target)) {
    return { ok: false, message: `path does not exist: ${target}` };
  }
  await shell.openPath(target);
  return { ok: true };
});

app.whenReady().then(async () => {
  const isTest = process.env['NAP_TEST'] === '1';

  // Resolve the active project. Precedence:
  //   --nap-cwd <path>   (set by app.relaunch on project switch — robust to
  //                       env-var mutation not propagating across relaunch)
  //   NAP_CWD env var    (set by `make dev` etc. for direct-launch flows)
  //   process.cwd()      (last resort — usually the source repo root)
  const argvCwd = getArgvFlag('--nap-cwd');
  const projectCwd = argvCwd || process.env['NAP_CWD'] || process.cwd();
  // No project loaded? Bring up the landing screen — the renderer queries
  // landing-mode via the `project:initial` IPC below and routes accordingly.
  // We still create the BrowserWindow; the project-init block is skipped.
  const hasProject = fsSync.existsSync(join(projectCwd, '.nap', 'nepics'));

  ipcMain.handle('project:initial', async () => {
    return hasProject
      ? { loaded: true, cwd: projectCwd }
      : { loaded: false };
  });

  if (!hasProject) {
    createWindow();
    // Landing screen handles the rest via the IPCs above.
    return;
  }

  // Project loaded — record + carry on with the full app setup below.
  // Make NAP_CWD reflect whatever we resolved (argv or env), so downstream code
  // that still reads it (workflow-runner, etc.) sees the right value.
  process.env['NAP_CWD'] = projectCwd;
  await recordProjectOpen(projectCwd);

  const fs = new NodeFileSystem();
  const model = createModel(fs);
  projectModel = model;  // expose to module-level handlers (file:read, etc.)

  // Materialize permissions settings + register the path so every spawned
  // claude inherits bypassPermissions + the deny list (rm -rf, gh pr merge,
  // gh pr close, …). One file, one setter call, no plumbing through callers.
  try {
    const permsPath = await ensurePermissionsSettingsFile(projectCwd);
    setPermissionsSettingsPath(permsPath);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[nap-pro] failed to write permissions settings — agents will fall back to default prompts:', err);
  }

  // ── Activity logger — created early so socket-handler can emit ──
  const activityLogger = new ActivityLogger();

  // ── Workflow registry — tracks all in-flight + recent runs, persisted to
  // .nap/workflows/runs/ so a restart can resume interrupted runs ──
  const workflowRegistry = new WorkflowRegistry({
    persistDir: join(projectCwd, '.nap', 'workflows', 'runs'),
  });
  await workflowRegistry.loadFromDisk();

  // ── Workflow watcher — watches contextFiles for change-driven rerun cues ──
  const workflowWatcher = new WorkflowWatcher(
    join(projectCwd, '.nap', 'workflows'),
    projectCwd,
  );

  // ── Start socket server BEFORE window creation ──
  const socketPath = getServerSocketPath(projectCwd);
  ptySpawner = new NodePtySpawner(isTest);
  const handler = createRequestHandler(model, ptySpawner, activityLogger, projectCwd);
  await startSocketServer(handler, socketPath);

  // Wire message queue to pty writer
  setWriter((id, data) => {
    ptySpawner?.write(id, data);
    // Same rationale as the pty:write handler — a queued message arriving
    // (e.g. workflow PR handoff to a done architect) means the agent has new
    // work, so clear the done flag.
    void model.clearAgentDone(id);
  });

  const win = createWindow();
  initNotifier(win, { enabled: !isTest });

  // Expose model for medium tests
  if (isTest) {
    (global as any).__napModel__ = model;
  }

  // Find the active nepic directory
  const nepicsBase = join(projectCwd, '.nap', 'nepics');
  let activeNepicId = '';
  let activeNepicDir = '';

  const nepicDirEntries = await fs.readdir(nepicsBase);
  const nepicDirs = [];
  for (const d of nepicDirEntries) {
    if (d.startsWith('.') || d === 'ui-state.json') continue;
    if (await fs.isDirectory(join(nepicsBase, d))) nepicDirs.push(d);
  }
  if (nepicDirs.length > 0) {
    activeNepicId = nepicDirs[nepicDirs.length - 1];
    activeNepicDir = join(nepicsBase, activeNepicId);
  }

  // Wire model → IPC bridge.
  //
  // Snapshots are large (per-napkin recursive file entries) and the model
  // fires onChange for every state mutation. Coalesce all mutations within a
  // microtask boundary into a single push using setImmediate — under load
  // this drops IPC volume by 5-10x without any visible latency.
  let snapshotPending = false;
  function scheduleSnapshot(): void {
    if (snapshotPending || win.isDestroyed()) return;
    snapshotPending = true;
    setImmediate(() => {
      snapshotPending = false;
      if (win.isDestroyed()) return;
      activeNepicId = model.getActiveNepicId();
      const snapshot: AppSnapshot = {
        napkins: model.getNapkins(),
        architects: model.getArchitects(),
        activeNepicId,
        nepics: model.getNepics(),
        watcherEvents: model.getWatcherEvents(),
      };
      win.webContents.send('app:state', snapshot);
    });
  }
  model.onChange(scheduleSnapshot);

  // Wire renderer intents → main
  ipcMain.on('app:intent', async (_event, intent) => {
    if (intent?.type === 'setActiveTerminal') {
      // Terminal management
    }
    if (intent?.type === 'permission-response') {
      // Resolve via the same socket handler path
      const agentId = intent.agentId as string;
      const decision = intent.decision as string;
      try {
        await handler({ type: 'permission-response', id: 0, agentId, decision }, null as any);
      } catch {
        // No pending approval — ignore
      }
    }
  });

  // ── PTY management ──

  // Route pty data → renderer
  ptySpawner.setDataHandler((id, data) => {
    if (!win.isDestroyed()) {
      win.webContents.send('pty:data', id, data);
    }
  });

  // Route pty exits → renderer
  ptySpawner.setExitNotifier((id, exitCode) => {
    if (!win.isDestroyed()) {
      win.webContents.send('pty:exit', id, exitCode);
    }
  });

  // Wire pty IPC from renderer → main
  ipcMain.on('pty:write', (_event, id: string, data: string) => {
    ptySpawner?.write(id, data);
    // The user re-engaged a previously-done agent — clear the done flag so
    // the UI dot reverts from "dashed-check" back to active. No-op when the
    // agent isn't currently marked done. Fire-and-forget; the persist is
    // best-effort and we don't want to slow keystroke forwarding.
    void model.clearAgentDone(id);
  });

  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    ptySpawner?.resize(id, cols, rows);
  });

  ipcMain.on('pty:ready', (_event, id: string) => {
    ptySpawner?.markReady(id);
  });

  // Resume an exited agent's pty on demand (user clicked it)
  ipcMain.on('pty:resume', (_event, id: string) => {
    if (!ptySpawner || ptySpawner.isRunning(id)) return;

    const agent = model.getAllAgents().find((a) => a.id === id);
    if (!agent) return;

    // Archived agents don't resume — they need the successor flow
    if (agent.archived) return;

    const spawnTime = Date.now();

    const args = buildClaudeArgs({
      sessionId: agent.id,
      model: agent.model,
      resume: true,
    });
    ptySpawner.spawn({
      id: agent.id,
      file: 'claude',
      args,
      cwd: model.getAgentCwd(agent.id),
    });

    ptySpawner.onExit(agent.id, async () => {
      // Resume failure detection: fast exit + known "session gone" wording.
      if ((Date.now() - spawnTime) < RESUME_FAIL_THRESHOLD_MS) {
        const output = (ptySpawner as any).getOutputBuffer?.(agent.id) ?? '';
        if (isResumeMissingSession(output)) {
          await model.setAgentArchived(agent.id);
          return;
        }
      }
      return model.setAgentExitedById(agent.id);
    });

    model.setAgentRunning(agent.id, true);
  });

  // Post-hoc stage add — user forgot a stage in their workflow, or wants to
  // run an extra one after the workflow finished. Mirrors what `runStage`
  // does for a workflow stage (create stub, write the standard template
  // prompt with napkin scaffolding refs, start the agent) but without the
  // workflow-registry plumbing. The added agent stands alone: it isn't part
  // of any run, no `nap-pro done` advances anything — it just runs in the
  // napkin's worktree with the same context an in-workflow stage would have.
  ipcMain.handle(
    'napkin:add-stage',
    async (_event, opts: { slug: string; role: string; model?: string | null }) => {
      if (!ptySpawner) return { error: true, message: 'no pty spawner' };
      const napkin = model.getNapkins().find((n) => n.slug === opts.slug);
      if (!napkin) return { error: true, message: `napkin '${opts.slug}' not found` };
      if (!opts.role || typeof opts.role !== 'string') {
        return { error: true, message: 'role required' };
      }

      // Pick the next ordinal — scan the napkin's agents dir for `NNN-*` and
      // take max + 10 (leave gaps for further inserts). Falls back to a 3-digit
      // ts-suffix if the scan errors out for any reason.
      const fsP = await import('fs/promises');
      const agentsDir = join(napkin.path, 'agents');
      let maxOrd = 0;
      try {
        const entries = await fsP.readdir(agentsDir);
        for (const entry of entries) {
          const m = entry.match(/^(\d{3})-/);
          if (m) {
            const n = parseInt(m[1], 10);
            if (n > maxOrd) maxOrd = n;
          }
        }
      } catch {
        // Dir might not exist yet on a brand-new napkin — fall back to 010.
      }
      const ord = maxOrd > 0 ? maxOrd + 10 : 10;
      const name = `${String(ord).padStart(3, '0')}-${opts.role}`;

      // Create the agent stub (architect parent if one's running, same as runStage).
      const parent = model.getArchitects().find((a) => a.role === 'architect') ?? null;
      let createdId: string;
      try {
        const stub = await model.createAgentStub(
          opts.slug,
          name,
          opts.role,
          undefined,
          parent?.id,
          opts.model ?? null,
        );
        createdId = stub.id;
      } catch (err) {
        const e = err as { message?: string };
        return { error: true, message: e.message ?? 'createAgentStub failed' };
      }

      const agent = model.getAllAgents().find((a) => a.id === createdId);
      if (!agent) {
        return { error: true, message: 'agent created but not visible in model' };
      }

      // Build the workflow-style prompt: role doc reference + napkin scaffolding
      // file list + done footer. Identical to the `template` path in runStage.
      const scaffolding = await enumerateNapkinScaffolding(napkin.path, opts.slug);
      const promptBody = defaultTemplatePrompt(
        opts.role,
        agent.homePath,
        opts.slug,
        napkin.path,
        scaffolding,
      );
      const promptPath = join(agent.homePath, 'prompt.md');
      await fsP.writeFile(promptPath, promptBody);

      // Start it.
      try {
        await model.startAgentById(
          agent.id,
          `read ${promptPath} and follow its instructions`,
          ptySpawner,
        );
        return { ok: true, agentId: agent.id, name };
      } catch (err) {
        const e = err as { message?: string };
        return { error: true, message: e.message ?? 'start failed' };
      }
    },
  );

  // Ad-hoc architect spawn — user-triggered from the sidebar. Replaces the
  // old auto-create-at-init flow with an explicit on-demand action. Creates a
  // new `NNN-architect` agent stub under the active nepic, reloads the model
  // so the snapshot picks it up, then starts the agent immediately (the user
  // clicked a button labeled "Spawn architect" — they expect it to spawn).
  ipcMain.handle('architect:spawn', async () => {
    if (!ptySpawner) return { error: true, message: 'no pty spawner' };
    if (!activeNepicDir) return { error: true, message: 'no active nepic' };

    const fsP = await import('fs/promises');
    const cryptoMod = await import('crypto');
    const architectsDir = join(activeNepicDir, '20-architects');
    await fsP.mkdir(architectsDir, { recursive: true });

    // Pick the next ordinal — scan existing NNN-architect entries.
    const existing = await fsP.readdir(architectsDir);
    let maxOrd = 0;
    for (const name of existing) {
      const m = name.match(/^(\d{3})-architect$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxOrd) maxOrd = n;
      }
    }
    const ord = maxOrd + 1;
    const name = `${String(ord).padStart(3, '0')}-architect`;
    const dir = join(architectsDir, name);
    await fsP.mkdir(dir, { recursive: true });

    const marker = {
      cc_session_uuid: cryptoMod.randomUUID(),
      role: 'architect',
      name,
      nepic: activeNepicId,
      created_at: Date.now(),
      started: false,
    };
    await fsP.writeFile(join(dir, '.agent.nap.json'), JSON.stringify(marker, null, 2));

    // Copy the architect prompt template so the spawned session has a brief.
    try {
      const templatesDir = findTemplatesDir(__dirname);
      const tmpl = join(templatesDir, 'nepic', '20-architects', '001-architect', 'prompt.md');
      if (fsSync.existsSync(tmpl)) {
        await fsP.copyFile(tmpl, join(dir, 'prompt.md'));
      }
    } catch (err) {
      // Templates not found — proceed with no prompt.md; user can write one.
      const e = err as { message?: string };
      // eslint-disable-next-line no-console
      console.warn(`[nap-pro] architect:spawn — no prompt template (${e.message ?? err})`);
    }

    // Reload model so the new agent shows up in the snapshot, then start it.
    await model.loadFromFilesystem(activeNepicDir);
    const fresh = model.getArchitects().find((a) => a.name === name);
    if (!fresh) {
      return { error: true, message: 'agent created on disk but model failed to pick it up' };
    }
    try {
      await model.startAgentById(
        fresh.id,
        `read ${fresh.homePath}/prompt.md and follow its instructions`,
        ptySpawner,
      );
      return { ok: true, agentId: fresh.id, name };
    } catch (err) {
      const e = err as { message?: string };
      return { error: true, message: e.message ?? 'start failed' };
    }
  });

  ipcMain.handle('agent:spawn-successor', async (_event, id: string) => {
    if (!ptySpawner) return { error: true, message: 'no pty spawner' };
    const newId = await model.spawnSuccessor(id, ptySpawner);
    if (!newId) return { error: true, message: 'agent not found' };
    return { ok: true, newId };
  });

  // Pause / resume / stop an agent (via right-click in the UI)
  ipcMain.handle('agent:pause', async (_event, id: string) => {
    if (!ptySpawner) return { error: true, message: 'no pty spawner' };
    const ok = ptySpawner.pause(id);
    if (ok) model.setAgentPaused(id, true);
    return { ok };
  });

  ipcMain.handle('agent:resume', async (_event, id: string) => {
    if (!ptySpawner) return { error: true, message: 'no pty spawner' };
    const ok = ptySpawner.resume(id);
    if (ok) model.setAgentPaused(id, false);
    return { ok };
  });

  // Manually start a never-started agent. Used by right-click → Start when the
  // agent is dormant (e.g. the architect on first app launch, now that
  // resume.ts no longer auto-spawns unstarted agents).
  ipcMain.handle('agent:start', async (_event, id: string) => {
    if (!ptySpawner) return { error: true, message: 'no pty spawner' };
    const agent = model.getAllAgents().find((a) => a.id === id);
    if (!agent) return { error: true, message: 'agent not found' };
    if (agent.started) return { error: true, message: 'agent already started' };
    if (agent.exited) return { error: true, message: 'agent has exited — use Replay' };
    try {
      await model.startAgentById(
        id,
        `read ${agent.homePath}/prompt.md and follow its instructions`,
        ptySpawner,
      );
      return { ok: true };
    } catch (err) {
      const e = err as { message?: string };
      return { error: true, message: e.message || 'start failed' };
    }
  });

  ipcMain.handle(
    'agent:replay',
    async (
      _event,
      originalAgentId: string,
      opts: { model?: string | null; prompt?: string },
    ) => {
      if (!ptySpawner) return { ok: false, error: 'no pty spawner' };
      return await replayAgent(originalAgentId, opts, {
        model,
        ptySpawner,
        projectCwd,
      });
    },
  );

  ipcMain.handle('agent:stop', async (_event, id: string) => {
    if (!ptySpawner) return { error: true, message: 'no pty spawner' };
    if (!ptySpawner.isRunning(id)) return { ok: false, message: 'not running' };
    ptySpawner.kill(id);
    await model.setAgentExitedById(id);
    return { ok: true };
  });

  // Effective git cwd for an agent: its napkin's worktree if set, else project root.
  // This means slice 3's "files changed" view stays accurate per-napkin once
  // slice 5 worktrees are in play.
  function gitCwdForAgent(agentId: string): string {
    return model.getAgentCwd(agentId) || projectCwd;
  }

  // ── Live diff: list files changed since the agent's baseline + read diffs ──
  ipcMain.handle('agent:get-files', async (_event, id: string) => {
    const agent = model.getAllAgents().find((a) => a.id === id);
    if (!agent) return { error: true, message: 'agent not found' };
    const files = await getChangedFiles(gitCwdForAgent(id), agent.baselineSha);
    return { files, baselineSha: agent.baselineSha };
  });

  ipcMain.handle('agent:get-diff', async (_event, id: string, filePath: string) => {
    const agent = model.getAllAgents().find((a) => a.id === id);
    if (!agent) return { error: true, message: 'agent not found' };
    const diff = await getFileDiff(gitCwdForAgent(id), agent.baselineSha, filePath);
    return { diff: diff ?? '' };
  });

  // ── Cost / metrics (slice 7) ──
  ipcMain.handle('agent:get-cost', async (_event, id: string, scope: 'agent' | 'subtree') => {
    const allAgents = model.getAllAgents();
    const root = allAgents.find((a) => a.id === id);
    if (!root) return { error: true, message: 'agent not found' };

    let scoped = [root];
    if (scope === 'subtree') {
      const seen = new Set<string>([root.id]);
      const queue = [root.id];
      while (queue.length) {
        const parentId = queue.shift()!;
        for (const a of allAgents) {
          if (a.parentId === parentId && !seen.has(a.id)) {
            seen.add(a.id);
            scoped.push(a);
            queue.push(a.id);
          }
        }
      }
    }

    const perAgent = await Promise.all(
      scoped.map((a) => getAgentCost(a.id, a.name, gitCwdForAgent(a.id))),
    );
    return { perAgent, total: totalCost(perAgent) };
  });

  // ── Timeline replay (slice 12) ──
  ipcMain.handle('agent:get-timeline', async (_event, id: string) => {
    const allAgents = model.getAllAgents();
    const agent = allAgents.find((a) => a.id === id);
    if (!agent) return { error: true, message: 'agent not found' };

    const events = await activityLogger.getEvents(agent.id, agent.homePath);
    const chunks = ptySpawner ? ptySpawner.getScrollbackTimeline(agent.id) : [];

    // Resolve the time range. Prefer the earliest known timestamp; the agent's
    // own createdAt is on the model but may pre-date the running session.
    const candidates: number[] = [];
    if (chunks.length > 0) candidates.push(chunks[0].ts);
    if (events.length > 0) candidates.push(events[0].ts);
    const startedAt = candidates.length > 0 ? Math.min(...candidates) : agent.createdAt;
    const endedAt = ptySpawner?.isRunning(agent.id) ? null : (chunks.at(-1)?.ts ?? events.at(-1)?.ts ?? null);

    return {
      agentId: agent.id,
      agentName: agent.name,
      startedAt,
      endedAt,
      running: ptySpawner?.isRunning(agent.id) ?? false,
      events,
      chunks,
    };
  });

  // Napkin-scoped cost: every agent with napkinId === slug.
  // Used by workflow auto-open since workflow stages are siblings (parent = architect),
  // not a parent-chain.
  ipcMain.handle('napkin:get-cost', async (_event, slug: string) => {
    const napkin = model.getNapkins().find((n) => n.slug === slug);
    if (!napkin) return { error: true, message: `napkin '${slug}' not found` };
    const perAgent = await Promise.all(
      napkin.agents.map((a) => getAgentCost(a.id, a.name, gitCwdForAgent(a.id))),
    );
    return { perAgent, total: totalCost(perAgent) };
  });

  // Capture git HEAD as the agent's baseline at spawn time. Synchronous —
  // happens inside startResolvedAgent before pty.spawn, so the diff panel
  // never sees a null baseline race.
  model.setBaselineResolver(async (agentId) => {
    return await getHeadSha(gitCwdForAgent(agentId));
  });

  // ── Activity log: observe model state transitions, persist + push events ──

  // Snapshot per-agent state to detect transitions across model.onChange ticks
  type AgentSnap = {
    running: boolean;
    paused: boolean;
    exited: boolean;
    archived: boolean;
    done: boolean;
    everRan: boolean;
  };
  const lastSnap = new Map<string, AgentSnap>();

  function emit(
    agent: { id: string; name: string; homePath: string },
    type: ActivityEvent['type'],
    text: string,
    data?: Record<string, unknown>,
  ): void {
    activityLogger.emit(
      {
        ts: Date.now(),
        type,
        agentId: agent.id,
        agentName: agent.name,
        text,
        ...(data ? { data } : {}),
      },
      agent.homePath,
    );
  }

  // Push live events to the renderer
  activityLogger.onEvent((event) => {
    if (!win.isDestroyed()) {
      win.webContents.send('activity:event', event);
    }
    // Approval requests block the agent until a human answers — worth a ping.
    if (event.type === 'permission-requested') {
      notify(`Approval needed: ${event.agentName}`, event.text);
    }
  });

  model.onChange(() => {
    for (const agent of model.getAllAgents()) {
      const prev = lastSnap.get(agent.id);
      const next: AgentSnap = {
        running: agent.running,
        paused: agent.paused,
        exited: agent.exited,
        archived: agent.archived,
        done: agent.done,
        everRan: prev?.everRan === true || agent.running,
      };
      lastSnap.set(agent.id, next);

      // First sighting (no prev) → no events; treat current state as baseline
      if (!prev) continue;

      // running false → true: started or resumed
      if (!prev.running && next.running) {
        if (prev.everRan || prev.exited) {
          emit(agent, 'resumed', 'agent resumed');
        } else {
          emit(agent, 'started', 'agent started');
        }
      }
      // paused transitions (only meaningful while running)
      if (!prev.paused && next.paused) {
        emit(agent, 'paused', 'agent paused (SIGSTOP)');
      }
      if (prev.paused && !next.paused && next.running) {
        emit(agent, 'resumed', 'agent resumed (SIGCONT)');
      }
      // running → not running, with exit flag set
      if (prev.running && !next.running && next.exited && !prev.exited) {
        emit(agent, 'exited', 'agent exited');
      }
      // archived flip
      if (!prev.archived && next.archived) {
        emit(agent, 'archived', 'agent archived');
      }
      // done flip
      if (!prev.done && next.done) {
        emit(agent, 'done', 'agent reported done');
      }
    }
  });

  // ── Activity IPC ──

  ipcMain.handle('agent:get-activity', async (_event, id: string, scope: 'agent' | 'subtree') => {
    const allAgents = model.getAllAgents();
    const root = allAgents.find((a) => a.id === id);
    if (!root) return { events: [] };

    if (scope === 'subtree') {
      // Collect root + all descendants
      const collected = [root];
      const queue = [root.id];
      const seen = new Set<string>([root.id]);
      while (queue.length) {
        const parentId = queue.shift()!;
        for (const a of allAgents) {
          if (a.parentId === parentId && !seen.has(a.id)) {
            seen.add(a.id);
            collected.push(a);
            queue.push(a.id);
          }
        }
      }
      const events = await activityLogger.getEventsForMany(
        collected.map((a) => ({ id: a.id, homePath: a.homePath })),
      );
      return { events };
    }

    const events = await activityLogger.getEvents(root.id, root.homePath);
    return { events };
  });

  // Set napkin status (archive/unarchive from kanban)
  ipcMain.handle('napkin:set-status', async (_event, slug: string, status: string) => {
    await model.setNapkinStatus(slug, status);
    return { ok: true };
  });

  // ── Role management (slice 6) ──
  const rolesDir = join(projectCwd, '.nap', '00-org', '40-roles');

  ipcMain.handle('roles:list', async () => {
    const fsP = await import('fs/promises');
    try {
      const names = await fsP.readdir(rolesDir);
      return {
        roles: names
          .filter((n) => n.endsWith('.md'))
          .map((n) => n.replace(/\.md$/, ''))
          .sort(),
      };
    } catch {
      return { roles: [] };
    }
  });

  ipcMain.handle('roles:read', async (_event, name: string) => {
    const v = validateIdentifier(name, 'role-name');
    if (!v.ok) return { error: true, message: v.reason };
    const fsP = await import('fs/promises');
    try {
      const content = await fsP.readFile(join(rolesDir, `${name}.md`), 'utf-8');
      return { content };
    } catch (err) {
      const e = err as { message?: string };
      return { error: true, message: e.message || 'role not found' };
    }
  });

  ipcMain.handle('roles:save', async (_event, name: string, content: string) => {
    const v = validateIdentifier(name, 'role-name');
    if (!v.ok) return { error: true, message: v.reason };
    const fsP = await import('fs/promises');
    try {
      await fsP.mkdir(rolesDir, { recursive: true });
      await fsP.writeFile(join(rolesDir, `${name}.md`), content);
      return { ok: true };
    } catch (err) {
      const e = err as { message?: string };
      return { error: true, message: e.message || 'failed to write role' };
    }
  });

  ipcMain.handle('roles:delete', async (_event, name: string) => {
    const v = validateIdentifier(name, 'role-name');
    if (!v.ok) return { error: true, message: v.reason };
    const fsP = await import('fs/promises');
    try {
      await fsP.unlink(join(rolesDir, `${name}.md`));
      return { ok: true };
    } catch (err) {
      const e = err as { message?: string };
      return { error: true, message: e.message || 'failed to delete role' };
    }
  });

  // ── Workflow definitions (slice 6) ──
  const workflowsDir = join(projectCwd, '.nap', 'workflows');

  ipcMain.handle('workflows:list', async () => {
    const fsP = await import('fs/promises');
    try {
      const names = await fsP.readdir(workflowsDir);
      return {
        workflows: names
          .filter((n) => n.endsWith('.json'))
          .map((n) => n.replace(/\.json$/, ''))
          .sort(),
      };
    } catch {
      return { workflows: [] };
    }
  });

  ipcMain.handle('workflows:read', async (_event, name: string) => {
    const v = validateIdentifier(name, 'workflow-name');
    if (!v.ok) return { error: true, message: v.reason };
    const fsP = await import('fs/promises');
    try {
      const text = await fsP.readFile(join(workflowsDir, `${name}.json`), 'utf-8');
      return { workflow: JSON.parse(text) };
    } catch (err) {
      const e = err as { message?: string };
      return { error: true, message: e.message || 'workflow not found' };
    }
  });

  ipcMain.handle('workflows:save', async (_event, name: string, def: unknown) => {
    const v = validateIdentifier(name, 'workflow-name');
    if (!v.ok) return { error: true, message: v.reason };

    // Save-time validation — parallel-group contiguity, scope-architect
    // placement, anything else we accumulate. Returns the first error.
    if (def && typeof def === 'object' && 'stages' in def) {
      const err = validateWorkflow(def as Parameters<typeof validateWorkflow>[0]);
      if (err) return { error: true, message: err };
    }

    const fsP = await import('fs/promises');
    try {
      await fsP.mkdir(workflowsDir, { recursive: true });
      await fsP.writeFile(join(workflowsDir, `${name}.json`), JSON.stringify(def, null, 2));
      // contextFiles may have changed — refresh the watcher
      void workflowWatcher.refresh();
      return { ok: true };
    } catch (err) {
      const e = err as { message?: string };
      return { error: true, message: e.message || 'failed to write workflow' };
    }
  });

  ipcMain.handle('workflows:delete', async (_event, name: string) => {
    const v = validateIdentifier(name, 'workflow-name');
    if (!v.ok) return { error: true, message: v.reason };
    const fsP = await import('fs/promises');
    try {
      await fsP.unlink(join(workflowsDir, `${name}.json`));
      void workflowWatcher.refresh();
      return { ok: true };
    } catch (err) {
      const e = err as { message?: string };
      return { error: true, message: e.message || 'failed to delete workflow' };
    }
  });

  // ── Workflow runs (slice 10) ──
  ipcMain.handle('workflows:list-runs', async () => {
    return { runs: workflowRegistry.list() };
  });

  ipcMain.handle('workflows:stage-stats', async (_event, stageName: string, role: string) => {
    const stats = await computeStageStats(model, stageName, role, projectCwd);
    return { stats };
  });

  ipcMain.handle('workflows:cancel-run', async (_event, runId: string) => {
    const entry = workflowRegistry.cancel(runId);
    if (!entry) return { ok: false, error: 'run not found or already finished' };
    // Kill any agents currently running for this run's napkin so the runner
    // unblocks promptly. The runner will detect the abort signal and complete
    // the registry entry.
    if (ptySpawner) {
      for (const stage of entry.run.stages) {
        if (stage.status === 'running' && stage.agentId && ptySpawner.isRunning(stage.agentId)) {
          ptySpawner.kill(stage.agentId);
        }
      }
    }
    return { ok: true };
  });

  ipcMain.handle('workflows:resume-run', async (_event, runId: string) => {
    if (!ptySpawner) return { ok: false, error: 'no pty spawner' };
    // Kick off in the background — the dashboard tracks progress via run updates.
    resumeWorkflowRun(runId, { model, ptySpawner, projectCwd, registry: workflowRegistry })
      .then((result) => {
        if (!win.isDestroyed()) {
          const revived = workflowRegistry.list().find((r) => r.runId === runId);
          win.webContents.send('workflow:complete', {
            workflowName: revived?.workflowName ?? '',
            napkinSlug: revived?.napkinSlug ?? '',
            ok: result.ok,
          });
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[workflow] resume threw:', err);
      });
    return { ok: true };
  });

  ipcMain.handle('workflows:nudge-stage', async (_event, runId: string, stageName: string) => {
    const entry = workflowRegistry.getEntry(runId);
    const stage = entry?.run.stages.find((s) => s.name === stageName);
    if (!stage?.agentId) return { ok: false, error: 'stage has no live agent' };
    enqueue(
      stage.agentId,
      `[workflow-runner] You've produced no output for a while — are you stuck? ` +
        `If the work is done: write your response to response.md and run \`nap-pro done\` (the pipeline is blocked on you). ` +
        `If you're blocked: say exactly what you're blocked on in your terminal.`,
    );
    return { ok: true };
  });

  // Push registry changes to the renderer + fire system notifications on the
  // transitions worth interrupting the user for.
  const notifiedStalledStages = new Set<string>();
  workflowRegistry.onChange((run) => {
    if (!win.isDestroyed()) {
      win.webContents.send('workflow:run-update', run);
    }

    for (const stage of run.stages) {
      const stallKey = `${run.runId}:${stage.name}`;
      if (stage.status === 'stalled' && !notifiedStalledStages.has(stallKey)) {
        notifiedStalledStages.add(stallKey);
        notify(
          `Stage stalled: ${stage.name}`,
          `${run.workflowName} on ${run.napkinSlug} — no agent output for a while. Nudge or check its terminal.`,
        );
      } else if (stage.status !== 'stalled') {
        notifiedStalledStages.delete(stallKey);
      }
    }

    if (run.status === 'completed') {
      notify(`Workflow completed: ${run.workflowName}`, `All stages finished on ${run.napkinSlug}.`);
    } else if (run.status === 'failed') {
      notify(
        `Workflow failed: ${run.workflowName}`,
        `${run.napkinSlug} — ${run.message ?? 'a stage failed'}. Open the runs dashboard to retry.`,
      );
    }
  });

  // Push contextFile change events for watch mode
  workflowWatcher.onChange((event) => {
    if (!win.isDestroyed()) {
      win.webContents.send('workflow:context-changed', event);
    }
  });
  // Initial scan once we know the project layout
  void workflowWatcher.refresh();

  ipcMain.handle(
    'workflows:run-from-spec',
    async (
      _event,
      args: {
        workflowName: string;
        napkinSlug: string;
        workItemName: string;
        specDocs: string[];
      },
    ) => {
      if (!ptySpawner) return { error: true, message: 'no pty spawner' };

      // Resolve spec docs to absolute paths (relative inputs are project-relative).
      const absSpecDocs = args.specDocs
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => (p.startsWith('/') ? p : join(projectCwd, p)));
      if (absSpecDocs.length === 0) {
        return { error: true, message: 'at least one spec doc path is required' };
      }

      // Create the napkin if it doesn't already exist. Validation runs inside.
      const existing = model.getNapkins().find((n) => n.slug === args.napkinSlug);
      if (!existing) {
        try {
          await model.createNapkin(args.napkinSlug, 'doing');
        } catch (err) {
          const e = err as { message?: string };
          return { error: true, message: e.message || 'failed to create napkin' };
        }
      }

      // Run the workflow with the from-spec opts (triggers scope stage if def.scope set).
      runWorkflow(
        args.workflowName,
        args.napkinSlug,
        { model, ptySpawner, projectCwd, registry: workflowRegistry },
        {
          fromSpec: { specDocs: absSpecDocs, workItemName: args.workItemName },
        },
      )
        .then((result) => {
          // eslint-disable-next-line no-console
          console.log(
            `[workflow] from-spec ${args.workflowName} on ${args.napkinSlug}: ${
              result.ok ? 'completed' : 'failed: ' + result.message
            }`,
          );
          if (!win.isDestroyed()) {
            win.webContents.send('workflow:complete', {
              workflowName: args.workflowName,
              napkinSlug: args.napkinSlug,
              ok: result.ok,
            });
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[workflow] from-spec threw:', err);
        });

      return { ok: true };
    },
  );

  ipcMain.handle('workflows:run', async (_event, workflowName: string, napkinSlug: string) => {
    if (!ptySpawner) return { error: true, message: 'no pty spawner' };
    // Run in the background — return early so the renderer doesn't block on the whole pipeline
    runWorkflow(workflowName, napkinSlug, {
      model,
      ptySpawner,
      projectCwd,
      registry: workflowRegistry,
    })
      .then((result) => {
        if (!result.ok) {
          // eslint-disable-next-line no-console
          console.error(`[workflow] ${workflowName} on ${napkinSlug} failed:`, result.message, result.stages);
        } else {
          // eslint-disable-next-line no-console
          console.log(`[workflow] ${workflowName} on ${napkinSlug} completed`, result.stages);
        }
        // Always notify renderer — UI can decide whether to show cost panel based on ok flag
        if (!win.isDestroyed()) {
          win.webContents.send('workflow:complete', {
            workflowName,
            napkinSlug,
            ok: result.ok,
          });
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[workflow] ${workflowName} on ${napkinSlug} threw:`, err);
      });
    return { ok: true };
  });

  // ── Worktree management (slice 5 + 8) ──
  ipcMain.handle('napkin:create-worktree', async (_event, slug: string, baseBranch?: string) => {
    const napkin = model.getNapkins().find((n) => n.slug === slug);
    if (!napkin) return { ok: false, error: `napkin '${slug}' not found` };
    const { createWorktree } = await import('./worktree-helpers');
    const result = await createWorktree(projectCwd, slug, { baseBranch });
    if (!result.ok) return { ok: false, error: result.error };
    await model.setNapkinWorktree(slug, result.path!);
    return { ok: true, path: result.path, branch: result.branch };
  });

  // Branch listing for the workflow setup UI
  ipcMain.handle('git:list-branches', async () => {
    const { listBranches, getDefaultBranch } = await import('./worktree-helpers');
    const [branches, defaultBranch] = await Promise.all([
      listBranches(projectCwd),
      getDefaultBranch(projectCwd),
    ]);
    return { branches, defaultBranch };
  });

  ipcMain.handle('napkin:remove-worktree', async (_event, slug: string, force?: boolean) => {
    const napkin = model.getNapkins().find((n) => n.slug === slug);
    if (!napkin) return { ok: false, error: `napkin '${slug}' not found` };

    // Refuse if any agent in the napkin is currently running, OR if there's
    // an active workflow run on it. Force removal would leave running ptys
    // with a deleted cwd — every subsequent tool call panics.
    const liveAgents = napkin.agents.filter((a) => a.running);
    const activeRun = workflowRegistry.getActiveRunForNapkin(slug);
    if ((liveAgents.length > 0 || activeRun) && !force) {
      const reasons: string[] = [];
      if (liveAgents.length > 0) {
        reasons.push(
          `${liveAgents.length} agent(s) running: ${liveAgents.map((a) => a.name).join(', ')}`,
        );
      }
      if (activeRun) reasons.push(`workflow "${activeRun.workflowName}" is in flight`);
      return {
        ok: false,
        error: `cannot remove worktree — ${reasons.join('; ')}. Stop them first, or pass --force.`,
      };
    }
    // With --force: kill the running agents before yanking the worktree.
    if (ptySpawner) {
      for (const a of liveAgents) {
        if (ptySpawner.isRunning(a.id)) ptySpawner.kill(a.id);
      }
    }

    const { removeWorktree } = await import('./worktree-helpers');
    const result = await removeWorktree(projectCwd, slug, { force: !!force });
    if (!result.ok) return { ok: false, error: result.error };
    await model.setNapkinWorktree(slug, null);
    return { ok: true };
  });

  // Open file in default editor
  ipcMain.on('open-file-path', (_event, filePath: string) => {
    shell.openPath(filePath);
  });

  // UI state persistence (debug panel collapse/tab, sidebar visible)
  ipcMain.on('save-ui-state', (_event, state: unknown) => {
    model.saveUiState(state);
  });

  ipcMain.handle('load-ui-state', async () => {
    if (!activeNepicDir) return null;
    const fs = new NodeFileSystem();
    const uiStatePath = activeNepicDir + '/ui-state.json';
    return await fs.readJSON(uiStatePath);
  });

  // Expose pty manager for medium tests
  if (isTest) {
    (global as any).__napPtyManager__ = ptySpawner;
  }

  // IPC: switch active nepic
  ipcMain.handle('nepic:switch', async (_event, nepicId: string) => {
    await model.switchNepic(nepicId);
    activeNepicId = model.getActiveNepicId();
    activeNepicDir = model.getNepicDir();
    // Start any agents that need ptys (Case A resume, Case C fresh)
    if (ptySpawner) await startAgents(model, ptySpawner);
    return { ok: true };
  });

  // IPC: create a new nepic
  ipcMain.handle('nepic:create', async (_event, name: string) => {
    const nepics = model.getNepics();
    const nextNum = String(nepics.length + 1).padStart(2, '0');
    const slug = `${nextNum}-${name}`;
    const result = await model.createNepic(slug, name);
    // Switch to new nepic
    await model.switchNepic(slug);
    activeNepicId = model.getActiveNepicId();
    activeNepicDir = model.getNepicDir();
    // Auto-start the new architect (Case C — fresh)
    if (ptySpawner) await startAgents(model, ptySpawner);
    return {
      nepic: { id: slug, slug, name },
      architectId: result.architectId,
    };
  });

  // Register did-finish-load BEFORE async ops so it isn't missed
  win.webContents.on('did-finish-load', () => {
    if (activeNepicDir) {
      const snapshot: AppSnapshot = {
        napkins: model.getNapkins(),
        architects: model.getArchitects(),
        activeNepicId,
        nepics: model.getNepics(),
        watcherEvents: model.getWatcherEvents(),
      };
      win.webContents.send('app:state', snapshot);
    }
  });

  // Load model from filesystem (triggers onChange → pushes snapshot to renderer)
  if (activeNepicDir) {
    await model.loadFromFilesystem(activeNepicDir);

    // Start agents — spawns ptys, updates running flags
    await startAgents(model, ptySpawner);

    model.startWatching(activeNepicDir);
  }
});

// ── Quit handling ──

app.on('before-quit', () => {
  stopSocketServer();
  if (ptySpawner) {
    ptySpawner.clearExitHandlers();
    ptySpawner.killAll();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
