import React, { useEffect, useRef } from 'react';
import type { AgentState } from '../shared/bridge-types';
import { useNapStore } from './store';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface AgentContextMenuProps {
  agent: AgentState;
  position: ContextMenuPosition;
  onClose: () => void;
  /** True when this agent has children in the visible tree — enables "Global activity". */
  isParentInTree: boolean;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: false;
  onClick: () => void;
}

interface Separator {
  separator: true;
}

type MenuEntry = MenuItem | Separator;

export function AgentContextMenu({
  agent,
  position,
  onClose,
  isParentInTree,
}: AgentContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);
  const openDiffPanel = useNapStore((s) => s.openDiffPanel);
  const openActivityPanel = useNapStore((s) => s.openActivityPanel);
  const openCostPanel = useNapStore((s) => s.openCostPanel);
  const openTimelinePanel = useNapStore((s) => s.openTimelinePanel);
  const openReplayModal = useNapStore((s) => s.openReplayModal);

  // Close on outside click or escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const canPause = agent.running && !agent.paused && !agent.exited;
  const canResume = agent.running && agent.paused && !agent.exited;
  const canStop = agent.running;
  const canPeek = agent.started || agent.archived;
  // "Start" is for dormant agents — never started, not exited, not archived.
  // The architect after init lands here, as do any stage agents whose stubs
  // were created but not yet spawned by the workflow runner.
  const canStart = !agent.started && !agent.exited && !agent.archived;

  const items: MenuEntry[] = [
    {
      label: 'Peek',
      shortcut: '⏎',
      disabled: !canPeek,
      onClick: () => {
        setActiveTerminal(agent.id);
        onClose();
      },
    },
    { separator: true },
    {
      label: 'Start',
      disabled: !canStart,
      onClick: () => {
        window.electronAPI?.startAgent?.(agent.id);
        onClose();
      },
    },
    {
      label: 'Pause',
      disabled: !canPause,
      onClick: () => {
        window.electronAPI?.pauseAgent?.(agent.id);
        onClose();
      },
    },
    {
      label: 'Resume',
      disabled: !canResume,
      onClick: () => {
        window.electronAPI?.resumeAgent?.(agent.id);
        onClose();
      },
    },
    {
      label: 'Stop',
      disabled: !canStop,
      onClick: () => {
        window.electronAPI?.stopAgent?.(agent.id);
        onClose();
      },
    },
    {
      label: 'Replay with…',
      // Architects (no napkin) and never-started agents can't be replayed.
      disabled: agent.napkinId === null || !agent.started,
      onClick: () => {
        openReplayModal(agent.id);
        onClose();
      },
    },
    { separator: true },
    {
      label: 'Activity',
      onClick: () => {
        openActivityPanel(agent.id, 'agent');
        onClose();
      },
    },
    {
      label: 'Files',
      onClick: () => {
        openDiffPanel(agent.id);
        onClose();
      },
    },
    {
      label: 'Timeline',
      onClick: () => {
        openTimelinePanel(agent.id);
        onClose();
      },
    },
    {
      label: 'Global activity',
      disabled: !isParentInTree,
      onClick: () => {
        openActivityPanel(agent.id, 'subtree');
        onClose();
      },
    },
    {
      label: 'Reveal in Finder',
      onClick: () => {
        window.electronAPI?.revealProjectPath?.(agent.homePath);
        onClose();
      },
    },
    {
      label: 'View response.md',
      // Only meaningful for agents that have at least started (and likely written one).
      disabled: !agent.started,
      onClick: () => {
        useNapStore.getState().openMarkdownPanel(`${agent.homePath}/response.md`);
        onClose();
      },
    },
    { separator: true },
    {
      label: 'Cost',
      onClick: () => {
        openCostPanel(agent.id, 'agent');
        onClose();
      },
    },
    {
      label: 'Total cost',
      disabled: !isParentInTree,
      onClick: () => {
        openCostPanel(agent.id, 'subtree');
        onClose();
      },
    },
    { separator: true },
    {
      label: 'Open dir',
      onClick: () => {
        window.electronAPI?.openFilePath?.(agent.homePath);
        onClose();
      },
    },
    {
      label: 'Copy session ID',
      onClick: () => {
        navigator.clipboard.writeText(agent.id);
        onClose();
      },
    },
  ];

  // Clamp position so the menu stays on-screen
  const menuWidth = 200;
  const menuHeight = items.length * 24 + 16;
  const x = Math.min(position.x, window.innerWidth - menuWidth - 4);
  const y = Math.min(position.y, window.innerHeight - menuHeight - 4);

  return (
    <div
      ref={ref}
      data-testid="agent-context-menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        minWidth: menuWidth,
        background: '#252526',
        border: '1px solid #3c3c3c',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        padding: '4px 0',
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
        fontSize: 12,
        color: '#cccccc',
        zIndex: 1000,
      }}
    >
      {items.map((item, i) => {
        if ('separator' in item) {
          return (
            <div
              key={`sep-${i}`}
              style={{
                height: 1,
                background: '#3c3c3c',
                margin: '4px 0',
              }}
            />
          );
        }

        return (
          <div
            key={item.label}
            onClick={() => {
              if (!item.disabled) item.onClick();
            }}
            style={{
              padding: '4px 12px',
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.disabled ? '#6b7280' : '#cccccc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) e.currentTarget.style.background = '#094771';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span style={{ color: '#6b7280', fontSize: 11 }}>{item.shortcut}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
