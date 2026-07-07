import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { NapModel } from './model';
import type { PtySpawner } from './pty-spawner';
import type {
  AgentStage,
  OpenPrStage,
  WorkflowDef,
  WorkflowStage,
} from '../shared/bridge-types';
import { createWorktree } from './worktree-helpers';
import { enqueue } from './message-queue';
import { readProjectConfig, type ProjectConfig } from './project-config';
import type { WorkflowRegistry } from './workflow-registry';

/**
 * Cascade per-project defaults into a workflow def. Precedence:
 *
 *   per-run override > workflow value > project default > built-in default
 *
 * "Workflow value" means the field is **explicitly set** in the JSON. An
 * explicit empty string (e.g. `"prTitlePrefix": ""`) is preserved — the user
 * is opting OUT of any prefix. Only `undefined` falls through to the project
 * default. Mutates `def` in place.
 */
export function applyProjectConfigCascade(
  def: WorkflowDef,
  projectConfig: ProjectConfig,
): void {
  if (def.prTitlePrefix === undefined && projectConfig.prTitlePrefix !== undefined) {
    def.prTitlePrefix = projectConfig.prTitlePrefix;
  }
  if (def.worktreeBaseDir === undefined && projectConfig.worktreeBaseDir !== undefined) {
    def.worktreeBaseDir = projectConfig.worktreeBaseDir;
  }
}

export interface RunWorkflowDeps {
  model: NapModel;
  ptySpawner: PtySpawner;
  projectCwd: string;
  registry: WorkflowRegistry;
}

export interface RunWorkflowOpts {
  /**
   * When set, the workflow is being launched from a spec. The runner spawns
   * the scope stage first (if def.scope is configured) to populate the napkin
   * before the regular stages run.
   */
  fromSpec?: {
    /** Absolute paths to spec docs the scope agent should read. */
    specDocs: string[];
    /** Display name for this workitem — appears in the scope agent's prompt. */
    workItemName: string;
  };
}

export interface RunWorkflowResult {
  ok: boolean;
  message?: string;
  /** Per-stage status (in declaration order). */
  stages?: Array<{ name: string; status: 'completed' | 'failed' | 'awaiting-architect' }>;
}

/**
 * Run a workflow on a napkin.
 *
 * Behavior:
 *   - Optionally creates a worktree for the napkin (if useWorktree is true and none exists).
 *   - Stages are grouped by parallelGroup. Within a group, agents are spawned concurrently
 *     and awaited together. Groups themselves run sequentially in declaration order.
 *   - For each stage, writes prompt.md and (unless promptSource='architect') starts the agent
 *     and awaits its `done` flag. If the agent exits without done, the stage is marked failed
 *     and the runner stops.
 *   - 'architect' prompt source: writes a placeholder prompt.md and waits for the agent's
 *     `started` flag to flip (set by the architect manually invoking `nap-pro start`). Then
 *     awaits done as usual.
 */
export async function runWorkflow(
  workflowName: string,
  napkinSlug: string,
  deps: RunWorkflowDeps,
  opts: RunWorkflowOpts = {},
): Promise<RunWorkflowResult> {
  const { model, ptySpawner, projectCwd, registry } = deps;

  const napkin = model.getNapkins().find((n) => n.slug === napkinSlug);
  if (!napkin) return { ok: false, message: `napkin '${napkinSlug}' not found` };

  // Load workflow definition
  const workflowsDir = path.join(projectCwd, '.nap', 'workflows');
  let def: WorkflowDef;
  try {
    const text = await fsPromises.readFile(
      path.join(workflowsDir, `${workflowName}.json`),
      'utf-8',
    );
    def = JSON.parse(text) as WorkflowDef;
  } catch (err) {
    const e = err as { message?: string };
    return { ok: false, message: e.message || `workflow '${workflowName}' not found` };
  }
  if (!def.stages || def.stages.length === 0) {
    return { ok: false, message: 'workflow has no stages' };
  }

  // Merge project-level defaults under the workflow values. See
  // `applyProjectConfigCascade` for the precedence rules.
  const projectConfig = await readProjectConfig(projectCwd);
  applyProjectConfigCascade(def, projectConfig);

  // Auto-insert an `open-pr` stage before the first reviewer stage when the
  // workflow has reviewers but no explicit PR creation. Mutates `def.stages`
  // before the registry is opened so the synthetic stage shows up in the runs
  // dashboard alongside everything else.
  def.stages = autoInsertOpenPrStage(def.stages, def.autoOpenPrBeforeReviewers);

  // Open a registry entry — produces the runId + abort signal we use throughout.
  const willRunScope = !!opts.fromSpec && !!def.scope;
  const entry = registry.start(workflowName, napkinSlug, def, {
    withScope: willRunScope,
    fromSpec: opts.fromSpec,
  });
  return driveRun(entry.run.runId, entry.controller.signal, def, napkinSlug, deps, opts, new Set());
}

