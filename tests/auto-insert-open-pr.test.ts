import { describe, it, expect } from 'vitest';
import type { AgentStage, OpenPrStage, WorkflowStage } from '../src/shared/bridge-types';
import { autoInsertOpenPrStage } from '../src/main/workflow-runner';

function agent(name: string, role: string, parallelGroup?: number): AgentStage {
  return { name, role, model: null, promptSource: 'template', parallelGroup };
}

function openPr(name: string): OpenPrStage {
  return { kind: 'open-pr', name };
}

describe('autoInsertOpenPrStage', () => {
  it('returns input unchanged when no reviewer stages exist', () => {
    const stages: WorkflowStage[] = [agent('010-design', 'architect'), agent('020-impl', 'fullstack-eng')];
    const result = autoInsertOpenPrStage(stages, undefined);
    expect(result).toBe(stages);
    expect(result.length).toBe(2);
  });

  it('inserts a synthetic open-pr right before the first reviewer when one is missing', () => {
    const stages: WorkflowStage[] = [
      agent('010-design', 'architect'),
      agent('020-impl', 'fullstack-eng'),
      agent('030-test-impl', 'test-eng'),
      agent('040-eng-review', 'eng-reviewer', 4),
      agent('040-product-review', 'product-reviewer', 4),
    ];
    const result = autoInsertOpenPrStage(stages, undefined);
    expect(result.length).toBe(6);
    expect(result[3].kind).toBe('open-pr');
    expect(result[3].name).toBe('035-open-pr');
    expect(result[4].name).toBe('040-eng-review');
  });

  it('respects autoOpenPrBeforeReviewers: false (opt-out)', () => {
    const stages: WorkflowStage[] = [
      agent('020-impl', 'fullstack-eng'),
      agent('040-eng-review', 'eng-reviewer'),
    ];
    const result = autoInsertOpenPrStage(stages, false);
    expect(result).toBe(stages);
  });

  it('does NOT insert when an explicit open-pr stage already exists', () => {
    const stages: WorkflowStage[] = [
      agent('020-impl', 'fullstack-eng'),
      openPr('025-open-pr'),
      agent('040-eng-review', 'eng-reviewer'),
    ];
    const result = autoInsertOpenPrStage(stages, undefined);
    expect(result).toBe(stages);
    expect(result.filter((s) => s.kind === 'open-pr').length).toBe(1);
  });

  it('falls back to "auto-open-pr" name when the surrounding ordinals are tight', () => {
    const stages: WorkflowStage[] = [
      agent('001-design', 'architect'),
      agent('002-review', 'eng-reviewer'),
    ];
    const result = autoInsertOpenPrStage(stages, undefined);
    expect(result.length).toBe(3);
    expect(result[1].kind).toBe('open-pr');
    expect(result[1].name).toBe('auto-open-pr');
  });

  it('handles a reviewer as the very first stage (no prior ordinal)', () => {
    const stages: WorkflowStage[] = [agent('010-eng-review', 'eng-reviewer')];
    const result = autoInsertOpenPrStage(stages, undefined);
    expect(result.length).toBe(2);
    expect(result[0].kind).toBe('open-pr');
    expect(result[0].name).toBe('005-open-pr');
  });
});
