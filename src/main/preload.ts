import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

// Buffer snapshots that arrive before the renderer registers its callback.
// Fixes race: main sends app:state during loadFromFilesystem/startAgents,
// but React hasn't mounted yet so the callback isn't registered.
let pendingSnapshot: unknown = null;
let snapshotCallback: ((snapshot: unknown) => void) | null = null;

ipcRenderer.on('app:state', (_event, snapshot) => {
  if (snapshotCallback) {
    snapshotCallback(snapshot);
  } else {
    pendingSnapshot = snapshot;
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Snapshot bridge (0100) ──
  onSnapshot: (cb: (snapshot: unknown) => void) => {
    snapshotCallback = cb;
    if (pendingSnapshot !== null) {
      cb(pendingSnapshot);
      pendingSnapshot = null;
    }
  },
  sendIntent: (intent: unknown) => {
    ipcRenderer.send('app:intent', intent);
  },

  // ── PTY channels (0200) ──
  pty: {
    write: (id: string, data: string) => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    ready: (id: string) => ipcRenderer.send('pty:ready', id),
    resume: (id: string) => ipcRenderer.send('pty:resume', id),
    onData: (callback: (id: string, data: string) => void) => {
      const handler = (_event: IpcRendererEvent, id: string, data: string) =>
        callback(id, data);
      ipcRenderer.on('pty:data', handler);
      return () => ipcRenderer.removeListener('pty:data', handler);
    },
    onExit: (callback: (id: string, exitCode: number) => void) => {
      const handler = (_event: IpcRendererEvent, id: string, exitCode: number) =>
        callback(id, exitCode);
      ipcRenderer.on('pty:exit', handler);
      return () => ipcRenderer.removeListener('pty:exit', handler);
    },
  },

  // ── File opener ──
  openFilePath: (filePath: string) => ipcRenderer.send('open-file-path', filePath),

  // ── UI state persistence ──
  saveUiState: (state: unknown) => ipcRenderer.send('save-ui-state', state),
  loadUiState: () => ipcRenderer.invoke('load-ui-state'),

  // ── Nepic management (0500) ──
  switchNepic: (id: string) => ipcRenderer.invoke('nepic:switch', id),
  createNepic: (name: string) => ipcRenderer.invoke('nepic:create', name),

  // ── Napkin status ──
  setNapkinStatus: (slug: string, status: string) => ipcRenderer.invoke('napkin:set-status', slug, status),

  // ── Agent successor (0620) ──
  spawnSuccessor: (id: string) => ipcRenderer.invoke('agent:spawn-successor', id),

  // ── Agent lifecycle controls (right-click menu) ──
  pauseAgent: (id: string) => ipcRenderer.invoke('agent:pause', id),
  resumeAgent: (id: string) => ipcRenderer.invoke('agent:resume', id),
  stopAgent: (id: string) => ipcRenderer.invoke('agent:stop', id),
  startAgent: (id: string) => ipcRenderer.invoke('agent:start', id),
  replayAgent: (id: string, opts: { model?: string | null; prompt?: string }) =>
    ipcRenderer.invoke('agent:replay', id, opts),

  // ── Live diff (right-click → Files) ──
  getAgentFiles: (id: string) => ipcRenderer.invoke('agent:get-files', id),
  getAgentDiff: (id: string, filePath: string) =>
    ipcRenderer.invoke('agent:get-diff', id, filePath),

  // ── Activity stream (right-click → Activity / Global activity) ──
  getAgentActivity: (id: string, scope: 'agent' | 'subtree') =>
    ipcRenderer.invoke('agent:get-activity', id, scope),
  onActivityEvent: (callback: (event: unknown) => void) => {
    const handler = (_e: IpcRendererEvent, event: unknown) => callback(event);
    ipcRenderer.on('activity:event', handler);
    return () => ipcRenderer.removeListener('activity:event', handler);
  },

  // ── Worktree management (slice 5 + 8) ──
  createNapkinWorktree: (slug: string, baseBranch?: string) =>
    ipcRenderer.invoke('napkin:create-worktree', slug, baseBranch),
  removeNapkinWorktree: (slug: string, force?: boolean) =>
    ipcRenderer.invoke('napkin:remove-worktree', slug, force),
  listGitBranches: () => ipcRenderer.invoke('git:list-branches'),

  // ── Roles management (slice 6) ──
  listRoles: () => ipcRenderer.invoke('roles:list'),
  readRole: (name: string) => ipcRenderer.invoke('roles:read', name),
  saveRole: (name: string, content: string) =>
    ipcRenderer.invoke('roles:save', name, content),
  deleteRole: (name: string) => ipcRenderer.invoke('roles:delete', name),

  // ── Workflow management (slice 6) ──
  listWorkflows: () => ipcRenderer.invoke('workflows:list'),
  readWorkflow: (name: string) => ipcRenderer.invoke('workflows:read', name),
  saveWorkflow: (name: string, def: unknown) =>
    ipcRenderer.invoke('workflows:save', name, def),
  deleteWorkflow: (name: string) => ipcRenderer.invoke('workflows:delete', name),
  runWorkflow: (workflowName: string, napkinSlug: string) =>
    ipcRenderer.invoke('workflows:run', workflowName, napkinSlug),
  runWorkflowFromSpec: (args: {
    workflowName: string;
    napkinSlug: string;
    workItemName: string;
    specDocs: string[];
  }) => ipcRenderer.invoke('workflows:run-from-spec', args),

  // ── Cost / metrics (slice 7) ──
  getAgentCost: (id: string, scope: 'agent' | 'subtree') =>
    ipcRenderer.invoke('agent:get-cost', id, scope),
  getNapkinCost: (slug: string) => ipcRenderer.invoke('napkin:get-cost', slug),
  onWorkflowComplete: (callback: (event: { workflowName: string; napkinSlug: string; ok: boolean }) => void) => {
    const handler = (_e: IpcRendererEvent, event: unknown) =>
      callback(event as { workflowName: string; napkinSlug: string; ok: boolean });
    ipcRenderer.on('workflow:complete', handler);
    return () => ipcRenderer.removeListener('workflow:complete', handler);
  },

  // ── Workflow runs / dashboard (slice 10) ──
  listWorkflowRuns: () => ipcRenderer.invoke('workflows:list-runs'),
  cancelWorkflowRun: (runId: string) => ipcRenderer.invoke('workflows:cancel-run', runId),
  onWorkflowRunUpdate: (callback: (run: unknown) => void) => {
    const handler = (_e: IpcRendererEvent, run: unknown) => callback(run);
    ipcRenderer.on('workflow:run-update', handler);
    return () => ipcRenderer.removeListener('workflow:run-update', handler);
  },

  // ── Watch mode (slice 11) ──
  onWorkflowContextChanged: (callback: (event: unknown) => void) => {
    const handler = (_e: IpcRendererEvent, event: unknown) => callback(event);
    ipcRenderer.on('workflow:context-changed', handler);
    return () => ipcRenderer.removeListener('workflow:context-changed', handler);
  },

  // ── Replay timeline (slice 12) ──
  getAgentTimeline: (id: string) => ipcRenderer.invoke('agent:get-timeline', id),

  // ── Stage stats (slice 14) ──
  getStageStats: (stageName: string, role: string) =>
    ipcRenderer.invoke('workflows:stage-stats', stageName, role),

  // ── Project lifecycle + landing screen (slice 19) ──
  getInitialProject: () => ipcRenderer.invoke('project:initial'),
  listRecentProjects: () => ipcRenderer.invoke('project:list-recent'),
  forgetProject: (path: string) => ipcRenderer.invoke('project:forget', path),
  pickProjectDir: (opts?: { title?: string }) =>
    ipcRenderer.invoke('project:pick-dir', opts ?? {}),
  openProject: (path: string) => ipcRenderer.invoke('project:open', path),
  createProject: (opts: { parentDir: string; name: string }) =>
    ipcRenderer.invoke('project:create', opts),
  revealProjectPath: (path?: string) => ipcRenderer.invoke('project:reveal', path),
  spawnArchitect: () => ipcRenderer.invoke('architect:spawn'),
  addStageToNapkin: (opts: { slug: string; role: string; model?: string | null }) =>
    ipcRenderer.invoke('napkin:add-stage', opts),
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('file:write', path, content),
  pickFiles: (opts?: { title?: string }) => ipcRenderer.invoke('dialog:pick-files', opts ?? {}),
  resumeWorkflowRun: (runId: string) => ipcRenderer.invoke('workflows:resume-run', runId),
  nudgeWorkflowStage: (runId: string, stageName: string) =>
    ipcRenderer.invoke('workflows:nudge-stage', runId, stageName),
});
