import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { assertValidIdentifier } from '../shared/identifiers';

const exec = promisify(execFile);

const BRANCH_PREFIX = 'nap-pro/';

/**
 * Resolve the directory where this project's worktrees live. Caller-supplied
 * `baseDir` wins; otherwise we fall back to a sibling directory of the project
 * so worktrees don't pollute the project's git status with themselves.
 *
 * Accepted shapes for `baseDir`:
 *   - empty / undefined → `<projectCwd>-worktrees/` (default)
 *   - absolute path     → used as-is
 *   - `~`-prefixed      → home-expanded
 *   - relative          → resolved against projectCwd
 */
export function resolveWorktreeBaseDir(projectCwd: string, baseDir?: string): string {
  const trimmed = baseDir?.trim();
  if (!trimmed) {
    return `${projectCwd}-worktrees`;
  }
  if (trimmed.startsWith('~')) {
    return path.join(os.homedir(), trimmed.slice(1).replace(/^[/\\]/, ''));
  }
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return path.resolve(projectCwd, trimmed);
}

/**
 * Path where a napkin's worktree lives. Composes `resolveWorktreeBaseDir` with
 * the napkin slug.
 *
 * Example:  projectCwd=/Users/x/proj, slug=0100-foo, baseDir=undefined
 *           → /Users/x/proj-worktrees/0100-foo
 */
export function getWorktreePath(projectCwd: string, slug: string, baseDir?: string): string {
  return path.join(resolveWorktreeBaseDir(projectCwd, baseDir), slug);
}

export function getWorktreeBranch(slug: string): string {
  return `${BRANCH_PREFIX}${slug}`;
}

interface ExecResult {
  stdout: string;
  ok: boolean;
  error?: string;
}

async function runGit(cwd: string, args: string[]): Promise<ExecResult> {
  try {
    const { stdout } = await exec('git', args, {
      cwd,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    });
    return { stdout, ok: true };
  } catch (err) {
    const e = err as { message?: string; stderr?: string };
    return { stdout: '', ok: false, error: (e.stderr || e.message || 'git failed').toString().trim() };
  }
}

export interface CreateWorktreeResult {
  ok: boolean;
  path?: string;
  branch?: string;
  error?: string;
}

/**
 * Create a worktree for a napkin.
 *
 * If `baseBranch` is given, the new branch is forked from that. Without it,
 * we fork from the repo's default branch (origin/HEAD → main → master → first).
 * If no default can be resolved, falls back to the project's current HEAD.
 *
 * If the worktree path already exists, returns it idempotently.
 * If the nap-pro/<slug> branch already exists, attaches the worktree to it
 * instead of recreating (baseBranch ignored in that case).
 */
export async function createWorktree(
  projectCwd: string,
  slug: string,
  opts: { baseBranch?: string; baseDir?: string } = {},
): Promise<CreateWorktreeResult> {
  assertValidIdentifier(slug, 'napkin-slug');
  const target = getWorktreePath(projectCwd, slug, opts.baseDir);
  const branch = getWorktreeBranch(slug);

  // Already exists?
  if (await pathExists(target)) {
    const list = await runGit(projectCwd, ['worktree', 'list', '--porcelain']);
    if (list.ok && list.stdout.includes(target)) {
      return { ok: true, path: target, branch };
    }
    return { ok: false, error: `path exists but isn't a registered worktree: ${target}` };
  }

  await fsPromises.mkdir(path.dirname(target), { recursive: true });

  // If our nap-pro branch already exists, attach to it as-is (preserve work in progress).
  const branchCheck = await runGit(projectCwd, ['rev-parse', '--verify', `refs/heads/${branch}`]);
  if (branchCheck.ok) {
    const result = await runGit(projectCwd, ['worktree', 'add', target, branch]);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, path: target, branch };
  }

  // Resolve the base ref. Falls back gracefully through the chain.
  const explicitBase = opts.baseBranch?.trim();
  const base =
    explicitBase || (await getDefaultBranch(projectCwd)) || '';

  // Validate base if explicit, so we surface a clear error rather than git's.
  if (explicitBase) {
    const exists = await runGit(projectCwd, [
      'rev-parse',
      '--verify',
      '--quiet',
      explicitBase,
    ]);
    if (!exists.ok) {
      return {
        ok: false,
        error: `base branch '${explicitBase}' not found (try one from \`git branch -a\`)`,
      };
    }
  }

  // Build args. If no base resolved, omit it — git uses HEAD.
  const addArgs = base
    ? ['worktree', 'add', '-b', branch, target, base]
    : ['worktree', 'add', '-b', branch, target];

  const result = await runGit(projectCwd, addArgs);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, path: target, branch };
}

export interface RemoveWorktreeResult {
  ok: boolean;
  error?: string;
}

/**
 * Remove a worktree. By default refuses if it has uncommitted changes; pass force=true to override.
 * The branch is preserved so the work isn't lost.
 */
