import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNapStore } from './store';

/**
 * In-pane markdown viewer + editor. Lives **inline** in the main center pane,
 * sharing horizontal space with the Terminal — not as a fixed-position overlay.
 * When no tabs are open this component returns null and the terminal takes
 * the full pane.
 *
 * Tabs across the top let you jump between multiple open `.md` files. Each
 * tab has its own view/edit toggle (`Edit` ↔ `View`). Edit mode is a plain
 * textarea — no attribution UI yet (that's the next design conversation).
 *
 * Drafts are stored at the app level (`markdownDrafts`) so switching tabs
 * preserves in-progress edits. Cmd+S saves the active tab's draft via the
 * `file:write` IPC (same security clamp as `file:read`).
 */
export function MarkdownPanel() {
  const tabs = useNapStore((s) => s.markdownTabs);
  const active = useNapStore((s) => s.activeMarkdownTab);
  const focus = useNapStore((s) => s.focusMarkdownTab);
  const closeTab = useNapStore((s) => s.closeMarkdownTab);
  const drafts = useNapStore((s) => s.markdownDrafts);

  if (tabs.length === 0 || !active) return null;

  return (
    <div
      data-testid="markdown-panel"
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        borderLeft: '1px solid #3c3c3c',
        color: '#cccccc',
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
        fontSize: 13,
        overflow: 'hidden',
      }}
    >
      {/* Tab strip */}
      <div
        style={{
          display: 'flex',
          background: '#252526',
          borderBottom: '1px solid #3c3c3c',
          minHeight: 30,
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {tabs.map((path) => (
          <Tab
            key={path}
            path={path}
            isActive={path === active}
            isDirty={path in drafts}
            onFocus={() => focus(path)}
            onClose={() => closeTab(path)}
          />
        ))}
      </div>

      {/* Active file body. Re-mount on path change so loading state isolates per tab. */}
      <MarkdownBody key={active} path={active} />
    </div>
  );
}

function Tab({
  path,
  isActive,
  isDirty,
  onFocus,
  onClose,
}: {
  path: string;
  isActive: boolean;
  isDirty: boolean;
  onFocus: () => void;
  onClose: () => void;
}) {
  const filename = path.split('/').pop() ?? path;
  return (
    <div
      onClick={onFocus}
      title={path}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px 6px 14px',
        borderRight: '1px solid #3c3c3c',
        background: isActive ? '#1e1e1e' : 'transparent',
        color: isActive ? '#e5e5e5' : '#9ca3af',
        cursor: 'pointer',
        fontSize: 12,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        borderTop: isActive ? '2px solid #3b82f6' : '2px solid transparent',
      }}
    >
      <span>
        {filename}
        {isDirty && <span style={{ color: '#f59e0b', marginLeft: 4 }} title="Unsaved changes">●</span>}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title={isDirty ? 'Close tab (unsaved changes will be discarded)' : 'Close tab'}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#6b7280',
          cursor: 'pointer',
          padding: '0 2px',
          fontSize: 12,
          lineHeight: 1,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#e5e5e5')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
      >
        ✕
      </button>
    </div>
  );
}

