import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Per-million-token rates in USD. Approximate; intended for "good enough"
 * cost attribution, not invoicing. Update as Anthropic publishes new rates.
 */
const RATES = {
  'claude-opus-4-7':   { in: 15.0, out: 75.0, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-sonnet-4-6': { in: 3.0,  out: 15.0, cacheWrite: 3.75,  cacheRead: 0.30 },
  'claude-haiku-4-5':  { in: 1.0,  out: 5.0,  cacheWrite: 1.25,  cacheRead: 0.10 },
} as const;

const DEFAULT_RATE = RATES['claude-sonnet-4-6'];

export interface TokenCounts {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface AgentCostSummary {
  agentId: string;
  agentName: string;
  /** Empty string if no log was found. */
  sessionId: string;
  /** Most-frequent model in the log; null if no usage events. */
  model: string | null;
  tokens: TokenCounts;
  /** Total tokens across all categories — useful as a single number. */
  totalTokens: number;
  costUsd: number;
  /** ms between first and last usage-bearing event in the log. */
  durationMs: number;
  /** Number of assistant messages with usage data. */
  messageCount: number;
}

/**
 * CC encodes the cwd as the project dir name in ~/.claude/projects/ by replacing
 * `/` with `-` and prepending a `-`. Example:
 *   /Users/x/proj-a → -Users-x-proj-a
 */
function encodeCwd(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

/**
 * Compute cost summary for a single agent. Returns zero-cost summary if no log
 * was found or it had no usage events.
 */
export async function getAgentCost(
  agentId: string,
  agentName: string,
  agentCwd: string,
): Promise<AgentCostSummary> {
  const empty: AgentCostSummary = {
    agentId,
    agentName,
    sessionId: '',
    model: null,
    tokens: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
    totalTokens: 0,
    costUsd: 0,
    durationMs: 0,
    messageCount: 0,
  };

  if (!agentCwd) return empty;

  const logPath = path.join(
    os.homedir(),
    '.claude',
    'projects',
    encodeCwd(agentCwd),
    `${agentId}.jsonl`,
  );

  let text: string;
  try {
    text = await fsPromises.readFile(logPath, 'utf-8');
  } catch {
    return empty;
  }

  const tokens: TokenCounts = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  let costUsd = 0;
  const seenMessageIds = new Set<string>();
  const modelCounts = new Map<string, number>();
  let firstTs: number | null = null;
  let lastTs: number | null = null;
  let messageCount = 0;

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const usage = entry?.message?.usage;
    if (!usage) continue;

    // Dedupe by message id — the same assistant message can appear multiple times
    // in the log (streaming chunks logged separately).
    const msgId = entry?.message?.id as string | undefined;
    if (msgId) {
      if (seenMessageIds.has(msgId)) continue;
      seenMessageIds.add(msgId);
    }

    const model = (entry?.message?.model as string | undefined) ?? 'unknown';
    modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1);

    const rate = RATES[model as keyof typeof RATES] ?? DEFAULT_RATE;

    const inT = Number(usage.input_tokens ?? 0);
    const outT = Number(usage.output_tokens ?? 0);
    const cwT = Number(usage.cache_creation_input_tokens ?? 0);
    const crT = Number(usage.cache_read_input_tokens ?? 0);

    tokens.input += inT;
    tokens.output += outT;
    tokens.cacheWrite += cwT;
    tokens.cacheRead += crT;

    costUsd +=
      (inT * rate.in +
        outT * rate.out +
        cwT * rate.cacheWrite +
        crT * rate.cacheRead) /
      1_000_000;

    messageCount += 1;

    const ts = entry?.timestamp ? Date.parse(entry.timestamp) : NaN;
    if (!Number.isNaN(ts)) {
      if (firstTs === null || ts < firstTs) firstTs = ts;
      if (lastTs === null || ts > lastTs) lastTs = ts;
    }
  }

  // Pick most-frequent model
  let dominantModel: string | null = null;
  let maxCount = 0;
  for (const [m, c] of modelCounts) {
    if (c > maxCount) {
      maxCount = c;
      dominantModel = m;
    }
  }

  return {
    agentId,
    agentName,
    sessionId: agentId, // session id IS the agent id in our setup
    model: dominantModel,
    tokens,
    totalTokens: tokens.input + tokens.output + tokens.cacheWrite + tokens.cacheRead,
    costUsd,
    durationMs: firstTs !== null && lastTs !== null ? lastTs - firstTs : 0,
    messageCount,
  };
}

/** Aggregate cost across multiple agents — sums all token categories + cost. */
export function totalCost(summaries: AgentCostSummary[]): {
  tokens: TokenCounts;
  totalTokens: number;
  costUsd: number;
  messageCount: number;
} {
  const tokens: TokenCounts = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  let costUsd = 0;
  let messageCount = 0;
  for (const s of summaries) {
    tokens.input += s.tokens.input;
    tokens.output += s.tokens.output;
    tokens.cacheWrite += s.tokens.cacheWrite;
    tokens.cacheRead += s.tokens.cacheRead;
    costUsd += s.costUsd;
    messageCount += s.messageCount;
  }
  return {
    tokens,
    totalTokens: tokens.input + tokens.output + tokens.cacheWrite + tokens.cacheRead,
    costUsd,
    messageCount,
  };
}
