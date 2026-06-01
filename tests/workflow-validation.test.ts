import { describe, it, expect } from 'vitest';
import type { AgentStage, OpenPrStage, WorkflowDef } from '../src/shared/bridge-types';
import {
  validateWorkflow,
  validateWorkflowScopeArchitectPlacement,
  validateWorkflowParallelGroups,
} from '../src/shared/workflow-validation';

function agentStage(name: string, role: string, parallelGroup?: number): AgentStage {
  return { name, role, model: null, promptSource: 'template', parallelGroup };
}

function openPr(name: string): OpenPrStage {
  return { kind: 'open-pr', name };
}

function def(stages: WorkflowDef['stages'], scope?: WorkflowDef['scope']): WorkflowDef {
  return { name: 'test', stages, scope };
}

describe('validateWorkflowScopeArchitectPlacement', () => {
  it('returns null when no scope-architect appears as a regular stage', () => {
    expect(
      validateWorkflowScopeArchitectPlacement(
        def([agentStage('010-design', 'test-architect'), agentStage('020-impl', 'fullstack-eng')]),
      ),
    ).toBeNull();
  });

  it('returns null when scope-architect appears in the top-level scope field', () => {
    expect(
      validateWorkflowScopeArchitectPlacement(
        def(
          [agentStage('010-design', 'test-architect')],
          { role: 'scope-architect', model: null },
        ),
      ),
    ).toBeNull();
  });

  it('rejects scope-architect used as a regular stage', () => {
    const result = validateWorkflowScopeArchitectPlacement(
      def([agentStage('001-spec', 'scope-architect'), agentStage('010-design', 'test-architect')]),
    );
    expect(result).not.toBeNull();
    expect(result).toContain('001-spec');
    expect(result).toContain('scope-architect');
    expect(result).toContain('scope');
  });

  it('ignores open-pr stages when scanning for scope-architect misuse', () => {
    expect(
      validateWorkflowScopeArchitectPlacement(
        def([
          agentStage('010-design', 'test-architect'),
          openPr('020-open-pr'),
          agentStage('030-review', 'eng-reviewer'),
        ]),
      ),
    ).toBeNull();
  });
});

describe('validateWorkflow umbrella', () => {
  it('returns the parallel-group error first when both are present', () => {
    // Non-contiguous parallelGroup (1, undefined, 1) → groups error fires
    // before scope-architect placement check.
    const result = validateWorkflow(
      def([
        agentStage('010-a', 'fullstack-eng', 1),
        agentStage('020-b', 'fullstack-eng'),
        agentStage('030-c', 'fullstack-eng', 1),
        agentStage('040-d', 'scope-architect'), // misplacement
      ]),
    );
    expect(result).toContain('parallelGroup 1 appears non-contiguously');
  });

  it('returns scope-architect error when groups are clean', () => {
    const result = validateWorkflow(
      def([agentStage('001-spec', 'scope-architect'), agentStage('010-design', 'test-architect')]),
    );
    expect(result).toContain('scope-architect');
    expect(result).toContain('scope');
  });

  it('returns null for a well-formed workflow', () => {
    expect(
      validateWorkflow(
        def(
          [
            agentStage('010-design', 'test-architect'),
            agentStage('020-impl', 'fullstack-eng'),
            agentStage('030-review-a', 'eng-reviewer', 4),
            agentStage('030-review-b', 'product-reviewer', 4),
          ],
          { role: 'scope-architect', model: null },
        ),
      ),
    ).toBeNull();
  });
});

describe('validateWorkflowParallelGroups (regression)', () => {
  it('returns null when groups are contiguous', () => {
    expect(
      validateWorkflowParallelGroups(
        def([
          agentStage('a', 'r', 1),
          agentStage('b', 'r', 1),
          agentStage('c', 'r'),
          agentStage('d', 'r', 2),
        ]),
      ),
    ).toBeNull();
  });
});
