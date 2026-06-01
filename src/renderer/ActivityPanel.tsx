import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNapStore } from './store';
import { LinkifiedText } from './LinkifiedText';
import type { ActivityEvent, ActivityType, AgentState } from '../shared/bridge-types';

const TYPE_COLORS: Record<ActivityType, string> = {
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

const TYPE_LABEL: Record<ActivityType, string> = {
  started: 'started',
  paused: 'paused',
  resumed: 'resumed',
  exited: 'exited',
  archived: 'archived',
  done: 'done',
  'permission-requested': 'perm?',
  'permission-allowed': 'allow',
  'permission-denied': 'deny',
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

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8); // HH:MM:SS
}

export function ActivityPanel() {
  const agentId = useNapStore((s) => s.activityPanelAgentId);
  const scope = useNapStore((s) => s.activityPanelScope);
  const closeActivityPanel = useNapStore((s) => s.closeActivityPanel);
  const napkins = useNapStore((s) => s.napkins);
  const architects = useNapStore((s) => s.architects);

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<ActivityType>>(new Set());
  const [loading, setLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rootAgent = agentId ? findAgentById(agentId, napkins, architects) : null;

  // Subtree mode: which agent ids belong to this view?
  const subtreeIds = useMemo(() => {
    if (!agentId) return new Set<string>();
    if (scope === 'agent') return new Set([agentId]);
    const allAgents = [...architects, ...napkins.flatMap((n) => n.agents)];
    const ids = new Set([agentId]);
    const queue = [agentId];
    while (queue.length) {
      const parentId = queue.shift()!;
      for (const a of allAgents) {
        if (a.parentId === parentId && !ids.has(a.id)) {
          ids.add(a.id);
          queue.push(a.id);
        }
      }
    }
    return ids;
  }, [agentId, scope, architects, napkins]);

  const refresh = useCallback(async () => {
    if (!agentId || !window.electronAPI?.getAgentActivity) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.getAgentActivity(agentId, scope);
      setEvents(res.events ?? []);
    } finally {
      setLoading(false);
    }
  }, [agentId, scope]);

  // Initial load
  useEffect(() => {
    if (agentId) {
      refresh();
    } else {
      setEvents([]);
      setActiveFilters(new Set());
    }
  }, [agentId, refresh]);

  // Live event stream
  useEffect(() => {
    if (!agentId || !window.electronAPI?.onActivityEvent) return;
    const unsub = window.electronAPI.onActivityEvent((event) => {
      if (subtreeIds.has(event.agentId)) {
        setEvents((prev) => [...prev, event]);
      }
    });
    return unsub;
  }, [agentId, subtreeIds]);

  // Auto-scroll on new events
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events, autoScroll]);

  // Esc closes
  useEffect(() => {
    if (!agentId) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeActivityPanel();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [agentId, closeActivityPanel]);

  if (!agentId) return null;

  // Type filter chips show counts
  const typeCounts = new Map<ActivityType, number>();
  for (const e of events) {
    typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
  }

  const visibleEvents =
    activeFilters.size === 0
      ? events
      : events.filter((e) => activeFilters.has(e.type));

  function toggleFilter(t: ActivityType): void {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  return (
    <div
      data-testid="activity-panel"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '55%',
        maxWidth: 900,
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
        <span style={{ color: '#e5e5e5', fontWeight: 600 }}>
          {scope === 'subtree' ? 'Global activity' : 'Activity'}
        </span>
        <span style={{ color: '#6b7280' }}>·</span>
        <span style={{ color: '#cccccc' }}>{rootAgent?.name ?? agentId}</span>
        {scope === 'subtree' && (
          <>
            <span style={{ color: '#6b7280' }}>·</span>
            <span style={{ color: '#6b7280', fontSize: 11 }}>
              {subtreeIds.size} agent{subtreeIds.size === 1 ? '' : 's'}
            </span>
          </>
        )}
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            style={{ margin: 0 }}
          />
          autoscroll
        </label>
        <button onClick={refresh} disabled={loading} style={btnStyle} title="Refresh">
          ↻
        </button>
        <button onClick={closeActivityPanel} style={btnStyle} title="Close (Esc)">
          ✕
        </button>
      </div>

      {/* Filter chips */}
      {typeCounts.size > 0 && (
        <div
          style={{
            padding: '6px 16px',
            borderBottom: '1px solid #3c3c3c',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            flexShrink: 0,
          }}
        >
          {Array.from(typeCounts.entries()).map(([type, count]) => {
            const active = activeFilters.has(type);
            const color = TYPE_COLORS[type] ?? '#6b7280';
            return (
              <span
                key={type}
                onClick={() => toggleFilter(type)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 10,
                  border: `1px solid ${active ? color : '#3c3c3c'}`,
                  background: active ? `${color}22` : 'transparent',
                  color: active ? color : '#9ca3af',
                  fontSize: 11,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {TYPE_LABEL[type]} {count}
              </span>
            );
          })}
        </div>
      )}

      {/* Event list */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {visibleEvents.length === 0 ? (
          <div style={{ padding: 24, color: '#6b7280', fontSize: 12 }}>
            {loading ? 'Loading…' : 'No events yet.'}
          </div>
        ) : (
          visibleEvents.map((e, i) => <EventRow key={i} event={e} showAgent={scope === 'subtree'} />)
        )}
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

function EventRow({ event, showAgent }: { event: ActivityEvent; showAgent: boolean }) {
  const color = TYPE_COLORS[event.type] ?? '#6b7280';
  return (
    <div
      style={{
        padding: '3px 16px',
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: '#6b7280', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
        {formatTime(event.ts)}
      </span>
      <span
        style={{
          color,
          minWidth: 50,
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        {TYPE_LABEL[event.type]}
      </span>
      {showAgent && (
        <span style={{ color: '#9cdcfe', flexShrink: 0 }}>
          {event.agentName}
        </span>
      )}
      <span style={{ color: '#cccccc', flex: 1, wordBreak: 'break-word' }}>
        <LinkifiedText text={event.text} />
      </span>
    </div>
  );
}
