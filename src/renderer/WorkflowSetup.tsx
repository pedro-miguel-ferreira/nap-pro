import React, { useEffect, useState, useCallback } from 'react';
import { useNapStore } from './store';
import type { AgentStage, OpenPrStage, WorkflowDef, WorkflowStage, PromptSource, BranchInfo, StageStats } from '../shared/bridge-types';

const NAME_RE = /^[a-z0-9_-]+$/i;

const MODELS: Array<{ id: string; label: string }> = [
  { id: '', label: 'default (CC chooses)' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

const PROMPT_SOURCES: Array<{ id: PromptSource; label: string; help: string }> = [
  { id: 'template', label: 'role template', help: 'use the role file as the prompt' },
  { id: 'custom', label: 'custom', help: 'paste your own prompt' },
  { id: 'architect', label: 'architect decides', help: 'pause for architect to write prompt.md' },
];

/**
 * What the runner writes when `promptSource: 'template'` — mirrored here so
 * we can pre-fill the custom textarea when the user flips to 'custom' on a
 * stage they haven't customized yet. `<home>` / `<napkin-dir>` etc. are
 * placeholders the user can leave or edit; the runner substitutes real
 * values at spawn time only on the 'template' path, so under 'custom' the
 * placeholders are literal — the user should edit them or remove them.
 */
function templatePromptSeed(role: string): string {
  return `Read your role: \`.nap/00-org/40-roles/${role}.md\` — every line matters.

Read the rest of \`.nap/00-org/\` — promise, workflow, structure.

## Napkin

- Slug: \`<napkin-slug>\`
- Dir: \`<napkin-dir>\`

Scaffolding files (read whichever apply to your role):
- \`<napkin-dir>/<slug>.nap.md\`
- \`<napkin-dir>/<slug>.spec.md\`
- \`<napkin-dir>/<slug>.stories.md\`
- \`<napkin-dir>/<slug>.design.md\` (if present)
- \`<napkin-dir>/<slug>.test.md\` (if present)

Your home dir is \`<home>\`. Write your response to \`<home>/response.md\`.

[Replace this paragraph with your custom instructions. The runner appends
 the standard "CRITICAL: nap-pro done" footer automatically — you don't
 need to repeat it.]
`;
}

function emptyStage(idx: number): WorkflowStage {
  return {
    name: `${String(idx + 1).padStart(3, '0')}-stage`,
    role: 'fs-eng',
    model: null,
    promptSource: 'template',
  };
}

export function WorkflowSetup() {
  const open = useNapStore((s) => s.workflowSetupOpen);
  const target = useNapStore((s) => s.workflowSetupTarget);
  const close = useNapStore((s) => s.closeWorkflowSetup);

  const [workflows, setWorkflows] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkflowDef | null>(null);
  const [originalDraft, setOriginalDraft] = useState<string>('');
  const [creatingName, setCreatingName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const dirty = draft ? JSON.stringify(draft) !== originalDraft : false;

  const refreshLists = useCallback(async () => {
    const [wf, rl, br] = await Promise.all([
      window.electronAPI?.listWorkflows?.(),
      window.electronAPI?.listRoles?.(),
      window.electronAPI?.listGitBranches?.(),
    ]);
    setWorkflows(wf?.workflows ?? []);
    setRoles(rl?.roles ?? []);
    setBranches(br?.branches ?? []);
    setDefaultBranch(br?.defaultBranch ?? null);
  }, []);

  useEffect(() => {
    if (open) {
      refreshLists();
    } else {
      setSelected(null);
      setDraft(null);
      setOriginalDraft('');
      setCreatingName(null);
      setStatus(null);
    }
  }, [open, refreshLists]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selected) {
        setDraft(null);
        setOriginalDraft('');
        return;
      }
      setBusy(true);
      try {
        const res = await window.electronAPI?.readWorkflow?.(selected);
        if (!cancelled && res?.workflow) {
          setDraft(res.workflow);
          setOriginalDraft(JSON.stringify(res.workflow));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (dirty) {
          // eslint-disable-next-line no-alert
          if (!window.confirm('Discard unsaved changes?')) return;
        }
        close();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, close, dirty]);

  if (!open) return null;

  async function save(): Promise<void> {
    if (!selected || !draft) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await window.electronAPI?.saveWorkflow?.(selected, draft);
      if (res?.ok) {
        setOriginalDraft(JSON.stringify(draft));
        setStatus({ kind: 'ok', text: 'Saved' });
      } else {
        setStatus({ kind: 'err', text: res?.message || 'Save failed' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function startCreating(name: string): Promise<void> {
    if (!NAME_RE.test(name)) {
      setStatus({ kind: 'err', text: 'Name must be alphanumeric (with - or _)' });
      return;
    }
    if (workflows.includes(name)) {
      setStatus({ kind: 'err', text: `Workflow "${name}" already exists` });
      return;
    }
    const initial: WorkflowDef = {
      name,
      description: '',
      useWorktree: true,
      stages: [emptyStage(0)],
    };
    setBusy(true);
    setStatus(null);
    try {
      const res = await window.electronAPI?.saveWorkflow?.(name, initial);
      if (res?.ok) {
        await refreshLists();
        setSelected(name);
        setCreatingName(null);
      } else {
        setStatus({ kind: 'err', text: res?.message || 'Create failed' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteWorkflow(): Promise<void> {
    if (!selected) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete workflow "${selected}"?`)) return;
    setBusy(true);
    try {
      const res = await window.electronAPI?.deleteWorkflow?.(selected);
      if (res?.ok) {
        await refreshLists();
        setSelected(null);
        setStatus({ kind: 'ok', text: 'Deleted' });
      } else {
        setStatus({ kind: 'err', text: res?.message || 'Delete failed' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function runOnTarget(): Promise<void> {
    if (!selected || !target) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await window.electronAPI?.runWorkflow?.(selected, target);
      if (res?.ok) {
        setStatus({ kind: 'ok', text: `Running "${selected}" on ${target}` });
        setTimeout(close, 600);
      } else {
        setStatus({ kind: 'err', text: res?.message || 'Run failed' });
      }
    } finally {
      setBusy(false);
    }
  }

  // Each row knows its own stage kind and produces a fully-typed replacement,
  // so we side-step the Partial<discriminated-union> merge problem entirely.
  function updateStage(idx: number, fn: (s: WorkflowStage) => WorkflowStage): void {
    if (!draft) return;
    setDraft({ ...draft, stages: draft.stages.map((s, i) => (i === idx ? fn(s) : s)) });
  }

  function addStage(): void {
    if (!draft) return;
    setDraft({ ...draft, stages: [...draft.stages, emptyStage(draft.stages.length)] });
  }

  function addOpenPrStage(): void {
    if (!draft) return;
    const idx = draft.stages.length;
    const newStage: OpenPrStage = {
      kind: 'open-pr',
      name: `${String(idx + 1).padStart(3, '0')}-open-pr`,
    };
    setDraft({ ...draft, stages: [...draft.stages, newStage] });
  }

  function removeStage(idx: number): void {
    if (!draft) return;
    setDraft({ ...draft, stages: draft.stages.filter((_, i) => i !== idx) });
  }

  function moveStage(idx: number, dir: -1 | 1): void {
    if (!draft) return;
    const target = idx + dir;
    if (target < 0 || target >= draft.stages.length) return;
    const next = [...draft.stages];
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft({ ...draft, stages: next });
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (dirty) {
            // eslint-disable-next-line no-alert
            if (!window.confirm('Discard unsaved changes?')) return;
          }
          close();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 950,
      }}
    >
      <div
        style={{
          width: '90%',
          maxWidth: 1200,
          height: '85%',
          maxHeight: 900,
          background: '#1e1e1e',
          border: '1px solid #3c3c3c',
          borderRadius: 6,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
          fontSize: 13,
          color: '#cccccc',
          overflow: 'hidden',
        }}
      >
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
            {target ? `Run workflow on ${target}` : 'Workflows'}
          </span>
          <span style={{ color: '#6b7280', fontSize: 11 }}>.nap/workflows/</span>
          <span style={{ flex: 1 }} />
          {status && (
            <span style={{ fontSize: 11, color: status.kind === 'ok' ? '#22c55e' : '#ef4444' }}>
              {status.text}
            </span>
          )}
          <button onClick={close} style={btnStyle} title="Close (Esc)">
            ✕
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* List */}
          <div
            style={{
              width: 220,
              borderRight: '1px solid #3c3c3c',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {workflows.length === 0 ? (
                <div style={{ padding: 16, color: '#6b7280', fontSize: 12 }}>
                  No workflows yet.
                </div>
              ) : (
                workflows.map((w) => (
                  <div
                    key={w}
                    onClick={() => {
                      if (dirty) {
                        // eslint-disable-next-line no-alert
                        if (!window.confirm('Discard unsaved changes?')) return;
                      }
                      setSelected(w);
                      setStatus(null);
                    }}
                    style={{
                      padding: '6px 12px',
                      cursor: 'pointer',
                      background: selected === w ? '#37373d' : 'transparent',
                      borderLeft: selected === w ? '2px solid #007acc' : '2px solid transparent',
                      color: selected === w ? '#e5e5e5' : '#cccccc',
                    }}
                    onMouseEnter={(e) => {
                      if (selected !== w) e.currentTarget.style.background = '#2a2d2e';
                    }}
                    onMouseLeave={(e) => {
                      if (selected !== w) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {w}
                  </div>
                ))
              )}
            </div>
            <div style={{ borderTop: '1px solid #3c3c3c', padding: 10 }}>
              {creatingName !== null ? (
                <>
                  <input
                    autoFocus
                    type="text"
                    value={creatingName}
                    onChange={(e) => setCreatingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') startCreating(creatingName.trim());
                      if (e.key === 'Escape') setCreatingName(null);
                    }}
                    placeholder="workflow-name"
                    style={inputStyle}
                  />
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button
                      onClick={() => startCreating(creatingName.trim())}
                      disabled={busy || !creatingName.trim()}
                      style={{ ...btnStyle, flex: 1, height: 24, width: 'auto' }}
                    >
                      Create
                    </button>
                    <button
                      onClick={() => setCreatingName(null)}
                      style={{ ...btnStyle, flex: 1, height: 24, width: 'auto' }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setCreatingName('')}
                  style={{ ...btnStyle, width: '100%' }}
                >
                  + New Workflow
                </button>
              )}
            </div>
          </div>

          {/* Editor */}
          <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            {!selected || !draft ? (
              <div style={{ padding: 24, color: '#6b7280', fontSize: 12 }}>
                {target
                  ? `Pick a workflow to run on ${target}, or create a new one.`
                  : 'Pick a workflow to edit, or create a new one.'}
              </div>
            ) : (
              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ color: '#e5e5e5', fontSize: 14 }}>{selected}</span>
                  {dirty && (
                    <span style={{ color: '#f59e0b', fontSize: 11 }}>● modified</span>
                  )}
                  <span style={{ flex: 1 }} />
                  {target ? (
                    <button
                      onClick={runOnTarget}
                      disabled={busy || dirty}
                      style={{
                        ...btnStyle,
                        width: 'auto',
                        padding: '0 14px',
                        borderColor: '#22c55e',
                        color: '#86efac',
                      }}
                      title={dirty ? 'Save changes first' : `Run on ${target}`}
                    >
                      Run on {target}
                    </button>
                  ) : null}
                  <button
                    onClick={save}
                    disabled={!dirty || busy}
                    style={{
                      ...btnStyle,
                      width: 'auto',
                      padding: '0 12px',
                      borderColor: dirty ? '#007acc' : '#3c3c3c',
                      color: dirty ? '#7dd3fc' : '#6b7280',
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={deleteWorkflow}
                    style={{ ...btnStyle, width: 'auto', padding: '0 12px', color: '#ef4444' }}
                  >
                    Delete
                  </button>
                </div>

                <label style={labelStyle}>Description</label>
                <input
                  type="text"
                  value={draft.description ?? ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="What this workflow does"
                  style={{ ...inputStyle, width: '100%', marginBottom: 12 }}
                />

                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={draft.useWorktree ?? true}
                    onChange={(e) => setDraft({ ...draft, useWorktree: e.target.checked })}
                    style={{ margin: 0 }}
                  />
                  <span>Auto-create per-napkin worktree before running</span>
                </label>

                {(draft.useWorktree ?? true) && (
                  <>
                    <div style={{ marginTop: 10 }}>
                      <label style={labelStyle}>
                        Base branch
                        {defaultBranch && (
                          <span style={{ textTransform: 'none', letterSpacing: 0, color: '#6b7280', marginLeft: 6 }}>
                            (default: {defaultBranch})
                          </span>
                        )}
                      </label>
                      <select
                        value={draft.baseBranch ?? ''}
                        onChange={(e) =>
                          setDraft({ ...draft, baseBranch: e.target.value || undefined })
                        }
                        style={{ ...selectStyle, width: 320 }}
                      >
                        <option value="">— use repo default —</option>
                        {branches.map((b) => (
                          <option key={`${b.remote ? 'r' : 'l'}-${b.name}`} value={b.name}>
                            {b.name}
                            {b.remote ? '  (remote)' : ''}
                            {b.current ? '  ★' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <label style={labelStyle}>
                        Worktree base dir
                        <span style={{ textTransform: 'none', letterSpacing: 0, color: '#6b7280', marginLeft: 6 }}>
                          (default: {'<project>-worktrees/'} sibling)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={draft.worktreeBaseDir ?? ''}
                        onChange={(e) =>
                          setDraft({ ...draft, worktreeBaseDir: e.target.value || undefined })
                        }
                        placeholder="absolute, ~/path, or project-relative — leave blank for default"
                        style={{ ...inputStyle, width: 480 }}
                        title="Where to create worktrees for this workflow's runs. Napkin slug is appended."
                      />
                    </div>
                  </>
                )}

                <label
                  style={{
                    ...labelStyle,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    marginTop: 10,
                  }}
                  title="When stages complete, the architect (if running) is prompted to push the branch and open a draft PR."
                >
                  <input
                    type="checkbox"
                    checked={!!draft.createPr}
                    onChange={(e) =>
                      setDraft({ ...draft, createPr: e.target.checked || undefined })
                    }
                    style={{ margin: 0 }}
                  />
                  <span>Architect opens a draft PR when the workflow completes</span>
                </label>

                {draft.createPr && (
                  <div style={{ marginTop: 6, marginLeft: 22 }}>
                    <label style={labelStyle}>PR title prefix (optional)</label>
                    <input
                      type="text"
                      value={draft.prTitlePrefix ?? ''}
                      onChange={(e) =>
                        setDraft({ ...draft, prTitlePrefix: e.target.value || undefined })
                      }
                      placeholder="[Apps]"
                      style={{ ...inputStyle, width: 240 }}
                    />
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Reference docs (one path per line)</label>
                  <textarea
                    value={(draft.contextFiles ?? []).join('\n')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        contextFiles: e.target.value
                          .split('\n')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder={`docs/specs/xpto.md\ndocs/architecture/overview.md`}
                    rows={4}
                    style={{
                      ...inputStyle,
                      width: '100%',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  />
                  <div style={{ color: '#6b7280', fontSize: 10, marginTop: 4 }}>
                    Appended to every stage's prompt.md (paths resolved against project root). Use the per-stage opt-out below to skip.
                  </div>
                </div>

                <div style={{ height: 1, background: '#3c3c3c', margin: '14px 0' }} />

                <label
                  style={{
                    ...labelStyle,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                  title="When the workflow is launched from a spec doc (no pre-existing napkin), this stage runs first to populate the napkin's scaffolding."
                >
                  <input
                    type="checkbox"
                    checked={!!draft.scope}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        scope: e.target.checked
                          ? { role: draft.scope?.role || 'scope-architect', model: draft.scope?.model ?? null }
                          : undefined,
                      })
                    }
                    style={{ margin: 0 }}
                  />
                  <span>Scope stage (runs first when launched from spec)</span>
                </label>

                {draft.scope && (
                  <div style={{ marginTop: 6, marginLeft: 22, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Role</label>
                    <select
                      value={draft.scope.role}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          scope: { ...draft.scope!, role: e.target.value },
                        })
                      }
                      style={{ ...selectStyle, width: 220 }}
                    >
                      {roles.length === 0 && <option value={draft.scope.role}>{draft.scope.role}</option>}
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <label style={{ ...labelStyle, marginBottom: 0, marginLeft: 8 }}>Model</label>
                    <select
                      value={draft.scope.model ?? ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          scope: { ...draft.scope!, model: e.target.value || null },
                        })
                      }
                      style={{ ...selectStyle, width: 200 }}
                    >
                      <option value="">default</option>
                      <option value="claude-opus-4-7">Opus 4.7</option>
                      <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                      <option value="claude-haiku-4-5">Haiku 4.5</option>
                    </select>
                  </div>
                )}

                <div style={{ height: 1, background: '#3c3c3c', margin: '14px 0' }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: '#e5e5e5' }}>Stages</span>
                  <span style={{ color: '#6b7280', fontSize: 11 }}>
                    {draft.stages.length} · run sequentially unless grouped
                  </span>
                </div>

                {draft.stages.map((stage, idx) => (
                  <StageRow
                    key={idx}
                    stage={stage}
                    idx={idx}
                    total={draft.stages.length}
                    roles={roles}
                    update={(fn) => updateStage(idx, fn)}
                    onRemove={() => removeStage(idx)}
                    onMoveUp={() => moveStage(idx, -1)}
                    onMoveDown={() => moveStage(idx, 1)}
                  />
                ))}

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    onClick={addStage}
                    style={{ ...btnStyle, width: 'auto', padding: '0 14px' }}
                  >
                    + Add Stage
                  </button>
                  <button
                    onClick={addOpenPrStage}
                    style={{ ...btnStyle, width: 'auto', padding: '0 14px', borderColor: '#22c55e', color: '#86efac' }}
                    title="Adds a synthetic open-pr stage. Place it between build stages and reviewer stages."
                  >
                    + Add open-PR Stage
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StageRow(props: {
  stage: WorkflowStage;
  idx: number;
  total: number;
  roles: string[];
  update: (fn: (s: WorkflowStage) => WorkflowStage) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  if (props.stage.kind === 'open-pr') {
    return <OpenPrStageRow {...props} stage={props.stage} />;
  }
  return <AgentStageRow {...props} stage={props.stage} />;
}

function OpenPrStageRow({
  stage,
  idx,
  total,
  update,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  stage: OpenPrStage;
  idx: number;
  total: number;
  update: (fn: (s: WorkflowStage) => WorkflowStage) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  // Narrowed merger — guarantees we return an OpenPrStage with the patch applied.
  const onChange = (patch: Partial<OpenPrStage>): void =>
    update((s) => (s.kind === 'open-pr' ? { ...s, ...patch } : s));
  return (
    <div
      style={{
        border: '1px solid #3c3c3c',
        borderRadius: 4,
        padding: 10,
        marginBottom: 8,
        background: '#1e2a1e',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ color: '#6b7280', fontSize: 11, minWidth: 30 }}>#{idx + 1}</span>
        <input
          type="text"
          value={stage.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="stage name (e.g. 035-open-pr)"
          style={{ ...inputStyle, flex: 1 }}
        />
        <span
          style={{
            fontSize: 10,
            padding: '2px 6px',
            background: '#22c55e22',
            color: '#86efac',
            borderRadius: 3,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
          title="Synthetic stage — runner does git push + gh pr create inline (no LLM)."
        >
          open-pr
        </span>
        <button onClick={onMoveUp} disabled={idx === 0} style={{ ...btnStyle }} title="Move up">↑</button>
        <button onClick={onMoveDown} disabled={idx === total - 1} style={{ ...btnStyle }} title="Move down">↓</button>
        <button onClick={onRemove} style={{ ...btnStyle, color: '#ef4444' }} title="Remove">✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={labelStyle}>title prefix (optional)</label>
          <input
            type="text"
            value={stage.titlePrefix ?? ''}
            onChange={(e) => onChange({ titlePrefix: e.target.value || undefined })}
            placeholder="defaults to workflow.prTitlePrefix"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>parallel group</label>
          <input
            type="number"
            value={stage.parallelGroup ?? ''}
            onChange={(e) =>
              onChange({ parallelGroup: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="(none)"
            style={inputStyle}
            title="Usually leave blank — open-pr should run as its own gate before reviewers"
          />
        </div>
      </div>
    </div>
  );
}

function AgentStageRow({
  stage,
  idx,
  total,
  roles,
  update,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  stage: AgentStage;
  idx: number;
  total: number;
  roles: string[];
  update: (fn: (s: WorkflowStage) => WorkflowStage) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const onChange = (patch: Partial<AgentStage>): void =>
    update((s) => (s.kind === 'open-pr' ? s : { ...s, ...patch }));
  return (
    <div
      style={{
        border: '1px solid #3c3c3c',
        borderRadius: 4,
        padding: 10,
        marginBottom: 8,
        background: '#252526',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ color: '#6b7280', fontSize: 11, minWidth: 30 }}>#{idx + 1}</span>
        <input
          type="text"
          value={stage.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="agent name (e.g. 001-test-arch)"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={onMoveUp} disabled={idx === 0} style={{ ...btnStyle }} title="Move up">
          ↑
        </button>
        <button onClick={onMoveDown} disabled={idx === total - 1} style={{ ...btnStyle }} title="Move down">
          ↓
        </button>
        <button onClick={onRemove} style={{ ...btnStyle, color: '#ef4444' }} title="Remove">
          ✕
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <label style={labelStyle}>role</label>
          <select
            value={stage.role}
            onChange={(e) => onChange({ role: e.target.value })}
            style={selectStyle}
          >
            {roles.length === 0 && <option value={stage.role}>{stage.role}</option>}
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>model</label>
          <select
            value={stage.model ?? ''}
            onChange={(e) => onChange({ model: e.target.value || null })}
            style={selectStyle}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>parallel group</label>
          <input
            type="number"
            value={stage.parallelGroup ?? ''}
            onChange={(e) =>
              onChange({
                parallelGroup: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="(none)"
            style={inputStyle}
            title="Stages with the same number run together"
          />
        </div>
      </div>

      <label style={labelStyle}>prompt</label>
      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
        {PROMPT_SOURCES.map((p) => (
          <label
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              fontSize: 11,
              color: stage.promptSource === p.id ? '#cccccc' : '#9ca3af',
            }}
            title={p.help}
          >
            <input
              type="radio"
              checked={stage.promptSource === p.id}
              onChange={() => {
                const patch: Partial<AgentStage> = { promptSource: p.id };
                // Switching INTO 'custom' with no existing text? Seed the
                // textarea with what the runner would have written for the
                // 'template' path, so the user can edit one line instead of
                // starting from scratch. Already-typed customPrompt is left
                // alone — we never clobber user input.
                if (p.id === 'custom' && !stage.customPrompt) {
                  patch.customPrompt = templatePromptSeed(stage.role);
                }
                onChange(patch);
              }}
              style={{ margin: 0 }}
            />
            {p.label}
          </label>
        ))}
      </div>
      {stage.promptSource === 'custom' && (
        <textarea
          value={stage.customPrompt ?? ''}
          onChange={(e) => onChange({ customPrompt: e.target.value })}
          placeholder="Custom prompt sent to the agent on start..."
          rows={4}
          style={{
            ...inputStyle,
            width: '100%',
            resize: 'vertical',
            fontFamily: 'inherit',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        />
      )}

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 8,
          fontSize: 11,
          color: '#9ca3af',
          cursor: 'pointer',
        }}
        title="When checked, the workflow's reference docs are NOT appended to this stage's prompt"
      >
        <input
          type="checkbox"
          checked={!!stage.skipContext}
          onChange={(e) => onChange({ skipContext: e.target.checked || undefined })}
          style={{ margin: 0 }}
        />
        skip workflow reference docs for this stage
      </label>

      <StageStatsLine stageName={stage.name} role={stage.role} />
    </div>
  );
}

function formatDurationShort(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function formatCostShort(usd: number | null): string {
  if (usd === null) return '—';
  if (usd < 0.0001) return '<$0.0001';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function StageStatsLine({ stageName, role }: { stageName: string; role: string }) {
  const [stats, setStats] = useState<StageStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stageName.trim() || !role.trim() || !window.electronAPI?.getStageStats) {
      setStats(null);
      return;
    }
    let cancelled = false;
    // Debounce — name/role changes mid-edit; wait for them to settle.
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await window.electronAPI!.getStageStats!(stageName, role);
        if (!cancelled) setStats(res.stats);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [stageName, role]);

  if (!stats) {
    return (
      <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280' }}>
        {loading ? 'Loading history…' : ''}
      </div>
    );
  }
  if (stats.count === 0) {
    return (
      <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280' }}>
        No past runs of <span style={{ color: '#9cdcfe' }}>{stageName}</span> as <span style={{ color: '#fbbf24' }}>{role}</span>.
      </div>
    );
  }

  const passPct = stats.passRate === null ? null : Math.round(stats.passRate * 100);
  const passColor =
    passPct === null
      ? '#9ca3af'
      : passPct >= 80
        ? '#22c55e'
        : passPct >= 50
          ? '#fbbf24'
          : '#ef4444';

  return (
    <div
      style={{
        marginTop: 8,
        fontSize: 10,
        color: '#9ca3af',
        display: 'flex',
        gap: 12,
        alignItems: 'baseline',
        fontVariantNumeric: 'tabular-nums',
      }}
      title={`${stats.completedCount} completed, ${stats.failedCount} failed, ${stats.inProgressCount} in-progress out of ${stats.count}`}
    >
      <span style={{ color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        history
      </span>
      <span>{stats.count} runs</span>
      <span style={{ color: '#3c3c3c' }}>·</span>
      {passPct !== null ? (
        <span style={{ color: passColor }}>{passPct}% pass</span>
      ) : (
        <span style={{ color: '#6b7280' }}>no terminal samples</span>
      )}
      <span style={{ color: '#3c3c3c' }}>·</span>
      <span>~{formatDurationShort(stats.medianDurationMs)}</span>
      <span style={{ color: '#3c3c3c' }}>·</span>
      <span>~{formatCostShort(stats.medianCostUsd)}</span>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #3c3c3c',
  color: '#cccccc',
  borderRadius: 3,
  height: 26,
  width: 26,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  background: '#1e1e1e',
  border: '1px solid #3c3c3c',
  color: '#cccccc',
  borderRadius: 3,
  padding: '4px 6px',
  fontFamily: 'inherit',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'auto',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 2,
};
