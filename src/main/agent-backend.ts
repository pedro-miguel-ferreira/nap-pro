import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildClaudeArgs, getPermissionsSettingsPath } from './claude-args';
import { isResumeMissingSession } from './resume-detection';
import { getAgentCost, type AgentCostSummary } from './cost-helpers';
import { installCursorPermissions } from './cursor-permissions';
import { CLAUDE_MODELS, type ClaudeModelOption } from '../shared/claude-models';
import { CURSOR_MODELS, mapCursorModel } from '../shared/cursor-models';

/**
 * The agent CLI nap-pro drives in each pty. `claude` (Claude Code) is the
 * default and upstream behaviour; `cursor` drives Cursor's `agent` CLI.
 *
 * Selection (see resolveBackendName): NAP_BACKEND env > `.nap/config.json`
 * `backend` > 'claude'. Set once per process via setActiveBackend, the same
 * way the permissions path is — spawn sites call getBackend() instead of
 * threading it through every caller.
 */

export type BackendName = 'claude' | 'cursor';

export const BACKEND_NAMES: BackendName[] = ['claude', 'cursor'];

export interface BuildArgsOpts {
  /** 'fresh' starts the session with this id; 'resume' continues it. */
  mode: 'fresh' | 'resume';
  sessionId: string;
  model?: string | null;
  prompt?: string | null;
  /** Claude only: omit --verbose. */
  quiet?: boolean;
}

export interface AgentBackend {
  name: BackendName;
  /** Executable spawned in the pty (resolved via PATH). */
  binary: string;
  /**
   * Mint the id for a new agent session. nap-pro owns the id: agent id ==
   * backend session id, for both backends.
   */
  newSessionId(): string;
  buildArgs(opts: BuildArgsOpts): string[];
  /** Args for an unmanaged, human-driven session (`nap-pro doctor`). */
  buildStandaloneArgs(prompt: string): string[];
  /**
   * Pre-spawn check that a session can be resumed. true/false when the backend
   * can tell from disk; undefined = unknown, rely on resumeFailedOutput after
   * the spawn exits.
   */
  sessionExists(cwd: string, sessionId: string): boolean | undefined;
  /** Post-exit check: did the output say the resumed session is gone? */
  resumeFailedOutput(buffer: string): boolean;
  /** Prepare the agent's run dir (cwd) before spawn — e.g. permission files. */
  installPermissions(runDir: string): void;
  /** false = readUsage always returns null (no usage data on disk). */
  usageAvailable: boolean;
  /** Token/cost usage for a session; null = this backend doesn't expose it. */
  readUsage(agentId: string, agentName: string, cwd: string): Promise<AgentCostSummary | null>;
  models: ClaudeModelOption[];
  /** Translate a stored model id into one this backend's CLI accepts. */
  mapModel(id: string | null | undefined): string | null;
}

export const claudeBackend: AgentBackend = {
  name: 'claude',
  binary: 'claude',
  newSessionId: () => crypto.randomUUID(),
  buildArgs: (opts) =>
    buildClaudeArgs({
      sessionId: opts.sessionId,
      model: opts.model,
      prompt: opts.prompt,
      resume: opts.mode === 'resume',
      quiet: opts.quiet,
    }),
  buildStandaloneArgs: (prompt) => ['--verbose', prompt],
  sessionExists: () => undefined,
  resumeFailedOutput: isResumeMissingSession,
  // Claude reads .nap/permissions.json directly via --settings.
  installPermissions: () => {},
  usageAvailable: true,
  readUsage: (agentId, agentName, cwd) => getAgentCost(agentId, agentName, cwd),
  models: CLAUDE_MODELS,
  mapModel: (id) => id || null,
};

const ID = /^[a-zA-Z0-9._-]+$/;

/**
 * Cursor keys chats by the md5 of the realpath of the cwd the agent ran in:
 * `~/.cursor/chats/<md5(cwd)>/<chatId>/meta.json`.
 */
function cursorChatMetaPaths(cwd: string, sessionId: string): string[] {
  const dirs = new Set<string>([path.resolve(cwd)]);
  try {
    dirs.add(fs.realpathSync(cwd));
  } catch {
    // cwd gone — fall back to the literal path
  }
  return [...dirs].map((d) =>
    path.join(
      os.homedir(), '.cursor', 'chats',
      crypto.createHash('md5').update(d).digest('hex'),
      sessionId, 'meta.json',
    ),
  );
}

