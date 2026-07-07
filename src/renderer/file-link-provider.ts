import type { Terminal, ILinkProvider, ILink, IBuffer } from '@xterm/xterm';

// Match file paths with optional line:col
// Matches:
//   src/main/main.ts
//   ./tests/foo.ts
//   /Users/me/file.ts
//   file.ts:42:17
//   file.ts:42
// Avoids matching URLs (http://, https://)
export const FILE_PATH_REGEX =
  /(?<!\w)(?:\.\/|\.\.\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.\w+(?::\d+(?::\d+)?)?/g;

/** A raw token that is a full path on its own (used to validate reassembled wraps). */
const COMPLETE_PATH_REGEX = /^(?:\.\/|\.\.\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.\w+(?::\d+(?::\d+)?)?$/;

/** A whole line that is nothing but one path-ish token (middle piece of a long wrap). */
const SINGLE_TOKEN_LINE_REGEX = /^[\w.\-/]+$/;

/** Path fragment at the start of a (possibly indented) continuation line, ending in an extension. */
const HEAD_FRAGMENT_REGEX = /^(\s*)([\w.\-/]+\.\w+(?::\d+(?::\d+)?)?)/;

function isUrl(text: string, startIndex: number): boolean {
  // Walk back to the start of the surrounding non-whitespace token.
  // Include the match itself because the regex consumes the second '/'
  // of '://' as its optional path prefix.
  let i = startIndex - 1;
  while (i >= 0 && text[i] !== ' ' && text[i] !== '\t') i--;
  const token = text.slice(i + 1);
  return /^https?:\/\//.test(token);
}

/** Exported for reuse — strips optional `:line:col` suffix from a matched path. */
export function extractPathAndLocation(match: string): { path: string; line?: number; col?: number } {
  const lineColMatch = match.match(/^(.+?):(\d+)(?::(\d+))?$/);
  if (lineColMatch) {
    return {
      path: lineColMatch[1],
      line: parseInt(lineColMatch[2], 10),
      col: lineColMatch[3] ? parseInt(lineColMatch[3], 10) : undefined,
    };
  }
  return { path: match };
}

// ── Wrapped-path reassembly (pure, unit-tested) ──
//
// Agents print long absolute paths that wrap — either soft (xterm wraps the
// row and marks continuations `isWrapped`, handled by joining the logical
// line before matching) or hard (Claude Code's renderer emits a real newline
// plus indent mid-path). Hard wraps need a heuristic: a long line ending in
// an unterminated path token, whose following line starts (after indent)
// with a fragment that completes it. Without this, the regex matches only
// the post-break fragment (`s-chat-trace-download.spec.md`) which resolves
// to a garbage path.

export interface PathMatch {
  /** Index in the queried line's text where the clickable fragment starts. */
  start: number;
  /** Exclusive end index of the clickable fragment. */
  end: number;
  /** Full path text — reassembled across wrapped lines when needed. */
  path: string;
}

/** Last whitespace-delimited token of a line if it looks like an unfinished path. */
function extractTailToken(line: string): { token: string; start: number } | null {
  const trimmed = line.replace(/\s+$/, '');
  if (!trimmed) return null;
  const lastSpace = Math.max(trimmed.lastIndexOf(' '), trimmed.lastIndexOf('\t'));
  let token = trimmed.slice(lastSpace + 1);
  let start = lastSpace + 1;
  // Strip wrapping punctuation the regexes never match: ( [ { < quotes/backtick.
  const leadingPunct = token.match(/^[(\[{<"'`]+/);
  if (leadingPunct) {
    token = token.slice(leadingPunct[0].length);
    start += leadingPunct[0].length;
  }
  if (!token.includes('/')) return null;
  if (token.includes('://')) return null; // URL, not a file path
  if (!/^(?:\.\/|\.\.\/|\/)?[\w.\-/]+$/.test(token)) return null;
  if (COMPLETE_PATH_REGEX.test(token)) return null; // already whole — regular match handles it
  return { token, start };
}

const MAX_WRAP_SEGMENTS = 4;

/**
 * The hovered line ends mid-path; try to complete it from the following lines.
 * `minWrapLineLength` guards against false joins: a hard-wrapped line runs to
 * (nearly) the terminal width, so short lines ending in `foo/bar` are prose.
 */
function tryTailAssembly(
  line: string,
  nextLines: string[],
  minWrapLineLength: number,
): PathMatch | null {
  const trimmedLength = line.replace(/\s+$/, '').length;
  if (trimmedLength < minWrapLineLength) return null;
  const tail = extractTailToken(line);
  if (!tail) return null;

  let assembled = tail.token;
  for (let i = 0; i < Math.min(nextLines.length, MAX_WRAP_SEGMENTS - 1); i++) {
    const continuation = nextLines[i].replace(/^\s+/, '');
    const headFragment = continuation.match(/^([\w.\-/]+\.\w+(?::\d+(?::\d+)?)?)/);
    if (headFragment && COMPLETE_PATH_REGEX.test(assembled + headFragment[1])) {
      return { start: tail.start, end: trimmedLength, path: assembled + headFragment[1] };
    }
    // Middle piece: the whole line is one path token running the full width.
    const wholeLine = continuation.replace(/\s+$/, '');
    if (
      SINGLE_TOKEN_LINE_REGEX.test(wholeLine) &&
      nextLines[i].replace(/\s+$/, '').length >= minWrapLineLength
    ) {
      assembled += wholeLine;
      continue;
    }
    return null;
  }
  return null;
}

/**
 * The hovered line starts (after indent) with a path fragment; try to
 * reconstruct the beginning from the preceding lines.
 */
function tryHeadAssembly(
  line: string,
  prevLines: string[],
  minWrapLineLength: number,
): PathMatch | null {
  const fragment = line.match(HEAD_FRAGMENT_REGEX);
  if (!fragment) return null;
  const indent = fragment[1].length;
  // A fragment with `/` that is itself a complete absolute/relative path is
  // almost certainly a real standalone path, not a wrap continuation.
  if (fragment[2].startsWith('/') || fragment[2].startsWith('./')) return null;

  let assembled = fragment[2];
  let joined = false;
  for (let i = 0; i < Math.min(prevLines.length, MAX_WRAP_SEGMENTS - 1); i++) {
    if (prevLines[i].replace(/\s+$/, '').length < minWrapLineLength) break;
    const tail = extractTailToken(prevLines[i]);
    if (!tail) break;
    assembled = tail.token + assembled;
    joined = true;
    // If the tail had other content before it on its line, the path starts there.
    const beforeTail = prevLines[i].slice(0, tail.start).trim();
    if (beforeTail.length > 0) break;
  }
  if (!joined || !COMPLETE_PATH_REGEX.test(assembled)) return null;
  return { start: indent, end: indent + fragment[2].length, path: assembled };
}

/**
 * All clickable path matches for one logical line, given its neighbors
 * (nearest first). Regular regex matches plus wrap reassembly in both
 * directions. Exported for unit tests.
 */
export function findPathMatchesInLine(
  line: string,
  prevLines: string[],
  nextLines: string[],
  minWrapLineLength: number,
): PathMatch[] {
  const matches: PathMatch[] = [];

  const headMatch = tryHeadAssembly(line, prevLines, minWrapLineLength);
  if (headMatch) matches.push(headMatch);

  const regex = new RegExp(FILE_PATH_REGEX.source, 'g');
  let regexMatch: RegExpExecArray | null;
  while ((regexMatch = regex.exec(line)) !== null) {
    if (isUrl(line, regexMatch.index)) continue;
    // The head-assembled fragment supersedes the bare fragment match.
    if (headMatch && regexMatch.index < headMatch.end) continue;
    matches.push({
      start: regexMatch.index,
      end: regexMatch.index + regexMatch[0].length,
      path: regexMatch[0],
    });
  }

  const tailMatch = tryTailAssembly(line, nextLines, minWrapLineLength);
  if (tailMatch && !matches.some((m) => m.start <= tailMatch.start && m.end >= tailMatch.end)) {
    matches.push(tailMatch);
  }

  return matches;
}

// ── xterm wiring ──

/** 0-based row of the first row of the logical (soft-wrap joined) line containing `row`. */
function findLogicalStart(buffer: IBuffer, row: number): number {
  let start = row;
  while (start > 0 && buffer.getLine(start)?.isWrapped) start--;
  return start;
}

/**
 * Read a logical line starting at `startRow`: all soft-wrapped continuation
 * rows joined, each row normalized to exactly `cols` chars so string index ↔
 * (x, y) mapping is trivial.
 */
function readLogicalLine(
  buffer: IBuffer,
  startRow: number,
  cols: number,
): { text: string; rowCount: number } {
  let text = '';
  let row = startRow;
  for (;;) {
    const bufferLine = buffer.getLine(row);
    if (!bufferLine) break;
    let rowText = bufferLine.translateToString(false);
    if (rowText.length < cols) rowText = rowText.padEnd(cols, ' ');
    else if (rowText.length > cols) rowText = rowText.slice(0, cols);
    text += rowText;
    row++;
    if (!buffer.getLine(row)?.isWrapped) break;
  }
  return { text, rowCount: row - startRow };
}

const NEIGHBOR_LOGICAL_LINES = 3;

export function createFileLinkProvider(
  terminal: Terminal,
  getCwd: () => string,
  onOpen: (absolutePath: string) => void,
): ILinkProvider {
  return {
    provideLinks(lineNumber: number, callback: (links: ILink[] | undefined) => void): void {
      const buffer = terminal.buffer.active;
      const row = lineNumber - 1;
      if (!buffer.getLine(row)) {
        callback(undefined);
        return;
      }

      const cols = terminal.cols;
      const startRow = findLogicalStart(buffer, row);
      const { text, rowCount } = readLogicalLine(buffer, startRow, cols);

      // Neighboring logical lines, nearest first, for hard-wrap reassembly.
      const prevLines: string[] = [];
      let cursor = startRow;
      for (let i = 0; i < NEIGHBOR_LOGICAL_LINES && cursor > 0; i++) {
        const prevStart = findLogicalStart(buffer, cursor - 1);
        prevLines.push(readLogicalLine(buffer, prevStart, cols).text);
        cursor = prevStart;
      }
      const nextLines: string[] = [];
      cursor = startRow + rowCount;
      for (let i = 0; i < NEIGHBOR_LOGICAL_LINES && buffer.getLine(cursor); i++) {
        const next = readLogicalLine(buffer, cursor, cols);
        nextLines.push(next.text);
        cursor += next.rowCount;
      }

      // Hard wraps run to (nearly) the full terminal width; anything much
      // shorter that ends in `foo/bar` is prose, not a wrapped path.
      const minWrapLineLength = Math.max(16, cols - 24);
      const matches = findPathMatchesInLine(text, prevLines, nextLines, minWrapLineLength);

      const links: ILink[] = matches.map((match) => {
        const lastCharIndex = match.end - 1;
        return {
          range: {
            start: {
              x: (match.start % cols) + 1,
              y: startRow + Math.floor(match.start / cols) + 1,
            },
            end: {
              x: (lastCharIndex % cols) + 2,
              y: startRow + Math.floor(lastCharIndex / cols) + 1,
            },
          },
          text: match.path,
          activate: () => {
            const { path: filePath } = extractPathAndLocation(match.path);
            const cwd = getCwd();
            let resolved: string;
            if (filePath.startsWith('/')) {
              resolved = filePath;
            } else {
              // Simple path join — cwd always ends without trailing slash
              const base = cwd.endsWith('/') ? cwd.slice(0, -1) : cwd;
              const clean = filePath.startsWith('./') ? filePath.slice(2) : filePath;
              resolved = `${base}/${clean}`;
            }
            onOpen(resolved);
          },
        };
      });

      callback(links.length > 0 ? links : undefined);
    },
  };
}
