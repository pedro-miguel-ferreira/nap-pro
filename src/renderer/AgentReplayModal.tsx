import React, { useEffect, useState } from 'react';
import { useNapStore } from './store';
import type { AgentState, NapkinState } from '../shared/bridge-types';

const MODELS: Array<{ id: string; label: string }> = [
  { id: '', label: 'default (CC chooses)' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

function findAgent(
  id: string,
  napkins: NapkinState[],
  architects: AgentState[],
): AgentState | null {
  for (const n of napkins) {
    const a = n.agents.find((x) => x.id === id);
    if (a) return a;
  }
  return architects.find((x) => x.id === id) ?? null;
}

export function AgentReplayModal() {
  const originalId = useNapStore((s) => s.replayModalAgentId);
  const close = useNapStore((s) => s.closeReplayModal);
  const napkins = useNapStore((s) => s.napkins);
  const architects = useNapStore((s) => s.architects);
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);

  const original = originalId ? findAgent(originalId, napkins, architects) : null;

  const [model, setModel] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [editPrompt, setEditPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (originalId && original) {
      // Default to original's model so the dropdown shows what was already used.
      setModel(original.model ?? '');
      setPrompt('');
      setEditPrompt(false);
      setError(null);
    }
  }, [originalId, original]);

  useEffect(() => {
    if (!originalId) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [originalId, close]);

  if (!originalId || !original) return null;

  async function submit(): Promise<void> {
    if (!originalId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await window.electronAPI?.replayAgent?.(originalId, {
        model: model === '' ? null : model,
        prompt: editPrompt && prompt.trim() ? prompt : undefined,
      });
      if (!res || !res.ok) {
        setError(res?.error ?? 'replay failed');
      } else {
        // Focus the new agent's terminal so the user immediately sees it run
        if (res.newAgentId) setActiveTerminal(res.newAgentId);
        close();
      }
    } finally {
      setBusy(false);
    }
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
          width: 540,
          maxWidth: '90%',
          background: '#1e1e1e',
          border: '1px solid #3c3c3c',
          borderRadius: 6,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          padding: 20,
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
          fontSize: 13,
          color: '#cccccc',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
          <span style={{ color: '#e5e5e5', fontWeight: 600, fontSize: 14 }}>Replay agent</span>
          <span style={{ color: '#6b7280' }}>·</span>
          <span style={{ color: '#9cdcfe' }}>{original.name}</span>
        </div>

        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
          Spawns a new agent in the same napkin with its own git worktree branched from this agent's baseline.
          {original.baselineSha ? (
            <> Baseline: <code style={{ color: '#cccccc' }}>{original.baselineSha.slice(0, 7)}</code>.</>
          ) : (
            <> No baseline recorded — replay will branch from the repo's default branch.</>
          )}
        </p>

        <label style={labelStyle}>Model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={{ ...inputStyle, marginBottom: 12 }}
        >
          {MODELS.map((m) => (
            <option key={m.id || 'default'} value={m.id}>
              {m.label}
              {original.model === m.id ? ' (original)' : ''}
              {original.model == null && m.id === '' ? ' (original)' : ''}
            </option>
          ))}
        </select>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: '#9ca3af',
            cursor: 'pointer',
            marginBottom: editPrompt ? 6 : 0,
          }}
        >
          <input
            type="checkbox"
            checked={editPrompt}
            onChange={(e) => setEditPrompt(e.target.checked)}
            style={{ margin: 0 }}
          />
          edit prompt (default: copy original's prompt.md verbatim)
        </label>
        {editPrompt && (
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Override prompt sent to the replay agent…"
            rows={6}
            style={{
              ...inputStyle,
              width: '100%',
              resize: 'vertical',
              fontFamily: 'inherit',
              fontSize: 12,
              lineHeight: 1.5,
              marginBottom: 8,
            }}
          />
        )}

        {error && (
          <div style={{ color: '#ef4444', fontSize: 11, marginTop: 8 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={close} style={{ ...btnStyle, width: 'auto', padding: '0 16px' }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || (editPrompt && !prompt.trim())}
            style={{
              ...btnStyle,
              width: 'auto',
              padding: '0 16px',
              borderColor: '#22c55e',
              color: '#86efac',
            }}
          >
            {busy ? 'Spawning…' : 'Replay'}
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
  width: 28,
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
