import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { resolveWorktreeBaseDir, getWorktreePath } from '../src/main/worktree-helpers';

describe('resolveWorktreeBaseDir', () => {
  it('defaults to "<projectCwd>-worktrees" when baseDir is undefined', () => {
    const result = resolveWorktreeBaseDir('/Users/x/proj');
    expect(result).toBe('/Users/x/proj-worktrees');
  });

  it('defaults to "<projectCwd>-worktrees" when baseDir is empty / whitespace', () => {
    expect(resolveWorktreeBaseDir('/Users/x/proj', '')).toBe('/Users/x/proj-worktrees');
    expect(resolveWorktreeBaseDir('/Users/x/proj', '   ')).toBe('/Users/x/proj-worktrees');
  });

  it('uses an absolute path as-is', () => {
    const result = resolveWorktreeBaseDir('/Users/x/proj', '/mnt/ssd/worktrees');
    expect(result).toBe('/mnt/ssd/worktrees');
  });

  it('expands "~/" to home dir', () => {
    const result = resolveWorktreeBaseDir('/Users/x/proj', '~/worktrees');
    expect(result).toBe(path.join(os.homedir(), 'worktrees'));
  });

  it('expands "~" (no slash) to home dir', () => {
    const result = resolveWorktreeBaseDir('/Users/x/proj', '~');
    expect(result).toBe(os.homedir());
  });

  it('resolves a relative path against projectCwd', () => {
    const result = resolveWorktreeBaseDir('/Users/x/proj', '.worktrees');
    expect(result).toBe('/Users/x/proj/.worktrees');
  });

  it('resolves a "../" relative path against projectCwd', () => {
    const result = resolveWorktreeBaseDir('/Users/x/proj', '../shared-worktrees');
    expect(result).toBe('/Users/x/shared-worktrees');
  });
});

describe('getWorktreePath', () => {
  it('appends the slug to the resolved base dir', () => {
    expect(getWorktreePath('/Users/x/proj', '0100-foo')).toBe('/Users/x/proj-worktrees/0100-foo');
    expect(getWorktreePath('/Users/x/proj', '0100-foo', '/mnt/ssd/wt')).toBe('/mnt/ssd/wt/0100-foo');
    expect(getWorktreePath('/Users/x/proj', '0100-foo', '~/wt')).toBe(
      path.join(os.homedir(), 'wt', '0100-foo'),
    );
  });
});
