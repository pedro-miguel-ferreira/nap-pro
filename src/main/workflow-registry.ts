import * as crypto from 'crypto';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
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
 * Every mutation is persisted to `<persistDir>/<runId>.json` (when a
 * persistDir is configured) so an app restart doesn't lose orchestration
 * state: on startup `loadFromDisk()` pulls the history back, flips runs that
 * died mid-flight to 'interrupted', and `reactivate()` lets the runner resume
 * them from the first non-completed stage.
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

/** What lands in the per-run JSON file — enough to display AND resume. */
export interface PersistedRun {
  run: WorkflowRun;
  def: WorkflowDef;
  fromSpec?: { specDocs: string[]; workItemName: string };
}

export type RunUpdateListener = (run: WorkflowRun) => void;

const PERSISTED_RUN_FILE_CAP = 50;

export class WorkflowRegistry {
  private entries = new Map<string, WorkflowRegistryEntry>();
  /** Most recently active run per napkin — used for per-napkin lookup. */
  private latestByNapkin = new Map<string, string>();
  private listeners = new Set<RunUpdateListener>();
  /** Capped recent-completed buffer so the dashboard can show history briefly. */
  private completedHistory: WorkflowRun[] = [];
  private readonly historyCap = 25;
  /** def + fromSpec per runId — needed to resume without re-parsing workflow files. */
  private runContexts = new Map<string, { def: WorkflowDef; fromSpec?: PersistedRun['fromSpec'] }>();
  private readonly persistDir: string | null;
  /** Serializes run-file writes; also lets tests await pending persistence. */
  private persistChain: Promise<void> = Promise.resolve();

  constructor(opts: { persistDir?: string } = {}) {
    this.persistDir = opts.persistDir ?? null;
  }

  start(
    workflowName: string,
    napkinSlug: string,
    def: WorkflowDef,
    opts: { withScope?: boolean; fromSpec?: PersistedRun['fromSpec'] } = {},
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
    this.runContexts.set(runId, { def, fromSpec: opts.fromSpec });
    this.emit(run);
    return entry;
  }

  // ── Persistence ──

  /**
   * Load persisted runs from disk into history. Runs that were 'running' when
   * the app died are flipped to 'interrupted' (their in-flight stages back to
   * 'pending') and can be resumed via reactivate(). Corrupt files are skipped.
   */
  async loadFromDisk(): Promise<void> {
    if (!this.persistDir) return;
    let fileNames: string[];
    try {
      fileNames = await fsPromises.readdir(this.persistDir);
    } catch {
      return; // no runs dir yet
    }
    const loaded: WorkflowRun[] = [];
    for (const fileName of fileNames) {
      if (!fileName.endsWith('.json')) continue;
      try {
        const raw = await fsPromises.readFile(path.join(this.persistDir, fileName), 'utf-8');
        const persisted = JSON.parse(raw) as PersistedRun;
        if (!persisted?.run?.runId || !persisted.def) continue;

        if (persisted.run.status === 'running') {
          persisted.run.status = 'interrupted';
          persisted.run.message = 'app quit mid-run — resume to continue from the last completed stage';
          for (const stage of persisted.run.stages) {
            if (stage.status === 'running' || stage.status === 'stalled') {
              stage.status = 'pending';
              stage.endedAt = undefined;
            }
          }
          const interruptedRun = persisted.run;
          this.persistChain = this.persistChain.then(() => this.persistRun(interruptedRun));
        }

        this.runContexts.set(persisted.run.runId, {
          def: persisted.def,
          fromSpec: persisted.fromSpec,
        });
        loaded.push(persisted.run);
      } catch {
        // skip unreadable run files
      }
    }
    loaded.sort((a, b) => b.startedAt - a.startedAt);
    this.completedHistory = [...loaded, ...this.completedHistory].slice(0, this.historyCap);
    void this.pruneRunFiles();
  }

