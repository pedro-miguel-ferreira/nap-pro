import { describe, it, expect, afterEach } from 'vitest';
import {
  buildClaudeArgs,
  setPermissionsSettingsPath,
  getPermissionsSettingsPath,
} from '../src/main/claude-args';

afterEach(() => {
  // Reset module-level state so tests don't leak into each other.
  setPermissionsSettingsPath(null);
});

describe('buildClaudeArgs', () => {
  it('emits --session-id + --verbose for a fresh spawn', () => {
    const args = buildClaudeArgs({ sessionId: 'abc123', prompt: 'hello' });
    expect(args).toEqual(['--verbose', '--session-id', 'abc123', 'hello']);
  });

  it('uses --resume instead of --session-id when resume=true', () => {
    const args = buildClaudeArgs({ sessionId: 'abc123', resume: true });
    expect(args).toEqual(['--verbose', '--resume', 'abc123']);
  });

  it('omits permission flags when no settings path is set', () => {
    expect(getPermissionsSettingsPath()).toBeNull();
    const args = buildClaudeArgs({ sessionId: 'abc123' });
    expect(args).not.toContain('--permission-mode');
    expect(args).not.toContain('--settings');
  });

  it('emits --settings (only) when a permissions path is set', () => {
    setPermissionsSettingsPath('/tmp/permissions.json');
    const args = buildClaudeArgs({ sessionId: 'abc123', prompt: 'hi' });
    expect(args).toContain('--settings');
    expect(args).toContain('/tmp/permissions.json');
    // The file itself owns defaultMode — no CLI override fighting it.
    expect(args).not.toContain('--permission-mode');
    // Prompt is still last positional — order matters because CC treats
    // the trailing arg as the initial user message.
    expect(args[args.length - 1]).toBe('hi');
  });

  it('rejects suspicious session ids before any flag emission', () => {
    expect(() => buildClaudeArgs({ sessionId: '$(rm -rf /)' })).toThrow();
  });
});
