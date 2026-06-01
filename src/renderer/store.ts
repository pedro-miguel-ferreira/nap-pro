import { create } from 'zustand';
import type { AppSnapshot, NapkinState, AgentState, NepicInfo, WatcherEvent, WorkflowRun } from '../shared/bridge-types';

export type CardViewMode = 'collapsed' | 'focused' | 'extended';

export interface NapStore {
  // ── Model state (from main process snapshots) ──
  napkins: NapkinState[];
  architects: AgentState[];
  activeNepicId: string;
  activeTerminalId: string | null;
  watcherEvents: WatcherEvent[];
  nepics: NepicInfo[];

  // ── Renderer-only state (preserved across snapshots) ──
  focusedCardSlug: string | null;
  cardViewMode: CardViewMode;
  sidebarVisible: boolean;
  browserFilterText: string;
  browserFilterVisible: boolean;
  debugPanelCollapsed: boolean;
  debugPanelTab: 'model' | 'filesystem' | 'events';
  kanbanVisible: boolean;
  collapsedAgentIds: Set<string>;
  diffPanelAgentId: string | null;
  diffPanelSelectedFile: string | null;
  /**
   * Absolute paths of markdown files open in the split-view pane, in tab order.
   * Empty = pane hidden, terminal full-width. Adding the first tab makes the
   * pane appear as a horizontal split next to the terminal.
   */
  markdownTabs: string[];
  /** Absolute path of the currently-focused tab, or null when no tabs are open. */
  activeMarkdownTab: string | null;
  /**
   * In-flight edits per file. A path-keyed entry means the tab is in edit
   * mode AND has unsaved changes (the draft is the textarea's current value).
   * Survives tab switches — switching away from an edited tab keeps the draft.
   * Saving clears the entry; discarding clears it without writing.
   */
  markdownDrafts: Record<string, string>;
  activityPanelAgentId: string | null;
  activityPanelScope: 'agent' | 'subtree';
  costPanelAgentId: string | null;
  costPanelScope: 'agent' | 'subtree';
  /** When set, panel queries by napkin slug instead of agent id. */
  costPanelNapkinSlug: string | null;
  timelinePanelAgentId: string | null;
  roleEditorOpen: boolean;
  workflowSetupOpen: boolean;
  workflowSetupTarget: string | null;
  workflowDashboardOpen: boolean;
  workflowRuns: WorkflowRun[];
  commandPaletteOpen: boolean;
  /** When set, AgentReplayModal opens for this original agent id. */
  replayModalAgentId: string | null;
  /** When true, the WorkflowFromSpecModal is open. */
  workflowFromSpecOpen: boolean;
  addStageModalOpen: boolean;
  /** Slug of the napkin the add-stage modal is targeting, when open. */
  addStageModalNapkinSlug: string | null;
  /**
   * Napkins whose last workflow run referenced docs that have since changed.
   * Cleared when a new run starts on that napkin or when the user re-runs.
   */
  staleNapkins: Record<string, { workflowName: string; changedFiles: string[]; since: number }>; // null = manage workflows; non-null = pick a workflow to run on this napkin

