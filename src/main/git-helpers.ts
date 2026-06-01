import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

export type GitStatusCode = 'A' | 'M' | 'D' | 'R' | 'C' | 'U' | '?';

export interface GitChangedFile {
  /** Single-letter status: A added, M modified, D deleted, R renamed, C copied, U unmerged, ? untracked. */
  status: GitStatusCode;
  /** Repo-relative path. */
  path: string;
  /** For renames/copies, the original path. */
  oldPath?: string;
}

/**
 * Run a git command in `cwd`. Returns stdout on success, null if git is missing
 * or the directory isn't a repo. Never throws.
 */
async function runGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec('git', args, {
      cwd,
      maxBuffer: 16 * 1024 * 1024, // 16MB — diffs can be big
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    });
    return stdout;
  } catch {
    return null;
  }
}

/** Resolve HEAD to a full commit SHA, or null if not a repo. */
export async function getHeadSha(cwd: string): Promise<string | null> {
  const out = await runGit(cwd, ['rev-parse', 'HEAD']);
  return out?.trim() || null;
}

/**
 * Files changed since `baselineSha` (commits + working tree + untracked).
 * If baseline is null, returns just the working tree + untracked diff vs HEAD.
 *
 * Strategy:
 *   1. `git diff --name-status <baseline>` for committed changes since baseline
 *   2. `git status --porcelain` for working tree + untracked
 *   Merge into one map keyed by path. Working-tree state wins for live view.
 */
export async function getChangedFiles(
  cwd: string,
  baselineSha: string | null,
): Promise<GitChangedFile[]> {
  const result = new Map<string, GitChangedFile>();

  // 1. Commits since baseline (skip if no baseline)
  if (baselineSha) {
    const diffOut = await runGit(cwd, [
      'diff',
      '--name-status',
      `${baselineSha}..HEAD`,
    ]);
    if (diffOut) {
      for (const line of diffOut.split('\n')) {
        if (!line.trim()) continue;
        const parsed = parseDiffNameStatusLine(line);
        if (parsed) result.set(parsed.path, parsed);
      }
    }
  }

  // 2. Working tree + untracked
  const statusOut = await runGit(cwd, ['status', '--porcelain', '-uall']);
  if (statusOut) {
    for (const line of statusOut.split('\n')) {
      if (!line) continue;
      const parsed = parseStatusLine(line);
      if (parsed) result.set(parsed.path, parsed); // working tree overrides committed
    }
  }

  return Array.from(result.values()).sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Diff for a single file against `baselineSha` (or HEAD if no baseline).
 * For untracked files, returns the file content as a synthetic +diff.
 * Returns null if the file isn't found or git isn't available.
 */
export async function getFileDiff(
  cwd: string,
  baselineSha: string | null,
  filePath: string,
): Promise<string | null> {
  // Try diff vs baseline (or HEAD)
  const ref = baselineSha ?? 'HEAD';
  const diff = await runGit(cwd, ['diff', ref, '--', filePath]);
  if (diff && diff.length > 0) return diff;

  // No diff against the ref — could be an untracked file. Show its full content as +.
  // Use ls-files --others to confirm it's untracked.
  const untracked = await runGit(cwd, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    filePath,
  ]);
  if (untracked && untracked.trim() === filePath) {
    // Read the file directly and synthesize a diff
    const content = await runGit(cwd, ['show', `:0:${filePath}`]).catch(() => null);
    if (content !== null) return synthesizeAddDiff(filePath, content);
    // Fallback: read from working tree
    const fs = await import('fs/promises');
    try {
      const { join } = await import('path');
      const text = await fs.readFile(join(cwd, filePath), 'utf-8');
      return synthesizeAddDiff(filePath, text);
    } catch {
      return null;
    }
  }

  return diff ?? null;
}

// ── Internals ──

function parseStatusLine(line: string): GitChangedFile | null {
  // porcelain v1 format: XY <path>     (or "XY <path> -> <newpath>" for renames)
  // X = index status, Y = worktree status
  if (line.length < 4) return null;
  const x = line[0];
  const y = line[1];
  const rest = line.slice(3);

  // Untracked
  if (x === '?' && y === '?') {
    return { status: '?', path: rest };
  }

  // Use the more meaningful of X (staged) or Y (unstaged) — Y wins if non-space
  const code = (y !== ' ' ? y : x).toUpperCase();
  if (!isStatusCode(code)) return null;

  // Rename: "R  oldpath -> newpath"
  if (code === 'R' || code === 'C') {
    const arrow = rest.indexOf(' -> ');
    if (arrow >= 0) {
      return {
        status: code,
        path: rest.slice(arrow + 4),
        oldPath: rest.slice(0, arrow),
      };
    }
  }

  return { status: code, path: rest };
}

function parseDiffNameStatusLine(line: string): GitChangedFile | null {
  // Format: "M\tpath" or "R100\told\tnew" (rename with similarity score)
  const parts = line.split('\t');
  if (parts.length < 2) return null;
  const codeRaw = parts[0][0]?.toUpperCase();
  if (!isStatusCode(codeRaw)) return null;
  if ((codeRaw === 'R' || codeRaw === 'C') && parts.length >= 3) {
    return { status: codeRaw, path: parts[2], oldPath: parts[1] };
  }
  return { status: codeRaw, path: parts[1] };
}

function isStatusCode(c: string | undefined): c is GitStatusCode {
  return c === 'A' || c === 'M' || c === 'D' || c === 'R' || c === 'C' || c === 'U' || c === '?';
}

function synthesizeAddDiff(filePath: string, content: string): string {
  const lines = content.split('\n');
  const header = [
    `diff --git a/${filePath} b/${filePath}`,
    'new file mode 100644',
    `--- /dev/null`,
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
  ];
  const body = lines.map((l) => '+' + l);
  return [...header, ...body].join('\n');
}
