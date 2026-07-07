import { describe, it, expect } from 'vitest';
import { buildOpenPrAgentPrompt } from '../src/main/workflow-runner';

const ARGS = {
  workflowName: 'build-and-review',
  napkinSlug: '0100-full-app-views',
  napkinDocPath: '/proj/.nap/nepics/01-v1/30-napkins/0100-full-app-views/0100-full-app-views.nap.md',
  worktreePath: '/proj-worktrees/0100-full-app-views',
  projectCwd: '/Users/p/src/coda/app-views',
  branch: 'nap-pro/0100-full-app-views',
  baseBranch: 'main',
  prefix: '[Apps]',
  runId: 'abcd1234-5678-90ab-cdef-000000000000',
};

describe('buildOpenPrAgentPrompt', () => {
  const prompt = buildOpenPrAgentPrompt(ARGS);

  it('names the worktree, branch, base, and napkin doc', () => {
    expect(prompt).toContain(ARGS.worktreePath);
    expect(prompt).toContain(ARGS.branch);
    expect(prompt).toContain('--base main');
    expect(prompt).toContain(ARGS.napkinDocPath);
  });

  it('covers the no-origin case with a repo-create fallback named after the project dir', () => {
    expect(prompt).toContain('git remote get-url origin');
    expect(prompt).toContain('gh repo create app-views --private --source=. --remote=origin --push');
  });

  it('instructs committing leftover changes before pushing', () => {
    expect(prompt).toContain('git status');
    expect(prompt.indexOf('git status')).toBeLessThan(prompt.indexOf(`git push -u origin ${ARGS.branch}`));
  });

  it('applies the title prefix and asks for the PR URL / explicit failure report', () => {
    expect(prompt).toContain('--title "[Apps] <descriptive title from the napkin>"');
    expect(prompt).toContain('PR NOT CREATED');
  });

  it('omits the prefix cleanly when empty', () => {
    const noPrefix = buildOpenPrAgentPrompt({ ...ARGS, prefix: '' });
    expect(noPrefix).toContain('--title "<descriptive title from the napkin>"');
  });
});