  // ── Actions ──
  applySnapshot: (snapshot: AppSnapshot) => void;
  setActiveTerminal: (id: string) => void;
  expandCard: (slug: string) => void;
  focusCard: (slug: string) => void;
  extendCard: () => void;
  collapseCard: () => void;
  toggleSidebar: () => void;
  toggleKanban: () => void;
  switchNepic: (id: string) => void;
  setBrowserFilter: (text: string) => void;
  setBrowserFilterVisible: (visible: boolean) => void;
  toggleDebugPanel: () => void;
  setDebugPanelTab: (tab: 'model' | 'filesystem' | 'events') => void;
  toggleAgentCollapsed: (agentId: string) => void;
  openDiffPanel: (agentId: string) => void;
  closeDiffPanel: () => void;
  /** Open a markdown file in the split-view pane. Adds a tab if the file isn't
   * already open, then focuses it. Same call from every entry point. */
  openMarkdownPanel: (path: string) => void;
  /** Close one tab. If it was the active tab, focus the next one over (or null
   * when the last tab closes — pane disappears, terminal goes full-width). */
  closeMarkdownTab: (path: string) => void;
  /** Focus a tab that's already open. */
  focusMarkdownTab: (path: string) => void;
  /** Close all tabs — pane disappears entirely. */
  closeAllMarkdownTabs: () => void;
  /** Start (or update) editing — sets the draft. Pass the initial content
   * when entering edit mode for the first time. */
  setMarkdownDraft: (path: string, content: string) => void;
  /** Drop the draft for a path — exits edit mode without writing. */
  discardMarkdownDraft: (path: string) => void;
  selectDiffFile: (path: string | null) => void;
  openActivityPanel: (agentId: string, scope: 'agent' | 'subtree') => void;
  closeActivityPanel: () => void;
  openCostPanel: (agentId: string, scope: 'agent' | 'subtree') => void;
  openCostPanelForNapkin: (slug: string) => void;
  closeCostPanel: () => void;
  openTimelinePanel: (agentId: string) => void;
  closeTimelinePanel: () => void;
  openRoleEditor: () => void;
  closeRoleEditor: () => void;
  openWorkflowSetup: (napkinSlug?: string | null) => void;
  closeWorkflowSetup: () => void;
  openWorkflowDashboard: () => void;
  closeWorkflowDashboard: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openReplayModal: (originalAgentId: string) => void;
  closeReplayModal: () => void;
  openWorkflowFromSpec: () => void;
  openAddStageModal: (napkinSlug: string) => void;
  closeAddStageModal: () => void;
  closeWorkflowFromSpec: () => void;
  setWorkflowRuns: (runs: WorkflowRun[]) => void;
  patchWorkflowRun: (run: WorkflowRun) => void;
  applyContextChange: (event: { path: string; workflowNames: string[]; ts: number }) => void;
  clearStale: (napkinSlug: string) => void;
}

// Per-nepic renderer state memory (not persisted)
const nepicTerminalMemory = new Map<string, string>();
const nepicFocusedCardMemory = new Map<string, string>();

/** Test-only: clear per-nepic memory between tests */
export function _resetNepicTerminalMemory(): void {
  nepicTerminalMemory.clear();
  nepicFocusedCardMemory.clear();
}

