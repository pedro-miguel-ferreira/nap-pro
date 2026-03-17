#!/usr/bin/env node

import * as net from 'net';
import { NdjsonParser, serialize } from '../shared/ndjson';
import { SOCKET_PATH } from '../shared/constants';

function send(request: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(SOCKET_PATH);

    conn.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        process.stderr.write('nap is not running\n');
        process.exit(1);
      }
      reject(err);
    });

    const parser = new NdjsonParser((msg) => {
      resolve(msg as Record<string, unknown>);
      conn.destroy();
    });

    conn.on('data', (chunk) => parser.feed(chunk.toString()));
    conn.on('connect', () => {
      conn.write(serialize(request));
    });
  });
}

function parseArgs(argv: string[]): {
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
} {
  const command = argv[0] || 'help';
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, args: positional, flags };
}

interface SessionRow {
  id: string;
  name: string;
  status: string;
  parent: string;
  cwd: string;
  uptime: string;
}

function printTable(header: string[], rows: string[][]): void {
  const widths = header.map((h, i) => {
    const colValues = [h, ...rows.map((r) => r[i] || '')];
    return Math.max(...colValues.map((v) => v.length));
  });

  const formatRow = (row: string[]) =>
    row.map((cell, i) => cell.padEnd(widths[i])).join('  ');

  process.stdout.write(formatRow(header) + '\n');
  for (const row of rows) {
    process.stdout.write(formatRow(row) + '\n');
  }
}

async function main(): Promise<void> {
  const { command, args, flags } = parseArgs(process.argv.slice(2));
  let requestId = 1;

  switch (command) {
    case 'start': {
      if (!args[0]) {
        process.stderr.write('Usage: nap start <command> [--name <name>] [--cwd <path>]\n');
        process.exit(1);
      }
      const res = await send({
        type: 'start',
        id: requestId++,
        command: args[0],
        name: flags['name'] || undefined,
        cwd: (flags['cwd'] as string) || process.cwd(),
        parentId: process.env['NAP_SESSION_ID'] || null,
      });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      process.stdout.write(JSON.stringify({ id: res['sessionId'], name: res['name'] }) + '\n');
      break;
    }

    case 'ps': {
      const res = await send({ type: 'ps', id: requestId++ });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      const sessions = res['sessions'] as SessionRow[];

      if (flags['json']) {
        process.stdout.write(JSON.stringify(sessions, null, 2) + '\n');
      } else {
        const header = ['NAME', 'STATUS', 'PARENT', 'CWD', 'UPTIME'];
        const rows = sessions.map((s) => [s.name, s.status, s.parent, s.cwd, s.uptime]);
        printTable(header, rows);
      }
      break;
    }

    case 'peek': {
      if (!args[0]) {
        process.stderr.write('Usage: nap peek <name>\n');
        process.exit(1);
      }
      const res = await send({ type: 'peek', id: requestId++, name: args[0] });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      break;
    }

    case 'kill': {
      if (!args[0]) {
        process.stderr.write('Usage: nap kill <name>\n');
        process.exit(1);
      }
      const res = await send({ type: 'kill', id: requestId++, name: args[0] });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      break;
    }

    case 'close': {
      if (!args[0]) {
        process.stderr.write('Usage: nap close <name>\n');
        process.exit(1);
      }
      const res = await send({ type: 'close', id: requestId++, name: args[0] });
      if (res['error']) {
        process.stderr.write(String(res['message']) + '\n');
        process.exit(1);
      }
      break;
    }

    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      process.stderr.write('Commands: start, ps, peek, kill, close\n');
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write((err.message || String(err)) + '\n');
  process.exit(1);
});
