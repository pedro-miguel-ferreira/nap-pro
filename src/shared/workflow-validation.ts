import type { WorkflowDef } from './bridge-types';

/**
 * Run all save-time validators in order, returning the first error or null.
 * Keeps the save handler trivial — no manual chaining of validators here.
 */
export function validateWorkflow(def: WorkflowDef): string | null {
  return (
    validateWorkflowParallelGroups(def) ??
    validateWorkflowScopeArchitectPlacement(def)
  );
}

/**
 * `scope-architect` is special: it only does useful work when the runner has
 * injected a source spec into its prompt (the "Run workflow from spec…" flow,
 * which routes through the workflow's top-level `scope:` field). As a regular
 * stage, scope-architect spawns with the standard template prompt — no source
 * listed — and correctly refuses to fabricate scope, blocking the entire
 * workflow.
 *
 * Reject the misplacement at save time so the user fixes it before running
 * (and before paying for the spawned LLM session that's about to block).
 *
 * Returns `null` when the def is valid, or an error string.
 */
export function validateWorkflowScopeArchitectPlacement(def: WorkflowDef): string | null {
  for (const stage of def.stages) {
    if (stage.kind === 'open-pr') continue;
    if (stage.role === 'scope-architect') {
      return (
        `Stage "${stage.name}" uses role "scope-architect" as a regular stage. ` +
        `scope-architect only works when launched from spec via the workflow's ` +
        `top-level \`scope\` field — there the runner injects the source spec doc ` +
        `into its prompt. As a regular stage it has no source and blocks the ` +
        `workflow. Move it: remove this stage and set ` +
        `\`"scope": { "role": "scope-architect", "model": <…> }\` on the workflow.`
      );
    }
  }
  return null;
}

/**
 * The runner groups stages by walking the list once and merging *consecutive*
 * stages with the same parallelGroup number. So `[g=1, no-group, g=1]` becomes
 * three serial singletons — almost certainly not what the user intended.
 *
 * Reject this at save time with a clear message rather than silently
 * miscompiling at run time.
 *
 * Returns `null` when the def is valid, or an error string.
 */
export function validateWorkflowParallelGroups(def: WorkflowDef): string | null {
  const seenAndClosed = new Set<number>();
  let currentGroup: number | undefined;

  for (const stage of def.stages) {
    if (stage.parallelGroup === undefined) {
      // Singleton — closes any open group
      if (currentGroup !== undefined) {
        seenAndClosed.add(currentGroup);
        currentGroup = undefined;
      }
      continue;
    }
    if (stage.parallelGroup === currentGroup) {
      // Same as current group — continuation, fine
      continue;
    }
    // Switching to a different (or first) group
    if (seenAndClosed.has(stage.parallelGroup)) {
      return (
        `parallelGroup ${stage.parallelGroup} appears non-contiguously ` +
        `(stage "${stage.name}"). Groups must be contiguous — reorder stages so ` +
        `all members of the same group are adjacent.`
      );
    }
    if (currentGroup !== undefined) {
      seenAndClosed.add(currentGroup);
    }
    currentGroup = stage.parallelGroup;
  }
  return null;
}