export const cursorBackend: AgentBackend = {
  name: 'cursor',
  binary: 'agent',
  // `agent --resume <id>` with an id Cursor hasn't seen starts a new chat that
  // adopts that id (verified), so nap-pro can mint the id up front like it
  // does for Claude — no `agent create-chat` round trip, and no dependence on
  // knowing the agent's final cwd at stub-creation time.
  newSessionId: () => crypto.randomUUID(),
  buildArgs: (opts) => {
    if (!ID.test(opts.sessionId)) throw new Error(`invalid session id: ${opts.sessionId}`);
    const model = mapCursorModel(opts.model);
    if (model != null && !ID.test(model)) throw new Error(`invalid model id: ${model}`);
    // Fresh and resume are the same invocation: --resume <id> creates the chat
    // on first use. --trust skips the workspace-trust dialog (the TUI blocks on
    // it otherwise); --force runs tools without prompting, bounded by the deny
    // list in .cursor/cli.json.
    const out = ['--resume', opts.sessionId, '--trust', '--approve-mcps', '--force'];
    if (model) out.push('--model', model);
    if (opts.prompt && opts.prompt.length > 0) out.push(opts.prompt);
    return out;
  },
  buildStandaloneArgs: (prompt) => ['--trust', prompt],
  sessionExists: (cwd, sessionId) => {
    for (const p of cursorChatMetaPaths(cwd, sessionId)) {
      try {
        const meta = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (meta?.hasConversation) return true;
      } catch {
        // not here
      }
    }
    return false;
  },
  // Resuming a missing chat silently starts an empty one (exit 0) — nothing
  // to detect in the output; sessionExists covers it before spawn.
  resumeFailedOutput: () => false,
  // --force means the deny list is the only guardrail: no rules file, no spawn.
  installPermissions: (runDir) => {
    const permsPath = getPermissionsSettingsPath();
    if (!permsPath) throw new Error('no .nap/permissions.json registered — refusing to run agent --force without a deny list');
    installCursorPermissions(permsPath, runDir);
  },
  // Cursor transcripts carry no token usage.
  usageAvailable: false,
  readUsage: async () => null,
  models: CURSOR_MODELS,
  mapModel: mapCursorModel,
};

export const COST_UNAVAILABLE_MESSAGE = "Cost data isn't available for the Cursor backend";

const BACKENDS: Record<BackendName, AgentBackend> = {
  claude: claudeBackend,
  cursor: cursorBackend,
};

export function isBackendName(v: unknown): v is BackendName {
  return typeof v === 'string' && (BACKEND_NAMES as string[]).includes(v);
}

export function getBackendByName(name: BackendName): AgentBackend {
  return BACKENDS[name];
}

/** Every agent binary — the test-mode spawner swaps any of these for `cat`. */
export const AGENT_BINARIES = new Set(Object.values(BACKENDS).map((b) => b.binary));

let _active: AgentBackend = claudeBackend;

export function setActiveBackend(b: AgentBackend): void {
  _active = b;
}

export function getBackend(): AgentBackend {
  return _active;
}

/**
 * NAP_BACKEND env > `<projectCwd>/.nap/config.json` `backend` > 'claude'.
 * Unknown values are ignored (fall through), never fatal. Sync because the
 * CLI resolves it too.
 */
export function resolveBackendName(projectCwd: string | null | undefined): BackendName {
  const env = process.env['NAP_BACKEND'];
  if (isBackendName(env)) return env;
  if (projectCwd) {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(projectCwd, '.nap', 'config.json'), 'utf-8'));
      if (isBackendName(cfg?.backend)) return cfg.backend;
    } catch {
      // missing / malformed — default
    }
  }
  return 'claude';
}

/** The directory the spawned agent actually runs in — mirrors NodePtySpawner. */
export function resolveRunDir(cwd: string): string {
  return cwd || process.env['NAP_CWD'] || process.cwd();
}

/**
 * Build the spawn request for an agent session on the active backend, after
 * preparing its run dir. Every agent spawn site goes through here (or
 * computeResumeActions for the STOP→RUN batch).
 */
export function buildAgentSpawn(opts: {
  id: string;
  mode: 'fresh' | 'resume';
  model?: string | null;
  prompt?: string | null;
  cwd: string;
}): { id: string; file: string; args: string[]; cwd: string } {
  const b = getBackend();
  prepareRunDir(b, opts.cwd);
  return {
    id: opts.id,
    file: b.binary,
    args: b.buildArgs({ mode: opts.mode, sessionId: opts.id, model: opts.model, prompt: opts.prompt }),
    cwd: opts.cwd,
  };
}

/**
 * Best-effort for Claude (it reads .nap/permissions.json via --settings). For
 * Cursor the generated deny list is the only guardrail under --force, so a
 * failure blocks the spawn (fail closed).
 */
export function prepareRunDir(b: AgentBackend, cwd: string): void {
  try {
    b.installPermissions(resolveRunDir(cwd));
  } catch (err) {
    if (b.name === 'cursor') throw err;
    // eslint-disable-next-line no-console
    console.warn(`[nap-pro] failed to install ${b.name} permissions in ${resolveRunDir(cwd)}:`, err);
  }
}
