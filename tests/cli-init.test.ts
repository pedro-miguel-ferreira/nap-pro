import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { findProjectRoot } from '../src/shared/constants';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nap-init-test-'));
}

function runNapInit(cwd: string, extraArgs: string[] = []): void {
  const cliPath = path.join(__dirname, '..', 'out', 'cli', 'cli', 'nap.js');
  execFileSync('node', [cliPath, 'init', ...extraArgs], {
    cwd,
    timeout: 10000,
    encoding: 'utf8',
  });
}

// Check if CLI binary exists — skip if not built
const cliPath = path.join(__dirname, '..', 'out', 'cli', 'cli', 'nap.js');
const cliBuilt = fs.existsSync(cliPath);

describe.skipIf(!cliBuilt)('nap init', () => {
  // T-0210-60
  it('creates correct directory structure', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);

      expect(fs.existsSync(path.join(tmpDir, '.nap', '.gitignore'))).toBe(true);
      expect(fs.readFileSync(path.join(tmpDir, '.nap', '.gitignore'), 'utf8')).toBe('sock\nui-state.json\n');

      expect(fs.existsSync(path.join(tmpDir, '.nap', '00-org'))).toBe(true);
      // 20-architects/ exists but is empty — no auto-architect anymore.
      expect(fs.existsSync(path.join(tmpDir, '.nap', 'nepics', '01-v1', '20-architects'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins'))).toBe(true);

      // NO old artifacts
      expect(fs.existsSync(path.join(tmpDir, '.nap', 'nap.db'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, '.nap', 'nepics', '01-v1', '40-board'))).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0210-61
  it('does NOT create a project-level architect agent', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);
      const architectsDir = path.join(tmpDir, '.nap', 'nepics', '01-v1', '20-architects');
      // Dir exists but empty — workflow runs can drop architect-style stage
      // agents here later if a workflow needs one.
      expect(fs.existsSync(architectsDir)).toBe(true);
      expect(fs.readdirSync(architectsDir)).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0210-62
  it('writes ui-state.json', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);
      const uiState = JSON.parse(fs.readFileSync(path.join(tmpDir, '.nap', 'ui-state.json'), 'utf8'));
      expect(uiState).toEqual({ activeNepicId: '01-v1' });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0210-64
  it('init on existing project → error', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir);
      expect(() => runNapInit(tmpDir)).toThrow();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0210-65
  it('init --add-skills copies skills to project .claude/skills/', () => {
    const tmpDir = makeTmpDir();
    try {
      runNapInit(tmpDir, ['--add-skills']);
      expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'napkin'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'napkin-format'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Walk-up discovery', () => {
  // T-0210-68
  it('finds .nap/ from subdirectory', () => {
    const tmpDir = makeTmpDir();
    try {
      fs.mkdirSync(path.join(tmpDir, '.nap'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'sub', 'deep'), { recursive: true });
      const root = findProjectRoot(path.join(tmpDir, 'sub', 'deep'));
      expect(root).toBe(tmpDir);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // T-0210-69
  it('walk-up with no .nap/ → null', () => {
    const tmpDir = makeTmpDir();
    try {
      const root = findProjectRoot(tmpDir);
      expect(root).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
