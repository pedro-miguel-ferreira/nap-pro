// ── PtySpawner interface — injectable for testing ──

export interface SpawnRequest {
  id: string;
  /** Executable name or absolute path. Resolved via PATH when bare. */
  file: string;
  /** Arguments. NOT shell-interpreted — passed directly via execve. */
  args: string[];
  /** Working directory. Empty string falls back to process.cwd() / NAP_CWD. */
  cwd: string;
}

export interface TimelineChunk {
  /** Wall-clock ms when this chunk arrived from the PTY. */
  ts: number;
  data: string;
}

export interface PtySpawner {
  spawn(opts: SpawnRequest): void;
  kill(id: string): void;
  killAll(): void;
  isRunning(id: string): boolean;
  runningCount(): number;
  onExit(id: string, callback: (exitCode: number) => void | Promise<void>): void;
  clearExitHandlers(): void;
  write(id: string, data: string): void;
  getScrollback(id: string): string;
  /** Timestamped PTY output for replay UI. Capped per agent. */
  getScrollbackTimeline(id: string): TimelineChunk[];
  /** SIGSTOP the PTY's process group. No-op if not running. Returns true if signaled. */
  pause(id: string): boolean;
  /** SIGCONT the PTY's process group. No-op if not running. Returns true if signaled. */
  resume(id: string): boolean;
  isPaused(id: string): boolean;
}

// ── FakePtySpawner — records calls, for small tests ──

export class FakePtySpawner implements PtySpawner {
  spawned: SpawnRequest[] = [];
  writes: { id: string; data: string }[] = [];
  pauseCalls: string[] = [];
  resumeCalls: string[] = [];
  private running = new Set<string>();
  private paused = new Set<string>();
  private exitCallbacks = new Map<string, (exitCode: number) => void | Promise<void>>();
  private outputBuffers = new Map<string, string>();
  private spawnTimes = new Map<string, number>();

  spawn(opts: SpawnRequest): void {
    this.spawned.push(opts);
    this.running.add(opts.id);
    this.spawnTimes.set(opts.id, Date.now());
    this.outputBuffers.set(opts.id, '');
  }

  kill(id: string): void {
    if (this.running.has(id)) {
      this.running.delete(id);
      const cb = this.exitCallbacks.get(id);
      if (cb) {
        cb(0);
        this.exitCallbacks.delete(id);
      }
    }
  }

  killAll(): void {
    for (const id of [...this.running]) {
      this.kill(id);
    }
  }

  isRunning(id: string): boolean {
    return this.running.has(id);
  }

  runningCount(): number {
    return this.running.size;
  }

  onExit(id: string, callback: (exitCode: number) => void | Promise<void>): void {
    this.exitCallbacks.set(id, callback);
  }

  clearExitHandlers(): void {
    this.exitCallbacks.clear();
  }

  write(id: string, data: string): void {
    this.writes.push({ id, data });
  }

  getScrollback(id: string): string {
    return this.outputBuffers.get(id) ?? '';
  }

  /** Test-only: simulate a pty exit. Awaitable so disk writes complete. */
  async simulateExit(id: string, exitCode: number): Promise<void> {
    this.running.delete(id);
    const cb = this.exitCallbacks.get(id);
    if (cb) {
      const result = cb(exitCode);
      if (result && typeof (result as Promise<void>).then === 'function') {
        await result;
      }
      this.exitCallbacks.delete(id);
    }
  }

  /** Test-only: inject output data into the buffer */
  simulateOutput(id: string, data: string): void {
    const existing = this.outputBuffers.get(id) ?? '';
    this.outputBuffers.set(id, existing + data);
  }

  /** Get the output buffer for a pty */
  getOutputBuffer(id: string): string {
    return this.outputBuffers.get(id) ?? '';
  }

  /** Get spawn time for a pty */
  getSpawnTime(id: string): number | undefined {
    return this.spawnTimes.get(id);
  }

  /** Check if a spawn was a --resume */
  isResumeCommand(id: string): boolean {
    const entry = this.spawned.find(s => s.id === id);
    return entry ? entry.args.includes('--resume') : false;
  }

  pause(id: string): boolean {
    if (!this.running.has(id)) return false;
    this.pauseCalls.push(id);
    this.paused.add(id);
    return true;
  }

  resume(id: string): boolean {
    if (!this.running.has(id)) return false;
    this.resumeCalls.push(id);
    this.paused.delete(id);
    return true;
  }

  isPaused(id: string): boolean {
    return this.paused.has(id);
  }

  getScrollbackTimeline(_id: string): TimelineChunk[] {
    // Fakes don't track timeline by default — tests can override if needed.
    return [];
  }
}
