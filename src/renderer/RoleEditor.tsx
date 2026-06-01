import React, { useEffect, useState, useCallback } from 'react';
import { useNapStore } from './store';

const NAME_RE = /^[a-z0-9_-]+$/i;

const PLACEHOLDER_TEMPLATE = `# <Role>

## Who you are

A short paragraph: instincts, mental models, what good looks like for this role.

## What you do

Three to five short bullets describing the responsibilities of this role.

## When you're done

Write \`response.md\` and run \`nap-pro done\`.

## CRITICAL: required reading

You MUST read these:

1. \`.nap/00-org/10-promise.nap.md\`
2. \`.nap/00-org/20-workflow.nap.md\`
3. \`.nap/00-org/30-structure.nap.md\`
`;

export function RoleEditor() {
  const open = useNapStore((s) => s.roleEditorOpen);
  const close = useNapStore((s) => s.closeRoleEditor);

  const [roles, setRoles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const dirty = content !== originalContent;

  const refreshList = useCallback(async () => {
    const res = await window.electronAPI?.listRoles?.();
    setRoles(res?.roles ?? []);
  }, []);

  // Initial load
  useEffect(() => {
    if (open) {
      refreshList();
    } else {
      setSelected(null);
      setContent('');
      setOriginalContent('');
      setNewRoleName('');
      setCreating(false);
      setStatus(null);
    }
  }, [open, refreshList]);

  // Load role content when selection changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selected) {
        setContent('');
        setOriginalContent('');
        return;
      }
      setBusy(true);
      try {
        const res = await window.electronAPI?.readRole?.(selected);
        if (!cancelled) {
          const text = res?.content ?? '';
          setContent(text);
          setOriginalContent(text);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Esc closes (only when no unsaved changes)
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (dirty) {
          // eslint-disable-next-line no-alert
          if (!window.confirm('Discard unsaved changes?')) return;
        }
        close();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, close, dirty]);

  if (!open) return null;

  async function save(): Promise<void> {
    if (!selected) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await window.electronAPI?.saveRole?.(selected, content);
      if (res?.ok) {
        setOriginalContent(content);
        setStatus({ kind: 'ok', text: 'Saved' });
      } else {
        setStatus({ kind: 'err', text: res?.message || 'Save failed' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function createRole(): Promise<void> {
    const name = newRoleName.trim();
    if (!name) return;
    if (!NAME_RE.test(name)) {
      setStatus({ kind: 'err', text: 'Name must be alphanumeric (with - or _)' });
      return;
    }
    if (roles.includes(name)) {
      setStatus({ kind: 'err', text: `Role "${name}" already exists` });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const initial = PLACEHOLDER_TEMPLATE.replace('<Role>', name);
      const res = await window.electronAPI?.saveRole?.(name, initial);
      if (res?.ok) {
        await refreshList();
        setSelected(name);
        setNewRoleName('');
        setCreating(false);
        setStatus({ kind: 'ok', text: `Created "${name}"` });
      } else {
        setStatus({ kind: 'err', text: res?.message || 'Create failed' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteRole(): Promise<void> {
    if (!selected) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete role "${selected}"? This removes the .md file. Existing agents using this role are unaffected.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await window.electronAPI?.deleteRole?.(selected);
      if (res?.ok) {
        await refreshList();
        setSelected(null);
        setStatus({ kind: 'ok', text: 'Deleted' });
      } else {
        setStatus({ kind: 'err', text: res?.message || 'Delete failed' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="role-editor-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (dirty) {
            // eslint-disable-next-line no-alert
            if (!window.confirm('Discard unsaved changes?')) return;
          }
          close();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 950,
      }}
    >
      <div
        style={{
          width: '85%',
          maxWidth: 1100,
          height: '80%',
          maxHeight: 800,
          background: '#1e1e1e',
          border: '1px solid #3c3c3c',
          borderRadius: 6,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
          fontSize: 13,
          color: '#cccccc',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid #3c3c3c',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#e5e5e5', fontWeight: 600 }}>Roles</span>
          <span style={{ color: '#6b7280', fontSize: 11 }}>
            .nap/00-org/40-roles/
          </span>
          <span style={{ flex: 1 }} />
          {status && (
            <span style={{ fontSize: 11, color: status.kind === 'ok' ? '#22c55e' : '#ef4444' }}>
              {status.text}
            </span>
          )}
          <button onClick={close} style={btnStyle} title="Close (Esc)">
            ✕
          </button>
        </div>

        {/* Body — split: list | editor */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Role list */}
          <div
            style={{
              width: 220,
              borderRight: '1px solid #3c3c3c',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {roles.length === 0 ? (
                <div style={{ padding: 16, color: '#6b7280', fontSize: 12 }}>
                  No roles yet.
                </div>
              ) : (
                roles.map((r) => (
                  <div
                    key={r}
                    onClick={() => {
                      if (dirty) {
                        // eslint-disable-next-line no-alert
                        if (!window.confirm('Discard unsaved changes?')) return;
                      }
                      setSelected(r);
                      setStatus(null);
                    }}
                    style={{
                      padding: '6px 12px',
                      cursor: 'pointer',
                      background: selected === r ? '#37373d' : 'transparent',
                      borderLeft:
                        selected === r ? '2px solid #007acc' : '2px solid transparent',
                      color: selected === r ? '#e5e5e5' : '#cccccc',
                    }}
                    onMouseEnter={(e) => {
                      if (selected !== r) e.currentTarget.style.background = '#2a2d2e';
                    }}
                    onMouseLeave={(e) => {
                      if (selected !== r) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {r}
                  </div>
                ))
              )}
            </div>
            <div style={{ borderTop: '1px solid #3c3c3c', padding: 10 }}>
              {creating ? (
                <>
                  <input
                    autoFocus
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createRole();
                      if (e.key === 'Escape') {
                        setCreating(false);
                        setNewRoleName('');
                      }
                    }}
                    placeholder="role-name"
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      background: '#1e1e1e',
                      border: '1px solid #007acc',
                      color: '#cccccc',
                      borderRadius: 3,
                      fontFamily: 'inherit',
                      fontSize: 12,
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button
                      onClick={createRole}
                      disabled={busy || !newRoleName.trim()}
                      style={{ ...btnStyle, flex: 1, height: 24 }}
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setCreating(false);
                        setNewRoleName('');
                      }}
                      style={{ ...btnStyle, flex: 1, height: 24 }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  style={{ ...btnStyle, width: '100%' }}
                >
                  + Add Role
                </button>
              )}
            </div>
          </div>

          {/* Editor */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {!selected ? (
              <div style={{ padding: 24, color: '#6b7280', fontSize: 12 }}>
                Select a role to edit, or create a new one.
              </div>
            ) : (
              <>
                <div
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #3c3c3c',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ color: '#e5e5e5' }}>{selected}.md</span>
                  {dirty && (
                    <span style={{ color: '#f59e0b', fontSize: 11 }}>● modified</span>
                  )}
                  <span style={{ flex: 1 }} />
                  <button
                    onClick={save}
                    disabled={!dirty || busy}
                    style={{
                      ...btnStyle,
                      width: 'auto',
                      padding: '0 12px',
                      borderColor: dirty ? '#007acc' : '#3c3c3c',
                      color: dirty ? '#7dd3fc' : '#6b7280',
                    }}
                  >
                    Save
                  </button>
                  <button onClick={deleteRole} style={{ ...btnStyle, width: 'auto', padding: '0 12px', color: '#ef4444' }}>
                    Delete
                  </button>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  spellCheck={false}
                  style={{
                    flex: 1,
                    background: '#1e1e1e',
                    color: '#cccccc',
                    border: 'none',
                    outline: 'none',
                    padding: 12,
                    fontFamily: 'inherit',
                    fontSize: 13,
                    lineHeight: 1.5,
                    resize: 'none',
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #3c3c3c',
  color: '#cccccc',
  borderRadius: 3,
  height: 26,
  width: 26,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
};