  /**
   * Bring an interrupted or failed run back to life for resumption: fresh
   * AbortController, status back to 'running', non-completed stages reset to
   * 'pending'. Returns everything the runner needs to re-drive it, or null
   * when the run is unknown / still active / not resumable.
   */
  reactivate(runId: string): {
    entry: WorkflowRegistryEntry;
    def: WorkflowDef;
    fromSpec?: PersistedRun['fromSpec'];
    completedStages: Set<string>;
  } | null {
    if (this.entries.has(runId)) return null; // already active
    const historyIdx = this.completedHistory.findIndex((r) => r.runId === runId);
    const runContext = this.runContexts.get(runId);
    if (historyIdx < 0 || !runContext) return null;
    const run = this.completedHistory[historyIdx];
    if (run.status !== 'interrupted' && run.status !== 'failed') return null;

    this.completedHistory.splice(historyIdx, 1);
    run.status = 'running';
    run.endedAt = undefined;
    run.message = undefined;
    const completedStages = new Set<string>();
    for (const stage of run.stages) {
      if (stage.status === 'completed') {
        completedStages.add(stage.name);
      } else {
        stage.status = 'pending';
        stage.startedAt = undefined;
        stage.endedAt = undefined;
        stage.message = undefined;
      }
    }

    const entry: WorkflowRegistryEntry = { run, controller: new AbortController() };
    this.entries.set(runId, entry);
    this.latestByNapkin.set(run.napkinSlug, runId);
    this.emit(run);
    return { entry, def: runContext.def, fromSpec: runContext.fromSpec, completedStages };
  }

  private persistRun(run: WorkflowRun): Promise<void> {
    if (!this.persistDir) return Promise.resolve();
    const runContext = this.runContexts.get(run.runId);
    if (!runContext) return Promise.resolve();
    const persisted: PersistedRun = {
      run,
      def: runContext.def,
      fromSpec: runContext.fromSpec,
    };
    const filePath = path.join(this.persistDir, `${run.runId}.json`);
    return fsPromises
      .mkdir(this.persistDir, { recursive: true })
      .then(() => fsPromises.writeFile(filePath, JSON.stringify(persisted, null, 2)))
      .catch(() => {
        // persistence is best-effort — never break the run over a disk hiccup
      });
  }

  /** Keep the newest PERSISTED_RUN_FILE_CAP run files; delete the rest. */
  private async pruneRunFiles(): Promise<void> {
    if (!this.persistDir) return;
    try {
      const fileNames = (await fsPromises.readdir(this.persistDir)).filter((f) => f.endsWith('.json'));
      if (fileNames.length <= PERSISTED_RUN_FILE_CAP) return;
      const withTimes = await Promise.all(
        fileNames.map(async (f) => {
          const stat = await fsPromises.stat(path.join(this.persistDir!, f));
          return { f, mtime: stat.mtimeMs };
        }),
      );
      withTimes.sort((a, b) => b.mtime - a.mtime);
      for (const { f } of withTimes.slice(PERSISTED_RUN_FILE_CAP)) {
        await fsPromises.unlink(path.join(this.persistDir, f));
      }
    } catch {
      // best-effort
    }
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

  markStageEnd(
    runId: string,
    stageName: string,
    status: WorkflowStageRunStatus,
    message?: string,
  ): void {
    const entry = this.entries.get(runId);
    if (!entry) return;
    const stage = entry.run.stages.find((s) => s.name === stageName);
    if (!stage) return;
    stage.status = status;
    stage.endedAt = Date.now();
    if (message) stage.message = message;
    this.emit(entry.run);
  }

  /**
   * Toggle a running stage's stalled flag (no pty output for a while). Only
   * flips between 'running' and 'stalled' — terminal states are untouched.
   */
  markStageStalled(runId: string, stageName: string, stalled: boolean): void {
    const entry = this.entries.get(runId);
    if (!entry) return;
    const stage = entry.run.stages.find((s) => s.name === stageName);
    if (!stage) return;
    if (stalled && stage.status === 'running') {
      stage.status = 'stalled';
      this.emit(entry.run);
    } else if (!stalled && stage.status === 'stalled') {
      stage.status = 'running';
      this.emit(entry.run);
    }
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

  /** Await all queued run-file writes — used by tests and shutdown paths. */
  flushPersistence(): Promise<void> {
    return this.persistChain;
  }

  private emit(run: WorkflowRun): void {
    this.persistChain = this.persistChain.then(() => this.persistRun(run));
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
