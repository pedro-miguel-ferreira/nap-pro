import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkflowRegistry } from '../src/main/workflow-registry';
import type { WorkflowDef } from '../src/shared/bridge-types';

const DEF: WorkflowDef = {
  name: 'build',
  stages: [
    { name: '010-design', role: 'designer', model: null, promptSource: 'template' },
    { name: '020-code', role: 'fullstack-eng', model: null, promptSource: 'template' },
    { name: '030-open-pr', role: 'open-pr', model: null, promptSource: 'custom' },
  ],
};

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-registry-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function readRunFile(runId: string): any {
  return JSON.parse(fs.readFileSync(path.join(dir, `${runId}.json`), 'utf-8'));
}

describe('WorkflowRegistry persistence', () => {
  it('persists a run through its lifecycle', async () => {
    const registry = new WorkflowRegistry({ persistDir: dir });
    const entry = registry.start('build', 'my-napkin', DEF);
    const runId = entry.run.runId;

    registry.markStageStart(runId, '010-design', 'agent-1');
    registry.markStageEnd(runId, '010-design', 'completed');
    registry.complete(runId, 'completed');
    await registry.flushPersistence();

    const persisted = readRunFile(runId);
    expect(persisted.run.status).toBe('completed');
    expect(persisted.run.stages[0].status).toBe('completed');
    expect(persisted.def.name).toBe('build');
  });

  it('records the failure message on the persisted stage', async () => {
    const registry = new WorkflowRegistry({ persistDir: dir });
    const entry = registry.start('build', 'my-napkin', DEF);
    registry.markStageStart(entry.run.runId, '010-design', 'agent-1');
    registry.markStageEnd(entry.run.runId, '010-design', 'failed', 'agent exited without done');
    registry.complete(entry.run.runId, 'failed', 'stage(s) failed');
    await registry.flushPersistence();

    const persisted = readRunFile(entry.run.runId);
    expect(persisted.run.stages[0].message).toBe('agent exited without done');
    expect(persisted.run.message).toBe('stage(s) failed');
  });
});

describe('WorkflowRegistry loadFromDisk', () => {
  it('flips runs that died mid-flight to interrupted with running stages reset', async () => {
    const first = new WorkflowRegistry({ persistDir: dir });
    const entry = first.start('build', 'my-napkin', DEF, { fromSpec: { specDocs: ['/a.md'], workItemName: 'wi' } });
    const runId = entry.run.runId;
    first.markStageStart(runId, '010-design', 'agent-1');
    first.markStageEnd(runId, '010-design', 'completed');
    first.markStageStart(runId, '020-code', 'agent-2');
    await first.flushPersistence();
    // app "dies" here — no complete()

    const second = new WorkflowRegistry({ persistDir: dir });
    await second.loadFromDisk();
    const runs = second.list();
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('interrupted');
    expect(runs[0].stages.find((s) => s.name === '010-design')?.status).toBe('completed');
    expect(runs[0].stages.find((s) => s.name === '020-code')?.status).toBe('pending');
  });

  it('loads completed runs into history untouched and skips corrupt files', async () => {
    const first = new WorkflowRegistry({ persistDir: dir });
    const entry = first.start('build', 'my-napkin', DEF);
    first.complete(entry.run.runId, 'completed');
    await first.flushPersistence();
    fs.writeFileSync(path.join(dir, 'garbage.json'), 'not json');

    const second = new WorkflowRegistry({ persistDir: dir });
    await second.loadFromDisk();
    expect(second.list()).toHaveLength(1);
    expect(second.list()[0].status).toBe('completed');
  });
});

describe('WorkflowRegistry reactivate', () => {
  async function makeInterrupted(): Promise<{ registry: WorkflowRegistry; runId: string }> {
    const first = new WorkflowRegistry({ persistDir: dir });
    const entry = first.start('build', 'my-napkin', DEF, { fromSpec: { specDocs: ['/a.md'], workItemName: 'wi' } });
    first.markStageStart(entry.run.runId, '010-design', 'agent-1');
    first.markStageEnd(entry.run.runId, '010-design', 'completed');
    first.markStageStart(entry.run.runId, '020-code', 'agent-2');
    await first.flushPersistence();
    const second = new WorkflowRegistry({ persistDir: dir });
    await second.loadFromDisk();
    return { registry: second, runId: entry.run.runId };
  }

  it('revives an interrupted run with completed stages preserved', async () => {
    const { registry, runId } = await makeInterrupted();
    const revived = registry.reactivate(runId);
    expect(revived).not.toBeNull();
    expect(revived!.completedStages).toEqual(new Set(['010-design']));
    expect(revived!.def.name).toBe('build');
    expect(revived!.fromSpec?.workItemName).toBe('wi');
    expect(revived!.entry.run.status).toBe('running');
    expect(registry.getEntry(runId)).not.toBeNull();
    // No longer in history
    expect(registry.list().filter((r) => r.runId === runId)).toHaveLength(1);
  });

  it('refuses to reactivate completed or active runs', async () => {
    const registry = new WorkflowRegistry({ persistDir: dir });
    const entry = registry.start('build', 'n', DEF);
    expect(registry.reactivate(entry.run.runId)).toBeNull(); // still active
    registry.complete(entry.run.runId, 'completed');
    expect(registry.reactivate(entry.run.runId)).toBeNull(); // completed
  });

  it('reactivates a failed run (retry path)', async () => {
    const registry = new WorkflowRegistry({ persistDir: dir });
    const entry = registry.start('build', 'n', DEF);
    registry.markStageStart(entry.run.runId, '010-design', 'a1');
    registry.markStageEnd(entry.run.runId, '010-design', 'failed', 'boom');
    registry.complete(entry.run.runId, 'failed');
    const revived = registry.reactivate(entry.run.runId);
    expect(revived).not.toBeNull();
    const design = revived!.entry.run.stages.find((s) => s.name === '010-design');
    expect(design?.status).toBe('pending');
    expect(design?.message).toBeUndefined();
  });
});

describe('WorkflowRegistry markStageStalled', () => {
  it('toggles running↔stalled and leaves terminal states alone', () => {
    const registry = new WorkflowRegistry();
    const entry = registry.start('build', 'n', DEF);
    const runId = entry.run.runId;
    registry.markStageStart(runId, '010-design', 'a1');

    registry.markStageStalled(runId, '010-design', true);
    expect(entry.run.stages[0].status).toBe('stalled');
    registry.markStageStalled(runId, '010-design', false);
    expect(entry.run.stages[0].status).toBe('running');

    registry.markStageEnd(runId, '010-design', 'completed');
    registry.markStageStalled(runId, '010-design', true);
    expect(entry.run.stages[0].status).toBe('completed');
  });
});