/**
 * Resume an interrupted or failed run from the first non-completed stage.
 * The registry restores the persisted def/fromSpec and the set of stages that
 * already completed; everything else re-runs through the normal machinery
 * (existing agent stubs get reset for a clean claude session).
 */
export async function resumeWorkflowRun(
  runId: string,
  deps: RunWorkflowDeps,
): Promise<RunWorkflowResult> {
  const revived = deps.registry.reactivate(runId);
  if (!revived) {
    return { ok: false, message: 'run not found or not resumable (only interrupted/failed runs can resume)' };
  }
  const { entry, def, fromSpec, completedStages } = revived;
  const napkinSlug = entry.run.napkinSlug;
  const napkin = deps.model.getNapkins().find((n) => n.slug === napkinSlug);
  if (!napkin) {
    deps.registry.complete(runId, 'failed', `napkin '${napkinSlug}' no longer exists`);
    return { ok: false, message: `napkin '${napkinSlug}' no longer exists` };
  }
  return driveRun(
    runId,
    entry.controller.signal,
    def,
    napkinSlug,
    deps,
    fromSpec ? { fromSpec } : {},
    completedStages,
  );
}

/**
 * Drive a registered run to completion: ensure the worktree, run the scope
 * stage (from-spec launches), then the stage groups. `skipStages` holds names
 * of stages already completed in a previous attempt (resume path) — they are
 * skipped, everything else runs normally.
 */
async function driveRun(
  runId: string,
  signal: AbortSignal,
  def: WorkflowDef,
  napkinSlug: string,
  deps: RunWorkflowDeps,
  opts: RunWorkflowOpts,
  skipStages: Set<string>,
): Promise<RunWorkflowResult> {
  const { model, projectCwd, registry } = deps;

  const napkin = model.getNapkins().find((n) => n.slug === napkinSlug);
  if (!napkin) {
    registry.complete(runId, 'failed', `napkin '${napkinSlug}' not found`);
    return { ok: false, message: `napkin '${napkinSlug}' not found` };
  }

  // 1. Worktree (idempotent — getWorktreePath check inside createWorktree)
  if (def.useWorktree !== false && !napkin.worktreePath) {
    const wt = await createWorktree(projectCwd, napkinSlug, {
      baseBranch: def.baseBranch,
      baseDir: def.worktreeBaseDir,
    });
    if (!wt.ok) {
      registry.complete(runId, 'failed', `worktree creation failed: ${wt.error}`);
      return { ok: false, message: `worktree creation failed: ${wt.error}` };
    }
    await model.setNapkinWorktree(napkinSlug, wt.path!);
  }

  if (signal.aborted) {
    registry.complete(runId, 'cancelled', 'cancelled before any stage ran');
    return { ok: false, message: 'cancelled', stages: [] };
  }

  // Scope stage — only when invoked from a spec AND the workflow has a scope
  // stage defined. Populates the napkin's .nap.md / .spec.md / .stories.md
  // before the regular stages run. Skipped on resume when already completed.
  if (opts.fromSpec && def.scope && !skipStages.has('000-scope')) {
    const scopeResult = await runScopeStage(
      def.scope,
      napkinSlug,
      opts.fromSpec,
      runId,
      deps,
    );
    if (scopeResult !== 'completed') {
      registry.complete(runId, 'failed', `scope stage ${scopeResult}`);
      return { ok: false, message: `scope stage ${scopeResult}`, stages: [] };
    }
  }

  // 2. Identify a parent agent (architect for the active nepic, if running)
  const architects = model.getArchitects();
  const parentArchitect = architects.find((a) => a.role === 'architect') ?? architects[0] ?? null;
  const parentId = parentArchitect?.id;

  // 3. Group stages by parallelGroup. Stages without a group form singletons.
  const groups: WorkflowStage[][] = [];
  for (const stage of def.stages) {
    if (stage.parallelGroup === undefined) {
      groups.push([stage]);
      continue;
    }
    const last = groups[groups.length - 1];
    if (
      last &&
      last.length > 0 &&
      last[0].parallelGroup === stage.parallelGroup
    ) {
      last.push(stage);
    } else {
      groups.push([stage]);
    }
  }

  const stageResults: RunWorkflowResult['stages'] = [];

  for (const group of groups) {
    if (signal.aborted) {
      registry.complete(runId, 'cancelled', 'cancelled mid-flow');
      return {
        ok: false,
        message: 'cancelled',
        stages: stageResults,
      };
    }

    // Resume path: stages that completed in a previous attempt don't re-run.
    const pendingInGroup = group.filter((stage) => !skipStages.has(stage.name));
    if (pendingInGroup.length === 0) continue;

    const groupPromises = pendingInGroup.map((stage) => {
      const runOne = stage.kind === 'open-pr'
        ? runOpenPrStage(stage, napkinSlug, parentId, def, runId, deps)
        : runStage(stage, napkinSlug, parentId, def, runId, deps);
      return runOne.then((r) => {
        stageResults.push({ name: stage.name, status: r });
        return r;
      });
    });
    const results = await Promise.all(groupPromises);

    // Stop if any stage in the group failed
    if (results.some((r) => r === 'failed')) {
      registry.complete(runId, 'failed', 'stage(s) failed in group; runner stopped');
      return {
        ok: false,
        message: `stage(s) failed in group; runner stopped`,
        stages: stageResults,
      };
    }
  }

  // All stages succeeded → flip the napkin to 'review' so the sidebar badge
  // reflects "ready for the human" instead of staying stuck on 'doing'.
  try {
    await model.setNapkinStatus(napkinSlug, 'review');
  } catch {
    // best-effort — status persistence is non-critical for the run result
  }

  // Legacy PR handoff — only fires when the workflow doesn't already include
  // an explicit `open-pr` stage. Prefer adding `{ "kind": "open-pr" }` to your
  // stages list (placed before reviewer stages) over relying on this fallback.
  const hasOpenPrStage = def.stages.some((s) => s.kind === 'open-pr');
  if (def.createPr === true && !hasOpenPrStage) {
    await handoffPrToArchitect(def, napkinSlug, runId, deps);
  }

  registry.complete(runId, 'completed');
  return { ok: true, stages: stageResults };
}

