import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNapStore } from './store';
import type { AgentState, NapkinState } from '../shared/bridge-types';
import { roleColor } from '../shared/dot-style';

/**
 * Cmd+P command palette. Fuzzy-search across:
 *   - agents (Enter → focuses their terminal)
 *   - napkins (Enter → focuses the card)
 *   - actions (Roles editor, Workflows editor, Runs dashboard, etc.)
 *
 * Default behavior: type to filter; first match is auto-selected; Enter runs;
 * arrow keys navigate. The point is "I have 50 napkins, get me to the right
 * agent in three keystrokes."
 */

type ItemCategory = 'agent' | 'napkin' | 'action';

interface PaletteItem {
  id: string;
  category: ItemCategory;
  label: string;
  /** Secondary text shown muted to the right (e.g., role for agents). */
  hint?: string;
  /** Tertiary tag color (role color for agents, etc.). */
  accentColor?: string;
  onRun: () => void;
}

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  agent: 'agent',
  napkin: 'napkin',
  action: 'action',
};

const CATEGORY_COLOR: Record<ItemCategory, string> = {
  agent: '#22c55e',
  napkin: '#9cdcfe',
  action: '#a855f7',
};

export function CommandPalette() {
  const open = useNapStore((s) => s.commandPaletteOpen);
  const close = useNapStore((s) => s.closeCommandPalette);
  const napkins = useNapStore((s) => s.napkins);
  const architects = useNapStore((s) => s.architects);
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);
  const focusCard = useNapStore((s) => s.focusCard);
  const openRoleEditor = useNapStore((s) => s.openRoleEditor);
  const openWorkflowSetup = useNapStore((s) => s.openWorkflowSetup);
  const openWorkflowDashboard = useNapStore((s) => s.openWorkflowDashboard);
  const openWorkflowFromSpec = useNapStore((s) => s.openWorkflowFromSpec);
  const toggleSidebar = useNapStore((s) => s.toggleSidebar);
  const toggleKanban = useNapStore((s) => s.toggleKanban);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset on each open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [];

    // Agents — architects first, then napkin agents
    for (const a of architects) {
      out.push(makeAgentItem(a, setActiveTerminal));
    }
    for (const napkin of napkins) {
      for (const a of napkin.agents) {
        out.push(makeAgentItem(a, setActiveTerminal));
      }
    }

    // Napkins
    for (const napkin of napkins) {
      out.push({
        id: `napkin:${napkin.slug}`,
        category: 'napkin',
        label: napkin.slug,
        hint: napkin.status,
        accentColor: CATEGORY_COLOR.napkin,
        onRun: () => focusCard(napkin.slug),
      });
    }

    // Fixed actions
    out.push(
      {
        id: 'action:roles',
        category: 'action',
        label: 'Open Roles editor',
        hint: '.nap/00-org/40-roles/',
        onRun: () => openRoleEditor(),
      },
      {
        id: 'action:workflows',
        category: 'action',
        label: 'Open Workflows editor',
        hint: '.nap/workflows/',
        onRun: () => openWorkflowSetup(null),
      },
      {
        id: 'action:from-spec',
        category: 'action',
        label: 'Run workflow from spec…',
        hint: 'create napkin + run scope stage on a spec doc',
        onRun: () => openWorkflowFromSpec(),
      },
      {
        id: 'action:runs',
        category: 'action',
        label: 'Open Runs dashboard',
        hint: 'workflow run history + cancel',
        onRun: () => openWorkflowDashboard(),
      },
      {
        id: 'action:sidebar',
        category: 'action',
        label: 'Toggle sidebar',
        hint: 'Cmd+B',
        onRun: () => toggleSidebar(),
      },
      {
        id: 'action:kanban',
        category: 'action',
        label: 'Toggle kanban',
        hint: 'Cmd+`',
        onRun: () => toggleKanban(),
      },
    );

    return out;
  }, [architects, napkins, setActiveTerminal, focusCard, openRoleEditor, openWorkflowSetup, openWorkflowDashboard, openWorkflowFromSpec, toggleSidebar, toggleKanban]);

  // Filter + sort by score
  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 50);
    const scored: Array<{ item: PaletteItem; score: number }> = [];
    for (const item of items) {
      const s = scoreMatch(query, item.label);
      if (s > 0) scored.push({ item, score: s });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 50).map((x) => x.item);
  }, [items, query]);

  // Clamp selected to filtered range
  useEffect(() => {
    if (selected >= filtered.length) setSelected(Math.max(0, filtered.length - 1));
  }, [filtered.length, selected]);

  // Scroll the selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLDivElement>(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  // Esc / arrows / enter
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(filtered.length - 1, s + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(0, s - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[selected];
        if (item) {
          item.onRun();
          close();
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, close, filtered, selected]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '12vh',
        zIndex: 980,
      }}
    >
      <div
        data-testid="command-palette"
        style={{
          width: 600,
          maxWidth: '90%',
          maxHeight: '70vh',
          background: '#252526',
          border: '1px solid #3c3c3c',
          borderRadius: 6,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
          fontSize: 13,
          color: '#cccccc',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          placeholder="Jump to agent, napkin, or action…"
          style={{
            background: '#1e1e1e',
            border: 'none',
            borderBottom: '1px solid #3c3c3c',
            color: '#e5e5e5',
            padding: '12px 16px',
            fontFamily: 'inherit',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '16px 16px', color: '#6b7280', fontSize: 12 }}>
              No matches.
            </div>
          ) : (
            filtered.map((item, idx) => (
              <Row
                key={item.id}
                item={item}
                idx={idx}
                selected={idx === selected}
                onClick={() => {
                  item.onRun();
                  close();
                }}
                onHover={() => setSelected(idx)}
              />
            ))
          )}
        </div>
        <div
          style={{
            padding: '6px 16px',
            borderTop: '1px solid #3c3c3c',
            color: '#6b7280',
            fontSize: 10,
            display: 'flex',
            gap: 16,
          }}
        >
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>esc close</span>
          <span style={{ flex: 1 }} />
          <span>{filtered.length} of {items.length}</span>
        </div>
      </div>
    </div>
  );
}

