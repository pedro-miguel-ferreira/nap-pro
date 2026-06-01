import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { ActivityEvent } from '../shared/bridge-types';
import { getAgentCost } from './cost-helpers';
import type { NapModel } from './model';

/**
 * Aggregate past outcomes for a "stage" — agents matching a given name + role
 * across all napkins. Reads each agent's activity.ndjson to derive lifecycle
 * outcomes; reads CC session logs (via cost-helpers) for token spend.
 *
 * Why name+role for matching: the workflow editor identifies stages by both,
 * so re-running a workflow produces multiple agents at the same name+role
 * across napkins. That's the cohort we want to summarize.
 *
 * Performance: O(matching agents × NDJSON size). Each agent's activity log is
 * tiny (lifecycle + permissions only), so this is cheap. Cost lookups read
 * jsonl files but they're already cached by the OS.
 */

export interface StageStatsSampleRun {
  napkinSlug: string | null;
  agentName: string;
  model: string | null;
  status: 'completed' | 'failed' | 'in-progress';
  /** ms from started → done|exited; undefined if still running. */
  durationMs?: number;
  costUsd: number;
  /** Wall-clock ms of the start. */
  ts: number;
}

export interface StageStats {
  /** Total cohort size. */
  count: number;
  completedCount: number;
  failedCount: number;
  inProgressCount: number;
  /** Pass rate over (completed + failed). 0..1, or null if no terminal samples. */
  passRate: number | null;
  /** Median duration across completed+failed runs in ms; null if none. */
  medianDurationMs: number | null;
  /** Median USD across completed+failed runs; null if none. */
  medianCostUsd: number | null;
  /** Most recent N samples, newest first. */
  recent: StageStatsSampleRun[];
}

const RECENT_LIMIT = 10;

export async function computeStageStats(
  model: NapModel,
  stageName: string,
  role: string,
  projectCwd: string,
): Promise<StageStats> {
  const matching = model.getAllAgents().filter((a) => a.name === stageName && a.role === role);

  const samples: StageStatsSampleRun[] = [];
  for (const agent of matching) {
    const events = await readActivityEvents(agent.homePath);
    const startedAt = firstEventTs(events, ['started', 'resumed']);
    const doneAt = firstEventTs(events, ['done']);
    const exitedAt = firstEventTs(events, ['exited']);

    let status: 'completed' | 'failed' | 'in-progress';
    let durationMs: number | undefined;
    if (doneAt !== null && startedAt !== null) {
      status = 'completed';
      durationMs = doneAt - startedAt;
    } else if (exitedAt !== null && startedAt !== null) {
      status = 'failed';
      durationMs = exitedAt - startedAt;
    } else if (startedAt !== null) {
      status = 'in-progress';
    } else {
      // Never started — skip
      continue;
    }

    // Cost from CC session log (best-effort — zero if no log).
    // Use the agent's effective cwd (worktree if napkin had one; else project root).
    const cwd = model.getAgentCwd(agent.id) || projectCwd;
    const costSummary = await getAgentCost(agent.id, agent.name, cwd);

    samples.push({
      napkinSlug: agent.napkinId,
      agentName: agent.name,
      model: agent.model,
      status,
      durationMs,
      costUsd: costSummary.costUsd,
      ts: startedAt!,
    });
  }

  samples.sort((a, b) => b.ts - a.ts);

  const completedCount = samples.filter((s) => s.status === 'completed').length;
  const failedCount = samples.filter((s) => s.status === 'failed').length;
  const inProgressCount = samples.filter((s) => s.status === 'in-progress').length;
  const terminalSamples = samples.filter((s) => s.status !== 'in-progress');

  const durations = terminalSamples
    .map((s) => s.durationMs)
    .filter((d): d is number => typeof d === 'number');
  const costs = terminalSamples.map((s) => s.costUsd);

  return {
    count: samples.length,
    completedCount,
    failedCount,
    inProgressCount,
    passRate: terminalSamples.length === 0 ? null : completedCount / terminalSamples.length,
    medianDurationMs: median(durations),
    medianCostUsd: median(costs),
    recent: samples.slice(0, RECENT_LIMIT),
  };
}

async function readActivityEvents(homePath: string): Promise<ActivityEvent[]> {
  try {
    const text = await fsPromises.readFile(path.join(homePath, 'activity.ndjson'), 'utf-8');
    const events: ActivityEvent[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as ActivityEvent);
      } catch {
        // skip malformed line
      }
    }
    return events;
  } catch {
    return [];
  }
}

function firstEventTs(
  events: ActivityEvent[],
  types: string[],
): number | null {
  for (const e of events) {
    if (types.includes(e.type)) return e.ts;
  }
  return null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
