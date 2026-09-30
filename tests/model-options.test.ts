import { describe, it, expect } from 'vitest';
import { pickerValue, withSavedModel } from '../src/renderer/model-options';
import { CLAUDE_MODELS } from '../src/shared/claude-models';
import { CURSOR_MODELS } from '../src/shared/cursor-models';

describe('model pickers — saved ids', () => {
  it('cursor: saved Claude-style ids select the entry they spawn as', () => {
    expect(pickerValue(CURSOR_MODELS, 'claude-fable-5')).toBe('claude-fable-5-high');
    expect(pickerValue(CURSOR_MODELS, 'claude-opus-4-8')).toBe('claude-opus-4-8-high');
    expect(pickerValue(CURSOR_MODELS, 'claude-opus-5')).toBe('claude-opus-5-high');
    // No raw duplicate entry appended.
    expect(withSavedModel(CURSOR_MODELS, 'claude-fable-5')).toBe(CURSOR_MODELS);
  });

  it('cursor: listed and empty ids pass through', () => {
    expect(pickerValue(CURSOR_MODELS, 'composer-2.5')).toBe('composer-2.5');
    expect(pickerValue(CURSOR_MODELS, null)).toBe('');
    expect(pickerValue(CURSOR_MODELS, '')).toBe('');
  });

  it('cursor: an unlisted Cursor id stays selectable, shown raw', () => {
    const opts = withSavedModel(CURSOR_MODELS, 'claude-opus-5-5-max');
    expect(opts[opts.length - 1]).toEqual({ id: 'claude-opus-5-5-max', label: 'claude-opus-5-5-max' });
  });

  it('claude: ids are never remapped', () => {
    for (const m of CLAUDE_MODELS) expect(pickerValue(CLAUDE_MODELS, m.id)).toBe(m.id);
    expect(withSavedModel(CLAUDE_MODELS, 'claude-fable-5')).toBe(CLAUDE_MODELS);
    // A Cursor id opened on the Claude backend is kept, not changed.
    expect(pickerValue(CLAUDE_MODELS, 'claude-fable-5-high')).toBe('claude-fable-5-high');
  });
});
