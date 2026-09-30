import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import type { PermissionsSettings } from './permissions-config';

/**
 * Cursor-backend permissions. `.nap/permissions.json` stays the single source
 * of truth (Claude Code schema); at spawn time it is translated into the
 * `.cursor/cli.json` that the `agent` CLI reads, walking from the git root to
 * the cwd:
 *
 *   { "permissions": { "allow": [...], "deny": [...] } }
 *
 * Differences from Claude Code that shape the translation:
 *   - agents run with `--force`, and Cursor has no "ask" tier under --force.
 *     Claude `ask` rules become `deny` — unless the guardian hook is installed,
 *     in which case they are left to `nap-pro hook before-shell`, which routes
 *     matching commands to the guardian and allows everything else.
 *   - `deny` holds even under --force.
 *   - Pattern forms (verified against agent 2026.09.28): `Shell(rm)` blocks by
 *     first word; `Shell(git reset --hard*)` blocks a subcommand prefix. The
 *     Claude-style `Shell(x:*)` form does NOT match, so it is never emitted.
 */

export const CURSOR_GUARDIAN_HOOK_COMMAND = 'nap-pro hook before-shell';

const GENERATED_FILES = ['.cursor/cli.json', '.cursor/hooks.json'];

/** `Bash(gh pr merge:*)` → `gh pr merge`; null for non-Bash rules. */
export function bashRulePrefix(rule: string): string | null {
  const m = rule.match(/^Bash\((.*)\)$/);
  if (!m) return null;
  const prefix = m[1].replace(/:\*$/, '').replace(/\*$/, '').trim();
  return prefix.length > 0 ? prefix : null;
}

/** Translate one Claude rule to Cursor's pattern syntax. null = no equivalent. */
export function toCursorRule(rule: string): string | null {
  const prefix = bashRulePrefix(rule);
  if (prefix !== null) {
    return prefix.includes(' ') ? `Shell(${prefix}*)` : `Shell(${prefix})`;
  }
  const file = rule.match(/^(Read|Edit|Write)\((.+)\)$/);
  if (file) return `${file[1] === 'Read' ? 'Read' : 'Write'}(${file[2]})`;
  return null;
}

function translateAll(rules: string[] | undefined): string[] {
  const out: string[] = [];
  for (const r of rules ?? []) {
    const t = toCursorRule(r);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export interface CursorCliPermissions {
  allow: string[];
  deny: string[];
}

export function translatePermissions(
  settings: PermissionsSettings,
  opts: { guardian: boolean },
): CursorCliPermissions {
  const p = settings.permissions ?? {};
  const deny = translateAll(p.deny);
  if (!opts.guardian) {
    for (const r of translateAll(p.ask)) if (!deny.includes(r)) deny.push(r);
  }
  return { allow: translateAll(p.allow), deny };
}

/**
 * Does a shell command hit one of the Claude `ask` rules? Checks every segment
 * of a compound command (`a && b; c | d`) by prefix, the same way the rule
 * reads: `Bash(rm -rf:*)` matches `rm -rf x` but not `rm file`.
 */
export function commandMatchesRules(command: string, rules: string[] | undefined): boolean {
  const prefixes = (rules ?? []).map(bashRulePrefix).filter((p): p is string => p !== null);
  if (prefixes.length === 0) return false;
  const segments = command.split(/&&|\|\||;|\||\n/).map((s) => s.trim()).filter(Boolean);
  return segments.some((seg) =>
    prefixes.some((p) => seg === p || seg.startsWith(p + ' ')),
  );
}

export function readPermissionsFile(permsPath: string): PermissionsSettings | null {
  try {
    return JSON.parse(fs.readFileSync(permsPath, 'utf-8')) as PermissionsSettings;
  } catch {
    return null;
  }
}

function readJson(p: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

/** Is the nap-pro guardian hook present in `<dir>/.cursor/hooks.json`? */
export function hasGuardianHook(dir: string): boolean {
  const hooks = readJson(path.join(dir, '.cursor', 'hooks.json'));
  const entries = hooks?.hooks?.beforeShellExecution;
  return Array.isArray(entries) && entries.some((e: any) => e?.command === CURSOR_GUARDIAN_HOOK_COMMAND);
}

/**
 * Merge the guardian hook into `<dir>/.cursor/hooks.json`, keeping any other
 * hooks already there. Idempotent.
 */
export function writeGuardianHook(dir: string): string {
  const hooksPath = path.join(dir, '.cursor', 'hooks.json');
  fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
  const existing = readJson(hooksPath) ?? {};
  const hooks = (existing.hooks && typeof existing.hooks === 'object') ? existing.hooks : {};
  const current: any[] = Array.isArray(hooks.beforeShellExecution) ? hooks.beforeShellExecution : [];
  const others = current.filter((e) => e?.command !== CURSOR_GUARDIAN_HOOK_COMMAND);
  const updated = {
    ...existing,
    version: existing.version ?? 1,
    hooks: {
      ...hooks,
      beforeShellExecution: [
        ...others,
        // 600s matches the hook handler's long-lived wait on the guardian.
        { command: CURSOR_GUARDIAN_HOOK_COMMAND, timeout: 600, failClosed: true },
      ],
    },
  };
  fs.writeFileSync(hooksPath, JSON.stringify(updated, null, 2) + '\n');
  return hooksPath;
}

/**
 * Write the translated rules into `<runDir>/.cursor/cli.json`, merging with any
 * non-permission keys already there. In guardian mode, also make sure the run
 * dir (a worktree has its own checkout) carries the guardian hook.
 */
export function installCursorPermissions(permsPath: string, runDir: string): void {
  const settings = readPermissionsFile(permsPath);
  if (!settings) throw new Error(`unreadable permissions file: ${permsPath}`);
  const projectDir = path.dirname(path.dirname(permsPath));
  const guardian = hasGuardianHook(projectDir);

  const cliPath = path.join(runDir, '.cursor', 'cli.json');
  fs.mkdirSync(path.dirname(cliPath), { recursive: true });
  const existing = readJson(cliPath) ?? {};
  const updated = { ...existing, permissions: translatePermissions(settings, { guardian }) };
  fs.writeFileSync(cliPath, JSON.stringify(updated, null, 2) + '\n');

  if (guardian && path.resolve(runDir) !== path.resolve(projectDir)) {
    writeGuardianHook(runDir);
  }
  excludeGeneratedFiles(runDir);
}

/**
 * Keep agents from committing the generated `.cursor/` files: append them to
 * the repo's `info/exclude`. Uses the common git dir so one entry covers the
 * main checkout and every worktree. No-op outside a git repo.
 */
export function excludeGeneratedFiles(runDir: string): void {
  let commonDir: string;
  try {
    commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: runDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return;
  }
  const excludePath = path.join(path.resolve(runDir, commonDir), 'info', 'exclude');
  let text = '';
  try {
    text = fs.readFileSync(excludePath, 'utf-8');
  } catch {
    // missing — created below
  }
  const lines = new Set(text.split('\n').map((l) => l.trim()));
  const missing = GENERATED_FILES.filter((f) => !lines.has(f) && !lines.has('/' + f));
  if (missing.length === 0) return;
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const prefix = text.length > 0 && !text.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(excludePath, prefix + '# nap-pro (Cursor backend)\n' + missing.join('\n') + '\n');
}