/**
 * Pokes the running architect with a structured instruction to push the
 * worktree branch and open a draft PR. The architect uses its Bash tool to do
 * the work and uses judgment for the title and PR body.
 *
 * If the architect isn't running, emits a console log and returns. The user
 * will see the workflow:complete event in the renderer; surfacing a "PR
 * handoff skipped" message there is left for a follow-up.
 */
async function handoffPrToArchitect(
  def: WorkflowDef,
  napkinSlug: string,
  runId: string,
  deps: RunWorkflowDeps,
): Promise<void> {
  const { model } = deps;
  const napkin = model.getNapkins().find((n) => n.slug === napkinSlug);
  if (!napkin) return;

  const worktreePath = napkin.worktreePath;
  if (!worktreePath) {
    // eslint-disable-next-line no-console
    console.warn(`[workflow] createPr requested but napkin ${napkinSlug} has no worktree`);
    return;
  }

  const architect = model.findAgentByRole('architect');
  if (!architect || !architect.running) {
    // eslint-disable-next-line no-console
    console.warn(
      `[workflow] createPr requested but architect is not running — open the PR manually for napkin ${napkinSlug}`,
    );
    return;
  }

  const branch = `nap-pro/${napkinSlug}`;
  const baseBranch = def.baseBranch?.trim() || 'main';
  const prefix = def.prTitlePrefix?.trim();
  const napkinDocPath = path.join(napkin.path, `${napkinSlug}.nap.md`);

  const message = buildArchitectPrPokeMessage({
    workflowName: def.name,
    napkinSlug,
    napkinDocPath,
    worktreePath,
    branch,
    baseBranch,
    prefix,
    runId,
  });

  enqueue(architect.id, message);
}

function buildArchitectPrPokeMessage(args: {
  workflowName: string;
  napkinSlug: string;
  napkinDocPath: string;
  worktreePath: string;
  branch: string;
  baseBranch: string;
  prefix: string | undefined;
  runId: string;
}): string {
  const titlePrefix = args.prefix ? `${args.prefix} ` : '';
  // The TASK ID disambiguates parallel handoffs. When multiple workflows on
  // different napkins finish around the same time, the architect's prompt
  // queue gets each as a discrete message — the preamble tells it to handle
  // them strictly one at a time, fully completing each before the next.
  return `[workflow-runner · TASK ID: ${args.runId.slice(0, 8)}] Workflow "${args.workflowName}" completed for napkin "${args.napkinSlug}". Please open the draft PR.

IMPORTANT: complete THIS task fully (push the branch, open the PR, report the URL) before processing any other handoff messages that may be in your queue. Each task is self-contained — do not try to interleave them.

Context:
- Napkin slug: ${args.napkinSlug}
- Napkin doc: ${args.napkinDocPath} (its contents go under "## Napkin" in the PR body)
- Worktree: ${args.worktreePath}
- Branch: ${args.branch}
- Base: ${args.baseBranch}

Steps to follow:

1. \`cd ${args.worktreePath}\`
2. Check \`git status\`. If there are uncommitted changes the agents left behind, commit them with a clean message.
3. \`git push -u origin ${args.branch}\`
4. Read ${args.napkinDocPath} to extract a descriptive title and the napkin body for the PR description.
5. Open the PR:

\`\`\`bash
gh pr create --draft --base ${args.baseBranch} --head ${args.branch} \\
  --title "${titlePrefix}<descriptive title from the napkin>" \\
  --body "$(cat <<'EOF'
## Napkin

<paste contents of ${args.napkinDocPath} here>

## Summary

<one paragraph on what shipped>

## Test plan

- [ ] <add concrete checks based on the test design and what the test-eng ran>
EOF
)"
\`\`\`

6. Report the PR URL when you're done. Prefix your reply with the task id "${args.runId.slice(0, 8)}" so the human can correlate it to the workflow run.
`;
}

