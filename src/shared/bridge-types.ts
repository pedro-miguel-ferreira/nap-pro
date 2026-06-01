// ── State types shared between main and renderer ──

export type NapkinStatus = 'backlog' | 'todo' | 'doing' | 'review' | 'done' | 'archived';

// ── File tree entry types for focused/extended views ──

export interface FileEntry {
  type: 'file';
  name: string;
  absPath: string;
  isMain?: boolean;  // true for <slug>.nap.md
}

export interface DirEntry {
  type: 'dir';
  name: string;
  absPath: string;
  children: (FileEntry | DirEntry)[];
}

export type Entry = FileEntry | DirEntry;

export interface WatcherEvent {
  timestamp: number;
  event: string;
  filename: string;
}

export interface NepicInfo {
  id: string;
  slug: string;
  name: string;
}

// ── Permission types ──

export interface PendingApproval {
  tool: string;
  command: string;
  timestamp: number;
  payload: object;  // full hook stdin JSON
}

// ── Git change types (slice 3) ──

export type GitStatusCode = 'A' | 'M' | 'D' | 'R' | 'C' | 'U' | '?';

export interface ChangedFile {
  status: GitStatusCode;
  path: string;
  oldPath?: string;
}

// ── Workflow types (slice 6) ──

export type PromptSource = 'template' | 'custom' | 'architect';

/**
 * Stages come in two flavors:
 *   - `agent` (default) — spawns a claude session in the worktree with a role + prompt
 *   - `open-pr` — synthetic stage handled inline by the runner: pushes the worktree
 *     branch and opens a draft PR via `gh pr create`, using the napkin doc as the body.
 *     Place this between the build stages and the reviewer stages so reviewers can
 *     post tagged `gh pr comment`s on a PR that actually exists.
 */
export interface AgentStage {
  /** Defaults to 'agent' when omitted. */
  kind?: 'agent';
  /** Agent name. Suggested format: NNN-role (e.g., 001-test-arch). */
  name: string;
  /** Role file under .nap/00-org/40-roles/ — without .md extension. */
  role: string;
  /** Claude model id; null = let CC choose default. */
  model: string | null;
  /** Where the prompt comes from. */
  promptSource: PromptSource;
  /** Used when promptSource = 'custom'. */
  customPrompt?: string;
  /**
   * Stages with the same parallelGroup number run concurrently.
   * Stages without a group, or with distinct groups, run sequentially.
   * Group N runs after all stages with group < N (or no group, if before) complete.
   */
  parallelGroup?: number;
  /** When true, the workflow's contextFiles are NOT appended to this stage's prompt. */
  skipContext?: boolean;
}

export interface OpenPrStage {
  kind: 'open-pr';
  /** Stage name — shown in the runs dashboard and used as the registry key. */
  name: string;
  /**
   * Title prefix override (e.g. "[Apps]"). Falls back to WorkflowDef.prTitlePrefix
   * if unset, then to empty.
   */
  titlePrefix?: string;
  /** Same semantics as on AgentStage. */
  parallelGroup?: number;
}

export type WorkflowStage = AgentStage | OpenPrStage;

export interface WorkflowScopeStage {
  /** Role file to use — defaults to scope-architect. */
  role: string;
  /** Override model id for the scope agent. */
  model?: string | null;
  /**
   * Optional override for the scope agent's prompt body. The runner appends
   * the spec doc list, workitem name, and napkin path automatically — this
   * field is for any extra project-specific instructions.
   */
  prompt?: string;
}

export interface WorkflowDef {
  name: string;
  description?: string;
  stages: WorkflowStage[];
  /** Whether to auto-create a napkin worktree before launching. Defaults to true. */
  useWorktree?: boolean;
  /** Branch to fork the worktree from. Defaults to the repo's default branch. */
  baseBranch?: string;
  /**
   * Where to create worktrees for napkins. Resolved as:
   *   - empty / undefined → `<projectCwd>-worktrees/` (default, sibling of project)
   *   - absolute path → used as-is
   *   - `~`-prefixed → home-expanded
   *   - relative path → resolved against projectCwd
   *
   * The runner appends `/<napkin-slug>` to whatever you set here. The base dir
   * is created if missing.
   */
  worktreeBaseDir?: string;
  /**
   * Reference docs (paths relative to the project root) appended to every
   * stage's prompt.md as a "Reference docs" section, unless the stage opts out.
   */
  contextFiles?: string[];
  /**
   * Legacy fallback: if no `open-pr` stage exists in `stages`, the runner will
   * — at the end — hand off a "please open the PR" message to the architect.
   * Prefer adding an `open-pr` stage at the right place in `stages` instead;
   * that runs deterministically (no LLM in the loop) and gives reviewer stages
   * a real PR to comment on.
   */
  createPr?: boolean;
  /**
   * When true (the default), the runner auto-inserts a synthetic `open-pr`
   * stage right before the first reviewer stage (roles ending in `-reviewer`)
   * if the workflow doesn't already have one. Set to `false` to opt out and
   * rely on explicit `kind: 'open-pr'` placement.
   *
   * Has no effect when the workflow already contains an explicit `open-pr`
   * stage — explicit placement always wins.
   */
  autoOpenPrBeforeReviewers?: boolean;
  /** Optional prefix for the PR title, e.g. "[Apps]". Trimmed and joined with a space. */
  prTitlePrefix?: string;
  /**
   * When set + the workflow is invoked from a spec (no pre-existing napkin),
   * this stage runs first. Its job is to read the spec docs and create the
   * napkin's scaffolding (.nap.md, .spec.md, .stories.md). Subsequent stages
   * read from those files. Skipped when the workflow is run on an existing
   * napkin via right-click → Run workflow.
   */
  scope?: WorkflowScopeStage;
}

