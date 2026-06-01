import * as fsPromises from 'fs/promises';
import * as path from 'path';

/**
 * `.nap/config.json` — per-project defaults consulted by the workflow runner
 * when a workflow leaves the relevant field blank. Cascade:
 *
 *   per-run override > workflow value > project default > built-in default
 *
 * All fields are optional. Missing file / missing field falls through to
 * whatever the workflow runner used before this module existed.
 */
export interface ProjectConfig {
  /** Default PR title prefix (e.g. "[Apps]"). */
  prTitlePrefix?: string;
  /** Default worktree base directory. Same resolution rules as the workflow field. */
  worktreeBaseDir?: string;
  /** Name of the workflow to preselect in the from-spec modal. */
  defaultWorkflow?: string;
}

/** Resolve the path where this project's config lives. */
export function getProjectConfigPath(projectCwd: string): string {
  return path.join(projectCwd, '.nap', 'config.json');
}

/**
 * Read `.nap/config.json`. Missing or malformed → returns an empty config.
 * Never throws; this is best-effort consultation, not a hard dependency.
 */
export async function readProjectConfig(projectCwd: string): Promise<ProjectConfig> {
  try {
    const text = await fsPromises.readFile(getProjectConfigPath(projectCwd), 'utf-8');
    const parsed = JSON.parse(text);
    return sanitize(parsed);
  } catch {
    return {};
  }
}

/** Persist `.nap/config.json`. Creates `.nap/` if missing. */
export async function writeProjectConfig(
  projectCwd: string,
  config: ProjectConfig,
): Promise<void> {
  const napDir = path.join(projectCwd, '.nap');
  await fsPromises.mkdir(napDir, { recursive: true });
  await fsPromises.writeFile(
    getProjectConfigPath(projectCwd),
    JSON.stringify(sanitize(config), null, 2) + '\n',
  );
}

function sanitize(input: unknown): ProjectConfig {
  if (!input || typeof input !== 'object') return {};
  const o = input as Record<string, unknown>;
  const out: ProjectConfig = {};
  if (typeof o.prTitlePrefix === 'string') out.prTitlePrefix = o.prTitlePrefix;
  if (typeof o.worktreeBaseDir === 'string') out.worktreeBaseDir = o.worktreeBaseDir;
  if (typeof o.defaultWorkflow === 'string') out.defaultWorkflow = o.defaultWorkflow;
  return out;
}
