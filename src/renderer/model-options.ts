import { useNapStore } from './store';
import { CLAUDE_MODELS, type ClaudeModelOption } from '../shared/claude-models';

/**
 * Models for the active backend's pickers (Claude or Cursor ids). Falls back
 * to the Claude list until `backend:info` has answered (and in tests).
 */
export function useModelOptions(): ClaudeModelOption[] {
  return useNapStore((s) => s.backendInfo?.models) ?? CLAUDE_MODELS;
}

/**
 * Keep a saved id selectable even when the active backend doesn't list it
 * (e.g. a workflow saved with a Claude id, opened on the Cursor backend —
 * the backend maps it at spawn time).
 */
export function withSavedModel(
  options: ClaudeModelOption[],
  saved: string | null | undefined,
): ClaudeModelOption[] {
  if (!saved || options.some((m) => m.id === saved)) return options;
  return [...options, { id: saved, label: saved }];
}