async function runStage(
  stage: AgentStage,
  napkinSlug: string,
  parentId: string | undefined,
  def: WorkflowDef,
  runId: string,
  deps: RunWorkflowDeps,
): Promise<'completed' | 'failed' | 'awaiting-architect'> {
  const { model, ptySpawner, projectCwd, registry } = deps;

  // Create the agent stub. If it already exists (workflow re-run on the same napkin),
  // and the previous attempt left it in a terminal state (exited/done/archived),
  // mint a fresh session UUID + reset lifecycle flags so this re-run gets a clean
  // claude session — otherwise we'd collide with the existing CC session log
  // and awaitDoneOrExit would resolve immediately on the stale `exited` flag.
  let createdId: string | undefined;
  try {
    const stub = await model.createAgentStub(
      napkinSlug,
      stage.name,
      stage.role,
      undefined,
      parentId,
      stage.model ?? null,
    );
    createdId = stub.id;
  } catch (err) {
    const existing = model
      .getAllAgents()
      .find((a) => a.napkinId === napkinSlug && a.name === stage.name);
    if (!existing) throw err;

    if (existing.exited || existing.done || existing.archived) {
      createdId = await model.resetAgentForRerun(existing.id);
    } else {
      createdId = existing.id;
    }
  }

  // Resolve fresh — id may have changed via reset above.
  const agent = model.getAllAgents().find((a) => a.id === createdId);
  if (!agent) {
    registry.markStageEnd(runId, stage.name, 'failed', 'stage agent could not be created');
    return 'failed';
  }

  // Look up the napkin so we can enumerate its scaffolding files and embed
  // their absolute paths into the agent's prompt — no more deriving the
  // napkin dir from the home dir.
  const napkin = model.getNapkins().find((n) => n.slug === napkinSlug);
  const napkinDir = napkin?.path ?? '';
  const scaffolding = napkinDir
    ? await enumerateNapkinScaffolding(napkinDir, napkinSlug)
    : [];

  // Write prompt.md
  const promptPath = path.join(agent.homePath, 'prompt.md');
  const contextSection =
    !stage.skipContext && def.contextFiles && def.contextFiles.length > 0
      ? renderContextSection(def.contextFiles, deps.projectCwd)
      : '';

  if (stage.promptSource === 'custom' && stage.customPrompt) {
    await fsPromises.writeFile(
      promptPath,
      withDoneFooter(stage.customPrompt + contextSection, agent.homePath),
    );
  } else if (stage.promptSource === 'template') {
    await fsPromises.writeFile(
      promptPath,
      defaultTemplatePrompt(stage.role, agent.homePath, napkinSlug, napkinDir, scaffolding) + contextSection,
    );
  } else if (stage.promptSource === 'architect') {
    const stub =
      `(awaiting prompt from architect — architect should rewrite this file, then run \`nap-pro start ${stage.name}\`)\n` +
      contextSection;
    await fsPromises.writeFile(promptPath, stub);
    // Don't auto-start; wait for the architect to flip `started`
    const ok = await waitFor(model, agent.id, (a) => a.started, 0); // no timeout
    if (!ok) {
      registry.markStageEnd(runId, stage.name, 'awaiting-architect');
      return 'awaiting-architect';
    }
    // Architect may have minted a fresh id when starting via `nap-pro start`;
    // re-resolve so we await the correct session.
    const refreshed = model.getAllAgents().find((a) => a.napkinId === napkinSlug && a.name === stage.name);
    const liveId = refreshed?.id ?? agent.id;
    registry.markStageStart(runId, stage.name, liveId);
    const result = await awaitDoneOrExit(model, liveId, stageWatch(deps, runId, stage.name));
    registry.markStageEnd(runId, stage.name, result, stageFailureHint(result));
    return result;
  } else {
    await fsPromises.writeFile(
      promptPath,
      defaultTemplatePrompt(stage.role, agent.homePath, napkinSlug, napkinDir, scaffolding) + contextSection,
    );
  }

  // Start the agent — by id, NOT by name, so we don't collide with same-named
  // stage agents in sibling napkins (e.g., variant napkins all have a "001-design").
  let startResult: { id: string } | null = null;
  try {
    startResult = await model.startAgentById(
      agent.id,
      `read ${promptPath} and follow its instructions`,
      ptySpawner,
    );
  } catch (err) {
    const startError = err instanceof Error ? err.message : String(err);
    registry.markStageEnd(runId, stage.name, 'failed', `agent failed to start: ${startError}`);
    return 'failed';
  }

  // Use the live id from startAgentByName — it may have minted a fresh one
  // (the reset path above already did this, but defending against future refactors).
  const liveId = startResult.id;
  registry.markStageStart(runId, stage.name, liveId);
  const result = await awaitDoneOrExit(model, liveId, stageWatch(deps, runId, stage.name));
  registry.markStageEnd(runId, stage.name, result, stageFailureHint(result));
  return result;
}

