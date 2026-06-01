import * as crypto from 'crypto';
import type {
  WorkflowDef,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowStageRun,
  WorkflowStageRunStatus,
} from '../shared/bridge-types';

/**
 * Tracks all in-flight + recently-completed workflow runs.
 *
 * State lives in memory only (electron main process). On app restart, runs
 * are gone — their stage agents persist on disk via the model, but the
 * orchestration record doesn't. Persistence to `.nap/workflows/runs/` is a
 * planned follow-up; for now, a relaunch means manually re-driving any
 * partially-completed flow.
 *
 * Each run carries an AbortController. Cancellation:
 *   - sets aborted=true on the controller
 *   - the runner checks signal.aborted between groups and aborts cleanly
 *   - the registry kills any in-flight agents via the killer fn passed in
 */

export interface WorkflowRegistryEntry {
  run: WorkflowRun;
  controller: AbortController;
}

export type RunUpdateListener = (run: WorkflowRun) => void;

export class WorkflowRegistry {
  private entries = new Map<string, WorkflowRegistryEntry>();
  /** Most recently active run per napkin — used for per-napkin lookup. */
  private latestByNapkin = new Map<string, string>();
  private listeners = new Set<RunUpdateListener>();
  /** Capped recent-completed buffer so the dashboard can show history briefly. */
  private completedHistory: WorkflowRun[] = [];
  private readonly historyCap = 25;

  start(
    workflowName: string,
    napkinSlug: string,
    def: WorkflowDef,
    opts: { withScope?: boolean } = {},
  ): WorkflowRegistryEntry {
    const runId = crypto.randomUUID();
    const stages: WorkflowStageRun[] = computeStageOrder(def, opts);

    const run: WorkflowRun = {
      runId,
      workflowName,
      napkinSlug,
      startedAt: Date.now(),
      status: 'running',
      stages,
    };

    const entry: WorkflowRegistryEntry = {
      run,
      controller: new AbortController(),
    };

    this.entries.set(runId, entry);
    this.latestByNapkin.set(napkinSlug, runId);
    this.emit(run);
    return entry;
  }

  /**
   * Mark a stage as starting. `agentId` is omitted for synthetic stages like
   * `open-pr` that are handled inline by the runner (no agent spawned).
   */
  markStageStart(runId: string, stageName: string, agentId?: string): void {
    const entry = this.entries.get(runId);
    if (!entry) return;
    const stage = entry.run.stages.find((s) => s.name === stageName);
    if (!stage) return;
    stage.status = 'running';
    if (agentId) stage.agentId = agentId;
    stage.startedAt = Date.now();
    this.emit(entry.run);
  }

  markStageEnd(runId: string, stageName: string, status: WorkflowStageRunStatus): void {
    const entry = this.entries.get(runId);
    if (!entry) return;
    const stage = entry.run.stages.find((s) => s.name === stageName);
    if (!stage) return;
    stage.status = status;
    stage.endedAt = Date.now();
    this.emit(entry.run);
  }

  /** Final state setter. Moves the run into recent-history and removes the entry. */
  complete(runId: string, status: WorkflowRunStatus, message?: string): void {
    const entry = this.entries.get(runId);
    if (!entry) return;
    entry.run.status = status;
    entry.run.endedAt = Date.now();
    if (message) entry.run.message = message;

    // Mark any still-pending stages as cancelled if the run failed/cancelled.
    if (status === 'cancelled' || status === 'failed') {
      for (const s of entry.run.stages) {
        if (s.status === 'pending' || s.status === 'running') {
          s.status = 'cancelled';
          s.endedAt = s.endedAt ?? Date.now();
        }
      }
    }

    // Snapshot into history before removing
    this.completedHistory.unshift({ ...entry.run, stages: [...entry.run.stages] });
    if (this.completedHistory.length > this.historyCap) {
      this.completedHistory.length = this.historyCap;
    }

    this.entries.delete(runId);
    this.emit(entry.run);
  }

  /**
   * Request cancellation of a run. Flips the abort signal; the runner detects
   * it between groups. The caller (main.ts) is responsible for killing any
   * in-flight agents — registry doesn't have a PtySpawner reference here.
   */
  cancel(runId: string): WorkflowRegistryEntry | null {
    const entry = this.entries.get(runId);
    if (!entry) return null;
    if (entry.run.status === 'running') {
      entry.controller.abort();
    }
    return entry;
  }

  /** Look up the active run for a napkin (if any). */
  getActiveRunForNapkin(napkinSlug: string): WorkflowRun | null {
    const runId = this.latestByNapkin.get(napkinSlug);
    if (!runId) return null;
    return this.entries.get(runId)?.run ?? null;
  }

  getEntry(runId: string): WorkflowRegistryEntry | null {
    return this.entries.get(runId) ?? null;
  }

  /** Active runs + recent history, sorted newest-first. */
  list(): WorkflowRun[] {
    const active = Array.from(this.entries.values()).map((e) => e.run);
    const merged = [...active, ...this.completedHistory];
    return merged.sort((a, b) => b.startedAt - a.startedAt);
  }

  onChange(listener: RunUpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(run: WorkflowRun): void {
    for (const fn of this.listeners) {
      try {
        fn(run);
      } catch {
        // listener errors don't break the producer
      }
    }
  }
}

/** Compute the ordered list of stages with group indices, mirroring runner logic. */
function computeStageOrder(
  def: WorkflowDef,
  opts: { withScope?: boolean } = {},
): WorkflowStageRun[] {
  const result: WorkflowStageRun[] = [];
  let groupIndex = 0;
  let lastParallelGroup: number | undefined;

  // Prepend scope stage when this is a from-spec run with a scope-stage def.
  // The first regular stage's "result.length === 0" check now returns false,
  // so groupIndex correctly bumps to 1 for the first real stage.
  if (opts.withScope && def.scope) {
    result.push({
      name: '000-scope',
      role: def.scope.role,
      model: def.scope.model ?? null,
      status: 'pending',
      groupIndex: 0,
    });
    // Leave groupIndex at 0 — the next loop iteration will bump it to 1.
  }

  for (const stage of def.stages) {
    if (stage.parallelGroup === undefined) {
      // Singleton group — bumps index
      groupIndex = result.length === 0 ? 0 : groupIndex + 1;
      lastParallelGroup = undefined;
    } else if (stage.parallelGroup === lastParallelGroup) {
      // Continuation of the previous parallel group
      // (matches runner's "consecutive only" grouping)
    } else {
      groupIndex = result.length === 0 ? 0 : groupIndex + 1;
      lastParallelGroup = stage.parallelGroup;
    }

    if (stage.kind === 'open-pr') {
      // Synthetic stage — no agent, no model. Use placeholders so the UI's
      // existing WorkflowStageRun rendering doesn't choke on missing fields.
      result.push({
        name: stage.name,
        role: '(runner)',
        model: null,
        status: 'pending',
        groupIndex,
      });
    } else {
      result.push({
        name: stage.name,
        role: stage.role,
        model: stage.model,
        status: 'pending',
        groupIndex,
      });
    }
  }

  return result;
}
