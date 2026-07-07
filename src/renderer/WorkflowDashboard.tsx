import React, { useEffect } from 'react';
import { useNapStore } from './store';
import type {
  WorkflowRun,
  WorkflowStageRun,
  WorkflowRunStatus,
  WorkflowStageRunStatus,
} from '../shared/bridge-types';

const RUN_COLOR: Record<WorkflowRunStatus, string> = {
  running: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4444',
  cancelled: '#6b7280',
};

const STAGE_COLOR: Record<WorkflowStageRunStatus, string> = {
  pending: '#525252',
  running: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4444',
  'awaiting-architect': '#a855f7',
  cancelled: '#6b7280',
};

const STAGE_LABEL: Record<WorkflowStageRunStatus, string> = {
  pending: 'pending',
  running: 'running',
  completed: 'done',
  failed: 'failed',
  'awaiting-architect': 'awaiting',
  cancelled: 'cancelled',
};

function formatTime(ts: number): string {
  return new Date(ts).toTimeString().slice(0, 8);
}

function formatDuration(start: number, end?: number): string {
  const ms = (end ?? Date.now()) - start;
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function WorkflowDashboard() {
  const open = useNapStore((s) => s.workflowDashboardOpen);
  const close = useNapStore((s) => s.closeWorkflowDashboard);
  const runs = useNapStore((s) => s.workflowRuns);

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

  const active = runs.filter((r) => r.status === 'running');
  const recent = runs.filter((r) => r.status !== 'running');

  return (
    <div
      data-testid="workflow-dashboard"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '60%',
        maxWidth: 1100,
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
        <span style={{ color: '#e5e5e5', fontWeight: 600 }}>Workflow runs</span>
        <span style={{ color: '#6b7280' }}>·</span>
        <span style={{ color: '#cccccc', fontSize: 11 }}>
          {active.length} active · {recent.length} recent
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={close} style={btnStyle} title="Close (Esc)">
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {runs.length === 0 ? (
          <div style={{ padding: 24, color: '#6b7280', fontSize: 12 }}>
            No workflow runs yet. Right-click a napkin → Run workflow…
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <SectionHeader label="Active" />
            )}
            {active.map((run) => (
              <RunCard key={run.runId} run={run} />
            ))}
            {recent.length > 0 && (
              <SectionHeader label="Recent" />
            )}
            {recent.map((run) => (
              <RunCard key={run.runId} run={run} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '8px 16px 4px 16px',
        color: '#6b7280',
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 1,
      }}
    >
      {label}
    </div>
  );
}

function RunCard({ run }: { run: WorkflowRun }) {
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);
  const color = RUN_COLOR[run.status];
  const isActive = run.status === 'running';

  return (
    <div
      style={{
        margin: '0 12px 8px 12px',
        padding: '10px 12px',
        background: '#252526',
        border: `1px solid #3c3c3c`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <span style={{ color: '#e5e5e5', fontWeight: 600 }}>{run.workflowName}</span>
        <span style={{ color: '#6b7280' }}>·</span>
        <span style={{ color: '#9cdcfe' }}>{run.napkinSlug}</span>
        <span style={{ color: '#6b7280' }}>·</span>
        <span style={{ color, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
          {run.status}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color: '#6b7280', fontSize: 11 }}>
          {formatTime(run.startedAt)}
          {' · '}
          {formatDuration(run.startedAt, run.endedAt)}
        </span>
        {isActive && (
          <button
            onClick={async () => {
              // eslint-disable-next-line no-alert
              if (
                window.confirm(
                  `Cancel workflow "${run.workflowName}" on ${run.napkinSlug}?\n\nIn-flight agents will be killed.`,
                )
              ) {
                await window.electronAPI?.cancelWorkflowRun?.(run.runId);
              }
            }}
            style={{
              ...btnStyle,
              width: 'auto',
              padding: '0 10px',
              borderColor: '#ef4444',
              color: '#fca5a5',
            }}
            title="Cancel run"
          >
            Cancel
          </button>
        )}
      </div>

      {run.message && (
        <div
          style={{
            color: '#9ca3af',
            fontSize: 11,
            marginBottom: 8,
            fontStyle: 'italic',
          }}
        >
          {run.message}
        </div>
      )}

      {/* Stages timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {run.stages.map((stage, idx) => (
          <StageRow
            key={idx}
            stage={stage}
            onClick={() => {
              if (stage.agentId) setActiveTerminal(stage.agentId);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function StageRow({
  stage,
  onClick,
}: {
  stage: WorkflowStageRun;
  onClick: () => void;
}) {
  const color = STAGE_COLOR[stage.status];
  const clickable = !!stage.agentId;
  return (
    <div
      onClick={clickable ? onClick : undefined}
      style={{
        padding: '3px 6px',
        borderRadius: 3,
        cursor: clickable ? 'pointer' : 'default',
        fontSize: 12,
      }}
      onMouseEnter={(e) => {
        if (clickable) e.currentTarget.style.background = '#2a2d2e';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
            animation: stage.status === 'running' ? 'blink 1s step-end infinite' : 'none',
          }}
        />
        <span style={{ color: '#cccccc', minWidth: 200 }}>{stage.name}</span>
        <span style={{ color: '#6b7280', fontSize: 11, minWidth: 60 }}>{stage.role}</span>
        {stage.model && (
          <span style={{ color: '#9ca3af', fontSize: 10 }}>
            {stage.model.replace(/^claude-/, '')}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span
          style={{
            color,
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            minWidth: 64,
            textAlign: 'right',
          }}
        >
          {STAGE_LABEL[stage.status]}
        </span>
        {stage.startedAt && (
          <span style={{ color: '#6b7280', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
            {formatDuration(stage.startedAt, stage.endedAt)}
          </span>
        )}
      </div>
      {/* Failure reason — the "why" that used to only reach main's console */}
      {stage.message && (
        <div
          style={{
            marginLeft: 14,
            marginTop: 2,
            color: '#f87171',
            fontSize: 11,
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
          }}
        >
          {stage.message}
        </div>
      )}
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
