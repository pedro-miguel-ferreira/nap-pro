import { useNapStore } from './store';
import { CLAUDE_MODELS, type ClaudeModelOption } from '../shared/claude-models';
import { CURSOR_DEFAULT_MODEL, CURSOR_MODELS, mapCursorModel } from '../shared/cursor-models';

/**
 * Models for the active backend's pickers (Claude or Cursor ids). Falls back
 * to the Claude list until `backend:info` has answered (and in tests).
 */
export function useModelOptions(): ClaudeModelOption[] {
  return useNapStore((s) => s.backendInfo?.models) ?? CLAUDE_MODELS;
}

/**
 * Label for the empty option. On Cursor, empty runs CURSOR_DEFAULT_MODEL —
 * say which, since Cursor's own default (Composer) is not what spawns.
 */
export function useDefaultModelLabel(): string {
  const cursor = useNapStore((s) => s.backendInfo?.name === 'cursor');
  if (!cursor) return 'default';
  const label = CURSOR_MODELS.find((m) => m.id === CURSOR_DEFAULT_MODEL)?.label ?? CURSOR_DEFAULT_MODEL;
  return `default (${label})`;
}

/**
 * The listed option a saved id actually spawns as. On Cursor a saved
 * Claude-style id (`claude-fable-5`) runs as `claude-fable-5-high`, so the
 * picker selects that entry rather than showing the raw id as a separate
 * choice. On Claude the mapped id is never listed, so ids pass through.
 */
export function pickerValue(options: ClaudeModelOption[], saved: string | null | undefined): string {
  if (!saved) return '';
  if (options.some((m) => m.id === saved)) return saved;
  const mapped = mapCursorModel(saved);
  return mapped && options.some((m) => m.id === mapped) ? mapped : saved;
}

/**
 * Keep a saved id selectable when it matches no listed model even after
 * mapping (e.g. a Cursor id opened on the Claude backend) — shown raw so the
 * stored value is never silently changed.
 */
export function withSavedModel(
  options: ClaudeModelOption[],
  saved: string | null | undefined,
): ClaudeModelOption[] {
  const value = pickerValue(options, saved);
  if (!value || options.some((m) => m.id === value)) return options;
  return [...options, { id: value, label: value }];
}
