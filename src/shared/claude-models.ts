/**
 * The Claude models selectable for stage agents, replays, and scope stages —
 * single source of truth for every model dropdown. Ordered most → least
 * capable. Consumers prepend their own "default (CC chooses)" empty-id entry.
 *
 * Cost rates for these ids live in src/main/cost-helpers.ts; chart colors in
 * src/renderer/CostPanel.tsx — keep all three in sync when models change.
 */
export interface ClaudeModelOption {
  /** Model id passed to claude via --model. */
  id: string;
  label: string;
}

export const CLAUDE_MODELS: ClaudeModelOption[] = [
  { id: 'claude-fable-5', label: 'Fable 5' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];