/** Dashboard hint for the common failure shape — agent died without `nap-pro done`. */
function stageFailureHint(result: 'completed' | 'failed'): string | undefined {
  return result === 'failed'
    ? 'agent exited without running `nap-pro done` — check its terminal / response.md'
    : undefined;
}

/**
 * Auto-insert a synthetic `open-pr` stage right before the first reviewer
 * stage if (a) the workflow has any reviewer-shaped stages (role ending in
 * `-reviewer`), (b) it doesn't already contain an explicit `open-pr` stage,
 * and (c) the workflow hasn't opted out via `autoOpenPrBeforeReviewers: false`.
 *
 * Returns the original list when nothing changes — never mutates the input.
 */
export function autoInsertOpenPrStage(
  stages: WorkflowStage[],
  autoOpenPrBeforeReviewers: boolean | undefined,
): WorkflowStage[] {
  if (autoOpenPrBeforeReviewers === false) return stages;
  if (stages.some((s) => s.kind === 'open-pr')) return stages;

  const firstReviewerIdx = stages.findIndex(
    (s) => s.kind !== 'open-pr' && s.role.endsWith('-reviewer'),
  );
  if (firstReviewerIdx < 0) return stages;

  // Pick a 3-digit ordinal that sits between the previous stage and the first
  // reviewer's name prefix. If the previous stage doesn't have a "NNN-" prefix,
  // fall back to a fixed "auto-open-pr" name — uniqueness matters more than aesthetics.
  const before = firstReviewerIdx > 0 ? stages[firstReviewerIdx - 1] : null;
  const after = stages[firstReviewerIdx];
  const synthName = pickAutoOpenPrName(before, after);

  const open: OpenPrStage = { kind: 'open-pr', name: synthName };
  return [...stages.slice(0, firstReviewerIdx), open, ...stages.slice(firstReviewerIdx)];
}

function pickAutoOpenPrName(
  before: WorkflowStage | null,
  after: WorkflowStage,
): string {
  const beforeOrd = before ? extractStageOrdinal(before.name) : null;
  const afterOrd = extractStageOrdinal(after.name);
  if (beforeOrd !== null && afterOrd !== null && afterOrd - beforeOrd >= 2) {
    const mid = beforeOrd + Math.floor((afterOrd - beforeOrd) / 2);
    return `${String(mid).padStart(3, '0')}-open-pr`;
  }
  if (afterOrd !== null && afterOrd >= 5) {
    return `${String(afterOrd - 5).padStart(3, '0')}-open-pr`;
  }
  return 'auto-open-pr';
}

