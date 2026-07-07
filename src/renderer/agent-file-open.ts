import type { Terminal } from '@xterm/xterm';
import { createFileLinkProvider } from './file-link-provider';
import { useNapStore } from './store';

/**
 * Shared "open a file the agent mentioned" logic — used by both terminal
 * creation paths (index.tsx effect + Terminal.tsx on-demand) and by
 * LinkifiedText in the ActivityPanel, so every surface routes clicks the
 * same way: `.md` files open in the in-app MarkdownPanel split view,
 * everything else is revealed via the OS (`openFilePath` IPC).
 *
 * Relative paths are resolved against the agent's effective cwd — the same
 * chain main.ts uses to spawn the pty (agent worktree → napkin worktree →
 * project root) — so a link like `docs/plan.md` printed by an agent working
 * in a worktree opens the file in *that* worktree.
 */

/** Collapse `.` / `..` segments and duplicate slashes in an absolute posix path. */
export function normalizePosixPath(p: string): string {
  const segments = p.split('/');
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }
  return '/' + resolved.join('/');
}

/** Resolve a raw path (as printed in agent output) against a cwd. Pure — testable. */
export function resolveAgentFilePath(raw: string, cwd: string): string {
  if (raw.startsWith('/')) return normalizePosixPath(raw);
  return normalizePosixPath(`${cwd}/${raw}`);
}

/**
 * Effective cwd for resolving an agent's relative file mentions. Mirrors
 * main.ts model.getAgentCwd(): per-agent worktree wins, then the napkin's
 * worktree, then the project root.
 */
export function getAgentCwdFromStore(agentId: string | null): string {
  const state = useNapStore.getState();
  if (agentId) {
    for (const napkin of state.napkins) {
      const agent = napkin.agents.find((a) => a.id === agentId);
      if (agent) {
        return agent.worktreePath ?? napkin.worktreePath ?? state.projectCwd;
      }
    }
    const architect = state.architects.find((a) => a.id === agentId);
    if (architect?.worktreePath) return architect.worktreePath;
  }
  return state.projectCwd;
}

/** Route an already-absolute path: `.md` → in-app viewer, else OS reveal. */
export function openResolvedFilePath(absolutePath: string): void {
  const normalized = normalizePosixPath(absolutePath);
  if (normalized.toLowerCase().endsWith('.md')) {
    useNapStore.getState().openMarkdownPanel(normalized);
  } else {
    window.electronAPI?.openFilePath(normalized);
  }
}

/** Resolve a raw (possibly relative) path in an agent's context, then open it. */
export function openAgentFilePath(agentId: string | null, rawPath: string): void {
  const cwd = getAgentCwdFromStore(agentId);
  openResolvedFilePath(resolveAgentFilePath(rawPath, cwd));
}

/**
 * Register the file-link provider on an agent's terminal with proper
 * cwd resolution + `.md` routing. The single wiring point for both
 * terminal creation paths.
 */
export function registerAgentFileLinks(terminal: Terminal, agentId: string): void {
  terminal.registerLinkProvider(
    createFileLinkProvider(
      terminal,
      () => getAgentCwdFromStore(agentId),
      openResolvedFilePath,
    ),
  );
}
