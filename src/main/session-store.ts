import { randomUUID } from 'crypto';

export interface Session {
  id: string;
  name: string;
  status: 'running' | 'exited' | 'done';
  command?: string;
  cwd: string;
  parentId: string | null;
  createdAt: number;
  doneMessage?: string;
}

let agentCounter = 0;
const sessions = new Map<string, Session>();

export function createSession(opts: {
  id?: string;
  command?: string;
  name?: string;
  cwd: string;
  parentId?: string | null;
}): Session {
  const id = opts.id || randomUUID();
  const name = opts.name || `agent-${++agentCounter}`;
  const session: Session = {
    id,
    name,
    status: 'running',
    command: opts.command,
    cwd: opts.cwd,
    parentId: opts.parentId ?? null,
    createdAt: Date.now(),
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function getAllSessions(): Session[] {
  return Array.from(sessions.values());
}

export function setSessionStatus(id: string, status: Session['status']): void {
  const s = sessions.get(id);
  if (s) s.status = status;
}

export function removeSession(id: string): void {
  sessions.delete(id);
}
