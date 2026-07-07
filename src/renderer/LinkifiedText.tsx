import React from 'react';
import { FILE_PATH_REGEX, extractPathAndLocation } from './file-link-provider';
import { useNapStore } from './store';
import { openAgentFilePath } from './agent-file-open';

/**
 * Render `text` with any file-path-shaped tokens turned into clickable spans.
 * `.md` paths open the in-app MarkdownPanel; other paths get revealed in
 * Finder via the existing `openFilePath` IPC.
 *
 * Used in the ActivityPanel where event text mentions files agents touched.
 * Routes the click through the same logic as the terminal file-link provider
 * so behavior stays consistent.
 */
export function LinkifiedText({ text }: { text: string }) {
  const parts = splitIntoParts(text);
  return (
    <>
      {parts.map((part, i) =>
        part.kind === 'path' ? (
          <span
            key={i}
            onClick={() => handlePathClick(part.text)}
            style={{
              color: '#7dd3fc',
              cursor: 'pointer',
              textDecoration: 'underline',
              textDecorationStyle: 'dotted',
              textUnderlineOffset: 2,
            }}
            title={`Open ${part.text}`}
          >
            {part.text}
          </span>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        ),
      )}
    </>
  );
}

interface Part {
  kind: 'plain' | 'path';
  text: string;
}

function splitIntoParts(text: string): Part[] {
  const parts: Part[] = [];
  const regex = new RegExp(FILE_PATH_REGEX.source, 'g');
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    // Mirror the file-link-provider's URL filter — don't linkify https://… tokens.
    if (looksLikeUrl(text, match.index)) continue;
    if (match.index > last) {
      parts.push({ kind: 'plain', text: text.slice(last, match.index) });
    }
    parts.push({ kind: 'path', text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ kind: 'plain', text: text.slice(last) });
  }
  return parts;
}

function looksLikeUrl(text: string, startIndex: number): boolean {
  let i = startIndex - 1;
  while (i >= 0 && text[i] !== ' ' && text[i] !== '\t') i--;
  const token = text.slice(i + 1);
  return /^https?:\/\//.test(token);
}

function handlePathClick(raw: string): void {
  const { path } = extractPathAndLocation(raw);
  // Resolve relative paths in the context of the agent whose activity is shown.
  openAgentFilePath(useNapStore.getState().activityPanelAgentId, path);
}
