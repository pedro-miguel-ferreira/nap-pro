/**
 * Models offered in the pickers when the project runs on the Cursor backend
 * (`agent` CLI). Ids are Cursor's own (`agent models`); the `-high` suffix is
 * the reasoning-effort tier. Ordered most → least capable.
 */
import type { ClaudeModelOption } from './claude-models';

export const CURSOR_MODELS: ClaudeModelOption[] = [
  { id: 'claude-opus-5-5-high', label: 'Opus 5.5 (high)' },
  { id: 'claude-fable-5-1-high', label: 'Fable 5.1 (high)' },
  { id: 'claude-fable-5-high', label: 'Fable 5 (high)' },
  { id: 'claude-opus-5-high', label: 'Opus 5 (high)' },
  { id: 'claude-opus-4-8-high', label: 'Opus 4.8 (high)' },
  { id: 'claude-sonnet-5-5-high', label: 'Sonnet 5.5 (high)' },
  { id: 'claude-sonnet-5-high', label: 'Sonnet 5 (high)' },
  { id: 'composer-2.5', label: 'Composer 2.5' },
];

/**
 * Claude-backend ids with no same-named Cursor model. Saved workflows and agent
 * markers still carry these, so they map to the nearest Cursor model instead
 * of failing at spawn with "Cannot use this model".
 */
const LEGACY_CLAUDE_IDS: Record<string, string> = {
  'claude-opus-4-7': 'claude-opus-4-8-high',
  'claude-sonnet-4-6': 'claude-sonnet-5-high',
  'claude-haiku-4-5': 'claude-sonnet-5-low',
};

// Claude-style family id without an effort suffix, e.g. claude-opus-5-5.
const BARE_CLAUDE_ID = /^claude-[a-z]+-\d+(?:-\d+)?$/;

/**
 * Translate a stored model id into one the `agent` CLI accepts. Claude-style
 * ids (`claude-opus-5-5`, `claude-fable-5`) get the `-high` effort tier;
 * anything else (already a Cursor id, e.g. `composer-2.5`,
 * `claude-opus-5-5-max`) passes through. Empty → null (Cursor's default).
 */
export function mapCursorModel(id: string | null | undefined): string | null {
  if (!id) return null;
  if (LEGACY_CLAUDE_IDS[id]) return LEGACY_CLAUDE_IDS[id];
  if (BARE_CLAUDE_ID.test(id)) return `${id}-high`;
  return id;
}