function MarkdownBody({ path }: { path: string }) {
  const draft = useNapStore((s) => s.markdownDrafts[path]);
  const setDraft = useNapStore((s) => s.setMarkdownDraft);
  const discardDraft = useNapStore((s) => s.discardMarkdownDraft);

  const [diskContent, setDiskContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const mountedRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEditing = draft !== undefined;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load disk content on path change.
  useEffect(() => {
    setLoading(true);
    setError(null);
    (async () => {
      const res = await window.electronAPI?.readFile?.(path);
      if (!mountedRef.current) return;
      setLoading(false);
      if (res?.error) {
        setError(res.message ?? 'failed to read');
        setDiskContent('');
      } else {
        setDiskContent(res?.content ?? '');
      }
    })();
  }, [path]);

  const startEditing = useCallback(() => {
    setDraft(path, diskContent);
    setSaveState('idle');
    // Focus the textarea after React swaps to edit mode.
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [path, diskContent, setDraft]);

  const cancelEditing = useCallback(() => {
    discardDraft(path);
    setSaveState('idle');
  }, [path, discardDraft]);

  const save = useCallback(async () => {
    if (draft === undefined) return;
    setSaveState('saving');
    const res = await window.electronAPI?.writeFile?.(path, draft);
    if (!mountedRef.current) return;
    if (res?.error) {
      setSaveState('error');
      setError(res.message ?? 'save failed');
      return;
    }
    setDiskContent(draft);
    discardDraft(path);
    setSaveState('saved');
    // Fade the "saved" indicator after a beat.
    setTimeout(() => {
      if (mountedRef.current) setSaveState('idle');
    }, 1500);
  }, [path, draft, discardDraft]);

  // Cmd+S in edit mode saves. Caught at document level so it fires whether
  // the focus is on the textarea or the editor chrome.
  useEffect(() => {
    if (!isEditing) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void save();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isEditing, save]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Editor toolbar — view/edit toggle + save state */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 12px',
          borderBottom: '1px solid #2d2d2d',
          background: '#1e1e1e',
          fontSize: 11,
          color: '#9ca3af',
          flexShrink: 0,
        }}
      >
        {!isEditing ? (
          <button onClick={startEditing} style={toolbarBtn} title="Edit this file">
            ✎ Edit
          </button>
        ) : (
          <>
            <button onClick={save} style={{ ...toolbarBtn, borderColor: '#22c55e', color: '#86efac' }} title="Save (Cmd+S)">
              Save
            </button>
            <button onClick={cancelEditing} style={toolbarBtn} title="Discard changes">
              Cancel
            </button>
            <span style={{ flex: 1 }} />
            {saveState === 'saving' && <span>saving…</span>}
            {saveState === 'saved' && <span style={{ color: '#86efac' }}>saved</span>}
            {saveState === 'error' && <span style={{ color: '#ef4444' }}>save failed</span>}
          </>
        )}
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {loading && (
          <div style={{ padding: '16px 22px', color: '#6b7280' }}>loading…</div>
        )}
        {error && !isEditing && (
          <div style={{ padding: '16px 22px', color: '#ef4444' }}>error: {error}</div>
        )}
        {!loading && !error && !isEditing && (
          <div
            className="markdown-body"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 22px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{diskContent}</ReactMarkdown>
          </div>
        )}
        {isEditing && (
          <textarea
            ref={textareaRef}
            value={draft ?? ''}
            onChange={(e) => setDraft(path, e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              width: '100%',
              boxSizing: 'border-box',
              background: '#1e1e1e',
              color: '#e5e5e5',
              border: 'none',
              outline: 'none',
              padding: '16px 22px',
              fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
              fontSize: 13,
              lineHeight: 1.55,
              resize: 'none',
              tabSize: 2,
            }}
          />
        )}
      </div>

      <style>{`
        .markdown-body h1 { font-size: 22px; font-weight: 600; margin: 18px 0 8px; color: #e5e5e5; border-bottom: 1px solid #3c3c3c; padding-bottom: 6px; }
        .markdown-body h2 { font-size: 17px; font-weight: 600; margin: 18px 0 6px; color: #e5e5e5; }
        .markdown-body h3 { font-size: 14px; font-weight: 600; margin: 14px 0 4px; color: #e5e5e5; }
        .markdown-body p  { margin: 8px 0; color: #d4d4d4; }
        .markdown-body ul, .markdown-body ol { margin: 6px 0 10px 22px; color: #d4d4d4; }
        .markdown-body li { margin: 2px 0; }
        .markdown-body code { background: #2d2d2d; padding: 1px 5px; border-radius: 3px; font-family: 'Menlo', monospace; font-size: 12px; color: #f0a500; }
        .markdown-body pre { background: #161616; border: 1px solid #2d2d2d; border-radius: 4px; padding: 10px 12px; overflow-x: auto; margin: 10px 0; }
        .markdown-body pre code { background: transparent; padding: 0; color: #d4d4d4; }
        .markdown-body blockquote { border-left: 3px solid #3b82f6; padding: 4px 0 4px 12px; margin: 8px 0; color: #9ca3af; }
        .markdown-body table { border-collapse: collapse; margin: 10px 0; font-size: 12px; }
        .markdown-body th, .markdown-body td { border: 1px solid #3c3c3c; padding: 4px 8px; text-align: left; }
        .markdown-body th { background: #2d2d2d; color: #e5e5e5; }
        .markdown-body a { color: #7dd3fc; text-decoration: none; }
        .markdown-body a:hover { text-decoration: underline; }
        .markdown-body hr { border: none; border-top: 1px solid #3c3c3c; margin: 16px 0; }
        .markdown-body input[type="checkbox"] { margin-right: 6px; }
      `}</style>
    </div>
  );
}

const toolbarBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #3c3c3c',
  color: '#cccccc',
  borderRadius: 3,
  padding: '2px 10px',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'inherit',
};
