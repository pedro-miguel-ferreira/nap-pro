import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { NapModel } from './model';
import type { PtySpawner } from './pty-spawner';
import { createWorktree } from './worktree-helpers';

/**
 * Stage replay — re-run an agent's prompt with a different model (and/or
 * edited prompt). The replay is a brand-new agent in the same napkin, named
 * `<original>-replay-<n>`, with its own per-agent git worktree branched from
 * the original's baseline SHA.
 *
 * Why a fresh worktree: the napkin's main worktree probably has the original's
 * commits already, so simply spawning a sibling there would race + dirty the
 * canonical state. A worktree at the original baseline gives the replay a
 * clean slate that mirrors what the original saw.
 */

export interface ReplayDeps {
  model: NapModel;
  ptySpawner: PtySpawner;
  projectCwd: string;
}

export interface ReplayOptions {
  /** Override model id; null/undefined uses the original's model. */
  model?: string | null;
  /** Override prompt text; undefined copies the original's prompt.md verbatim. */
  prompt?: string;
}

export interface ReplayResult {
  ok: boolean;
  newAgentId?: string;
  newAgentName?: string;
  worktreePath?: string;
  error?: string;
}

export async function replayAgent(
  originalAgentId: string,
  opts: ReplayOptions,
  deps: ReplayDeps,
): Promise<ReplayResult> {
  const { model, ptySpawner, projectCwd } = deps;

  const original = model.getAllAgents().find((a) => a.id === originalAgentId);
  if (!original) return { ok: false, error: `agent ${originalAgentId} not found` };
  if (!original.napkinId) {
    return { ok: false, error: 'cannot replay agents that have no napkin (architects, etc.)' };
  }
  const napkin = model.getNapkins().find((n) => n.slug === original.napkinId);
  if (!napkin) return { ok: false, error: `napkin ${original.napkinId} not found` };

  // Mint a unique replay name in the napkin's namespace.
  const taken = new Set(napkin.agents.map((a) => a.name));
  let n = 1;
  let replayName = `${original.name}-replay-${n}`;
  while (taken.has(replayName)) {
    n++;
    replayName = `${original.name}-replay-${n}`;
  }

  // Per-agent worktree at the original's baseline. If there's no baseline (e.g.
  // the original was never spawned in a git repo), createWorktree falls back
  // to the repo's default branch — which is fine for "compare from main".
  const baseRef = original.baselineSha ?? undefined;
  const wt = await createWorktree(projectCwd, replayName, { baseBranch: baseRef });
  if (!wt.ok) return { ok: false, error: `worktree creation failed: ${wt.error}` };

  // Materialize the agent. createAgentStub throws if the name collides — we
  // pre-checked above, but the model's own validator also runs.
  let stub;
  try {
    stub = await model.createAgentStub(
      original.napkinId,
      replayName,
      original.role,
      undefined,
      original.parentId ?? undefined,
      opts.model !== undefined ? (opts.model ?? null) : original.model,
    );
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  await model.setAgentWorktree(stub.id, wt.path!);
  await model.setAgentReplayOfId(stub.id, originalAgentId);

  // Resolve the prompt — override wins, else copy original's prompt.md.
  let promptText = opts.prompt;
  if (promptText === undefined) {
    try {
      promptText = await fsPromises.readFile(
        path.join(original.homePath, 'prompt.md'),
        'utf-8',
      );
    } catch {
      promptText = '';
    }
  }
  if (!promptText.trim()) {
    return {
      ok: false,
      error: 'no prompt to replay — original has no prompt.md and no override was given',
    };
  }

  const promptPath = path.join(stub.dir, 'prompt.md');
  await fsPromises.writeFile(promptPath, promptText);

  // Start the replay agent. Use startAgentById to avoid name collisions across
  // napkins (same as the workflow runner).
  try {
    await model.startAgentById(
      stub.id,
      `read ${promptPath} and follow its instructions`,
      ptySpawner,
    );
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  return {
    ok: true,
    newAgentId: stub.id,
    newAgentName: replayName,
    worktreePath: wt.path,
  };
}
