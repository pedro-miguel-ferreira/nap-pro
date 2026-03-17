import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { NdjsonParser, serialize } from '../shared/ndjson';
import { SOCKET_PATH } from '../shared/constants';

export type RequestHandler = (msg: unknown) => unknown | Promise<unknown>;

let server: net.Server | null = null;

export async function startSocketServer(handler: RequestHandler): Promise<void> {
  // Ensure socket directory exists
  const socketDir = path.dirname(SOCKET_PATH);
  fs.mkdirSync(socketDir, { recursive: true });

  // Handle existing socket file
  if (fs.existsSync(SOCKET_PATH)) {
    const alive = await isSocketAlive(SOCKET_PATH);
    if (alive) {
      throw new Error('Another instance of Nap is already running');
    }
    // Stale socket — remove it
    fs.unlinkSync(SOCKET_PATH);
  }

  server = net.createServer((conn) => {
    const parser = new NdjsonParser(async (msg) => {
      try {
        const res = await handler(msg);
        conn.write(serialize(res));
      } catch (err) {
        const req = msg as { id?: number };
        conn.write(serialize({ id: req.id, error: 'internal', message: String(err) }));
      }
    });

    conn.on('data', (chunk) => parser.feed(chunk.toString()));
    conn.on('error', () => {});
  });

  return new Promise<void>((resolve, reject) => {
    server!.on('error', reject);
    server!.listen(SOCKET_PATH, () => resolve());
  });
}

export function stopSocketServer(): void {
  if (server) {
    server.close();
    server = null;
  }
  try {
    fs.unlinkSync(SOCKET_PATH);
  } catch {
    // Already removed
  }
}

function isSocketAlive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = net.createConnection(socketPath);
    conn.on('connect', () => {
      conn.destroy();
      resolve(true);
    });
    conn.on('error', () => resolve(false));
  });
}
