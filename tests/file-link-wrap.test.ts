import { describe, it, expect } from 'vitest';
import { findPathMatchesInLine } from '../src/renderer/file-link-provider';
import type { PathMatch } from '../src/renderer/file-link-provider';

// Terminal-width heuristic used by the provider for cols=80.
const MIN_WRAP = 56;

function paths(matches: PathMatch[]): string[] {
  return matches.map((m) => m.path);
}

describe('findPathMatchesInLine — regular matches', () => {
  it('finds a plain path with no neighbors', () => {
    const line = 'Wrote the plan to docs/specs/plan.md and updated code.';
    const found = findPathMatchesInLine(line, [], [], MIN_WRAP);
    expect(paths(found)).toEqual(['docs/specs/plan.md']);
    expect(found[0].start).toBe(line.indexOf('docs/'));
  });

  it('skips URLs', () => {
    const found = findPathMatchesInLine('see https://example.com/a/b.md now', [], [], MIN_WRAP);
    expect(found).toEqual([]);
  });

  it('finds multiple paths on one line', () => {
    const found = findPathMatchesInLine('a.md and src/b.ts:12', [], [], MIN_WRAP);
    expect(paths(found)).toEqual(['a.md', 'src/b.ts:12']);
  });
});

describe('findPathMatchesInLine — hard-wrapped paths (the agent-output case)', () => {
  // The real repro: CC hard-wraps a long absolute path mid-token, indenting
  // the continuation. Hovering EITHER line must yield the full path.
  const line1 =
    '(/Users/pedroferreira/src/coda/app-views-worktrees/0100-full-app-views/docs/specs/apps/app';
  const line2 = '        s-chat-trace-download.spec.md) , the link is attached';
  const fullPath =
    '/Users/pedroferreira/src/coda/app-views-worktrees/0100-full-app-views/docs/specs/apps/apps-chat-trace-download.spec.md';

  it('hovering the first line assembles the full path from the tail', () => {
    const found = findPathMatchesInLine(line1, [], [line2], MIN_WRAP);
    expect(paths(found)).toContain(fullPath);
    const tail = found.find((m) => m.path === fullPath);
    // Clickable region: from after the '(' to the end of the line.
    expect(tail?.start).toBe(1);
    expect(tail?.end).toBe(line1.length);
  });

  it('hovering the continuation line assembles the full path from the head fragment', () => {
    const found = findPathMatchesInLine(line2, [line1], [], MIN_WRAP);
    expect(paths(found)).toContain(fullPath);
    const head = found.find((m) => m.path === fullPath);
    // Clickable region: the fragment after the indent.
    expect(head?.start).toBe(8);
    expect(head?.end).toBe(8 + 's-chat-trace-download.spec.md'.length);
  });

  it('does NOT emit the bare fragment as its own link on the continuation line', () => {
    const found = findPathMatchesInLine(line2, [line1], [], MIN_WRAP);
    expect(paths(found)).not.toContain('s-chat-trace-download.spec.md');
  });

  it('reassembles a three-line wrap through a full-width middle piece', () => {
    const first = 'Report: /Users/p/src/coda/some-very-long-project-name/docs/specs/apps/deep/none';
    const middle = 'stop-middle-segment-that-fills-the-entire-terminal-row-without-any-spaces/mo';
    const last = '   re/final-report.spec.md and done';
    const full =
      '/Users/p/src/coda/some-very-long-project-name/docs/specs/apps/deep/nonestop-middle-segment-that-fills-the-entire-terminal-row-without-any-spaces/more/final-report.spec.md';
    expect(paths(findPathMatchesInLine(first, [], [middle, last], MIN_WRAP))).toContain(full);
    expect(paths(findPathMatchesInLine(last, [middle, first], [], MIN_WRAP))).toContain(full);
  });

  it('padded xterm rows (trailing spaces) still assemble', () => {
    const found = findPathMatchesInLine(line1.padEnd(100, ' '), [], [line2.padEnd(100, ' ')], MIN_WRAP);
    expect(paths(found)).toContain(fullPath);
  });
});

describe('findPathMatchesInLine — false-positive guards', () => {
  it('short prose line ending in a dir path does not join with the next line', () => {
    // 'Modified docs/specs/foo' is way below the wrap-width threshold.
    const found = findPathMatchesInLine('Modified docs/specs/foo', [], ['plan.md is now moved'], MIN_WRAP);
    expect(paths(found)).not.toContain('docs/specs/fooplan.md');
  });

  it('fragment at line start without a wrapped predecessor stays a normal match', () => {
    const found = findPathMatchesInLine('plan.md is the file', ['Some unrelated prose line'], [], MIN_WRAP);
    expect(paths(found)).toEqual(['plan.md']);
  });

  it('absolute path at line start is never treated as a continuation', () => {
    const prev = 'x'.repeat(60) + ' ends with token containing a slash: some/dir';
    const found = findPathMatchesInLine('/etc/hosts.md is mentioned', [prev], [], MIN_WRAP);
    expect(paths(found)).toEqual(['/etc/hosts.md']);
  });

  it('wrapped URL is not turned into a file link', () => {
    const urlLine1 = 'download from https://example.com/some/really/long/path/segment/that/keeps/going/unt';
    const urlLine2 = 'il/it/wraps/file.md';
    const found = findPathMatchesInLine(urlLine1, [], [urlLine2], MIN_WRAP);
    expect(found).toEqual([]);
  });
});