export const useNapStore = create<NapStore>((set, get) => ({
  napkins: [],
  architects: [],
  activeNepicId: '',
  activeTerminalId: null,
  watcherEvents: [],
  nepics: [],

  focusedCardSlug: null,
  cardViewMode: 'collapsed' as CardViewMode,
  sidebarVisible: true,
  browserFilterText: '',
  browserFilterVisible: false,
  debugPanelCollapsed: true,
  debugPanelTab: 'model' as const,
  kanbanVisible: false,
  collapsedAgentIds: new Set<string>(),
  diffPanelAgentId: null,
  diffPanelSelectedFile: null,
  markdownTabs: [],
  activeMarkdownTab: null,
  markdownDrafts: {},
  activityPanelAgentId: null,
  activityPanelScope: 'agent' as const,
  costPanelAgentId: null,
  costPanelScope: 'agent' as const,
  costPanelNapkinSlug: null,
  timelinePanelAgentId: null,
  roleEditorOpen: false,
  workflowSetupOpen: false,
  workflowSetupTarget: null,
  workflowDashboardOpen: false,
  workflowRuns: [],
  commandPaletteOpen: false,
  replayModalAgentId: null,
  workflowFromSpecOpen: false,
  addStageModalOpen: false,
  addStageModalNapkinSlug: null,
  staleNapkins: {},

  // Snapshot only updates model state — renderer-only state preserved
  applySnapshot: (snapshot: AppSnapshot) => {
    const prev = get();
    const nepicChanged = snapshot.activeNepicId !== prev.activeNepicId && prev.activeNepicId !== '';

    // Save current state for the old nepic before switching
    if (nepicChanged && prev.activeNepicId) {
      if (prev.activeTerminalId) {
        nepicTerminalMemory.set(prev.activeNepicId, prev.activeTerminalId);
      }
      if (prev.focusedCardSlug) {
        nepicFocusedCardMemory.set(prev.activeNepicId, prev.focusedCardSlug);
      }
    }

    const updates: Partial<NapStore> = {
      napkins: snapshot.napkins,
      architects: snapshot.architects,
      activeNepicId: snapshot.activeNepicId,
      nepics: snapshot.nepics ?? [],
      watcherEvents: snapshot.watcherEvents ?? [],
    };

    // On nepic switch, restore last terminal + focused card or pick architect
    if (nepicChanged) {
      const remembered = nepicTerminalMemory.get(snapshot.activeNepicId);
      if (remembered) {
        updates.activeTerminalId = remembered;
      } else {
        const arch = snapshot.architects.find(a => a.running)
          ?? snapshot.architects.find(a => a.started);
        updates.activeTerminalId = arch?.id ?? null;
      }

      const rememberedCard = nepicFocusedCardMemory.get(snapshot.activeNepicId);
      if (rememberedCard) {
        updates.focusedCardSlug = rememberedCard;
        updates.cardViewMode = 'focused';
      } else {
        // Default: focus the architect card
        const arch = snapshot.architects[0];
        updates.focusedCardSlug = arch?.id ?? null;
        updates.cardViewMode = arch ? 'focused' : 'collapsed';
      }
    }

    set(updates);
  },

  setActiveTerminal: (id: string) => {
    set({ activeTerminalId: id });
  },

  // Click card → focused. Click same card → collapsed.
  expandCard: (slug: string) => {
    const { focusedCardSlug } = get();
    if (focusedCardSlug === slug) {
      set({ focusedCardSlug: null, cardViewMode: 'collapsed' });
    } else {
      set({ focusedCardSlug: slug, cardViewMode: 'focused' });
    }
  },

  // Force focus a card (always focus, never toggle — used by kanban navigation)
  focusCard: (slug: string) => {
    set({ focusedCardSlug: slug, cardViewMode: 'focused', sidebarVisible: true });
  },

  // Cmd+E → toggle focused ↔ extended (only if a card is focused)
  extendCard: () => {
    const { focusedCardSlug, cardViewMode } = get();
    if (!focusedCardSlug) return;
    if (cardViewMode === 'focused') {
      set({ cardViewMode: 'extended' });
    } else if (cardViewMode === 'extended') {
      set({ cardViewMode: 'focused' });
    }
  },

  collapseCard: () => {
    set({ focusedCardSlug: null, cardViewMode: 'collapsed' });
  },

  toggleSidebar: () => {
    set({ sidebarVisible: !get().sidebarVisible });
  },

  toggleKanban: () => {
    set({ kanbanVisible: !get().kanbanVisible });
  },

  switchNepic: (id: string) => {
    if (typeof window !== 'undefined' && window.electronAPI?.switchNepic) {
      window.electronAPI.switchNepic(id);
    }
  },

  setBrowserFilter: (text: string) => {
    set({ browserFilterText: text });
  },

  setBrowserFilterVisible: (visible: boolean) => {
    if (!visible) {
      set({ browserFilterVisible: false, browserFilterText: '' });
    } else {
      set({ browserFilterVisible: true });
    }
  },

  toggleDebugPanel: () => {
    const next = !get().debugPanelCollapsed;
    set({ debugPanelCollapsed: next });
    persistUiState({ debugPanelCollapsed: next, debugPanelTab: get().debugPanelTab });
  },

  setDebugPanelTab: (tab: 'model' | 'filesystem' | 'events') => {
    set({ debugPanelTab: tab });
    persistUiState({ debugPanelCollapsed: get().debugPanelCollapsed, debugPanelTab: tab });
  },

  toggleAgentCollapsed: (agentId: string) => {
    const next = new Set(get().collapsedAgentIds);
    if (next.has(agentId)) {
      next.delete(agentId);
    } else {
      next.add(agentId);
    }
    set({ collapsedAgentIds: next });
    persistUiState({ collapsedAgentIds: Array.from(next) });
  },


  openDiffPanel: (agentId: string) => {
    set({ diffPanelAgentId: agentId, diffPanelSelectedFile: null });
  },

  closeDiffPanel: () => {
    set({ diffPanelAgentId: null, diffPanelSelectedFile: null });
  },

  openMarkdownPanel: (path: string) => {
    const { markdownTabs } = get();
    if (markdownTabs.includes(path)) {
      // Already open — just focus it.
      set({ activeMarkdownTab: path });
    } else {
      set({ markdownTabs: [...markdownTabs, path], activeMarkdownTab: path });
    }
  },

  closeMarkdownTab: (path: string) => {
    const { markdownTabs, activeMarkdownTab } = get();
    const idx = markdownTabs.indexOf(path);
    if (idx < 0) return;
    const nextTabs = markdownTabs.filter((p) => p !== path);
    let nextActive: string | null = activeMarkdownTab;
    if (activeMarkdownTab === path) {
      // Focus the neighbor (preferring the one to the left, then right).
      nextActive = nextTabs[idx - 1] ?? nextTabs[idx] ?? null;
    }
    set({ markdownTabs: nextTabs, activeMarkdownTab: nextActive });
  },

  focusMarkdownTab: (path: string) => {
    const { markdownTabs } = get();
    if (markdownTabs.includes(path)) {
      set({ activeMarkdownTab: path });
    }
  },

  closeAllMarkdownTabs: () => {
    set({ markdownTabs: [], activeMarkdownTab: null });
  },

  setMarkdownDraft: (path: string, content: string) => {
    const { markdownDrafts } = get();
    set({ markdownDrafts: { ...markdownDrafts, [path]: content } });
  },

  discardMarkdownDraft: (path: string) => {
    const { markdownDrafts } = get();
    if (!(path in markdownDrafts)) return;
    const rest = { ...markdownDrafts };
    delete rest[path];
    set({ markdownDrafts: rest });
  },

  selectDiffFile: (path: string | null) => {
    set({ diffPanelSelectedFile: path });
  },

  openActivityPanel: (agentId: string, scope: 'agent' | 'subtree') => {
    set({ activityPanelAgentId: agentId, activityPanelScope: scope });
  },

  closeActivityPanel: () => {
    set({ activityPanelAgentId: null });
  },

  openCostPanel: (agentId: string, scope: 'agent' | 'subtree') => {
    set({ costPanelAgentId: agentId, costPanelScope: scope, costPanelNapkinSlug: null });
  },
  openCostPanelForNapkin: (slug: string) => {
    set({ costPanelAgentId: null, costPanelNapkinSlug: slug });
  },
  closeCostPanel: () => {
    set({ costPanelAgentId: null, costPanelNapkinSlug: null });
  },

  openTimelinePanel: (agentId: string) => {
    set({ timelinePanelAgentId: agentId });
  },
  closeTimelinePanel: () => {
    set({ timelinePanelAgentId: null });
  },

  openRoleEditor: () => set({ roleEditorOpen: true }),
  closeRoleEditor: () => set({ roleEditorOpen: false }),

  openWorkflowSetup: (napkinSlug?: string | null) =>
    set({ workflowSetupOpen: true, workflowSetupTarget: napkinSlug ?? null }),
  closeWorkflowSetup: () => set({ workflowSetupOpen: false, workflowSetupTarget: null }),

  openWorkflowDashboard: () => set({ workflowDashboardOpen: true }),
  closeWorkflowDashboard: () => set({ workflowDashboardOpen: false }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),

  openReplayModal: (originalAgentId: string) => set({ replayModalAgentId: originalAgentId }),
  closeReplayModal: () => set({ replayModalAgentId: null }),

  openWorkflowFromSpec: () => set({ workflowFromSpecOpen: true }),
  closeWorkflowFromSpec: () => set({ workflowFromSpecOpen: false }),
  openAddStageModal: (slug: string) =>
    set({ addStageModalOpen: true, addStageModalNapkinSlug: slug }),
  closeAddStageModal: () =>
    set({ addStageModalOpen: false, addStageModalNapkinSlug: null }),

  setWorkflowRuns: (runs: WorkflowRun[]) => set({ workflowRuns: runs }),
  patchWorkflowRun: (run: WorkflowRun) => {
    const prev = get().workflowRuns;
    const idx = prev.findIndex((r) => r.runId === run.runId);
    let next: WorkflowRun[];
    if (idx === -1) {
      next = [run, ...prev].slice(0, 50);
    } else {
      next = [...prev];
      next[idx] = run;
    }
    // A new running run on a napkin clears its stale flag — they're acting on the change.
    let nextStale = get().staleNapkins;
    if (run.status === 'running' && nextStale[run.napkinSlug]) {
      nextStale = { ...nextStale };
      delete nextStale[run.napkinSlug];
    }
    set({ workflowRuns: next, staleNapkins: nextStale });
  },

  applyContextChange: (event) => {
    // Find napkins whose most recent run used any of the affected workflows.
    const runs = get().workflowRuns;
    const targets = new Map<string, string>(); // napkinSlug → workflowName
    for (const run of runs) {
      if (!event.workflowNames.includes(run.workflowName)) continue;
      // First match wins (runs sorted newest-first when set in registry list)
      if (!targets.has(run.napkinSlug)) {
        targets.set(run.napkinSlug, run.workflowName);
      }
    }
    if (targets.size === 0) return;

    const prev = get().staleNapkins;
    const next = { ...prev };
    for (const [slug, workflowName] of targets) {
      const existing = next[slug];
      const changedFiles = existing
        ? Array.from(new Set([...existing.changedFiles, event.path]))
        : [event.path];
      next[slug] = {
        workflowName,
        changedFiles,
        since: event.ts,
      };
    }
    set({ staleNapkins: next });
  },

  clearStale: (napkinSlug: string) => {
    const prev = get().staleNapkins;
    if (!prev[napkinSlug]) return;
    const next = { ...prev };
    delete next[napkinSlug];
    set({ staleNapkins: next });
  },
}));

// ── UI state persistence helpers ──

function persistUiState(partial: { debugPanelCollapsed?: boolean; debugPanelTab?: string; collapsedAgentIds?: string[] }) {
  if (typeof window !== 'undefined' && window.electronAPI?.saveUiState) {
    window.electronAPI.saveUiState(partial);
  }
}

// Load persisted ui-state on mount
export async function loadPersistedUiState(): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI?.loadUiState) return;
  const state = await window.electronAPI.loadUiState() as Record<string, unknown> | null;
  if (!state) return;
  const updates: Partial<NapStore> = {};
  if (typeof state.debugPanelCollapsed === 'boolean') updates.debugPanelCollapsed = state.debugPanelCollapsed;
  if (state.debugPanelTab === 'model' || state.debugPanelTab === 'filesystem' || state.debugPanelTab === 'events') {
    updates.debugPanelTab = state.debugPanelTab;
  }
  if (Array.isArray(state.collapsedAgentIds)) {
    updates.collapsedAgentIds = new Set(state.collapsedAgentIds.filter((x): x is string => typeof x === 'string'));
  }
  if (Object.keys(updates).length > 0) useNapStore.setState(updates);
}
