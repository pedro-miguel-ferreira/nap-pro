/**
 * Centralized "did claude --resume fail because the session is gone?" predicate.
 *
 * Claude Code surfaces this scenario with phrasing that has changed at least
 * once in CC's history. We accept several known wordings so a future rewording
 * doesn't silently regress agents into 'exited' instead of 'archived'.
 *
 * Sites that use this:
 *   - main.ts pty:resume IPC handler (failure → setAgentArchived)
 *   - coordinators.ts startAgents resume path (same)
 */

const PATTERNS: RegExp[] = [
  /No conversation found/i,
  /Session not found/i,
  /Session .* (?:does not exist|expired|missing)/i,
  /Cannot resume session/i,
];

export function isResumeMissingSession(buffer: string): boolean {
  if (!buffer) return false;
  return PATTERNS.some((re) => re.test(buffer));
}
