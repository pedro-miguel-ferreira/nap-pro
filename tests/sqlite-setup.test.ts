import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase, closeDatabase, getDbPath } from '../src/main/database';
import {
  initSessionStore,
  createSession,
  getSession,
  getAllSessions,
  setSessionStatus,
  setSessionDone,
  removeSession,
} from '../src/main/session-store';
import { injectSessionId } from '../src/main/inject-session-id';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type DatabaseType from 'better-sqlite3';

/** Init a fresh :memory: SQLite DB and wire up the session store */
function freshDb(): DatabaseType.Database {
  closeDatabase();
  const db = initDatabase(':memory:');
  initSessionStore(db);
  return db;
}

// =========================================================================
// T-0200-01: SQLite store — interface parity
// =========================================================================
describe('T-0200-01: SQLite store — interface parity', () => {
  let db: DatabaseType.Database;

  beforeEach(() => {
    db = freshDb();
  });

  afterEach(() => {
    closeDatabase();
  });

  test('createSession returns Session with correct types', () => {
    const s = createSession({ cwd: '/tmp', name: 'parity-test' });
    expect(typeof s.id).toBe('string');
    expect(s.name).toBe('parity-test');
    expect(s.status).toBe('running');
    expect(s.cwd).toBe('/tmp');
    expect(s.parentId).toBeNull();
    expect(typeof s.createdAt).toBe('number');
    expect(s.ccSessionUuid).toBeDefined();
  });

  test('getSession returns Session for existing, undefined for missing', () => {
    const s = createSession({ cwd: '/tmp', name: 'get-test' });

    const found = getSession(s.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(s.id);
    expect(found!.name).toBe(s.name);
    expect(found!.status).toBe('running');
    expect(found!.cwd).toBe('/tmp');
    expect(found!.parentId).toBeNull();
    expect(found!.createdAt).toBe(s.createdAt);

    expect(getSession('does-not-exist')).toBeUndefined();
  });

  test('getAllSessions returns Session[]', () => {
    const s1 = createSession({ cwd: '/tmp', name: 'all-a' });
    const s2 = createSession({ cwd: '/tmp', name: 'all-b' });
    const all = getAllSessions();

    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBe(2);
    expect(all.map((s) => s.id)).toContain(s1.id);
    expect(all.map((s) => s.id)).toContain(s2.id);
  });

  test('removeSession + getSession returns undefined', () => {
    const s = createSession({ cwd: '/tmp' });
    removeSession(s.id);
    expect(getSession(s.id)).toBeUndefined();
  });

  test('optional fields: SQL null → TS undefined; parentId stays null', () => {
    const s = createSession({ cwd: '/tmp' });
    const retrieved = getSession(s.id)!;
    // command not set → undefined (not null)
    expect(retrieved.command).toBeUndefined();
    expect(retrieved.doneMessage).toBeUndefined();
    // parentId was null → stays null (not undefined)
    expect(retrieved.parentId).toBeNull();
  });
});

// =========================================================================
// T-0200-02: Schema init is idempotent
// =========================================================================
describe('T-0200-02: Schema init is idempotent', () => {
  test('double init: no errors, all 4 tables exist, row counts unchanged', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0200-02-'));
    const dbPath = path.join(tmpDir, '.nap', 'nap.db');

    try {
      // First init
      const db1 = initDatabase(dbPath);
      initSessionStore(db1);
      createSession({ cwd: '/tmp', name: 'pre-reinit' });
      closeDatabase();

      // Second init — same file, must not error
      const db2 = initDatabase(dbPath);

      const tables = db2
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r: any) => r.name);

      expect(tables).toContain('nepics');
      expect(tables).toContain('napkins');
      expect(tables).toContain('sessions');
      expect(tables).toContain('ui_state');

      // Row count unchanged
      initSessionStore(db2);
      const sessions = getAllSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].name).toBe('pre-reinit');

      closeDatabase();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// =========================================================================
// T-0200-03: CC session UUID generation and storage
// =========================================================================
describe('T-0200-03: CC session UUID generation and storage', () => {
  let db: DatabaseType.Database;

  const UUID_V4_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  beforeEach(() => {
    db = freshDb();
  });

  afterEach(() => {
    closeDatabase();
  });

  test('createSession generates a valid v4 UUID', () => {
    const s = createSession({ cwd: '/tmp' });
    expect(s.ccSessionUuid).toMatch(UUID_V4_RE);
  });

  test('UUID round-trips through getSession', () => {
    const s = createSession({ cwd: '/tmp' });
    const retrieved = getSession(s.id)!;
    expect(retrieved.ccSessionUuid).toBe(s.ccSessionUuid);
  });

  test('UUID matches raw SQL cc_session_uuid column', () => {
    const s = createSession({ cwd: '/tmp' });
    const row = db
      .prepare('SELECT cc_session_uuid FROM sessions WHERE id = ?')
      .get(s.id) as { cc_session_uuid: string };
    expect(row.cc_session_uuid).toBe(s.ccSessionUuid);
  });
});

// =========================================================================
// T-0200-04: --session-id injection into command string
// =========================================================================
describe('T-0200-04: --session-id injection into command string', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  test('claude --verbose "read prompt.md" → injected after first token', () => {
    expect(injectSessionId('claude --verbose "read prompt.md"', uuid)).toBe(
      `claude --session-id ${uuid} --verbose "read prompt.md"`,
    );
  });

  test('bare "claude" → claude --session-id <uuid>', () => {
    expect(injectSessionId('claude', uuid)).toBe(
      `claude --session-id ${uuid}`,
    );
  });

  test('claude "prompt with spaces" → preserves quoted args', () => {
    expect(injectSessionId('claude "prompt with spaces"', uuid)).toBe(
      `claude --session-id ${uuid} "prompt with spaces"`,
    );
  });

  test('non-claude command → no injection', () => {
    expect(injectSessionId('echo hello', uuid)).toBe('echo hello');
    expect(injectSessionId('node script.js', uuid)).toBe('node script.js');
    expect(injectSessionId('python -c "print(1)"', uuid)).toBe(
      'python -c "print(1)"',
    );
  });

  test('claude-like prefix (claudebot) → no injection', () => {
    expect(injectSessionId('claudebot run', uuid)).toBe('claudebot run');
  });
});

