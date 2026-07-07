import React, { useState } from 'react';

/**
 * Normalize text pasted into a path input into whole paths. Terminal copies
 * hard-wrap long paths onto a new indented line — an indented line is a
 * continuation of the previous path, not a new one. Non-indented lines are
 * separate paths. Exported for unit tests.
 */
export function parsePastedPaths(text: string): string[] {
  const paths: string[] = [];
  for (const line of text.split('\n')) {
    const isContinuation = /^\s/.test(line) && paths.length > 0;
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    if (isContinuation) {
      paths[paths.length - 1] += trimmedLine;
    } else {
      paths.push(trimmedLine);
    }
  }
  return paths;
}

/**
 * File-path list editor: removable rows + a native Browse… picker + a
 * single-path input (Enter adds; multiline pastes are rejoined into whole
 * paths). Replaces the one-path-per-line textareas that broke long paths.
 */
export function PathListInput({
  paths,
  onChange,
  browseTitle,
  placeholder,
  onPendingInputChange,
}: {
  paths: string[];
  onChange: (paths: string[]) => void;
  browseTitle: string;
  placeholder?: string;
  /** Fires with the input's current text — lets a parent include a typed-but-not-added path on submit. */
  onPendingInputChange?: (value: string) => void;
}) {
  const [pathInput, setPathInput] = useState('');

  function updateInput(value: string): void {
    setPathInput(value);
    onPendingInputChange?.(value);
  }

  function addPaths(newPaths: string[]): void {
    const cleaned = newPaths.map((p) => p.trim()).filter(Boolean);
    if (cleaned.length === 0) return;
    onChange([...paths, ...cleaned.filter((p) => !paths.includes(p))]);
  }

  function addFromInput(): void {
    addPaths(parsePastedPaths(pathInput));
    updateInput('');
  }

  async function browse(): Promise<void> {
    const picked = await window.electronAPI?.pickFiles?.({ title: browseTitle });
    if (picked?.ok && picked.paths) addPaths(picked.paths);
  }

  return (
    <div>
      {paths.length > 0 && (
        <div
          style={{
            border: '1px solid #3c3c3c',
            borderRadius: 3,
            marginBottom: 6,
            maxHeight: 140,
            overflowY: 'auto',
          }}
        >
          {paths.map((doc) => (
            <div
              key={doc}
              title={doc}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '3px 8px',
                fontSize: 12,
                borderBottom: '1px solid #2d2d2d',
              }}
            >
              {/* direction:rtl keeps the filename end visible when the path overflows */}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  direction: 'rtl',
                  textAlign: 'left',
                  color: '#d4d4d4',
                }}
              >
                {doc}
              </span>
              <button
                onClick={() => onChange(paths.filter((d) => d !== doc))}
                title="Remove"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '0 2px',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={pathInput}
          onChange={(e) => updateInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addFromInput();
            }
          }}
          onPaste={(e) => {
            // Terminal copies of long paths carry hard newlines — normalize
            // them into whole paths instead of letting them break the value.
            const pasted = e.clipboardData.getData('text');
            if (pasted.includes('\n')) {
              e.preventDefault();
              addPaths(parsePastedPaths(pathInput + pasted));
              updateInput('');
            }
          }}
          placeholder={placeholder ?? 'type or paste a path, Enter to add'}
          style={{
            flex: 1,
            background: '#1e1e1e',
            border: '1px solid #3c3c3c',
            color: '#cccccc',
            borderRadius: 3,
            padding: '4px 6px',
            fontFamily: 'inherit',
            fontSize: 12,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <button onClick={addFromInput} disabled={!pathInput.trim()} style={smallBtnStyle}>
          Add
        </button>
        <button onClick={browse} style={smallBtnStyle}>
          Browse…
        </button>
      </div>
    </div>
  );
}

const smallBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #3c3c3c',
  color: '#cccccc',
  borderRadius: 3,
  height: 28,
  padding: '0 10px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
};
