import { describe, it, expect } from 'vitest';
import type { WorkflowDef } from '../src/shared/bridge-types';
import { applyProjectConfigCascade } from '../src/main/workflow-runner';

function baseDef(overrides: Partial<WorkflowDef> = {}): WorkflowDef {
  return {
    name: 'test',
    stages: [],
    ...overrides,
  };
}

describe('applyProjectConfigCascade', () => {
  it('fills blank workflow fields from the project config', () => {
    const def = baseDef(); // prTitlePrefix + worktreeBaseDir both undefined
    applyProjectConfigCascade(def, {
      prTitlePrefix: '[Apps]',
      worktreeBaseDir: '~/coda-worktrees',
    });
    expect(def.prTitlePrefix).toBe('[Apps]');
    expect(def.worktreeBaseDir).toBe('~/coda-worktrees');
  });

  it('preserves workflow values when both workflow and project config set them', () => {
    const def = baseDef({
      prTitlePrefix: '[Workflow Wins]',
      worktreeBaseDir: '/explicit/path',
    });
    applyProjectConfigCascade(def, {
      prTitlePrefix: '[Project Default]',
      worktreeBaseDir: '/default/path',
    });
    expect(def.prTitlePrefix).toBe('[Workflow Wins]');
    expect(def.worktreeBaseDir).toBe('/explicit/path');
  });

  it('preserves an explicit empty string in the workflow (opt-out)', () => {
    // The user might want to ship a PR with no prefix from a workflow even
    // when the project has a default — `""` is the opt-out signal.
    const def = baseDef({ prTitlePrefix: '' });
    applyProjectConfigCascade(def, { prTitlePrefix: '[Project Default]' });
    expect(def.prTitlePrefix).toBe('');
  });

  it('preserves an explicit empty string for worktreeBaseDir too', () => {
    const def = baseDef({ worktreeBaseDir: '' });
    applyProjectConfigCascade(def, { worktreeBaseDir: '/default' });
    expect(def.worktreeBaseDir).toBe('');
  });

  it('is a no-op when the project config is empty', () => {
    const def = baseDef({ prTitlePrefix: '[X]' });
    applyProjectConfigCascade(def, {});
    expect(def.prTitlePrefix).toBe('[X]');
    expect(def.worktreeBaseDir).toBeUndefined();
  });

  it('is a no-op when both are empty', () => {
    const def = baseDef();
    applyProjectConfigCascade(def, {});
    expect(def.prTitlePrefix).toBeUndefined();
    expect(def.worktreeBaseDir).toBeUndefined();
  });

  it('only touches the fields it knows about', () => {
    const def = baseDef({ baseBranch: 'main', createPr: true });
    applyProjectConfigCascade(def, {
      prTitlePrefix: '[X]',
      worktreeBaseDir: '/wt',
      defaultWorkflow: 'feature-from-spec',
    });
    expect(def.baseBranch).toBe('main');
    expect(def.createPr).toBe(true);
    // defaultWorkflow is consumed by UI, not the runner — the cascade leaves
    // it alone (it's not a WorkflowDef field).
  });
});