function extractStageOrdinal(name: string): number | null {
  const m = name.match(/^(\d{3})-/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Open-PR stage: spawns a dedicated agent whose only job is getting the
 * napkin branch onto GitHub as a draft PR. An agent (not inline shell)
 * because the steps need judgment and a real shell environment: committing
 * whatever the build agents left uncommitted, creating the GitHub repo when
 * the project has no `origin` yet, pushing the base branch on first publish,
 * and writing a sensible title/body from the napkin doc.
 *
 * Place this between build stages and reviewer stages in a workflow so the
 * reviewers can post tagged `gh pr comment`s on a real PR instead of buffering
 * findings in `response.md`.
 */
async function runOpenPrStage(
  stage: OpenPrStage,
  napkinSlug: string,
  parentId: string | undefined,
  def: WorkflowDef,
  runId: string,
  deps: RunWorkflowDeps,
): Promise<'completed' | 'failed' | 'awaiting-architect'> {
  const { model, registry } = deps;

  const napkin = model.getNapkins().find((n) => n.slug === napkinSlug);
  if (!napkin?.worktreePath) {
    registry.markStageEnd(
      runId,
      stage.name,
      'failed',
      `napkin "${napkinSlug}" has no worktree — nothing to push`,
    );
    return 'failed';
  }

  const agentStage: AgentStage = {
    kind: 'agent',
    name: stage.name,
    role: 'open-pr',
    model: null,
    promptSource: 'custom',
    customPrompt: buildOpenPrAgentPrompt({
      workflowName: def.name,
      napkinSlug,
      napkinDocPath: path.join(napkin.path, `${napkinSlug}.nap.md`),
      worktreePath: napkin.worktreePath,
      projectCwd: deps.projectCwd,
      branch: `nap-pro/${napkinSlug}`,
      baseBranch: def.baseBranch?.trim() || 'main',
      prefix: (stage.titlePrefix ?? def.prTitlePrefix ?? '').trim(),
      runId,
    }),
    skipContext: true,
  };
  return runStage(agentStage, napkinSlug, parentId, def, runId, deps);
}

/** Self-contained prompt for the open-pr agent — no role doc dependency. */
export function buildOpenPrAgentPrompt(args: {
  workflowName: string;
  napkinSlug: string;
  napkinDocPath: string;
  worktreePath: string;
  projectCwd: string;
  branch: string;
  baseBranch: string;
  prefix: string;
  runId: string;
}): string {
  const titlePrefix = args.prefix ? `${args.prefix} ` : '';
  const repoName = path.basename(args.projectCwd);
  return `You are the open-pr stage of workflow "${args.workflowName}" for napkin "${args.napkinSlug}" (run ${args.runId.slice(0, 8)}).

Your ONLY job: get this napkin's work onto GitHub as a draft PR, then report the URL. Do not review, refactor, or extend the work.

Context:
- Worktree (the branch's checkout): ${args.worktreePath}
- Branch: ${args.branch}
- Base branch: ${args.baseBranch}
- Project root (main checkout of the same repo): ${args.projectCwd}
- Napkin doc (source for title + PR body): ${args.napkinDocPath}

Steps:

1. \`cd ${args.worktreePath}\` and check \`git status\`. If the build agents left uncommitted changes, commit them — everything that belongs to this napkin's work, with a clean descriptive message.

2. Check the remote: \`git remote get-url origin\`.
   - If origin exists, continue to step 3.
   - If there is NO origin, this project isn't on GitHub yet — publish it:
     a. \`cd ${args.projectCwd}\`
     b. \`gh repo create ${repoName} --private --source=. --remote=origin --push\` (pushes the current base branch too)
     c. If the repo name is taken, pick a sensible variant.
     d. Return to the worktree: \`cd ${args.worktreePath}\`

3. Make sure the base branch exists on the remote (\`git ls-remote --heads origin ${args.baseBranch}\`); push it from the project root if missing.

4. Push the napkin branch: \`git push -u origin ${args.branch}\`.

5. Read ${args.napkinDocPath}. Craft a descriptive PR title starting with "${titlePrefix}" and open the draft PR:

\`\`\`bash
gh pr create --draft --base ${args.baseBranch} --head ${args.branch} \\
  --title "${titlePrefix}<descriptive title from the napkin>" \\
  --body "$(cat <<'EOF'
## Napkin

<contents of the napkin doc>

## Summary

<one paragraph on what shipped>

## Test plan

- [ ] <concrete checks based on what the build/test stages did>
EOF
)"
\`\`\`

6. Verify with \`gh pr view ${args.branch} --json url\` and put the PR URL on the FIRST line of your response.

If you hit an unrecoverable blocker (gh not authenticated, no GitHub access, push rejected), do NOT silently give up: put "PR NOT CREATED: <exact error>" on the first line of your response, followed by the command the human should run to fix it.`;
}

/**
 * Render the workflow-level reference docs as a footer block. Paths are
 * resolved against projectCwd so they work even when the agent's cwd is a
 * worktree.
 */
function renderContextSection(files: string[], projectCwd: string): string {
  const cleaned = files.map((f) => f.trim()).filter(Boolean);
  if (cleaned.length === 0) return '';
  const lines = cleaned.map((f) => `- ${path.resolve(projectCwd, f)}`);
  return `

---

## Reference docs

Read these for context (paths are absolute):

${lines.join('\n')}
`;
}

/**
 * Wrap a custom prompt with the done-protocol footer so the workflow runner
 * can advance when the stage finishes.
 */
/**
 * Run the optional scope stage. Spawns a one-off agent (`000-scope`) in the
 * napkin, points it at the spec docs + the scope-architect role doc, and
 * waits for it to write the napkin's scaffolding files and call `nap-pro done`.
 */
async function runScopeStage(
  scope: NonNullable<WorkflowDef['scope']>,
  napkinSlug: string,
  fromSpec: NonNullable<RunWorkflowOpts['fromSpec']>,
  runId: string,
  deps: RunWorkflowDeps,
): Promise<'completed' | 'failed'> {
  const { model, ptySpawner, registry } = deps;
  const napkin = model.getNapkins().find((n) => n.slug === napkinSlug);
  if (!napkin) return 'failed';

  // Architect parent (matches normal stage parent — keeps the tree coherent)
  const architects = model.getArchitects();
  const parent = architects.find((a) => a.role === 'architect') ?? architects[0] ?? null;

  let createdId: string;
  try {
    const stub = await model.createAgentStub(
      napkinSlug,
      '000-scope',
      scope.role,
      undefined,
      parent?.id,
      scope.model ?? null,
    );
    createdId = stub.id;
  } catch (err) {
    // Agent already exists from a previous attempt — reset for rerun
    const existing = model
      .getAllAgents()
      .find((a) => a.napkinId === napkinSlug && a.name === '000-scope');
    if (!existing) throw err;
    if (existing.exited || existing.done || existing.archived) {
      createdId = await model.resetAgentForRerun(existing.id);
    } else {
      createdId = existing.id;
    }
  }

  const agent = model.getAllAgents().find((a) => a.id === createdId);
  if (!agent) {
    registry.markStageEnd(runId, '000-scope', 'failed');
    return 'failed';
  }

  // Build the scope agent's prompt — self-contained, all paths absolute.
  const promptPath = path.join(agent.homePath, 'prompt.md');
  const specList = fromSpec.specDocs.map((p) => `- ${p}`).join('\n');
  const customAddendum = scope.prompt?.trim() ? `\n${scope.prompt.trim()}\n` : '';

  const promptBody = `Read your role: \`.nap/00-org/40-roles/${scope.role}.md\`. It tells you exactly what to produce **and how to check in with the human before releasing the pipeline**.

You are scoping ONE workitem. Do not expand to other workitems mentioned in the spec.

## Workitem
${fromSpec.workItemName}

## Napkin
- Slug: ${napkinSlug}
- Dir: ${napkin.path}

## Spec docs (read these in full)
${specList}
${customAddendum}
Write the three required files inside the napkin dir: \`${napkinSlug}.nap.md\`, \`${napkinSlug}.spec.md\`, \`${napkinSlug}.stories.md\`. Each one as the role doc describes.

## Human checkpoint — REQUIRED before \`nap-pro done\`

After writing the three files, **stop and check in with the human in this terminal**. Do NOT call \`nap-pro done\` until they explicitly approve. The downstream pipeline is expensive — a misaligned scope wastes 4 agents.

Print a short summary (the goal sentence, the IN/OUT lines from \`<slug>.nap.md\`, and the three file paths) and end with: *"Tell me what to change, or say 'ship it' to release the pipeline."*

Then wait. When the human replies:
- **Feedback** → update the relevant file(s), re-summarize, ask again. Loop until they ship it.
- **They edited the files themselves** → re-read the files (canonical source) before proceeding.
- **"ship it" / "go" / "proceed" / "looks good"** → write any leftover notes to ${path.join(agent.homePath, 'response.md')}, then run \`nap-pro done\`. The workflow runner is blocked waiting on you — without this, the rest of the pipeline never spawns.
`;

  await fsPromises.writeFile(promptPath, promptBody);

  try {
    await model.startAgentById(
      agent.id,
      `read ${promptPath} and follow its instructions`,
      ptySpawner,
    );
  } catch {
    registry.markStageEnd(runId, '000-scope', 'failed');
    return 'failed';
  }

  registry.markStageStart(runId, '000-scope', agent.id);
  const result = await awaitDoneOrExit(model, agent.id, stageWatch(deps, runId, '000-scope'));
  registry.markStageEnd(runId, '000-scope', result, stageFailureHint(result));
  return result;
}

function withDoneFooter(body: string, homePath: string): string {
  const responsePath = path.join(homePath, 'response.md');
  return `${body.trimEnd()}

---

CRITICAL: when you are done, write your response to ${responsePath}, then run \`nap-pro done\` in your terminal (no message argument — just \`nap-pro done\`). The workflow runner is blocked waiting — without this, the next stage never spawns.
`;
}

export function defaultTemplatePrompt(
  role: string,
  homePath: string,
  napkinSlug: string,
  napkinDir: string,
  scaffoldingFiles: string[],
): string {
  const scaffoldingSection = napkinDir
    ? `
## Napkin

- Slug: \`${napkinSlug}\`
- Dir: \`${napkinDir}\`

Scaffolding files (read whichever apply to your role before doing anything):
${scaffoldingFiles.length > 0 ? scaffoldingFiles.map((p) => `- \`${p}\``).join('\n') : '_(no scaffolding files written yet — earlier stages will fill these in)_'}
`
    : '';

  return `Read your role: \`.nap/00-org/40-roles/${role}.md\` — every line matters.

Read the rest of \`.nap/00-org/\` — promise, workflow, structure.
${scaffoldingSection}
Your home dir is ${homePath}. Write your response to ${homePath}/response.md.

CRITICAL: when you are done, write your response to ${homePath}/response.md, then run \`nap-pro done\` in your terminal (no message argument — just \`nap-pro done\`). The runner is blocked waiting — without this, the pipeline stalls.
`;
}

