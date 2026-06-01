import * as pty from 'node-pty';
import type { PtySpawner, SpawnRequest, TimelineChunk } from './pty-spawner';
import { getServerSocketPath } from '../shared/constants';

/**
 * Real PtySpawner wrapping node-pty.
 *
 * Spawns the executable directly via node-pty (no shell). The old `bash -c
 * "claude ..."` pattern was an injection vector via the model id and required
 * brittle quote escaping. Now we pass `file` + `args[]` and let execve handle
 * arg boundaries — no shell interpretation possible.
 *
 * In test mode (NAP_TEST=1), replaces `claude` with `cat` so tests don't need
 * a real Claude Code install.
 */
export class NodePtySpawner implements PtySpawner {
  private processes = new Map<string, pty.IPty>();
  private exitCallbacks = new Map<string, (exitCode: number) => void | Promise<void>>();
  private outputBuffers = new Map<string, string[]>();
  private detectionBuffers = new Map<string, string>(); // ALL output, survives markReady
  private scrollbackBuffers = new Map<string, string>(); // scrollback for nap-pro log (256KB max)
  private timelineChunks = new Map<string, TimelineChunk[]>(); // timestamped chunks for replay
  private readyTerminals = new Set<string>();
  private pausedIds = new Set<string>();
  private dataHandler: ((id: string, data: string) => void) | null = null;
  private exitNotifier: ((id: string, exitCode: number) => void) | null = null;
  private testMode: boolean;

  constructor(testMode = false) {
    this.testMode = testMode;
  }

  /** Set global data handler — called when a ready terminal emits data */
  setDataHandler(handler: (id: string, data: string) => void): void {
    this.dataHandler = handler;
  }

  /** Set global exit notifier — called when any pty exits (for renderer notification) */
  setExitNotifier(handler: (id: string, exitCode: number) => void): void {
    this.exitNotifier = handler;
  }

