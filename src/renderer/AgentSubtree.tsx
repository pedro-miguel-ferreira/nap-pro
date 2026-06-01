import React, { useState } from 'react';
import { useNapStore } from './store';
import type { AgentState } from '../shared/bridge-types';
import { dotStyle, roleColor } from '../shared/dot-style';
import { AgentContextMenu, type ContextMenuPosition } from './AgentContextMenu';

// ── Helpers ──

/**
 * Group agents by parentId, treating parents outside the scoped set as roots.
 * Returns a map keyed by parentId (or null for roots).
 */
export function buildAgentChildren(
  agents: AgentState[],
): Map<string | null, AgentState[]> {
  const inScope = new Set(agents.map((a) => a.id));
  const byParent = new Map<string | null, AgentState[]>();

  for (const a of agents) {
    const key = a.parentId && inScope.has(a.parentId) ? a.parentId : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(a);
  }

  for (const list of byParent.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt);
  }

  return byParent;
}

// ── Agent dot (role color + status shape) — duplicated from Sidebar to avoid circular import ──

function AgentDot({ agent, size = 8 }: { agent: AgentState; size?: number }) {
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);
  const style = dotStyle({
    role: agent.role,
    running: agent.running,
    paused: agent.paused,
    done: agent.done,
    exited: agent.exited,
    archived: agent.archived,
  });

  const hollow = style.shape === 'hollow';
  const dashed = style.shape === 'dashed-check';
  const paused = style.shape === 'paused';
  const actualSize = hollow ? size - 1 : size;
  const clickable = agent.started || agent.archived;

  return (
    <span
      title={`${agent.name} (${agent.role})`}
      onClick={(e) => {
        e.stopPropagation();
        if (clickable) setActiveTerminal(agent.id);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: actualSize,
        height: actualSize,
        minWidth: actualSize,
        minHeight: actualSize,
        borderRadius: '50%',
        boxSizing: 'content-box',
        flexShrink: 0,
        backgroundColor: hollow || dashed || paused ? 'transparent' : style.color,
        border: `2px ${dashed ? 'dashed' : 'solid'} ${hollow || dashed || paused ? style.color : 'transparent'}`,
        marginRight: 4,
        verticalAlign: 'middle',
        cursor: clickable ? 'pointer' : 'default',
        animation: agent.pendingApproval ? 'blink 0.6s step-end infinite' : 'none',
      }}
    >
      {dashed && (
        <svg width="6" height="6" viewBox="0 0 6 6">
          <path d="M1 3.2 L2.3 4.5 L5 1.5" stroke={style.color} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {paused && (
        <svg width="6" height="6" viewBox="0 0 6 6">
          <rect x="1.4" y="1" width="1" height="4" fill={style.color} />
          <rect x="3.6" y="1" width="1" height="4" fill={style.color} />
        </svg>
      )}
    </span>
  );
}

// ── Recursive subtree node ──

export interface AgentSubtreeProps {
  agent: AgentState;
  childrenMap: Map<string | null, AgentState[]>;
  depth: number;
  baseIndent: number;
  /** Render-prop for content under each agent (file entries, terminal row). */
  renderAgentBody?: (agent: AgentState, indent: number) => React.ReactNode;
}

export function AgentSubtree({
  agent,
  childrenMap,
  depth,
  baseIndent,
  renderAgentBody,
}: AgentSubtreeProps) {
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);
  const collapsedAgentIds = useNapStore((s) => s.collapsedAgentIds);
  const toggleAgentCollapsed = useNapStore((s) => s.toggleAgentCollapsed);

  const [menuPos, setMenuPos] = useState<ContextMenuPosition | null>(null);

  const children = childrenMap.get(agent.id) ?? [];
  const hasChildren = children.length > 0;
  const collapsed = collapsedAgentIds.has(agent.id);

  const indent = baseIndent + depth * 16;
  const clickable = agent.started || agent.archived;

  return (
    <div>
      <div
        data-testid="browser-agent"
        onClick={(e) => {
          e.stopPropagation();
          if (clickable) setActiveTerminal(agent.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuPos({ x: e.clientX, y: e.clientY });
        }}
        style={{
          padding: `1px 0 1px ${indent}px`,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          cursor: clickable ? 'pointer' : 'default',
          borderRadius: 3,
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')
        }
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Chevron — only when this agent has children */}
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggleAgentCollapsed(agent.id);
          }}
          style={{
            width: 12,
            display: 'inline-flex',
            justifyContent: 'center',
            color: hasChildren ? '#cccccc' : 'transparent',
            cursor: hasChildren ? 'pointer' : 'default',
            fontSize: 9,
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          {hasChildren ? (collapsed ? '▶' : '▼') : '·'}
        </span>

        <span style={{ flexShrink: 0, width: 10, display: 'flex', justifyContent: 'center' }}>
          <AgentDot agent={agent} size={8} />
        </span>
        <span
          style={{
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: '#cccccc',
          }}
        >
          {agent.name}/
        </span>
        {hasChildren && (
          <span style={{ color: '#6b7280', fontSize: 11, flexShrink: 0 }}>
            {countDescendants(agent.id, childrenMap)}
          </span>
        )}
        <span style={{ color: roleColor(agent.role), fontSize: 12, flexShrink: 0 }}>
          {agent.archived
            ? 'archived'
            : agent.exited
              ? 'exited'
              : agent.paused
                ? 'paused'
                : agent.done
                  ? 'done'
                  : agent.running
                    ? 'run'
                    : 'wait'}
        </span>
      </div>

      {/* Body slot — file entries, terminal etc. */}
      {!collapsed && renderAgentBody?.(agent, indent + 16)}

      {/* Recursively render children */}
      {!collapsed &&
        children.map((child) => (
          <AgentSubtree
            key={child.id}
            agent={child}
            childrenMap={childrenMap}
            depth={depth + 1}
            baseIndent={baseIndent}
            renderAgentBody={renderAgentBody}
          />
        ))}

      {menuPos && (
        <AgentContextMenu
          agent={agent}
          position={menuPos}
          onClose={() => setMenuPos(null)}
          isParentInTree={hasChildren}
        />
      )}
    </div>
  );
}

function countDescendants(
  id: string,
  childrenMap: Map<string | null, AgentState[]>,
): number {
  const direct = childrenMap.get(id) ?? [];
  let total = direct.length;
  for (const child of direct) {
    total += countDescendants(child.id, childrenMap);
  }
  return total;
}
