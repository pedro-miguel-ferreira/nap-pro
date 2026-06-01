import * as fs from 'fs';
import * as path from 'path';

/**
 * Scaffold a new nap-pro project at `cwd`. Shared between the CLI's `nap-pro
 * init` and the Electron app's New Project wizard — same on-disk shape, same
 * idempotency rules.
 *
 * - Creates `.nap/` if missing (skips when the dir already has real content)
 * - Copies `00-org/` templates (roles + org docs)
 * - Creates the 01-v1 nepic with empty 10-docs/, 30-napkins/, 20-architects/
 * - Writes `.nap/.gitignore` and `.nap/ui-state.json`
 *
 * **No project-level architect agent is created.** The original NAP v3 flow
 * leaned on a long-lived architect to brainstorm seed napkins; nap-pro's
 * workflow-from-spec flow spawns its own `scope-architect` stage agent and
 * the open-pr stage handles PR creation directly, so the auto-created
 * `001-architect` had no load-bearing role and just confused new users.
 * Users who want an ad-hoc project-level agent can spawn one on demand.
 *
 * Returns ok=false with a human-readable message when the project is already
 * initialized; callers decide how to surface that (CLI prints + exits; the
 * app shows the error inline in the wizard).
 */
export interface ScaffoldOpts {
  /** Where the project lives. The `.nap/` dir is created inside this. */
  cwd: string;
  /** Where the source templates live (resolved by the caller). */
  templatesDir: string;
  /**
   * Reserved for forward-compat with the CLI's `--template <name>` flow.
   * No effect today — scaffolding doesn't create an architect anymore.
   */
  useTemplatePrompt?: boolean;
}

export interface ScaffoldResult {
  ok: boolean;
  message?: string;
  /** Absolute path to the napDir on success — useful for follow-up writes. */
  napDir?: string;
}

export function scaffoldProject(opts: ScaffoldOpts): ScaffoldResult {
  const { cwd, templatesDir } = opts;
  const napDir = path.join(cwd, '.nap');

  // .nap/ may exist as a stub (auto-created by a running app's socket server)
  // or as a real initialized project. Distinguish by whether the canonical
  // subdirs are present.
  if (fs.existsSync(napDir)) {
    const hasRealContent =
      fs.existsSync(path.join(napDir, 'nepics')) ||
      fs.existsSync(path.join(napDir, '00-org'));
    if (hasRealContent) {
      return {
        ok: false,
        message: 'Project already initialized.',
      };
    }
    // Stub from socket auto-create — proceed and overwrite, leaving sock alone.
  } else {
    fs.mkdirSync(napDir, { recursive: true });
  }

  // 00-org/ — roles + org docs
  copyDirRecursive(path.join(templatesDir, '00-org'), path.join(napDir, '00-org'));

  // 01-v1 nepic — empty subdirs so the workflow runner has somewhere to place
  // napkin agent homes on the first run. 20-architects/ is created empty
  // (no auto-architect anymore — see file header comment).
  const nepicDir = path.join(napDir, 'nepics', '01-v1');
  fs.mkdirSync(path.join(nepicDir, '10-docs'), { recursive: true });
  fs.mkdirSync(path.join(nepicDir, '20-architects'), { recursive: true });
  fs.mkdirSync(path.join(nepicDir, '30-napkins'), { recursive: true });

  fs.writeFileSync(path.join(napDir, '.gitignore'), 'sock\nui-state.json\n');
  fs.writeFileSync(
    path.join(napDir, 'ui-state.json'),
    JSON.stringify({ activeNepicId: '01-v1' }, null, 2),
  );

  return { ok: true, napDir };
}

/**
 * Locate the templates directory. Walks known relative paths from `__dirname`,
 * matching whatever build layout the caller is running under.
 *
 * Layouts handled:
 *   - Built CLI:           out/cli/cli/nap.js          →  ../../../src/templates
 *   - Built Electron main: out/main/main.js            →  ../../src/templates
 *   - Source / test:       src/main/project-init.ts    →  ../templates
 *
 * Throws when no candidate exists — that's a build packaging problem and
 * should fail loudly, not silently.
 */
export function findTemplatesDir(moduleDir: string): string {
  const candidates = [
    path.resolve(moduleDir, '..', '..', '..', 'src', 'templates'),
    path.resolve(moduleDir, '..', '..', 'src', 'templates'),
    path.resolve(moduleDir, '..', 'templates'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `templates directory not found — searched: ${candidates.join(', ')}`,
  );
}

export function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
