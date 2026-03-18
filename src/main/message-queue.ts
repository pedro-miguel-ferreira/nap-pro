export type PtyWriter = (id: string, data: string) => void;

interface QueueEntry {
  messages: string[];
  delivering: boolean;
}

const queues = new Map<string, QueueEntry>();
const DELIVERY_DELAY_MS = 500;

let writeFn: PtyWriter | null = null;

export function setWriter(fn: PtyWriter): void {
  writeFn = fn;
}

export function enqueue(id: string, message: string): void {
  let entry = queues.get(id);
  if (!entry) {
    entry = { messages: [], delivering: false };
    queues.set(id, entry);
  }
  entry.messages.push(message);
  if (!entry.delivering) {
    deliverNext(id);
  }
}

function deliverNext(id: string): void {
  const entry = queues.get(id);
  if (!entry || entry.messages.length === 0) {
    if (entry) entry.delivering = false;
    return;
  }

  entry.delivering = true;
  const msg = entry.messages.shift()!;

  if (writeFn) {
    writeFn(id, msg + '\n');
  }

  if (entry.messages.length > 0) {
    setTimeout(() => deliverNext(id), DELIVERY_DELAY_MS);
  } else {
    entry.delivering = false;
  }
}

export function clearQueue(id: string): void {
  queues.delete(id);
}
