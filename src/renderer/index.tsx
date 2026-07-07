import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Landing } from './Landing';
import { MarkdownPanel } from './MarkdownPanel';
import { Sidebar } from './Sidebar';
import { Terminal } from './Terminal';
import { DebugPanel } from './DebugPanel';
import { DiffPanel } from './DiffPanel';
import { ActivityPanel } from './ActivityPanel';
import { CostPanel } from './CostPanel';
import { TimelinePanel } from './TimelinePanel';
import { CommandPalette } from './CommandPalette';
import { AgentReplayModal } from './AgentReplayModal';
import { WorkflowFromSpecModal } from './WorkflowFromSpecModal';
import { AddStageModal } from './AddStageModal';
import { RoleEditor } from './RoleEditor';
import { WorkflowSetup } from './WorkflowSetup';
import { WorkflowDashboard } from './WorkflowDashboard';
import { KanbanOverlay } from './KanbanOverlay';
import { Gutter } from './Gutter';
import { useNapStore, loadPersistedUiState } from './store';
import { createTerminalInstance, getTerminal, disposeTerminal } from './terminal-registry';
import { registerAgentFileLinks } from './agent-file-open';
import type { AppSnapshot, ChangedFile, ActivityEvent, WorkflowDef, CostQueryResult, BranchInfo, WorkflowRun, TimelineSnapshot, StageStats } from '../shared/bridge-types';
import '@xterm/xterm/css/xterm.css';

// Expose store for Playwright tests
declare global {
  interface Window {
    __napStore__: typeof useNapStore;
    electronAPI: {
      onSnapshot: (cb: (snapshot: AppSnapshot) => void) => void;
      sendIntent: (intent: unknown) => void;
      pty: {
        write: (id: string, data: string) => void;
        resize: (id: string, cols: number, rows: number) => void;
        ready: (id: string) => void;
        resume: (id: string) => void;
        onData: (cb: (id: string, data: string) => void) => () => void;
        onExit: (cb: (id: string, exitCode: number) => void) => () => void;
      };
      openFilePath: (filePath: string) => void;
      saveUiState: (state: unknown) => void;
      loadUiState: () => Promise<unknown>;
      setNapkinStatus: (slug: string, status: string) => Promise<unknown>;
      switchNepic: (id: string) => Promise<unknown>;
      createNepic: (name: string) => Promise<unknown>;
      spawnSuccessor: (id: string) => Promise<{ ok?: boolean; newId?: string; error?: boolean; message?: string }>;
      // Optional — wired in later slices. Context menu calls them through `?.()`.
      pauseAgent?: (id: string) => Promise<unknown>;
      resumeAgent?: (id: string) => Promise<unknown>;
      stopAgent?: (id: string) => Promise<unknown>;
      startAgent?: (id: string) => Promise<{ ok?: boolean; error?: boolean; message?: string }>;
      replayAgent?: (id: string, opts: { model?: string | null; prompt?: string }) => Promise<{ ok: boolean; newAgentId?: string; newAgentName?: string; worktreePath?: string; error?: string }>;
      getAgentFiles?: (id: string) => Promise<{ files: ChangedFile[]; baselineSha: string | null; error?: boolean; message?: string }>;
      getAgentDiff?: (id: string, filePath: string) => Promise<{ diff: string; error?: boolean; message?: string }>;
      getAgentActivity?: (id: string, scope: 'agent' | 'subtree') => Promise<{ events: ActivityEvent[] }>;
      onActivityEvent?: (callback: (event: ActivityEvent) => void) => () => void;
      createNapkinWorktree?: (slug: string, baseBranch?: string) => Promise<{ ok: boolean; path?: string; branch?: string; error?: string }>;
      removeNapkinWorktree?: (slug: string, force?: boolean) => Promise<{ ok: boolean; error?: string }>;
      listGitBranches?: () => Promise<{ branches: BranchInfo[]; defaultBranch: string | null }>;
      // Roles + workflows (slice 6)
      listRoles?: () => Promise<{ roles: string[] }>;
      readRole?: (name: string) => Promise<{ content?: string; error?: boolean; message?: string }>;
      saveRole?: (name: string, content: string) => Promise<{ ok?: boolean; error?: boolean; message?: string }>;
      deleteRole?: (name: string) => Promise<{ ok?: boolean; error?: boolean; message?: string }>;
      listWorkflows?: () => Promise<{ workflows: string[] }>;
      readWorkflow?: (name: string) => Promise<{ workflow?: WorkflowDef; error?: boolean; message?: string }>;
      saveWorkflow?: (name: string, def: WorkflowDef) => Promise<{ ok?: boolean; error?: boolean; message?: string }>;
      deleteWorkflow?: (name: string) => Promise<{ ok?: boolean; error?: boolean; message?: string }>;
      runWorkflow?: (workflowName: string, napkinSlug: string) => Promise<{ ok?: boolean; error?: boolean; message?: string }>;
      runWorkflowFromSpec?: (args: { workflowName: string; napkinSlug: string; workItemName: string; specDocs: string[] }) => Promise<{ ok?: boolean; error?: boolean; message?: string }>;
      // Cost (slice 7)
      getAgentCost?: (id: string, scope: 'agent' | 'subtree') => Promise<CostQueryResult & { error?: boolean; message?: string }>;
      getNapkinCost?: (slug: string) => Promise<CostQueryResult & { error?: boolean; message?: string }>;
      onWorkflowComplete?: (callback: (event: { workflowName: string; napkinSlug: string; ok: boolean }) => void) => () => void;
      // Workflow runs (slice 10)
      listWorkflowRuns?: () => Promise<{ runs: WorkflowRun[] }>;
      cancelWorkflowRun?: (runId: string) => Promise<{ ok?: boolean; error?: string }>;
      onWorkflowRunUpdate?: (callback: (run: WorkflowRun) => void) => () => void;
      // Watch mode (slice 11)
      onWorkflowContextChanged?: (callback: (event: { path: string; workflowNames: string[]; ts: number }) => void) => () => void;
      // Timeline replay (slice 12)
      getAgentTimeline?: (id: string) => Promise<TimelineSnapshot & { error?: boolean; message?: string }>;
      // Stage stats (slice 14)
      getStageStats?: (stageName: string, role: string) => Promise<{ stats: StageStats }>;
      // Project lifecycle / landing (slice 19)
      getInitialProject?: () => Promise<{ loaded: boolean; cwd?: string }>;
      listRecentProjects?: () => Promise<{
        recents: Array<{ path: string; displayName: string; lastOpenedAt: number }>;
      }>;
      forgetProject?: (path: string) => Promise<{ ok: boolean }>;
      pickProjectDir?: (opts?: { title?: string }) =>
        Promise<{ ok: boolean; path?: string }>;
      openProject?: (path: string) => Promise<{ ok: boolean; message?: string }>;
      createProject?: (opts: { parentDir: string; name: string }) =>
        Promise<{ ok: boolean; message?: string; path?: string }>;
      revealProjectPath?: (path?: string) => Promise<{ ok: boolean; message?: string }>;
      spawnArchitect?: () => Promise<{
        ok?: boolean;
        error?: boolean;
        message?: string;
        agentId?: string;
        name?: string;
      }>;
      addStageToNapkin?: (opts: { slug: string; role: string; model?: string | null }) =>
        Promise<{ ok?: boolean; error?: boolean; message?: string; agentId?: string; name?: string }>;
      readFile?: (path: string) => Promise<{
        ok?: boolean;
        error?: boolean;
        message?: string;
        content?: string;
      }>;
      writeFile?: (path: string, content: string) => Promise<{
        ok?: boolean;
        error?: boolean;
        message?: string;
      }>;
    };
  }
}

