import { describe, it, expect } from 'vitest';
import { parsePastedPaths } from '../src/renderer/WorkflowFromSpecModal';

describe('parsePastedPaths', () => {
  it('single path stays one path', () => {
    expect(parsePastedPaths('docs/specs/plan.md')).toEqual(['docs/specs/plan.md']);
  });

  it('one path per line becomes separate paths', () => {
    expect(parsePastedPaths('docs/a.md\ndocs/b.md')).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('terminal hard-wrap (indented continuation) is rejoined into one path', () => {
    const pasted =
      '/Users/pedroferreira/src/coda/app-views-worktrees/0100-full-app-views/docs/specs/apps/app\n' +
      '        s-chat-trace-download.spec.md';
    expect(parsePastedPaths(pasted)).toEqual([
      '/Users/pedroferreira/src/coda/app-views-worktrees/0100-full-app-views/docs/specs/apps/apps-chat-trace-download.spec.md',
    ]);
  });

  it('mixed: separate paths with a wrapped one in between', () => {
    const pasted =
      'docs/a.md\n' +
      '/Users/p/very/long/path/to/some/deeply/nested/spec/documen\n' +
      '  t-name.spec.md\n' +
      'docs/b.md';
    expect(parsePastedPaths(pasted)).toEqual([
      'docs/a.md',
      '/Users/p/very/long/path/to/some/deeply/nested/spec/document-name.spec.md',
      'docs/b.md',
    ]);
  });

  it('blank lines and surrounding whitespace are dropped', () => {
    expect(parsePastedPaths('\n\ndocs/a.md  \n\n')).toEqual(['docs/a.md']);
  });

  it('leading indented line with nothing before it is its own path', () => {
    expect(parsePastedPaths('   docs/a.md')).toEqual(['docs/a.md']);
  });
});
