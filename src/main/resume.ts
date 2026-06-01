import type { AgentState } from '../shared/bridge-types';
import { buildClaudeArgs } from './claude-args';

export interface ResumeAction {
  agentId: string;
  action: 'resume' | 'fresh' | 'skip';
  /** Executable to spawn — 'claude' for resume/fresh, undefined for skip. */
  file?: string;
  /** Argv for the spawn — no shell interpretation. */
  args?: string[];
}

/**
 * Pure function: given a list of agents, compute what to do on STOP→RUN.
 *
 * Case A (started + !exited): resume with --resume (includes done agents)
 * Case B (exited): skip — user terminated, resume on demand via click
 * Case C (!started): **skip** — opening nap-pro should never auto-spawn an
 *   agent that has never run. The architect (or any other not-yet-started
 *   agent) stays dormant; the user starts it explicitly via right-click →
 *   Start, or it gets started by the workflow runner when its stage fires.
 *   This used to be `fresh` — that spun up the architect every launch even
 *   when the user just wanted to configure the project first.
 */
export function computeResumeActions(agents: AgentState[]): ResumeAction[] {
  return agents.map((agent) => {
    // Archived agents always skip — checked BEFORE started/exited
    if (agent.archived) {
      return { agentId: agent.id, action: 'skip' as const };
    }
    if (agent.exited) {
      return { agentId: agent.id, action: 'skip' as const };
    }
    if (agent.started) {
      return {
        agentId: agent.id,
        action: 'resume' as const,
        file: 'claude',
        args: buildClaudeArgs({
          sessionId: agent.id,
          model: agent.model,
          resume: true,
        }),
      };
    }
    // Never started — leave dormant.
    return { agentId: agent.id, action: 'skip' as const };
  });
}