window.__napStore__ = useNapStore;

function App() {
  const applySnapshot = useNapStore((s) => s.applySnapshot);
  const activeTerminalId = useNapStore((s) => s.activeTerminalId);
  const sidebarVisible = useNapStore((s) => s.sidebarVisible);
  const toggleSidebar = useNapStore((s) => s.toggleSidebar);
  const toggleDebugPanel = useNapStore((s) => s.toggleDebugPanel);
  const toggleKanban = useNapStore((s) => s.toggleKanban);
  const nepics = useNapStore((s) => s.nepics);

  // Wire snapshot IPC
  useEffect(() => {
    if (window.electronAPI?.onSnapshot) {
      window.electronAPI.onSnapshot((snapshot) => {
        applySnapshot(snapshot);
      });
    }
    // Load persisted UI state (debug panel collapse/tab)
    loadPersistedUiState();
  }, [applySnapshot]);

  // Auto-open cost panel when a workflow finishes
  useEffect(() => {
    if (!window.electronAPI?.onWorkflowComplete) return;
    return window.electronAPI.onWorkflowComplete(({ napkinSlug }) => {
      useNapStore.getState().openCostPanelForNapkin(napkinSlug);
    });
  }, []);

  // Subscribe to workflow run updates + initial fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await window.electronAPI?.listWorkflowRuns?.();
      if (!cancelled && res?.runs) {
        useNapStore.getState().setWorkflowRuns(res.runs);
      }
    })();
    const unsub = window.electronAPI?.onWorkflowRunUpdate?.((run) => {
      useNapStore.getState().patchWorkflowRun(run);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  // Watch mode: contextFile change → mark affected napkins stale
  useEffect(() => {
    if (!window.electronAPI?.onWorkflowContextChanged) return;
    return window.electronAPI.onWorkflowContextChanged((event) => {
      useNapStore.getState().applyContextChange(event);
    });
  }, []);

  // Wire pty data → xterm terminals
  useEffect(() => {
    if (!window.electronAPI?.pty) return;

    const unsubData = window.electronAPI.pty.onData((id, data) => {
      const entry = getTerminal(id);
      if (entry) {
        entry.terminal.write(data);
      }
    });

    const unsubExit = window.electronAPI.pty.onExit((id) => {
      disposeTerminal(id);
    });

    return () => {
      unsubData();
      unsubExit();
    };
  }, []);

  // Create/dispose xterm terminals for running agents, wire keyboard → pty
  useEffect(() => {
    const state = useNapStore.getState();
    const allAgents = [
      ...state.napkins.flatMap((n) => n.agents),
      ...state.architects,
    ];

    for (const agent of allAgents) {
      if (agent.started && !agent.exited && !getTerminal(agent.id)) {
        const entry = createTerminalInstance(agent.id);
        // Keyboard input → pty
        entry.terminal.onData((data) => {
          window.electronAPI?.pty?.write(agent.id, data);
        });
        // File link provider — `.md` clicks open the in-app viewer, everything
        // else reveals in the OS. Relative paths resolve against the agent's cwd.
        registerAgentFileLinks(entry.terminal, agent.id);
        // Signal ready after next tick (terminal needs to be opened first)
        window.electronAPI?.pty?.ready(agent.id);
      }
    }

    // Set default active terminal if none set
    if (!state.activeTerminalId) {
      const firstRunning = allAgents.find((a) => a.running);
      if (firstRunning) {
        useNapStore.getState().setActiveTerminal(firstRunning.id);
      }
    }
  });

  // Cmd+B → toggle sidebar, Cmd+D → toggle debug panel, Cmd+` → toggle kanban,
  // Cmd+P → open command palette
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        toggleDebugPanel();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault();
        toggleKanban();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        useNapStore.getState().openCommandPalette();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar, toggleDebugPanel, toggleKanban]);

  return (
    <div style={{ display: 'flex', height: '100%', background: '#1e1e1e' }}>
      <KanbanOverlay />
      {nepics.length > 0 && <Gutter />}
      {sidebarVisible && <Sidebar />}
      <CenterPane activeTerminalId={activeTerminalId} />
      <DiffPanel />
      <ActivityPanel />
      <CostPanel />
      <TimelinePanel />
      <RoleEditor />
      <WorkflowSetup />
      <WorkflowDashboard />
      <CommandPalette />
      <AgentReplayModal />
      <WorkflowFromSpecModal />
      <AddStageModal />
    </div>
  );
}

