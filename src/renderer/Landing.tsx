import React, { useEffect, useState, useRef, useCallback } from 'react';

interface RecentProject {
  path: string;
  displayName: string;
  lastOpenedAt: number;
}

const NAME_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * Landing screen — shown when the app launches without a project. Lets the
 * user open an existing nap-pro project (`.nap/nepics/` present), or scaffold
 * a new one. On pick, the main process sets NAP_CWD and relaunches; the new
 * process boots straight into the workspace.
 */
export function Landing() {
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lives across renders. Refresh fires on mount + after every IPC that
  // mutates state; the flag avoids "setState after unmount" warnings if the
  // user clicks one of the open buttons (which relaunches the app) mid-fetch.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const res = await window.electronAPI?.listRecentProjects?.();
    if (!mountedRef.current) return;
    setRecents(res?.recents ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onOpenExisting(): Promise<void> {
    setError(null);
    const picked = await window.electronAPI?.pickProjectDir?.({
      title: 'Open nap-pro project',
    });
    if (!picked?.ok || !picked.path) return;
    const res = await window.electronAPI?.openProject?.(picked.path);
    if (!res?.ok) {
      setError(res?.message || 'failed to open project');
    }
    // On success the main process relaunches the app — no further UI work.
  }

  async function onOpenRecent(p: string): Promise<void> {
    setError(null);
    const res = await window.electronAPI?.openProject?.(p);
    if (!res?.ok) {
      setError(res?.message || 'failed to open project');
      // Project disappeared from disk — drop the stale entry.
      if (res?.message?.startsWith('path does not exist')) {
        await window.electronAPI?.forgetProject?.(p);
        await refresh();
      }
    }
  }

  async function onForget(p: string, e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    await window.electronAPI?.forgetProject?.(p);
    await refresh();
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#1e1e1e',
        color: '#cccccc',
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
        fontSize: 13,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '8vh',
        overflowY: 'auto',
      }}
    >
      <div style={{ width: 640, maxWidth: '92%' }}>
        <div style={{ fontSize: 24, color: '#e5e5e5', marginBottom: 6 }}>nap-pro</div>
        <div style={{ color: '#9ca3af', marginBottom: 28, fontSize: 12 }}>
          Pick a project to start. Opening relaunches the app pointed at the picked dir.
        </div>

        {/* Recent list */}
        {loaded && recents.length === 0 && (
          <div
            style={{
              padding: 16,
              border: '1px dashed #3c3c3c',
              borderRadius: 6,
              color: '#6b7280',
              marginBottom: 20,
              fontSize: 12,
            }}
          >
            No recent projects yet. Use the buttons below.
          </div>
        )}

        {recents.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 10,
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Recent projects
            </div>
            <div
              style={{
                border: '1px solid #3c3c3c',
                borderRadius: 6,
                overflow: 'hidden',
                background: '#252526',
              }}
            >
              {recents.map((r) => (
                <RecentRow
                  key={r.path}
                  recent={r}
                  onOpen={() => onOpenRecent(r.path)}
                  onForget={(e) => onForget(r.path, e)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onOpenExisting}
            style={buttonStyle}
          >
            + Open existing project…
          </button>
          <button
            onClick={() => setCreating(true)}
            style={{ ...buttonStyle, borderColor: '#22c55e', color: '#86efac' }}
          >
            + New project…
          </button>
        </div>

        {error && (
          <div style={{ color: '#ef4444', fontSize: 11, marginTop: 12, lineHeight: 1.4 }}>
            {error}
          </div>
        )}

        {creating && (
          <NewProjectWizard
            onClose={() => setCreating(false)}
            onError={(msg) => setError(msg)}
          />
        )}
      </div>
    </div>
  );
}

function RecentRow({
  recent,
  onOpen,
  onForget,
}: {
  recent: RecentProject;
  onOpen: () => void;
  onForget: (e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid #3c3c3c',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: hover ? '#094771' : 'transparent',
      }}
    >
      <span style={{ flex: 1, color: '#e5e5e5' }}>{recent.displayName}</span>
      <span style={{ color: '#9ca3af', fontSize: 11 }}>{recent.path}</span>
      <span style={{ color: '#6b7280', fontSize: 11, minWidth: 60, textAlign: 'right' }}>
        {formatRelative(recent.lastOpenedAt)}
      </span>
      {hover && (
        <button
          onClick={onForget}
          title="Remove from recent list"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            fontSize: 14,
            padding: '0 4px',
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function NewProjectWizard({
  onClose,
  onError,
}: {
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [parentDir, setParentDir] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function pickParent(): Promise<void> {
    const picked = await window.electronAPI?.pickProjectDir?.({
      title: 'Pick parent directory',
    });
    if (picked?.ok && picked.path) setParentDir(picked.path);
  }

  async function submit(): Promise<void> {
    if (!parentDir || !name.trim()) return;
    if (!NAME_RE.test(name.trim())) {
      onError('Name must be alphanumeric (with - _ .)');
      return;
    }
    setBusy(true);
    const res = await window.electronAPI?.createProject?.({
      parentDir,
      name: name.trim(),
    });
    setBusy(false);
    if (!res?.ok) {
      onError(res?.message || 'create failed');
    }
    // On success the main process relaunches.
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
          width: 520,
          maxWidth: '90%',
          background: '#1e1e1e',
          border: '1px solid #3c3c3c',
          borderRadius: 6,
          padding: 20,
        }}
      >
        <div style={{ fontSize: 14, color: '#e5e5e5', marginBottom: 14, fontWeight: 600 }}>
          New project
        </div>

        <label style={labelStyle}>Parent directory</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input
            type="text"
            value={parentDir}
            onChange={(e) => setParentDir(e.target.value)}
            placeholder="/Users/you/src"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={pickParent} style={buttonStyle}>
            Browse…
          </button>
        </div>

        <label style={labelStyle}>Project name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-project"
          style={{ ...inputStyle, marginBottom: 16 }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={buttonStyle}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !parentDir || !name.trim()}
            style={{ ...buttonStyle, borderColor: '#22c55e', color: '#86efac' }}
          >
            {busy ? 'Creating…' : 'Create + open'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const buttonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #3c3c3c',
  color: '#cccccc',
  borderRadius: 3,
  padding: '6px 14px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  background: '#1e1e1e',
  border: '1px solid #3c3c3c',
  color: '#cccccc',
  borderRadius: 3,
  padding: '4px 6px',
  fontFamily: 'inherit',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 2,
};
