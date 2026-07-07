import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizePosixPath,
  resolveAgentFilePath,
  getAgentCwdFromStore,
} from '../src/renderer/agent-file-open';
import { useNapStore } from '../src/renderer/store';
import type { AgentState, NapkinState } from '../src/shared/bridge-types';

function makeAgent(overrides: Partial<AgentState>): AgentState {
  return {
    id: '',
    name: '',
    role: '',
    nepicId: '',
    napkinId: null,
    parentName: null,
    parentId: null,
    createdAt: 0,
    started: false,
    exited: false,
    running: false,
    paused: false,
    done: false,
    archived: false,
    pendingApproval: null,
    homePath: '',
    entries: [],
    baselineSha: null,
    model: null,
    worktreePath: null,
    replayOfAgentId: null,
    ...overrides,
  };
}

function makeNapkin(overrides: Partial<NapkinState>): NapkinState {
  return {
    id: 'slug',
    slug: 'slug',
    nepicId: '',
    status: 'draft' as NapkinState['status'],
    path: '',
    agents: [],
    entries: [],
    napkinContent: '',
    worktreePath: null,
    ...overrides,
  };
}

describe('normalizePosixPath', () => {
  it('collapses . and .. segments', () => {
    expect(normalizePosixPath('/a/b/../c/./d.md')).toBe('/a/c/d.md');
  });

  it('collapses duplicate slashes', () => {
    expect(normalizePosixPath('/a//b///c.md')).toBe('/a/b/c.md');
  });

  it('leaves a clean absolute path untouched', () => {
    expect(normalizePosixPath('/a/b/c.md')).toBe('/a/b/c.md');
  });

  it('does not escape above root', () => {
    expect(normalizePosixPath('/../../a.md')).toBe('/a.md');
  });
});

describe('resolveAgentFilePath', () => {
  it('passes absolute paths through (normalized)', () => {
    expect(resolveAgentFilePath('/proj/docs/plan.md', '/other')).toBe('/proj/docs/plan.md');
  });

  it('resolves bare relative paths against the cwd', () => {
    expect(resolveAgentFilePath('docs/plan.md', '/proj')).toBe('/proj/docs/plan.md');
  });

  it('resolves ./ paths against the cwd', () => {
    expect(resolveAgentFilePath('./plan.md', '/proj')).toBe('/proj/plan.md');
  });

  it('resolves ../ paths against the cwd', () => {
    expect(resolveAgentFilePath('../sibling/plan.md', '/proj/sub')).toBe('/proj/sibling/plan.md');
  });
});

describe('getAgentCwdFromStore', () => {
  beforeEach(() => {
    useNapStore.setState({
      napkins: [],
      architects: [],
      projectCwd: '/proj',
    });
  });

  it('falls back to projectCwd for unknown or null agent ids', () => {
    expect(getAgentCwdFromStore(null)).toBe('/proj');
    expect(getAgentCwdFromStore('nope')).toBe('/proj');
  });

  it('uses the napkin worktree for a napkin agent', () => {
    useNapStore.setState({
      napkins: [
        makeNapkin({
          slug: 'feat',
          worktreePath: '/proj-worktrees/feat',
          agents: [makeAgent({ id: 'a1', napkinId: 'feat' })],
        }),
      ],
    });
    expect(getAgentCwdFromStore('a1')).toBe('/proj-worktrees/feat');
  });

  it('per-agent worktree override wins over the napkin worktree', () => {
    useNapStore.setState({
      napkins: [
        makeNapkin({
          slug: 'feat',
          worktreePath: '/proj-worktrees/feat',
          agents: [makeAgent({ id: 'a1', napkinId: 'feat', worktreePath: '/proj-worktrees/replay-1' })],
        }),
      ],
    });
    expect(getAgentCwdFromStore('a1')).toBe('/proj-worktrees/replay-1');
  });

  it('napkin agent without any worktree resolves to projectCwd', () => {
    useNapStore.setState({
      napkins: [
        makeNapkin({ slug: 'feat', agents: [makeAgent({ id: 'a1', napkinId: 'feat' })] }),
      ],
    });
    expect(getAgentCwdFromStore('a1')).toBe('/proj');
  });

  it('architects resolve to projectCwd unless they carry a worktree', () => {
    useNapStore.setState({
      architects: [
        makeAgent({ id: 'arch1' }),
        makeAgent({ id: 'arch2', worktreePath: '/proj-worktrees/arch' }),
      ],
    });
    expect(getAgentCwdFromStore('arch1')).toBe('/proj');
    expect(getAgentCwdFromStore('arch2')).toBe('/proj-worktrees/arch');
  });
});