export async function removeWorktree(
  projectCwd: string,
  slug: string,
  opts: { force?: boolean; baseDir?: string } = {},
): Promise<RemoveWorktreeResult> {
  assertValidIdentifier(slug, 'napkin-slug');
  const target = getWorktreePath(projectCwd, slug, opts.baseDir);

  if (!(await pathExists(target))) {
    return { ok: true }; // already gone
  }

  const args = ['worktree', 'remove', target];
  if (opts.force) args.push('--force');

  const result = await runGit(projectCwd, args);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

export interface WorktreeInfo {
  slug: string;
  path: string;
  branch: string;
}

/** List all nap-pro-managed worktrees in the project. */
export async function listWorktrees(projectCwd: string): Promise<WorktreeInfo[]> {
  const result = await runGit(projectCwd, ['worktree', 'list', '--porcelain']);
  if (!result.ok) return [];

  const trees: WorktreeInfo[] = [];
  let current: { path?: string; branch?: string } = {};

  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      current.path = line.slice('worktree '.length);
    } else if (line.startsWith('branch ')) {
      // "branch refs/heads/<name>"
      const ref = line.slice('branch '.length);
      const name = ref.replace(/^refs\/heads\//, '');
      current.branch = name;
    } else if (line === '' && current.path && current.branch) {
      if (current.branch.startsWith(BRANCH_PREFIX)) {
        trees.push({
          slug: current.branch.slice(BRANCH_PREFIX.length),
          path: current.path,
          branch: current.branch,
        });
      }
      current = {};
    }
  }
  // Last entry might not be followed by an empty line
  if (current.path && current.branch?.startsWith(BRANCH_PREFIX)) {
    trees.push({
      slug: current.branch.slice(BRANCH_PREFIX.length),
      path: current.path,
      branch: current.branch,
    });
  }

  return trees;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsPromises.access(p);
    return true;
  } catch {
    return false;
  }
}

// ── Branch helpers ──

export interface BranchInfo {
  name: string;
  /** True for refs/remotes/<remote>/<name> */
  remote: boolean;
  /** Origin remote name for remote refs (e.g. "origin"). */
  remoteName?: string;
  current: boolean;
}

/**
 * Resolve the repo's "default" branch — what branches should fork off of.
 * Order: origin/HEAD → local `main` → local `master` → first local branch.
 * Returns null if not a git repo.
 */
export async function getDefaultBranch(projectCwd: string): Promise<string | null> {
  // Preferred: origin/HEAD → e.g. "origin/main"
  const headRef = await runGit(projectCwd, [
    'symbolic-ref',
    '--quiet',
    '--short',
    'refs/remotes/origin/HEAD',
  ]);
  if (headRef.ok) {
    const trimmed = headRef.stdout.trim();
    // Trim "origin/" prefix
    const slash = trimmed.indexOf('/');
    if (slash >= 0) return trimmed.slice(slash + 1);
    return trimmed;
  }

  // Fallback: local main / master
  for (const candidate of ['main', 'master']) {
    const exists = await runGit(projectCwd, [
      'rev-parse',
      '--verify',
      '--quiet',
      `refs/heads/${candidate}`,
    ]);
    if (exists.ok) return candidate;
  }

  // Last resort: first local branch
  const list = await runGit(projectCwd, ['branch', '--format=%(refname:short)']);
  if (list.ok) {
    const first = list.stdout.split('\n').find((b) => b.trim());
    if (first) return first.trim();
  }

  return null;
}

/**
 * List local + remote branches (origin only) for the UI dropdown.
 * Excludes nap-pro/* worktree branches by default since they're internal.
 */
export async function listBranches(
  projectCwd: string,
  opts: { includeNapPro?: boolean } = {},
): Promise<BranchInfo[]> {
  const out = await runGit(projectCwd, [
    'for-each-ref',
    '--format=%(refname)\t%(refname:short)\t%(HEAD)',
    'refs/heads/',
    'refs/remotes/origin/',
  ]);
  if (!out.ok) return [];

  const result: BranchInfo[] = [];
  for (const line of out.stdout.split('\n')) {
    if (!line.trim()) continue;
    const [refname, short, headMark] = line.split('\t');
    if (!refname || !short) continue;
    // Skip the symbolic origin/HEAD entry (it's a duplicate of origin/<default>)
    if (short === 'origin/HEAD' || refname.endsWith('/HEAD')) continue;

    const remote = refname.startsWith('refs/remotes/');
    const name = remote ? short.replace(/^origin\//, '') : short;

    if (!opts.includeNapPro && name.startsWith(BRANCH_PREFIX)) continue;

    result.push({
      name,
      remote,
      remoteName: remote ? 'origin' : undefined,
      current: headMark === '*',
    });
  }

  // Dedupe: prefer local over remote of same name
  const byName = new Map<string, BranchInfo>();
  for (const b of result) {
    const existing = byName.get(b.name);
    if (!existing || (existing.remote && !b.remote)) byName.set(b.name, b);
  }

  return Array.from(byName.values()).sort((a, b) => {
    // Current first, then alphabetical
    if (a.current && !b.current) return -1;
    if (!a.current && b.current) return 1;
    return a.name.localeCompare(b.name);
  });
}
