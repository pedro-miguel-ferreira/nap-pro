import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { ActivityEvent } from '../shared/bridge-types';

export type { ActivityEvent } from '../shared/bridge-types';

const RING_BUFFER_SIZE = 500;

/**
 * Per-agent activity logger. Events are:
 *   1. Held in an in-memory ring buffer (fast read, bounded)
 *   2. Appended to <homePath>/activity.ndjson (durable)
 *   3. Emitted to listeners (live push to renderer)
 *
 * Disk writes are fire-and-forget — failures are swallowed.
 * The ring buffer is the source of truth for queries; the file is for
 * post-hoc inspection and survives app restart.
 */
export class ActivityLogger {
  private buffers = new Map<string, ActivityEvent[]>(); // agentId → ring buffer
  private listeners = new Set<(event: ActivityEvent) => void>();

  /**
   * Emit a new event. Synchronously updates the ring buffer and notifies
   * listeners; appends to disk in the background.
   */
  emit(event: ActivityEvent, homePath: string): void {
    let buf = this.buffers.get(event.agentId);
    if (!buf) {
      buf = [];
      this.buffers.set(event.agentId, buf);
    }
    buf.push(event);
    if (buf.length > RING_BUFFER_SIZE) {
      buf.splice(0, buf.length - RING_BUFFER_SIZE);
    }

    // Fan out to listeners synchronously
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch {
        // listener errors don't break the producer
      }
    }

    // Persist (best-effort)
    void this.appendToDisk(event, homePath);
  }

  /**
   * Get the ring buffer for an agent, optionally hydrating from disk on first call.
   */
  async getEvents(agentId: string, homePath: string): Promise<ActivityEvent[]> {
    const cached = this.buffers.get(agentId);
    if (cached) return cached;

    // Cold cache — read the tail of activity.ndjson
    const events = await this.readFromDisk(homePath);
    this.buffers.set(agentId, events);
    return events;
  }

  /**
   * Aggregate events from multiple agents (for subtree / global views), sorted by ts.
   */
  async getEventsForMany(
    agents: Array<{ id: string; homePath: string }>,
  ): Promise<ActivityEvent[]> {
    const all: ActivityEvent[] = [];
    for (const agent of agents) {
      const events = await this.getEvents(agent.id, agent.homePath);
      all.push(...events);
    }
    return all.sort((a, b) => a.ts - b.ts);
  }

  onEvent(listener: (event: ActivityEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async appendToDisk(event: ActivityEvent, homePath: string): Promise<void> {
    try {
      const filePath = path.join(homePath, 'activity.ndjson');
      await fsPromises.mkdir(homePath, { recursive: true });
      await fsPromises.appendFile(filePath, JSON.stringify(event) + '\n');
    } catch {
      // best-effort
    }
  }

  private async readFromDisk(homePath: string): Promise<ActivityEvent[]> {
    try {
      const filePath = path.join(homePath, 'activity.ndjson');
      const text = await fsPromises.readFile(filePath, 'utf-8');
      const lines = text.trim().split('\n');
      // Take the last RING_BUFFER_SIZE lines
      const tail = lines.length > RING_BUFFER_SIZE ? lines.slice(-RING_BUFFER_SIZE) : lines;
      const events: ActivityEvent[] = [];
      for (const line of tail) {
        if (!line.trim()) continue;
        try {
          events.push(JSON.parse(line) as ActivityEvent);
        } catch {
          // skip malformed line
        }
      }
      return events;
    } catch {
      return [];
    }
  }
}
