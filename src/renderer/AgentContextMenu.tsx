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

  const canPause = agent.running && !agent.exited;
  const canResume = agent.started && !agent.exited && !agent.running;
  const canStop = agent.running;
  const canPeek = agent.started || agent.archived;

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
    { separator: true },
    {
      label: 'Activity',
      onClick: () => {
        window.electronAPI?.openActivityPanel?.(agent.id, 'agent');
        onClose();
      },
    },
    {
      label: 'Files',
      onClick: () => {
        window.electronAPI?.openDiffPanel?.(agent.id);
        onClose();
      },
    },
    {
      label: 'Global activity',
      disabled: !isParentInTree,
      onClick: () => {
        window.electronAPI?.openActivityPanel?.(agent.id, 'subtree');
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