// =========================================================================
// T-0200-05: Session status transitions persist
// =========================================================================
describe('T-0200-05: Session status transitions persist', () => {
  beforeEach(() => {
    freshDb();
  });

  afterEach(() => {
    closeDatabase();
  });

  test('create → done: status and doneMessage persist', () => {
    const s = createSession({ cwd: '/tmp' });
    setSessionDone(s.id, 'task complete');
    const updated = getSession(s.id)!;
    expect(updated.status).toBe('done');
    expect(updated.doneMessage).toBe('task complete');
  });

  test('create → exited: status persists, exitedAt set', () => {
    const s = createSession({ cwd: '/tmp' });
    setSessionStatus(s.id, 'exited');
    const updated = getSession(s.id)!;
    expect(updated.status).toBe('exited');
    expect(updated.exitedAt).toBeGreaterThan(0);
  });

  test('done idempotency: guard is in socket handler, not store', () => {
    const s = createSession({ cwd: '/tmp' });
    setSessionDone(s.id, 'first');
    setSessionDone(s.id, 'second');
    const updated = getSession(s.id)!;
    // Store-level setSessionDone overwrites — the idempotency guard
    // is in main.ts handleSocketRequest('done'), not in the store itself
    expect(updated.status).toBe('done');
    expect(updated.doneMessage).toBe('second');
  });
});

// =========================================================================
// T-0200-06: Database file creation
// =========================================================================
describe('T-0200-06: Database file creation', () => {
  test('creates file and .nap/ directory from scratch', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0200-06-'));
    const napDir = path.join(tmpDir, '.nap');
    const dbPath = path.join(napDir, 'nap.db');

    try {
      expect(fs.existsSync(napDir)).toBe(false);
      initDatabase(dbPath);
      expect(fs.existsSync(dbPath)).toBe(true);
      closeDatabase();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('getDbPath returns <cwd>/.nap/nap.db', () => {
    expect(getDbPath('/projects/myapp')).toBe(
      path.join('/projects/myapp', '.nap', 'nap.db'),
    );
  });

  test('opening existing db does not throw', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0200-06b-'));
    const dbPath = path.join(tmpDir, '.nap', 'nap.db');

    try {
      initDatabase(dbPath);
      closeDatabase();
      expect(() => initDatabase(dbPath)).not.toThrow();
      closeDatabase();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