/**
 * Root — asks main whether a project is loaded. If yes, render the workspace
 * (App). If no, render the Landing screen. Project switching is done in main
 * by relaunching with the new NAP_CWD, so we only need to make this decision
 * once on initial render.
 */
/**
 * Center pane — horizontal split between the terminal and the MarkdownPanel.
 *
 * When no markdown tabs are open the MarkdownPanel returns null and the
 * terminal column expands to fill the pane. Open the first .md file and a
 * draggable gutter appears between the two columns. The gutter is identical
 * in pattern to the Sidebar resize handle: drag to set the markdown column's
 * width, percentages clamped so neither column collapses entirely.
 */
function CenterPane({ activeTerminalId }: { activeTerminalId: string | null }) {
  const hasMarkdownTab = useNapStore((s) => s.markdownTabs.length > 0);
  const [mdWidthPct, setMdWidthPct] = useState(50);
  const draggingRef = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const container = (e.currentTarget as HTMLElement).parentElement!;

    function onMove(ev: MouseEvent) {
      if (!draggingRef.current || !container) return;
      const rect = container.getBoundingClientRect();
      const pctFromRight = ((rect.right - ev.clientX) / rect.width) * 100;
      // Clamp to 15-85% so neither pane collapses entirely.
      setMdWidthPct(Math.max(15, Math.min(85, pctFromRight)));
    }
    function onUp() {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'row', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
      {/* Terminal column — takes remaining width when markdown is open, all of it otherwise. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          // Width is implicit: flex:1 absorbs whatever the markdown column doesn't claim.
          flex: hasMarkdownTab ? `0 0 ${100 - mdWidthPct}%` : '1 1 auto',
          minWidth: 0,
        }}
      >
        {activeTerminalId ? (
          <Terminal />
        ) : (
          <div style={{ flex: 1, color: '#ccc', padding: 24, fontFamily: 'monospace', fontSize: 18 }}>
            v3
          </div>
        )}
        <DebugPanel />
      </div>

      {/* Draggable gutter — only visible when a markdown tab is open. */}
      {hasMarkdownTab && (
        <div
          onMouseDown={onMouseDown}
          style={{
            width: 4,
            background: 'transparent',
            cursor: 'col-resize',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#007acc')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        />
      )}

      {/* MarkdownPanel renders inline; returns null when no tabs are open so the
          gutter + this column collapse cleanly. */}
      <MarkdownPanel />
    </div>
  );
}

function Root() {
  const [projectLoaded, setProjectLoaded] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await window.electronAPI?.getInitialProject?.();
      if (cancelled) return;
      if (res?.cwd) useNapStore.getState().setProjectCwd(res.cwd);
      setProjectLoaded(!!res?.loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (projectLoaded === null) {
    // Brief loading flash — invisible in practice unless main is slow.
    return <div style={{ background: '#1e1e1e', height: '100%' }} />;
  }
  return projectLoaded ? <App /> : <Landing />;
}

const root = createRoot(document.getElementById('root')!);
root.render(<Root />);
