import React, { useEffect, useState } from 'react';
import { useNapStore } from './store';
import { CLAUDE_MODELS } from '../shared/claude-models';

/**
 * Post-hoc stage add. Pick a role, optionally a model, click Spawn. The new
 * agent runs in the napkin's worktree with the same workflow-style prompt
 * a real stage would get (role doc + scaffolding files enumerated + done
 * footer). Standalone — not part of any workflow run; no runner advances.
 *
 * Use case: workflow finished and you realized you wanted one more agent
 * (test-eng, an extra reviewer, etc.) with the same context as the others.
 */
export function AddStageModal() {
  const open = useNapStore((s) => s.addStageModalOpen);
  const targetSlug = useNapStore((s) => s.addStageModalNapkinSlug);
  const close = useNapStore((s) => s.closeAddStageModal);

  const [roles, setRoles] = useState<string[]>([]);
  const [role, setRole] = useState<string>('');
  const [modelId, setModelId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    (async () => {
      const res = await window.electronAPI?.listRoles?.();
      const list = res?.roles ?? [];
      setRoles(list);
      setRole((cur) => (cur && list.includes(cur) ? cur : list[0] ?? ''));
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open || !targetSlug) return null;

  async function submit(): Promise<void> {
    if (!targetSlug || !role) return;
    setBusy(true);
    setError(null);
    const res = await window.electronAPI?.addStageToNapkin?.({
      slug: targetSlug,
      role,
      model: modelId || null,
    });
    setBusy(false);
    if (res?.error) {
      setError(res.message ?? 'failed');
      return;
    }
    close();
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
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
          width: 480,
          maxWidth: '90%',
          background: '#1e1e1e',
          border: '1px solid #3c3c3c',
          borderRadius: 6,
          padding: 20,
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
          fontSize: 13,
          color: '#cccccc',
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <span style={{ color: '#e5e5e5', fontWeight: 600, fontSize: 14 }}>
            Add stage to {targetSlug}
          </span>
        </div>
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
          Spawns a new agent on this napkin with the same workflow-style prompt
          (role doc + napkin scaffolding files + done footer). Standalone — not
          part of any workflow run, so no runner advances on its <code>nap-pro done</code>.
          The agent will run in the napkin's worktree and see the existing
          <code>.nap.md</code>/<code>.spec.md</code>/<code>.stories.md</code>/etc.
        </p>

        <label style={labelStyle}>Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{ ...inputStyle, marginBottom: 12 }}
        >
          {roles.length === 0 ? (
            <option value="">— no roles defined —</option>
          ) : (
            roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))
          )}
        </select>

        <label style={labelStyle}>Model</label>
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          style={{ ...inputStyle, marginBottom: 12 }}
        >
          <option value="">default (CC chooses)</option>
          {CLAUDE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        {error && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 8 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={close} style={{ ...btnStyle, width: 'auto', padding: '0 16px' }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !role || roles.length === 0}
            style={{
              ...btnStyle,
              width: 'auto',
              padding: '0 16px',
              borderColor: '#22c55e',
              color: '#86efac',
            }}
          >
            {busy ? 'Spawning…' : 'Spawn'}
          </button>
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
  height: 28,
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
