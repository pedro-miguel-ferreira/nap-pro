import React, { useEffect, useRef } from 'react';
import type { NapkinState } from '../shared/bridge-types';
import { useNapStore } from './store';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface NapkinContextMenuProps {
  napkin: NapkinState;
  position: ContextMenuPosition;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  disabled?: boolean;
  separator?: false;
  destructive?: boolean;
  onClick: () => void;
}

interface Separator {
  separator: true;
}

type MenuEntry = MenuItem | Separator;

export function NapkinContextMenu({ napkin, position, onClose }: NapkinContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const openWorkflowSetup = useNapStore((s) => s.openWorkflowSetup);
  const openWorkflowDashboard = useNapStore((s) => s.openWorkflowDashboard);
  const stale = useNapStore((s) => s.staleNapkins[napkin.slug]);
  const clearStale = useNapStore((s) => s.clearStale);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
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

  const hasWorktree = !!napkin.worktreePath;

  const items: MenuEntry[] = [
    {
      label: 'Run workflow…',
      onClick: () => {
        openWorkflowSetup(napkin.slug);
        onClose();
      },
    },
    {
      label: 'Add stage…',
      onClick: () => {
        useNapStore.getState().openAddStageModal(napkin.slug);
        onClose();
      },
    },
    ...(stale
      ? ([
          {
            label: `Re-run "${stale.workflowName}" (docs changed)`,
            onClick: async () => {
              // Optimistic UI: clear stale + open dashboard immediately so the
              // user sees feedback before the IPC round-trip + first run-update
              // event lands. If the run actually fails to launch we revert below.
              const slug = napkin.slug;
              const workflowName = stale.workflowName;
              clearStale(slug);
              openWorkflowDashboard();
              onClose();

              const res = await window.electronAPI?.runWorkflow?.(workflowName, slug);
              if (res && !res.ok && res.message) {
                // eslint-disable-next-line no-alert
                alert(`Re-run failed: ${res.message}`);
              }
            },
          },
          { separator: true } as Separator,
        ] as MenuEntry[])
      : ([{ separator: true } as Separator] as MenuEntry[])),
    {
      label: hasWorktree ? 'Worktree exists' : 'Create worktree',
      disabled: hasWorktree,
      onClick: async () => {
        const res = await window.electronAPI?.createNapkinWorktree?.(napkin.slug);
        if (res && !res.ok) {
          // eslint-disable-next-line no-alert
          alert(`Failed to create worktree: ${res.error ?? 'unknown error'}`);
        }
        onClose();
      },
    },
    {
      label: 'Open worktree',
      disabled: !hasWorktree,
      onClick: () => {
        if (napkin.worktreePath) {
          window.electronAPI?.openFilePath(napkin.worktreePath);
        }
        onClose();
      },
    },
    {
      label: 'Copy worktree path',
      disabled: !hasWorktree,
      onClick: () => {
        if (napkin.worktreePath) {
          navigator.clipboard.writeText(napkin.worktreePath);
        }
        onClose();
      },
    },
    {
      label: 'Reveal napkin files',
      onClick: () => {
        // napkin.path is the napkin's directory under .nap/nepics/.../30-napkins/<slug>/
        // — contains <slug>.nap.md/.spec.md/.stories.md and the agents/ subtree.
        window.electronAPI?.revealProjectPath?.(napkin.path);
        onClose();
      },
    },
    {
      label: 'View napkin (.nap.md)',
      onClick: () => {
        useNapStore.getState().openMarkdownPanel(`${napkin.path}/${napkin.slug}.nap.md`);
        onClose();
      },
    },
    {
      label: 'View spec (.spec.md)',
      onClick: () => {
        useNapStore.getState().openMarkdownPanel(`${napkin.path}/${napkin.slug}.spec.md`);
        onClose();
      },
    },
    {
      label: 'View stories (.stories.md)',
      onClick: () => {
        useNapStore.getState().openMarkdownPanel(`${napkin.path}/${napkin.slug}.stories.md`);
        onClose();
      },
    },
    { separator: true },
    {
      label: 'Remove worktree',
      disabled: !hasWorktree,
      destructive: true,
      onClick: async () => {
        // eslint-disable-next-line no-alert
        const ok = window.confirm(
          `Remove worktree for "${napkin.slug}"?\n\nThe nap-pro/${napkin.slug} branch is preserved — only the working tree is deleted.`,
        );
        if (!ok) {
          onClose();
          return;
        }
        const res = await window.electronAPI?.removeNapkinWorktree?.(napkin.slug);
        if (res && !res.ok) {
          // eslint-disable-next-line no-alert
          if (
            window.confirm(
              `Failed: ${res.error ?? 'unknown error'}\n\nForce remove (discards uncommitted changes)?`,
            )
          ) {
            await window.electronAPI?.removeNapkinWorktree?.(napkin.slug, true);
          }
        }
        onClose();
      },
    },
  ];

  const menuWidth = 200;
  const menuHeight = items.length * 26 + 16;
  const x = Math.min(position.x, window.innerWidth - menuWidth - 4);
  const y = Math.min(position.y, window.innerHeight - menuHeight - 4);

  return (
    <div
      ref={ref}
      data-testid="napkin-context-menu"
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
              style={{ height: 1, background: '#3c3c3c', margin: '4px 0' }}
            />
          );
        }
        const color = item.destructive ? '#ef4444' : '#cccccc';
        return (
          <div
            key={item.label}
            onClick={() => {
              if (!item.disabled) item.onClick();
            }}
            style={{
              padding: '4px 12px',
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.disabled ? '#6b7280' : color,
              userSelect: 'none',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) e.currentTarget.style.background = '#094771';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
}
