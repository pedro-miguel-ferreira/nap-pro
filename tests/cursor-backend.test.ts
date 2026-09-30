import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFileSync, spawn } from 'child_process';
import {
  claudeBackend,
  cursorBackend,
  getBackend,
  setActiveBackend,
  resolveBackendName,
  buildAgentSpawn,
} from '../src/main/agent-backend';
import { buildClaudeArgs, setPermissionsSettingsPath } from '../src/main/claude-args';
import { mapCursorModel, CURSOR_MODELS } from '../src/shared/cursor-models';
import {
  toCursorRule,
  translatePermissions,
  commandMatchesRules,
  installCursorPermissions,
  writeGuardianHook,
  hasGuardianHook,
} from '../src/main/cursor-permissions';
import { DEFAULT_PERMISSIONS_SETTINGS } from '../src/main/permissions-config';
import { createModel } from '../src/main/model';
import { FakePtySpawner } from '../src/main/pty-spawner';
import { computeResumeActions } from '../src/main/resume';
import { startAgents } from '../src/main/coordinators';
import { createSurvivabilityFixture, NEPIC_DIR } from './fixtures';

function tmpDir(prefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

/** Register a real .nap/permissions.json — the Cursor backend refuses to spawn without one. */
function registerPermissions(): void {
  const permsPath = path.join(tmpDir('nap-cursor-proj-'), '.nap', 'permissions.json');
  fs.mkdirSync(path.dirname(permsPath), { recursive: true });
  fs.writeFileSync(permsPath, JSON.stringify(DEFAULT_PERMISSIONS_SETTINGS));
  setPermissionsSettingsPath(permsPath);
}

/** Write a Cursor chat meta.json the way `agent` does, under a fake HOME. */
function writeCursorChat(home: string, cwd: string, id: string, hasConversation = true): void {
  const hash = crypto.createHash('md5').update(cwd).digest('hex');
  const dir = path.join(home, '.cursor', 'chats', hash, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({ schemaVersion: 1, createdAtMs: 1, hasConversation, cwd }),
  );
}

const savedEnv = { HOME: process.env.HOME, NAP_CWD: process.env.NAP_CWD, NAP_BACKEND: process.env.NAP_BACKEND };

afterEach(() => {
  setActiveBackend(claudeBackend);
  setPermissionsSettingsPath(null);
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ── Args ──

describe('cursor backend — args', () => {
  it('fresh and resume both use --resume <id> with trust/force flags', () => {
    const fresh = cursorBackend.buildArgs({ mode: 'fresh', sessionId: 'abc', prompt: 'hello' });
    const resume = cursorBackend.buildArgs({ mode: 'resume', sessionId: 'abc' });
    // No stored model → Opus 5.5, never Cursor's own (Composer) default.
    const flags = ['--resume', 'abc', '--trust', '--approve-mcps', '--force', '--model', 'claude-opus-5-5-high'];
    expect(fresh).toEqual([...flags, 'hello']);
    expect(resume).toEqual(flags);
  });

  it('never emits Claude-only flags', () => {
    setPermissionsSettingsPath('/tmp/permissions.json');
    const args = cursorBackend.buildArgs({ mode: 'fresh', sessionId: 'abc', prompt: 'p' });
    for (const flag of ['--verbose', '--session-id', '--settings']) {
      expect(args).not.toContain(flag);
    }
  });

  it('maps the model and keeps the prompt last', () => {
    const args = cursorBackend.buildArgs({ mode: 'fresh', sessionId: 'abc', model: 'claude-opus-5-5', prompt: 'go' });
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe('claude-opus-5-5-high');
    expect(args[args.length - 1]).toBe('go');
  });

  it('rejects hostile session/model ids', () => {
    expect(() => cursorBackend.buildArgs({ mode: 'fresh', sessionId: '$(rm -rf /)' })).toThrow();
    expect(() => cursorBackend.buildArgs({ mode: 'fresh', sessionId: 'abc', model: 'x; rm' })).toThrow();
  });

  it('claude backend emits exactly buildClaudeArgs', () => {
    setPermissionsSettingsPath('/tmp/permissions.json');
    expect(claudeBackend.buildArgs({ mode: 'fresh', sessionId: 'abc', model: 'claude-opus-4-7', prompt: 'hi' }))
      .toEqual(buildClaudeArgs({ sessionId: 'abc', model: 'claude-opus-4-7', prompt: 'hi' }));
    expect(claudeBackend.buildArgs({ mode: 'resume', sessionId: 'abc' }))
      .toEqual(buildClaudeArgs({ sessionId: 'abc', resume: true }));
    expect(claudeBackend.binary).toBe('claude');
    expect(cursorBackend.binary).toBe('agent');
  });

  it('buildAgentSpawn uses the active backend binary', () => {
    setActiveBackend(cursorBackend);
    registerPermissions();
    const req = buildAgentSpawn({ id: 'abc', mode: 'fresh', cwd: tmpDir('nap-cursor-run-') });
    expect(req.file).toBe('agent');
    expect(req.args.slice(0, 2)).toEqual(['--resume', 'abc']);
  });
});

// ── Models ──

describe('cursor backend — mapModel', () => {
  it('adds -high to bare claude-style ids', () => {
    expect(mapCursorModel('claude-opus-4-8')).toBe('claude-opus-4-8-high');
    expect(mapCursorModel('claude-fable-5')).toBe('claude-fable-5-high');
    expect(mapCursorModel('claude-opus-5')).toBe('claude-opus-5-high');
    expect(mapCursorModel('claude-opus-5-5')).toBe('claude-opus-5-5-high');
    expect(mapCursorModel('claude-sonnet-5')).toBe('claude-sonnet-5-high');
  });

  it('passes already-valid cursor ids through', () => {
    for (const id of ['composer-2.5', 'claude-opus-5-5-max', 'claude-sonnet-5-low', 'gpt-5.6-sol-high']) {
      expect(mapCursorModel(id)).toBe(id);
    }
    for (const m of CURSOR_MODELS) expect(mapCursorModel(m.id)).toBe(m.id);
  });

  it('maps legacy claude ids Cursor does not offer', () => {
    expect(mapCursorModel('claude-opus-4-7')).toBe('claude-opus-4-8-high');
    expect(mapCursorModel('claude-sonnet-4-6')).toBe('claude-sonnet-5-high');
  });

  it('empty → Opus 5.5 (not Cursor\'s Composer default)', () => {
    expect(mapCursorModel(null)).toBe('claude-opus-5-5-high');
    expect(mapCursorModel('')).toBe('claude-opus-5-5-high');
  });
});

// ── Session existence ──

describe('cursor backend — sessionExists', () => {
  it('true only when meta.json exists with hasConversation', () => {
    const home = tmpDir('nap-cursor-home-');
    const cwd = tmpDir('nap-cursor-cwd-');
    process.env.HOME = home;
    expect(cursorBackend.sessionExists(cwd, 'chat-1')).toBe(false);
    writeCursorChat(home, cwd, 'chat-1', false);
    expect(cursorBackend.sessionExists(cwd, 'chat-1')).toBe(false);
    writeCursorChat(home, cwd, 'chat-1', true);
    expect(cursorBackend.sessionExists(cwd, 'chat-1')).toBe(true);
    // Keyed by cwd — same id elsewhere is a different chat.
    expect(cursorBackend.sessionExists(tmpDir('nap-cursor-other-'), 'chat-1')).toBe(false);
  });

  it('claude defers to output detection', () => {
    expect(claudeBackend.sessionExists('/x', 'y')).toBeUndefined();
    expect(claudeBackend.resumeFailedOutput('No conversation found with session ID')).toBe(true);
    expect(cursorBackend.resumeFailedOutput('No conversation found with session ID')).toBe(false);
  });
});

// ── Permissions translation ──

describe('cursor backend — permissions', () => {
  it('translates Claude rules to verified Cursor pattern forms', () => {
    expect(toCursorRule('Bash(gh pr merge:*)')).toBe('Shell(gh pr merge*)');
    expect(toCursorRule('Bash(git reset --hard:*)')).toBe('Shell(git reset --hard*)');
    expect(toCursorRule('Bash(rmdir:*)')).toBe('Shell(rmdir)');
    expect(toCursorRule('Read(./secrets/**)')).toBe('Read(./secrets/**)');
    expect(toCursorRule('Edit(./dist/**)')).toBe('Write(./dist/**)');
    expect(toCursorRule('WebFetch')).toBeNull();
    // The `:*` form does not match in Cursor — never emitted.
    expect(toCursorRule('Bash(git clean:*)')).not.toContain(':*');
  });

  it('ask rules become deny without a guardian', () => {
    const { deny, allow } = translatePermissions(DEFAULT_PERMISSIONS_SETTINGS, { guardian: false });
    expect(allow).toEqual([]);
    expect(deny).toEqual([
      'Shell(gh pr merge*)',
      'Shell(gh pr close*)',
      'Shell(rm -rf*)',
      'Shell(rm -fr*)',
      'Shell(rm -r*)',
      'Shell(rm -R*)',
      'Shell(rmdir)',
      'Shell(git clean*)',
      'Shell(git reset --hard*)',
    ]);
  });

  it('fails closed: no readable permissions file blocks the cursor spawn', () => {
    const dir = tmpDir('nap-cursor-failclosed-');
    setActiveBackend(cursorBackend);
    setPermissionsSettingsPath(null);
    expect(() => buildAgentSpawn({ id: crypto.randomUUID(), mode: 'fresh', cwd: dir })).toThrow();
    setPermissionsSettingsPath(path.join(dir, '.nap', 'permissions.json')); // does not exist
    expect(() => buildAgentSpawn({ id: crypto.randomUUID(), mode: 'fresh', cwd: dir })).toThrow();
    expect(fs.existsSync(path.join(dir, '.cursor', 'cli.json'))).toBe(false);

    setActiveBackend(claudeBackend); // Claude reads --settings itself — still spawns
    expect(() => buildAgentSpawn({ id: crypto.randomUUID(), mode: 'fresh', cwd: dir })).not.toThrow();
  });

  it('ask rules are left to the guardian hook when it is installed', () => {
    const { deny } = translatePermissions(DEFAULT_PERMISSIONS_SETTINGS, { guardian: true });
    expect(deny).toEqual(['Shell(gh pr merge*)', 'Shell(gh pr close*)']);
  });

  it('commandMatchesRules checks every segment by prefix', () => {
    const ask = DEFAULT_PERMISSIONS_SETTINGS.permissions.ask;
    expect(commandMatchesRules('rm -rf build', ask)).toBe(true);
    expect(commandMatchesRules('cd x && git reset --hard HEAD', ask)).toBe(true);
    expect(commandMatchesRules('rm file.txt', ask)).toBe(false);
    expect(commandMatchesRules('ls -la', ask)).toBe(false);
    expect(commandMatchesRules('echo rm -rf', ask)).toBe(false);
  });

  it('installCursorPermissions writes cli.json and excludes generated files', () => {
    const project = tmpDir('nap-cursor-proj-');
    execFileSync('git', ['init', '-q'], { cwd: project });
    fs.mkdirSync(path.join(project, '.nap'));
    const permsPath = path.join(project, '.nap', 'permissions.json');
    fs.writeFileSync(permsPath, JSON.stringify(DEFAULT_PERMISSIONS_SETTINGS));

    installCursorPermissions(permsPath, project);
    installCursorPermissions(permsPath, project); // idempotent

    const cli = JSON.parse(fs.readFileSync(path.join(project, '.cursor', 'cli.json'), 'utf-8'));
    expect(cli.permissions.deny).toContain('Shell(rm -rf*)');
    const exclude = fs.readFileSync(path.join(project, '.git', 'info', 'exclude'), 'utf-8');
    expect(exclude.match(/^\.cursor\/cli\.json$/gm)).toHaveLength(1);
    expect(exclude).toMatch(/^\.cursor\/hooks\.json$/m);
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: project, encoding: 'utf-8' });
    expect(status).not.toContain('.cursor');
  });

  it('guardian mode copies the hook into a separate run dir (worktree)', () => {
    const project = tmpDir('nap-cursor-proj-');
    const worktree = tmpDir('nap-cursor-wt-');
    fs.mkdirSync(path.join(project, '.nap'));
    const permsPath = path.join(project, '.nap', 'permissions.json');
    fs.writeFileSync(permsPath, JSON.stringify(DEFAULT_PERMISSIONS_SETTINGS));
    writeGuardianHook(project);

    installCursorPermissions(permsPath, worktree);

    expect(hasGuardianHook(worktree)).toBe(true);
    const cli = JSON.parse(fs.readFileSync(path.join(worktree, '.cursor', 'cli.json'), 'utf-8'));
    expect(cli.permissions.deny).not.toContain('Shell(rm -rf*)');
  });

  it('writeGuardianHook keeps other hooks and does not duplicate itself', () => {
    const dir = tmpDir('nap-cursor-hooks-');
    fs.mkdirSync(path.join(dir, '.cursor'));
    fs.writeFileSync(path.join(dir, '.cursor', 'hooks.json'), JSON.stringify({
      version: 1,
      hooks: { beforeShellExecution: [{ command: './mine.sh' }], afterFileEdit: [{ command: './fmt.sh' }] },
    }));
    writeGuardianHook(dir);
    writeGuardianHook(dir);
    const hooks = JSON.parse(fs.readFileSync(path.join(dir, '.cursor', 'hooks.json'), 'utf-8'));
    expect(hooks.hooks.afterFileEdit).toHaveLength(1);
    expect(hooks.hooks.beforeShellExecution.map((h: any) => h.command))
      .toEqual(['./mine.sh', 'nap-pro hook before-shell']);
  });
});

// ── Backend selection ──

describe('backend selection', () => {
  it('defaults to claude', () => {
    delete process.env.NAP_BACKEND;
    expect(resolveBackendName(tmpDir('nap-sel-'))).toBe('claude');
    expect(resolveBackendName(null)).toBe('claude');
    expect(getBackend().name).toBe('claude');
  });

  it('reads .nap/config.json backend', () => {
    delete process.env.NAP_BACKEND;
    const dir = tmpDir('nap-sel-');
    fs.mkdirSync(path.join(dir, '.nap'));
    fs.writeFileSync(path.join(dir, '.nap', 'config.json'), JSON.stringify({ backend: 'cursor' }));
    expect(resolveBackendName(dir)).toBe('cursor');
  });

  it('NAP_BACKEND overrides config; unknown values are ignored', () => {
    const dir = tmpDir('nap-sel-');
    fs.mkdirSync(path.join(dir, '.nap'));
    fs.writeFileSync(path.join(dir, '.nap', 'config.json'), JSON.stringify({ backend: 'cursor' }));
    process.env.NAP_BACKEND = 'claude';
    expect(resolveBackendName(dir)).toBe('claude');
    process.env.NAP_BACKEND = 'bogus';
    expect(resolveBackendName(dir)).toBe('cursor');
  });
});

// ── Spawn + resume paths on the cursor backend ──

describe('cursor backend — spawn and resume paths', () => {
  let home: string;
  let runDir: string;

  beforeEach(() => {
    home = tmpDir('nap-cursor-home-');
    runDir = tmpDir('nap-cursor-run-');
    process.env.HOME = home;
    // Survivability fixture agents have no worktree → run dir is NAP_CWD.
    process.env.NAP_CWD = runDir;
    setActiveBackend(cursorBackend);
    registerPermissions();
  });

  it('computeResumeActions emits the agent binary + --resume', async () => {
    const model = createModel(createSurvivabilityFixture());
    await model.loadFromFilesystem(NEPIC_DIR);
    const ta = computeResumeActions(model.getAllAgents()).find((d) => d.agentId === 'uuid-ta')!;
    expect(ta.file).toBe('agent');
    expect(ta.args!.slice(0, 2)).toEqual(['--resume', 'uuid-ta']);
  });

  it('STOP→RUN: missing chat → archived without spawning; existing chat → resumed', async () => {
    writeCursorChat(home, runDir, 'uuid-arch');
    const model = createModel(createSurvivabilityFixture());
    await model.loadFromFilesystem(NEPIC_DIR);
    const pty = new FakePtySpawner();

    await startAgents(model, pty);

    const byId = (id: string) => model.getAllAgents().find((a) => a.id === id)!;
    expect(pty.spawned.find((s) => s.id === 'uuid-ta')).toBeUndefined();
    expect(byId('uuid-ta').archived).toBe(true);
    const arch = pty.spawned.find((s) => s.id === 'uuid-arch')!;
    expect(arch.file).toBe('agent');
    expect(arch.args.join(' ')).toContain('--resume uuid-arch');
    expect(byId('uuid-arch').archived).toBe(false);
  });

  it('startAgentById spawns agent with the stored model mapped', async () => {
    const model = createModel(createSurvivabilityFixture());
    await model.loadFromFilesystem(NEPIC_DIR);
    const napkin = model.getNapkins()[0].slug;
    const stub = await model.createAgentStub(napkin, '009-cursor', 'fs-eng', undefined, undefined, 'claude-fable-5');
    const pty = new FakePtySpawner();

    await model.startAgentById(stub.id, 'do the thing', pty);

    const call = pty.spawned.find((s) => s.id === stub.id)!;
    expect(call.file).toBe('agent');
    expect(call.args).toEqual([
      '--resume', stub.id, '--trust', '--approve-mcps', '--force',
      '--model', 'claude-fable-5-high', 'do the thing',
    ]);
  });

  it('usage is explicitly unavailable', async () => {
    expect(cursorBackend.usageAvailable).toBe(false);
    expect(await cursorBackend.readUsage('a', 'b', runDir)).toBeNull();
  });
});

// ── CLI ──

const cliPath = path.join(__dirname, '..', 'out', 'cli', 'cli', 'nap.js');
const cliBuilt = fs.existsSync(cliPath);

function runCli(args: string[], opts: { cwd: string; env?: Record<string, string>; input?: string }) {
  try {
    const stdout = execFileSync('node', [cliPath, ...args], {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      input: opts.input,
      timeout: 10000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as string;
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout || '', stderr: e.stderr || '', exitCode: e.status || 1 };
  }
}

describe.skipIf(!cliBuilt)('cursor backend — CLI', () => {
  const baseEnv = { NAP_SESSION_ID: '', NAP_SOCKET: '', NAP_CWD: '', NAP_BACKEND: '' };

  it('init --backend cursor --guardian writes config + Cursor hook (no Claude hook)', () => {
    const dir = tmpDir('nap-cli-cursor-');
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const res = runCli(['init', '--backend', 'cursor', '--guardian'], { cwd: dir, env: baseEnv });
    expect(res.exitCode).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(dir, '.nap', 'config.json'), 'utf-8')).backend).toBe('cursor');
    expect(hasGuardianHook(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, '.claude', 'settings.json'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf-8')).toContain('.cursor/hooks.json');
  });

  it('setup --backend merges into existing config; invalid name → exit 1', () => {
    const dir = tmpDir('nap-cli-cursor-');
    expect(runCli(['init'], { cwd: dir, env: baseEnv }).exitCode).toBe(0);
    fs.writeFileSync(path.join(dir, '.nap', 'config.json'), JSON.stringify({ prTitlePrefix: '[X]' }));
    expect(runCli(['setup', '--backend', 'cursor'], { cwd: dir, env: baseEnv }).exitCode).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(dir, '.nap', 'config.json'), 'utf-8')))
      .toEqual({ prTitlePrefix: '[X]', backend: 'cursor' });
    const bad = runCli(['setup', '--backend', 'gemini'], { cwd: dir, env: baseEnv });
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr).toContain('invalid --backend');
  });

  it('hook before-shell: allows when not a nap agent, and non-ask commands without the socket', () => {
    const dir = tmpDir('nap-cli-cursor-');
    fs.mkdirSync(path.join(dir, '.nap'));
    fs.writeFileSync(path.join(dir, '.nap', 'permissions.json'), JSON.stringify(DEFAULT_PERMISSIONS_SETTINGS));

    const human = runCli(['hook', 'before-shell'], { cwd: dir, env: baseEnv, input: JSON.stringify({ command: 'rm -rf x' }) });
    expect(human.exitCode).toBe(0);
    expect(JSON.parse(human.stdout)).toEqual({ permission: 'allow' });

    const agentEnv = { ...baseEnv, NAP_SESSION_ID: 'uuid-x', NAP_CWD: dir, NAP_SOCKET: '/nonexistent.sock' };
    const ls = runCli(['hook', 'before-shell'], { cwd: dir, env: agentEnv, input: JSON.stringify({ command: 'ls -la' }) });
    expect(ls.exitCode).toBe(0);
    expect(JSON.parse(ls.stdout)).toEqual({ permission: 'allow' });

    // An ask-rule command needs the guardian — nap not running → non-zero
    // exit, which the failClosed hook turns into a block.
    const rm = runCli(['hook', 'before-shell'], { cwd: dir, env: agentEnv, input: JSON.stringify({ command: 'rm -rf x' }) });
    expect(rm.exitCode).not.toBe(0);
  });

  it('hook before-shell: guardian deny comes back in Cursor format', async () => {
    const net = await import('net');
    const dir = tmpDir('nap-cli-cursor-');
    fs.mkdirSync(path.join(dir, '.nap'));
    fs.writeFileSync(path.join(dir, '.nap', 'permissions.json'), JSON.stringify(DEFAULT_PERMISSIONS_SETTINGS));
    const sock = path.join(os.tmpdir(), `nap-cur-${process.pid}-${Date.now()}.sock`);
    const received: any[] = [];
    const server = net.createServer((c) => {
      let buf = '';
      c.on('data', (d) => {
        buf += d.toString();
        const i = buf.indexOf('\n');
        if (i < 0) return;
        received.push(JSON.parse(buf.slice(0, i)));
        c.write(JSON.stringify({ decision: 'deny', message: 'not today' }) + '\n');
      });
    });
    await new Promise<void>((r) => server.listen(sock, () => r()));
    try {
      const child = spawn('node', [cliPath, 'hook', 'before-shell'], {
        cwd: dir,
        env: { ...process.env, ...baseEnv, NAP_SESSION_ID: 'uuid-x', NAP_CWD: dir, NAP_SOCKET: sock },
      });
      child.stdin.end(JSON.stringify({ command: 'git reset --hard HEAD~1', workspace_roots: [dir] }));
      let out = '';
      child.stdout.on('data', (d) => { out += d.toString(); });
      const code = await new Promise<number>((r) => child.on('exit', (c) => r(c ?? 1)));
      expect(code).toBe(0);
      expect(JSON.parse(out)).toEqual({ permission: 'deny', user_message: 'not today', agent_message: 'not today' });
      expect(received[0]).toMatchObject({
        type: 'hook-permission-request',
        agentId: 'uuid-x',
        tool: 'Shell',
        command: 'git reset --hard HEAD~1',
      });
    } finally {
      server.close();
    }
  });
});
