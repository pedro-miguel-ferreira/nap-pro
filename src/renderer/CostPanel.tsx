import React, { useEffect, useState, useCallback } from 'react';
import { useNapStore } from './store';
import type { AgentCostSummary, CostQueryResult, AgentState } from '../shared/bridge-types';

const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4-7': '#a855f7',
  'claude-sonnet-4-6': '#3b82f6',
  'claude-haiku-4-5': '#22c55e',
};

function findAgentById(
  id: string,
  napkins: { agents: AgentState[] }[],
  architects: AgentState[],
): AgentState | null {
  for (const n of napkins) {
    const a = n.agents.find((x) => x.id === id);
    if (a) return a;
  }
  return architects.find((x) => x.id === id) ?? null;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toString();
}

function formatCost(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  if (usd >= 0.0001) return `$${usd.toFixed(4)}`;
  return usd === 0 ? '—' : `<$0.0001`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

function modelLabel(model: string | null): string {
  if (!model) return '—';
  return model.replace(/^claude-/, '');
}

export function CostPanel() {
  const agentId = useNapStore((s) => s.costPanelAgentId);
  const scope = useNapStore((s) => s.costPanelScope);
  const napkinSlug = useNapStore((s) => s.costPanelNapkinSlug);
  const close = useNapStore((s) => s.closeCostPanel);
  const napkins = useNapStore((s) => s.napkins);
  const architects = useNapStore((s) => s.architects);

  const [data, setData] = useState<CostQueryResult | null>(null);
  const [loading, setLoading] = useState(false);

  const open = !!agentId || !!napkinSlug;
  const rootAgent = agentId ? findAgentById(agentId, napkins, architects) : null;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      let res:
        | (CostQueryResult & { error?: boolean; message?: string })
        | undefined;
      if (napkinSlug && window.electronAPI?.getNapkinCost) {
        res = await window.electronAPI.getNapkinCost(napkinSlug);
      } else if (agentId && window.electronAPI?.getAgentCost) {
        res = await window.electronAPI.getAgentCost(agentId, scope);
      }
      if (res && !res.error) {
        setData({ perAgent: res.perAgent, total: res.total });
      }
    } finally {
      setLoading(false);
    }
  }, [agentId, scope, napkinSlug]);

  useEffect(() => {
    if (open) refresh();
    else setData(null);
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, close]);

  if (!open) return null;

  const total = data?.total;
  const perAgent = data?.perAgent ?? [];

  return (
    <div
      data-testid="cost-panel"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '60%',
        maxWidth: 1000,
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
        <span style={{ color: '#e5e5e5', fontWeight: 600 }}>
          {napkinSlug ? 'Workflow cost' : scope === 'subtree' ? 'Total cost' : 'Cost'}
        </span>
        <span style={{ color: '#6b7280' }}>·</span>
        <span style={{ color: '#cccccc' }}>
          {napkinSlug ?? rootAgent?.name ?? agentId}
        </span>
        {(napkinSlug || scope === 'subtree') && (
          <>
            <span style={{ color: '#6b7280' }}>·</span>
            <span style={{ color: '#6b7280', fontSize: 11 }}>
              {perAgent.length} agent{perAgent.length === 1 ? '' : 's'}
            </span>
          </>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={refresh} disabled={loading} style={btnStyle} title="Refresh">
          ↻
        </button>
        <button onClick={close} style={btnStyle} title="Close (Esc)">
          ✕
        </button>
      </div>

      {/* Total summary */}
      {total && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #3c3c3c',
            display: 'flex',
            gap: 24,
            flexShrink: 0,
            background: '#252526',
          }}
        >
          <Stat label="cost" value={formatCost(total.costUsd)} large color="#86efac" />
          <Stat label="total tokens" value={formatTokens(total.totalTokens)} large />
          <Stat label="messages" value={total.messageCount.toString()} />
          <Stat label="input" value={formatTokens(total.tokens.input)} />
          <Stat label="output" value={formatTokens(total.tokens.output)} />
          <Stat label="cache w" value={formatTokens(total.tokens.cacheWrite)} />
          <Stat label="cache r" value={formatTokens(total.tokens.cacheRead)} />
        </div>
      )}

      {/* Per-agent table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {perAgent.length === 0 ? (
          <div style={{ padding: 24, color: '#6b7280', fontSize: 12 }}>
            {loading ? 'Loading…' : 'No usage data found. Either the agent never ran, or claude logs are unavailable.'}
          </div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', textAlign: 'left' }}>
                <th style={thStyle}>agent</th>
                <th style={thStyle}>model</th>
                <th style={thStyleR}>cost</th>
                <th style={thStyleR}>in</th>
                <th style={thStyleR}>out</th>
                <th style={thStyleR}>cache w</th>
                <th style={thStyleR}>cache r</th>
                <th style={thStyleR}>msgs</th>
                <th style={thStyleR}>dur</th>
              </tr>
            </thead>
            <tbody>
              {perAgent.map((s) => (
                <CostRow key={s.agentId} summary={s} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CostRow({ summary }: { summary: AgentCostSummary }) {
  const modelColor = summary.model ? MODEL_COLORS[summary.model] ?? '#9ca3af' : '#6b7280';
  return (
    <tr style={{ borderBottom: '1px solid #2d2d2d' }}>
      <td style={tdStyle}>
        <span style={{ color: '#cccccc' }}>{summary.agentName}</span>
      </td>
      <td style={tdStyle}>
        <span style={{ color: modelColor, fontSize: 11 }}>{modelLabel(summary.model)}</span>
      </td>
      <td style={tdStyleR}>
        <span style={{ color: summary.costUsd > 0 ? '#86efac' : '#6b7280' }}>
          {formatCost(summary.costUsd)}
        </span>
      </td>
      <td style={tdStyleR}>{formatTokens(summary.tokens.input)}</td>
      <td style={tdStyleR}>{formatTokens(summary.tokens.output)}</td>
      <td style={tdStyleR}>{formatTokens(summary.tokens.cacheWrite)}</td>
      <td style={tdStyleR}>{formatTokens(summary.tokens.cacheRead)}</td>
      <td style={tdStyleR}>{summary.messageCount}</td>
      <td style={tdStyleR}>{formatDuration(summary.durationMs)}</td>
    </tr>
  );
}

function Stat({
  label,
  value,
  large,
  color,
}: {
  label: string;
  value: string;
  large?: boolean;
  color?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      <span
        style={{
          color: color ?? '#e5e5e5',
          fontSize: large ? 18 : 13,
          fontWeight: large ? 600 : 'normal',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
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

const thStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderBottom: '1px solid #3c3c3c',
  fontWeight: 'normal',
};

const thStyleR: React.CSSProperties = {
  ...thStyle,
  textAlign: 'right',
};

const tdStyle: React.CSSProperties = {
  padding: '5px 12px',
  fontVariantNumeric: 'tabular-nums',
};

const tdStyleR: React.CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
};
