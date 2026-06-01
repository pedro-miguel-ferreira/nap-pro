import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { WorkflowDef } from '../shared/bridge-types';

/**
 * Watches every contextFile referenced by saved workflows. Emits an event
 * when any of them changes, naming the file and which workflows reference it.
 *
 * Why polling (fs.watchFile) and not fs.watch:
 *   - reliable across editors that do "atomic save" (write-then-rename) where
 *     fs.watch on the file directly often misses the event
 *   - cross-platform stable
 *   - 1s polling is plenty for "spec doc changed → rerun" UX
 *
 * Lifecycle:
 *   - constructor takes the workflows dir + projectCwd
 *   - call refresh() after the app starts and after every workflow save/delete
 *   - call stop() on app quit
 */

export interface ContextChangeEvent {
  /** Absolute path that changed. */
  path: string;
  /** Workflow names whose definitions reference this path. */
  workflowNames: string[];
  /** Wall-clock timestamp of the change. */
  ts: number;
}

export type ContextChangeListener = (event: ContextChangeEvent) => void;

export class WorkflowWatcher {
  private watched = new Map<string, Set<string>>(); // absPath → workflowNames
  private listeners = new Set<ContextChangeListener>();
  private watchers = new Map<string, () => void>(); // absPath → unwatch fn

  constructor(
    private workflowsDir: string,
    private projectCwd: string,
  ) {}

  onChange(listener: ContextChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Re-scan all workflow JSON files, build the {path → workflowNames} map,
   * and reconcile watchers (add new, drop unused).
   */
  async refresh(): Promise<void> {
    const next = new Map<string, Set<string>>();

    let entries: string[];
    try {
      entries = await fsPromises.readdir(this.workflowsDir);
    } catch {
      // Workflows dir doesn't exist yet — nothing to watch
      this.reconcile(next);
      return;
    }

    for (const file of entries) {
      if (!file.endsWith('.json')) continue;
      const workflowName = file.replace(/\.json$/, '');
      try {
        const text = await fsPromises.readFile(path.join(this.workflowsDir, file), 'utf-8');
        const def = JSON.parse(text) as WorkflowDef;
        for (const rel of def.contextFiles ?? []) {
          if (!rel.trim()) continue;
          const abs = path.resolve(this.projectCwd, rel.trim());
          if (!next.has(abs)) next.set(abs, new Set());
          next.get(abs)!.add(workflowName);
        }
      } catch {
        // Skip malformed workflow files
        continue;
      }
    }

    this.reconcile(next);
  }

  stop(): void {
    for (const unwatch of this.watchers.values()) {
      try {
        unwatch();
      } catch {
        // best-effort
      }
    }
    this.watchers.clear();
    this.watched.clear();
  }

  /** Diff old vs new watch set and add/remove fs watchers. */
  private reconcile(next: Map<string, Set<string>>): void {
    // Remove watchers no longer needed
    for (const oldPath of this.watchers.keys()) {
      if (!next.has(oldPath)) {
        const unwatch = this.watchers.get(oldPath);
        try {
          unwatch?.();
        } catch {
          // best-effort
        }
        this.watchers.delete(oldPath);
      }
    }

    // Add watchers for new paths
    for (const [absPath, _names] of next) {
      if (this.watchers.has(absPath)) continue;
      this.watchers.set(absPath, this.watchPath(absPath));
    }

    this.watched = next;
  }

  private watchPath(absPath: string): () => void {
    const handler = (curr: fs.Stats, prev: fs.Stats): void => {
      // mtime equal & size equal — false alarm (e.g. atime touch)
      if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size) return;
      const names = Array.from(this.watched.get(absPath) ?? []);
      if (names.length === 0) return;
      const event: ContextChangeEvent = {
        path: absPath,
        workflowNames: names,
        ts: Date.now(),
      };
      for (const fn of this.listeners) {
        try {
          fn(event);
        } catch {
          // listener errors don't break the producer
        }
      }
    };
    fs.watchFile(absPath, { interval: 1000, persistent: false }, handler);
    return () => fs.unwatchFile(absPath, handler);
  }
}
