import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNapStore } from './store';
import type {
  ActivityEvent,
  ActivityType,
  TimelineChunk,
  TimelineSnapshot,
} from '../shared/bridge-types';

const EVENT_COLOR: Record<ActivityType, string> = {
  started: '#22c55e',
  paused: '#f59e0b',
  resumed: '#22c55e',
  exited: '#6b7280',
  archived: '#6b7280',
  done: '#3b82f6',
  'permission-requested': '#a855f7',
  'permission-allowed': '#22c55e',
  'permission-denied': '#ef4444',
};

/**
 * Strip CSI color/SGR sequences and OSC titles. Leaves CR/LF and most other
 * control characters intact so output mostly resembles what you saw live.
 * Imperfect for redraw-heavy TUIs (cursor moves stack instead of overwriting),
 * but the typical claude transcript renders well.
 */
function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[\d;?]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b[()][AB012]/g, '');
}

function formatTime(ts: number): string {
  return new Date(ts).toTimeString().slice(0, 8);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function TimelinePanel() {
  const agentId = useNapStore((s) => s.timelinePanelAgentId);
  const close = useNapStore((s) => s.closeTimelinePanel);

  const [snapshot, setSnapshot] = useState<TimelineSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  /** ms offset into the timeline (0 = startedAt; total = endedAt or now). */
  const [cursor, setCursor] = useState<number | null>(null);
  /** True while user is dragging — pauses the auto-follow-tail behavior. */
  const [scrubbing, setScrubbing] = useState(false);

  const refresh = useCallback(async () => {
    if (!agentId || !window.electronAPI?.getAgentTimeline) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.getAgentTimeline(agentId);
      if (!res.error) setSnapshot(res);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // Initial fetch + auto-refresh while running and not scrubbing
  useEffect(() => {
    if (!agentId) {
      setSnapshot(null);
      setCursor(null);
      return;
    }
    refresh();
  }, [agentId, refresh]);

  useEffect(() => {
    if (!agentId || !snapshot?.running || scrubbing) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [agentId, snapshot?.running, scrubbing, refresh]);

  // Esc closes
  useEffect(() => {
    if (!agentId) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [agentId, close]);

  // Resolve the time range
  const totalRangeMs = useMemo(() => {
    if (!snapshot) return 0;
    const end = snapshot.endedAt ?? Date.now();
    return Math.max(end - snapshot.startedAt, 1);
  }, [snapshot]);

  const cursorTs = useMemo(() => {
    if (!snapshot) return 0;
    if (cursor === null) {
      // Default: end of timeline
      return snapshot.endedAt ?? Date.now();
    }
    return snapshot.startedAt + cursor;
  }, [snapshot, cursor]);

  // Reconstruct output up to cursor
  const reconstructed = useMemo(() => {
    if (!snapshot) return '';
    const upTo = cursorTs;
    let out = '';
    for (const c of snapshot.chunks) {
      if (c.ts > upTo) break;
      out += c.data;
    }
    return stripAnsi(out);
  }, [snapshot, cursorTs]);

  if (!agentId) return null;

  return (
    <div
      data-testid="timeline-panel"
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
        <span style={{ color: '#e5e5e5', fontWeight: 600 }}>Timeline</span>
        <span style={{ color: '#6b7280' }}>·</span>
        <span style={{ color: '#cccccc' }}>{snapshot?.agentName ?? agentId}</span>
        {snapshot && (
          <>
            <span style={{ color: '#6b7280' }}>·</span>
            <span style={{ color: '#6b7280', fontSize: 11 }}>
              {formatDuration(totalRangeMs)}
              {snapshot.running ? ' · live' : ''}
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

      {/* Scrubber */}
      {snapshot && (
        <Scrubber
          snapshot={snapshot}
          totalRangeMs={totalRangeMs}
          cursor={cursor}
          onCursorChange={setCursor}
          onScrubStart={() => setScrubbing(true)}
          onScrubEnd={() => setScrubbing(false)}
        />
      )}

      {/* Reconstructed terminal output */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
          background: '#101012',
        }}
      >
        {!snapshot ? (
          <div style={{ color: '#6b7280', fontSize: 12, padding: 16 }}>
            {loading ? 'Loading…' : 'No timeline data.'}
          </div>
        ) : reconstructed.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 12, padding: 16 }}>
            No output captured up to this point. Try moving the cursor to the right.
          </div>
        ) : (
          <pre
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#d4d4d4',
            }}
          >
            {reconstructed}
          </pre>
        )}
      </div>

      {/* Cursor info bar */}
      {snapshot && (
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid #3c3c3c',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 11,
            color: '#9ca3af',
            flexShrink: 0,
          }}
        >
          <span>
            cursor:{' '}
            <span style={{ color: '#cccccc', fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(cursorTs)}
            </span>
          </span>
          <span>·</span>
          <span>
            +{formatDuration(cursorTs - snapshot.startedAt)} from start
          </span>
          <span style={{ flex: 1 }} />
          <span>
            {snapshot.events.filter((e) => e.ts <= cursorTs).length} of{' '}
            {snapshot.events.length} events
          </span>
        </div>
      )}
    </div>
  );
}

function Scrubber({
  snapshot,
  totalRangeMs,
  cursor,
  onCursorChange,
  onScrubStart,
  onScrubEnd,
}: {
  snapshot: TimelineSnapshot;
  totalRangeMs: number;
  cursor: number | null;
  onCursorChange: (ms: number | null) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const cursorMs = cursor ?? totalRangeMs;
  const cursorPct = (cursorMs / totalRangeMs) * 100;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!trackRef.current) return;
    onScrubStart();
    const rect = trackRef.current.getBoundingClientRect();
    const update = (clientX: number) => {
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const pct = x / rect.width;
      onCursorChange(Math.round(pct * totalRangeMs));
    };
    update(e.clientX);
    const onMove = (ev: MouseEvent) => update(ev.clientX);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      onScrubEnd();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #3c3c3c',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7280', marginBottom: 6 }}>
        <span>{formatTime(snapshot.startedAt)}</span>
        <span>
          {snapshot.endedAt ? formatTime(snapshot.endedAt) : 'now'}
        </span>
      </div>
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        style={{
          position: 'relative',
          height: 28,
          background: '#252526',
          border: '1px solid #3c3c3c',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        {/* Event ticks */}
        {snapshot.events.map((e: ActivityEvent, i) => {
          const pct = ((e.ts - snapshot.startedAt) / totalRangeMs) * 100;
          const color = EVENT_COLOR[e.type] ?? '#9ca3af';
          return (
            <div
              key={i}
              title={`${formatTime(e.ts)}  ${e.type}  ${e.text}`}
              style={{
                position: 'absolute',
                left: `${pct}%`,
                top: 4,
                bottom: 4,
                width: 3,
                marginLeft: -1.5,
                background: color,
                borderRadius: 1.5,
                pointerEvents: 'none',
              }}
            />
          );
        })}
        {/* Cursor */}
        <div
          style={{
            position: 'absolute',
            left: `${Math.min(Math.max(cursorPct, 0), 100)}%`,
            top: -4,
            bottom: -4,
            width: 2,
            marginLeft: -1,
            background: '#7dd3fc',
            pointerEvents: 'none',
            boxShadow: '0 0 4px rgba(125,211,252,0.6)',
          }}
        />
      </div>
      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6 }}>
        click anywhere on the bar to scrub. release at the right edge to follow live output.
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
