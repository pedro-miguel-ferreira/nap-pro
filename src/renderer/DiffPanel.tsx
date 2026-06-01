import React, { useEffect, useState, useCallback } from 'react';
import { useNapStore } from './store';
import type { ChangedFile, AgentState } from '../shared/bridge-types';

const STATUS_COLORS: Record<string, string> = {
  A: '#22c55e', // green — added
  M: '#f59e0b', // yellow — modified
  D: '#ef4444', // red — deleted
  R: '#3b82f6', // blue — renamed
  C: '#3b82f6', // blue — copied
  U: '#a855f7', // purple — unmerged
  '?': '#6b7280', // gray — untracked
};

const STATUS_LABELS: Record<string, string> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  U: 'unmerged',
  '?': 'untracked',
};

function findAgentById(id: string, napkins: { agents: AgentState[] }[], architects: AgentState[]): AgentState | null {
  for (const n of napkins) {
    const a = n.agents.find((x) => x.id === id);
    if (a) return a;
  }
  return architects.find((x) => x.id === id) ?? null;
}

export function DiffPanel() {
  const agentId = useNapStore((s) => s.diffPanelAgentId);
  const selectedFile = useNapStore((s) => s.diffPanelSelectedFile);
  const closeDiffPanel = useNapStore((s) => s.closeDiffPanel);
  const selectDiffFile = useNapStore((s) => s.selectDiffFile);
  const napkins = useNapStore((s) => s.napkins);
  const architects = useNapStore((s) => s.architects);

  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [baselineSha, setBaselineSha] = useState<string | null>(null);
  const [diff, setDiff] = useState<string>('');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);

  const agent = agentId ? findAgentById(agentId, napkins, architects) : null;

  const refresh = useCallback(async () => {
    if (!agentId || !window.electronAPI?.getAgentFiles) return;
    setLoadingFiles(true);
    try {
      const res = await window.electronAPI.getAgentFiles(agentId);
      if (!res.error) {
        setFiles(res.files ?? []);
        setBaselineSha(res.baselineSha ?? null);
      }
    } finally {
      setLoadingFiles(false);
    }
  }, [agentId]);

  // Load file list when panel opens
  useEffect(() => {
    if (agentId) {
      refresh();
    } else {
      setFiles([]);
      setDiff('');
      setBaselineSha(null);
    }
  }, [agentId, refresh]);

  // Load diff when a file is selected
  useEffect(() => {
    let cancelled = false;
    async function loadDiff() {
      if (!agentId || !selectedFile || !window.electronAPI?.getAgentDiff) {
        setDiff('');
        return;
      }
      setLoadingDiff(true);
      try {
        const res = await window.electronAPI.getAgentDiff(agentId, selectedFile);
        if (!cancelled && !res.error) {
          setDiff(res.diff ?? '');
        }
      } finally {
        if (!cancelled) setLoadingDiff(false);
      }
    }
    loadDiff();
    return () => {
      cancelled = true;
    };
  }, [agentId, selectedFile]);

  // Esc closes
  useEffect(() => {
    if (!agentId) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDiffPanel();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [agentId, closeDiffPanel]);

  if (!agentId) return null;

  return (
    <div
      data-testid="diff-panel"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '70%',
        maxWidth: 1200,
        background: '#1e1e1e',
        borderLeft: '1px solid #3c3c3c',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 900,
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
        fontSize: 13,
        color: '#cccccc',
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
        <span style={{ color: '#e5e5e5', fontWeight: 600 }}>Files</span>
        <span style={{ color: '#6b7280' }}>·</span>
        <span style={{ color: '#cccccc' }}>{agent?.name ?? agentId}</span>
        {baselineSha && (
          <>
            <span style={{ color: '#6b7280' }}>·</span>
            <span style={{ color: '#6b7280', fontSize: 11 }}>
              since {baselineSha.slice(0, 7)}
            </span>
          </>
        )}
        <span style={{ flex: 1 }} />
        <button
          onClick={refresh}
          disabled={loadingFiles}
          style={btnStyle}
          title="Refresh file list"
        >
          ↻
        </button>
        <button
          onClick={closeDiffPanel}
          style={btnStyle}
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>

      {/* Body — split: file list | diff viewer */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* File list */}
        <div
          style={{
            width: 320,
            borderRight: '1px solid #3c3c3c',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          {files.length === 0 ? (
            <div style={{ padding: 16, color: '#6b7280', fontSize: 12 }}>
              {loadingFiles ? 'Loading…' : 'No changes since baseline.'}
            </div>
          ) : (
            files.map((f) => (
              <FileRow
                key={f.path}
                file={f}
                selected={selectedFile === f.path}
                onClick={() => {
                  // .md files route to the in-app viewer; other files go to
                  // the diff view as before. The agent's cwd (worktree or
                  // project root) is what `file.path` is relative to.
                  if (f.path.endsWith('.md')) {
                    const base = agent?.worktreePath || '';
                    const abs = base ? `${base}/${f.path}` : f.path;
                    useNapStore.getState().openMarkdownPanel(abs);
                  } else {
                    selectDiffFile(f.path);
                  }
                }}
              />
            ))
          )}
        </div>

        {/* Diff viewer */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          {!selectedFile ? (
            <div style={{ padding: 24, color: '#6b7280', fontSize: 12 }}>
              Double-click a file to view its diff.
            </div>
          ) : loadingDiff ? (
            <div style={{ padding: 24, color: '#6b7280', fontSize: 12 }}>
              Loading diff…
            </div>
          ) : (
            <DiffView text={diff} />
          )}
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
  width: 26,
  height: 26,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
};

function FileRow({
  file,
  selected,
  onClick,
}: {
  file: ChangedFile;
  selected: boolean;
  onClick: () => void;
}) {
  const color = STATUS_COLORS[file.status] ?? '#6b7280';
  const label = STATUS_LABELS[file.status] ?? file.status;

  return (
    <div
      onClick={onClick}
      onDoubleClick={onClick}
      title={`${label}: ${file.path}`}
      style={{
        padding: '5px 12px',
        cursor: 'pointer',
        borderLeft: selected ? '2px solid #007acc' : '2px solid transparent',
        background: selected ? '#37373d' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = '#2a2d2e';
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span
        style={{
          color,
          fontSize: 11,
          fontWeight: 700,
          width: 14,
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {file.status}
      </span>
      <span
        style={{
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          direction: 'rtl',
          textAlign: 'left',
          color: file.status === 'D' ? '#9ca3af' : '#cccccc',
          textDecoration: file.status === 'D' ? 'line-through' : 'none',
        }}
      >
        {file.path}
      </span>
    </div>
  );
}

function DiffView({ text }: { text: string }) {
  if (!text) {
    return (
      <div style={{ padding: 24, color: '#6b7280', fontSize: 12 }}>
        (no diff — file unchanged or binary)
      </div>
    );
  }

  const lines = text.split('\n');
  return (
    <pre
      style={{
        margin: 0,
        padding: '8px 0',
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: 'pre',
      }}
    >
      {lines.map((line, i) => (
        <div key={i} style={lineStyle(line)}>
          {line || ' '}
        </div>
      ))}
    </pre>
  );
}

function lineStyle(line: string): React.CSSProperties {
  // Hunk header
  if (line.startsWith('@@')) {
    return {
      background: '#1f2937',
      color: '#7dd3fc',
      padding: '0 12px',
    };
  }
  // File header lines
  if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) {
    return {
      color: '#9ca3af',
      padding: '0 12px',
    };
  }
  // Add
  if (line.startsWith('+')) {
    return {
      background: 'rgba(34,197,94,0.12)',
      color: '#86efac',
      padding: '0 12px',
    };
  }
  // Delete
  if (line.startsWith('-')) {
    return {
      background: 'rgba(239,68,68,0.12)',
      color: '#fca5a5',
      padding: '0 12px',
    };
  }
  // Context
  return {
    color: '#cccccc',
    padding: '0 12px',
  };
}
