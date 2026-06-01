import React, { useEffect, useState } from 'react';
import { useNapStore } from './store';

const SLUG_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * "Run workflow from spec…" — entry point for the spec-driven flow.
 *
 * Asks for: which workflow, what to call the workitem, where the spec docs
 * live, and what slug to use. Creates a fresh napkin and runs the workflow's
 * scope stage first to populate the napkin's .nap.md / .spec.md / .stories.md.
 */
export function WorkflowFromSpecModal() {
  const open = useNapStore((s) => s.workflowFromSpecOpen);
  const close = useNapStore((s) => s.closeWorkflowFromSpec);
  const napkins = useNapStore((s) => s.napkins);
  const openWorkflowDashboard = useNapStore((s) => s.openWorkflowDashboard);

  const [workflows, setWorkflows] = useState<string[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('');
  const [workItemName, setWorkItemName] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [specDocsRaw, setSpecDocsRaw] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggest the next slug — find the highest existing 4-digit prefix and add 100.
  function suggestSlug(workItem: string): string {
    const slugPart = workItem
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-') || 'workitem';

    let maxPrefix = 0;
    for (const n of napkins) {
      const m = n.slug.match(/^(\d{4})/);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxPrefix) maxPrefix = num;
      }
    }
    const next = maxPrefix === 0 ? 100 : maxPrefix + 100;
    return `${String(next).padStart(4, '0')}-${slugPart}`;
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    (async () => {
      const res = await window.electronAPI?.listWorkflows?.();
      const ws = res?.workflows ?? [];
      setWorkflows(ws);
      // Auto-pick the first workflow (or keep current selection if still valid)
      setSelectedWorkflow((cur) => (cur && ws.includes(cur) ? cur : ws[0] ?? ''));
    })();
  }, [open]);

  // Re-suggest the slug when the workitem name changes (only if user hasn't manually edited)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  useEffect(() => {
    if (!slugManuallyEdited && workItemName.trim()) {
      setSlug(suggestSlug(workItemName));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workItemName, slugManuallyEdited]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, close]);

  if (!open) return null;

  async function submit(): Promise<void> {
    setError(null);
    if (!selectedWorkflow) {
      setError('Pick a workflow.');
      return;
    }
    if (!workItemName.trim()) {
      setError('Workitem name is required.');
      return;
    }
    if (!slug.trim() || !SLUG_RE.test(slug.trim())) {
      setError('Slug must be alphanumeric (with - or _ or .).');
      return;
    }
    if (napkins.find((n) => n.slug === slug.trim())) {
      setError(`Napkin "${slug}" already exists. Pick a different slug.`);
      return;
    }
    const specDocs = specDocsRaw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (specDocs.length === 0) {
      setError('At least one spec doc path is required (one per line).');
      return;
    }

    setBusy(true);
    try {
      const res = await window.electronAPI?.runWorkflowFromSpec?.({
        workflowName: selectedWorkflow,
        napkinSlug: slug.trim(),
        workItemName: workItemName.trim(),
        specDocs,
      });
      if (res?.ok) {
        openWorkflowDashboard();
        close();
      } else {
        setError(res?.message || 'failed to start');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
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
          width: 600,
          maxWidth: '90%',
          background: '#1e1e1e',
          border: '1px solid #3c3c3c',
          borderRadius: 6,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          padding: 20,
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
          fontSize: 13,
          color: '#cccccc',
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <span style={{ color: '#e5e5e5', fontWeight: 600, fontSize: 14 }}>
            Run workflow from spec
          </span>
        </div>
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
          Creates a fresh napkin, then runs the workflow's <strong>scope stage</strong> to read the
          spec docs and write the napkin's framing files. The scope agent will then{' '}
          <strong>pause and check in with you in its terminal</strong> — review the files, give
          feedback, and reply <code>ship it</code> when you're happy. Only then do the downstream
          stages spawn.
        </p>

        <label style={labelStyle}>Workflow</label>
        <select
          value={selectedWorkflow}
          onChange={(e) => setSelectedWorkflow(e.target.value)}
          style={{ ...inputStyle, marginBottom: 12 }}
        >
          {workflows.length === 0 ? (
            <option value="">— no workflows defined; create one first —</option>
          ) : (
            workflows.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))
          )}
        </select>

        <label style={labelStyle}>Workitem name</label>
        <input
          type="text"
          value={workItemName}
          onChange={(e) => setWorkItemName(e.target.value)}
          placeholder='e.g. "P2 — Clone-time integration" or "auth-refactor"'
          style={{ ...inputStyle, marginBottom: 12 }}
        />

        <label style={labelStyle}>
          Napkin slug{' '}
          <span style={{ color: '#6b7280', textTransform: 'none', letterSpacing: 0 }}>
            (auto-suggested from workitem name; edit if needed)
          </span>
        </label>
        <input
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugManuallyEdited(true);
          }}
          placeholder="0200-clone-integration"
          style={{ ...inputStyle, marginBottom: 12 }}
        />

        <label style={labelStyle}>Spec docs (one path per line, project-relative or absolute)</label>
        <textarea
          value={specDocsRaw}
          onChange={(e) => setSpecDocsRaw(e.target.value)}
          placeholder={`docs/specs/coda-apps-registry/01-spec.md\ndocs/specs/coda-apps-registry/02-architecture.md`}
          rows={5}
          style={{
            ...inputStyle,
            width: '100%',
            resize: 'vertical',
            fontFamily: 'inherit',
            fontSize: 12,
            lineHeight: 1.5,
            marginBottom: 8,
          }}
        />

        {error && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 8 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={close} style={{ ...btnStyle, width: 'auto', padding: '0 16px' }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || workflows.length === 0}
            style={{
              ...btnStyle,
              width: 'auto',
              padding: '0 16px',
              borderColor: '#22c55e',
              color: '#86efac',
            }}
          >
            {busy ? 'Starting…' : 'Run'}
          </button>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #3c3c3c',
  color: '#cccccc',
  borderRadius: 3,
  height: 28,
  width: 28,
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 2,
};