export interface BranchInfo {
  name: string;
  remote: boolean;
  remoteName?: string;
  current: boolean;
}

// ── Workflow run tracking (slice 10) ──

export type WorkflowRunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkflowStageRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'awaiting-architect'
  | 'cancelled';

export interface WorkflowStageRun {
  name: string;
  role: string;
  model: string | null;
  status: WorkflowStageRunStatus;
  /** Set once the stage's agent is created. */
  agentId?: string;
  startedAt?: number;
  endedAt?: number;
  /** Index into the workflow's group ordering — same number = parallel siblings. */
  groupIndex: number;
}

export interface WorkflowRun {
  /** Unique per launch (workflow can be re-run on the same napkin → new id). */
  runId: string;
  workflowName: string;
  napkinSlug: string;
  startedAt: number;
  endedAt?: number;
  status: WorkflowRunStatus;
  stages: WorkflowStageRun[];
  /** Set when the run failed or was cancelled. */
  message?: string;
}

// ── Cost types (slice 7) ──

export interface AgentCostSummary {
  agentId: string;
  agentName: string;
  sessionId: string;
  model: string | null;
  tokens: { input: number; output: number; cacheWrite: number; cacheRead: number };
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  messageCount: number;
}

export interface CostQueryResult {
  perAgent: AgentCostSummary[];
  total: {
    tokens: { input: number; output: number; cacheWrite: number; cacheRead: number };
    totalTokens: number;
    costUsd: number;
    messageCount: number;
  };
}

// ── Stage stats (slice 14) ──

export interface StageStatsSampleRun {
  napkinSlug: string | null;
  agentName: string;
  model: string | null;
  status: 'completed' | 'failed' | 'in-progress';
  durationMs?: number;
  costUsd: number;
  ts: number;
}

export interface StageStats {
  count: number;
  completedCount: number;
  failedCount: number;
  inProgressCount: number;
  passRate: number | null;
  medianDurationMs: number | null;
  medianCostUsd: number | null;
  recent: StageStatsSampleRun[];
}

// ── Replay timeline (slice 12) ──

export interface TimelineChunk {
  ts: number;
  data: string;
}

export interface TimelineSnapshot {
  agentId: string;
  agentName: string;
  /** Wall-clock ms — defaults to first chunk or first event ts. */
  startedAt: number;
  /** Wall-clock ms — null while running. */
  endedAt: number | null;
  /** Whether the agent is still producing data. */
  running: boolean;
  events: ActivityEvent[];
  chunks: TimelineChunk[];
}

// ── Activity stream types (slice 4) ──

export type ActivityType =
  | 'started'
  | 'paused'
  | 'resumed'
  | 'exited'
  | 'archived'
  | 'done'
  | 'permission-requested'
  | 'permission-allowed'
  | 'permission-denied';

export interface ActivityEvent {
  ts: number;
  type: ActivityType;
  agentId: string;
  agentName: string;
  text: string;
  data?: Record<string, unknown>;
}

// ── Core state types ──

export interface AgentState {
  id: string;              // cc_session_uuid — THE identity
  name: string;
  role: string;
  nepicId: string;
  napkinId: string | null; // null for architects
  parentName: string | null;
  parentId: string | null;
  createdAt: number;
  started: boolean;
  exited: boolean;
  running: boolean;        // ephemeral — pty currently alive
  paused: boolean;         // ephemeral — pty alive but SIGSTOPed
  done: boolean;           // ephemeral — called nap done
  archived: boolean;       // imported or dead session — needs successor
  pendingApproval: PendingApproval | null;  // ephemeral — permission request waiting
  homePath: string;
  entries: Entry[];        // home dir files for focused/extended views
  baselineSha: string | null; // git HEAD captured when the agent started; basis for "files changed"
  model: string | null; // claude model id (e.g. claude-opus-4-7) — null = CC default
  /**
   * Per-agent worktree override. When set, this agent runs in its own git
   * worktree (e.g., a stage replay). When null, it inherits the napkin's
   * worktree (or runs in the project root if neither is set).
   */
  worktreePath: string | null;
  /** When this agent is a replay, the id of the agent being replayed. */
  replayOfAgentId: string | null;
}

export interface NapkinState {
  id: string;              // = slug
  slug: string;
  nepicId: string;
  status: NapkinStatus;
  path: string;
  agents: AgentState[];
  entries: Entry[];        // napkin dir files for focused/extended views
  napkinContent: string;   // raw .nap.md text
  worktreePath: string | null; // optional git worktree where this napkin's agents run
}

// ── Bridge protocol ──

export interface AppSnapshot {
  napkins: NapkinState[];
  architects: AgentState[];
  activeNepicId: string;
  nepics: NepicInfo[];
  watcherEvents?: WatcherEvent[];
}

export type AppIntent =
  | { type: 'setActiveTerminal'; id: string };