function makeAgentItem(
  agent: AgentState,
  setActiveTerminal: (id: string) => void,
): PaletteItem {
  let stateLabel = 'wait';
  if (agent.archived) stateLabel = 'archived';
  else if (agent.exited) stateLabel = 'exited';
  else if (agent.paused) stateLabel = 'paused';
  else if (agent.done) stateLabel = 'done';
  else if (agent.running) stateLabel = 'running';
  else if (agent.started) stateLabel = 'started';
  return {
    id: `agent:${agent.id}`,
    category: 'agent',
    label: agent.name,
    hint: `${agent.role} · ${stateLabel}`,
    accentColor: roleColor(agent.role),
    onRun: () => setActiveTerminal(agent.id),
  };
}

function Row({
  item,
  idx,
  selected,
  onClick,
  onHover,
}: {
  item: PaletteItem;
  idx: number;
  selected: boolean;
  onClick: () => void;
  onHover: () => void;
}) {
  return (
    <div
      data-idx={idx}
      onClick={onClick}
      onMouseEnter={onHover}
      style={{
        padding: '6px 16px',
        background: selected ? '#094771' : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        userSelect: 'none',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: item.accentColor ?? CATEGORY_COLOR[item.category],
          flexShrink: 0,
        }}
      />
      <span style={{ color: '#cccccc', minWidth: 220 }}>{item.label}</span>
      {item.hint && (
        <span style={{ color: '#9ca3af', fontSize: 11 }}>{item.hint}</span>
      )}
      <span style={{ flex: 1 }} />
      <span
        style={{
          fontSize: 10,
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {CATEGORY_LABEL[item.category]}
      </span>
    </div>
  );
}

/**
 * Score a label against a query. Higher = better. 0 = no match.
 *   - Exact prefix match: 1000 - label length (shorter wins)
 *   - Substring contained: 500 - position of substring
 *   - Subsequence (chars in order, gaps allowed): 100 - label length
 */
function scoreMatch(query: string, label: string): number {
  const q = query.toLowerCase().trim();
  const l = label.toLowerCase();
  if (l === q) return 2000;
  if (l.startsWith(q)) return 1000 - l.length;
  const idx = l.indexOf(q);
  if (idx >= 0) return 500 - idx;
  // Subsequence
  let li = 0;
  for (const c of q) {
    li = l.indexOf(c, li);
    if (li === -1) return 0;
    li++;
  }
  return Math.max(1, 100 - l.length);
}