/**
 * Enumerate `<slug>.*.md` files inside the napkin dir. Returns absolute paths,
 * sorted. Missing dir / read errors → empty array (we don't want a transient
 * fs hiccup to kill an otherwise-fine stage; the role docs already make the
 * scaffolding scan resilient).
 */
export async function enumerateNapkinScaffolding(napkinDir: string, slug: string): Promise<string[]> {
  try {
    const entries = await fsPromises.readdir(napkinDir);
    return entries
      .filter((e) => e.startsWith(`${slug}.`) && e.endsWith('.md'))
      .map((e) => path.join(napkinDir, e))
      .sort();
  } catch {
    return [];
  }
}

/** No pty output for this long while running → the stage is 'stalled'. */
export const STALL_THRESHOLD_MS = parseInt(process.env['NAP_STALL_THRESHOLD_MS'] || '', 10) || 180_000;
const STALL_CHECK_INTERVAL_MS = Math.min(15_000, Math.max(250, Math.floor(STALL_THRESHOLD_MS / 4)));

interface StageWatch {
  ptySpawner: PtySpawner;
  /** Fired on stalled↔active transitions only. */
  onStallChange: (stalled: boolean) => void;
}

/** Watch wiring for a stage: flips the registry's stalled flag on transitions. */
function stageWatch(deps: RunWorkflowDeps, runId: string, stageName: string): StageWatch {
  return {
    ptySpawner: deps.ptySpawner,
    onStallChange: (stalled) => deps.registry.markStageStalled(runId, stageName, stalled),
  };
}