  spawn(opts: SpawnRequest): void {
    const finalCwd = opts.cwd || process.env['NAP_CWD'] || process.cwd();
    // In test mode, swap `claude` for `cat` so tests don't need claude on PATH.
    // `cat` ignores args, so we drop them too — just echoes whatever's typed.
    const file = this.testMode && opts.file === 'claude' ? 'cat' : opts.file;
    const args = this.testMode && opts.file === 'claude' ? [] : opts.args;

    const proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: finalCwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        NAP_SESSION_ID: opts.id,
        NAP_SOCKET: getServerSocketPath(process.env['NAP_CWD']),
      } as Record<string, string>,
    });

    this.processes.set(opts.id, proc);
    this.outputBuffers.set(opts.id, []);
    this.detectionBuffers.set(opts.id, '');
    this.scrollbackBuffers.set(opts.id, '');
    this.timelineChunks.set(opts.id, []);

    const id = opts.id;
    const MAX_SCROLLBACK = 256 * 1024; // 256KB
    const MAX_TIMELINE_BYTES = 256 * 1024;

    proc.onData((data: string) => {
      // Always capture in detection buffer (survives markReady flush)
      const det = this.detectionBuffers.get(id);
      if (det !== undefined) {
        // Keep last 4KB only — enough for error messages
        const updated = det + data;
        this.detectionBuffers.set(id, updated.length > 4096 ? updated.slice(-4096) : updated);
      }

      // Capture scrollback for nap-pro log
      const sb = this.scrollbackBuffers.get(id);
      if (sb !== undefined) {
        const updated = sb + data;
        this.scrollbackBuffers.set(id, updated.length > MAX_SCROLLBACK ? updated.slice(-MAX_SCROLLBACK) : updated);
      }

      // Capture timestamped chunks for the replay timeline.
      // Cap by total bytes — drop oldest chunks until under budget.
      const chunks = this.timelineChunks.get(id);
      if (chunks) {
        chunks.push({ ts: Date.now(), data });
        let total = 0;
        for (const c of chunks) total += c.data.length;
        while (chunks.length > 0 && total > MAX_TIMELINE_BYTES) {
          const dropped = chunks.shift()!;
          total -= dropped.data.length;
        }
      }

      if (this.readyTerminals.has(id)) {
        this.dataHandler?.(id, data);
      } else {
        const buffer = this.outputBuffers.get(id);
        if (buffer) buffer.push(data);
      }
    });

    proc.onExit(({ exitCode }: { exitCode: number }) => {
      this.processes.delete(id);
      this.outputBuffers.delete(id);
      this.readyTerminals.delete(id);
      this.scrollbackBuffers.delete(id);
      // NOTE: timelineChunks is intentionally NOT deleted here. The replay UI
      // wants to inspect the agent's timeline AFTER it exits. They get GC'd on
      // process restart or on the next agent reset.
      this.pausedIds.delete(id);

      // Coordinator's exit callback (model update) — detection buffer still available
      const cb = this.exitCallbacks.get(id);
      if (cb) {
        cb(exitCode);
        this.exitCallbacks.delete(id);
      }

      // Clean up detection buffer after exit handler has run
      this.detectionBuffers.delete(id);

      // Renderer notification
      this.exitNotifier?.(id, exitCode);
    });
  }

  kill(id: string): void {
    const proc = this.processes.get(id);
    if (proc) {
      proc.kill();
    }
  }

  killAll(): void {
    for (const proc of this.processes.values()) {
      proc.kill();
    }
    this.processes.clear();
    this.outputBuffers.clear();
    this.readyTerminals.clear();
    this.scrollbackBuffers.clear();
    this.timelineChunks.clear();
  }

  isRunning(id: string): boolean {
    return this.processes.has(id);
  }

  runningCount(): number {
    return this.processes.size;
  }

  onExit(id: string, callback: (exitCode: number) => void | Promise<void>): void {
    this.exitCallbacks.set(id, callback);
  }

  clearExitHandlers(): void {
    this.exitCallbacks.clear();
  }

  // ── Extended methods for real pty management ──

  /** Get the output buffer for resume failure detection */
  getOutputBuffer(id: string): string {
    return this.detectionBuffers.get(id) ?? '';
  }

  /** Signal that a terminal is ready to receive data — flushes buffer */
  markReady(id: string): void {
    this.readyTerminals.add(id);
    const buffer = this.outputBuffers.get(id);
    if (buffer) {
      for (const chunk of buffer) {
        this.dataHandler?.(id, chunk);
      }
    }
    this.outputBuffers.delete(id);
  }

  /** Get scrollback buffer for nap-pro log */
  getScrollback(id: string): string {
    return this.scrollbackBuffers.get(id) ?? '';
  }

  /** Timestamped PTY output chunks for the replay timeline. */
  getScrollbackTimeline(id: string): TimelineChunk[] {
    return this.timelineChunks.get(id) ?? [];
  }

  /** Write data to a pty's stdin */
  write(id: string, data: string): void {
    this.processes.get(id)?.write(data);
  }

  /** Resize a pty */
  resize(id: string, cols: number, rows: number): void {
    this.processes.get(id)?.resize(cols, rows);
  }

  /**
   * SIGSTOP the entire process group of the PTY.
   * Negative pid signals the pgid; node-pty puts each child in its own session,
   * so this freezes the shell + claude + any subprocesses atomically.
   */
  pause(id: string): boolean {
    const proc = this.processes.get(id);
    if (!proc) return false;
    if (this.pausedIds.has(id)) return true;
    try {
      process.kill(-proc.pid, 'SIGSTOP');
      this.pausedIds.add(id);
      return true;
    } catch {
      // Fallback: signal just the leader
      try {
        process.kill(proc.pid, 'SIGSTOP');
        this.pausedIds.add(id);
        return true;
      } catch {
        return false;
      }
    }
  }

  /** SIGCONT the process group. */
  resume(id: string): boolean {
    const proc = this.processes.get(id);
    if (!proc) return false;
    if (!this.pausedIds.has(id)) return true;
    try {
      process.kill(-proc.pid, 'SIGCONT');
      this.pausedIds.delete(id);
      return true;
    } catch {
      try {
        process.kill(proc.pid, 'SIGCONT');
        this.pausedIds.delete(id);
        return true;
      } catch {
        return false;
      }
    }
  }

  isPaused(id: string): boolean {
    return this.pausedIds.has(id);
  }
}