/**
 * Resolve when the agent's `done` flag flips true, or the agent exits.
 * Returns 'completed' on done, 'failed' on exit-without-done.
 *
 * With `watch` set, also runs a liveness watchdog: if the agent produces no
 * pty output for STALL_THRESHOLD_MS (and isn't paused or waiting on a
 * permission approval), onStallChange(true) fires; output resuming fires
 * onStallChange(false). Detection only — the stage keeps waiting either way;
 * the human decides whether to nudge or kill.
 *
 * Critical: synchronously check current state BEFORE subscribing. Without
 * this, an agent that exits between start and subscribe leaves the runner
 * hung forever waiting for a state change that already happened.
 */
function awaitDoneOrExit(
  model: NapModel,
  agentId: string,
  watch?: StageWatch,
): Promise<'completed' | 'failed'> {
  return new Promise((resolve) => {
    let unsub: (() => void) | null = null;
    let resolved = false;

    // ── Liveness watchdog ──
    const watchStartedAt = Date.now();
    let stalled = false;
    const stallTimer = watch
      ? setInterval(() => {
          const timeline = watch.ptySpawner.getScrollbackTimeline(agentId);
          const lastOutputAt = timeline.length > 0 ? timeline[timeline.length - 1].ts : watchStartedAt;
          const agent = model.getAllAgents().find((a) => a.id === agentId);
          // Paused (SIGSTOP) and approval-blocked agents are silent on purpose.
          const legitimatelyQuiet = watch.ptySpawner.isPaused(agentId) || !!agent?.pendingApproval;
          const stalledNow = !legitimatelyQuiet && Date.now() - lastOutputAt > STALL_THRESHOLD_MS;
          if (stalledNow !== stalled) {
            stalled = stalledNow;
            watch.onStallChange(stalled);
          }
        }, STALL_CHECK_INTERVAL_MS)
      : null;

    function done(result: 'completed' | 'failed'): void {
      if (resolved) return;
      resolved = true;
      if (stallTimer) clearInterval(stallTimer);
      try {
        unsub?.();
      } catch {
        // listener already gone
      }
      resolve(result);
    }

    function checkAgent(agent: { done: boolean; exited: boolean }): boolean {
      if (agent.done) {
        done('completed');
        return true;
      }
      if (agent.exited) {
        done('failed');
        return true;
      }
      return false;
    }

    // Synchronous initial check — handle "already done before subscribe" race.
    const current = model.getAllAgents().find((a) => a.id === agentId);
    if (current && checkAgent(current)) return;

    // Per-agent listener — only fires for THIS agent's state changes.
    unsub = model.subscribeAgent(agentId, (agent) => {
      checkAgent(agent);
    });
  });
}

/**
 * Wait until predicate(agent) returns truthy. timeoutMs=0 means wait forever.
 * Synchronously checks current state before subscribing.
 */
function waitFor(
  model: NapModel,
  agentId: string,
  predicate: (a: { started: boolean; exited: boolean; done: boolean; running: boolean }) => boolean,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let unsub: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;

    function done(result: boolean): void {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      try {
        unsub?.();
      } catch {
        // listener already gone
      }
      resolve(result);
    }

    function checkAgent(agent: {
      started: boolean;
      exited: boolean;
      done: boolean;
      running: boolean;
    }): boolean {
      if (predicate(agent)) {
        done(true);
        return true;
      }
      return false;
    }

    const current = model.getAllAgents().find((a) => a.id === agentId);
    if (current && checkAgent(current)) return;

    unsub = model.subscribeAgent(agentId, (agent) => {
      checkAgent(agent);
    });
    if (timeoutMs > 0) {
      timer = setTimeout(() => done(false), timeoutMs);
    }
  });
}
