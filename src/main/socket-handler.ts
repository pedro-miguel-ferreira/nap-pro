import type * as net from 'net';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { NapModel } from './model';
import type { PtySpawner } from './pty-spawner';
import type { NapkinStatus } from '../shared/bridge-types';
import { resolveByName } from './name-resolver';
import { enqueue } from './message-queue';
import { LONG_LIVED } from './socket-server';
import { serialize } from '../shared/ndjson';
import { createWorktree, removeWorktree, listWorktrees } from './worktree-helpers';

const VALID_PHASES = ['backlog', 'todo', 'doing', 'review', 'done', 'archived'] as const;

// ── Pending approvals registry ──
// Maps agentId → { resolve callback, connection }
// hook-permission-request adds an entry; permission-response resolves it.

interface PermissionResult {
  decision: string;
  message?: string;
  interrupt?: boolean;
}

interface PendingEntry {
  resolve: (result: PermissionResult) => void;
  conn: net.Socket;
  keepaliveTimer: ReturnType<typeof setInterval>;
}

const pendingRegistry = new Map<string, PendingEntry>();

/** Exported for tests — check registry state */
export function getPendingRegistry(): ReadonlyMap<string, PendingEntry> {
  return pendingRegistry;
}

export function createRequestHandler(
  model: NapModel,
  ptySpawner: PtySpawner,
  activityLogger?: import('./activity-log').ActivityLogger,
  projectCwd: string = process.cwd(),
): (msg: unknown, conn: net.Socket) => Promise<unknown> {
  function emitActivity(
    agentId: string,
    type: 'permission-requested' | 'permission-allowed' | 'permission-denied',
    text: string,
    data?: Record<string, unknown>,
  ): void {
    if (!activityLogger) return;
    const agent = model.getAllAgents().find((a) => a.id === agentId);
    if (!agent) return;
    activityLogger.emit(
      {
        ts: Date.now(),
        type,
        agentId: agent.id,
        agentName: agent.name,
        text,
        ...(data ? { data } : {}),
      },
      agent.homePath,
    );
  }

  return async (msg: unknown, conn: net.Socket) => {
    const req = msg as Record<string, unknown>;
    const reqId = req.id as number;
    const type = req.type as string;

    switch (type) {
      case 'create-napkin': {
        const slug = req.slug as string;
        const status = (req.status as NapkinStatus) || 'backlog';
        const nepicId = req.nepicId as string | undefined;
        const result = await model.createNapkin(slug, status, nepicId);
        return { ...result };
      }

      case 'create-agent': {
        const napkinSlug = req.napkinSlug as string;
        const name = req.name as string;
        const role = req.role as string;
        const nepicId = req.nepicId as string | undefined;
        const parentId = req.parentId as string | undefined;
        const modelId = (req.model as string | null | undefined) ?? null;
        const result = await model.createAgentStub(napkinSlug, name, role, nepicId, parentId, modelId);
        return { ...result };
      }

      case 'create-architect': {
        const name = req.name as string;
        const nepicId = req.nepicId as string | undefined;
        const parentId = req.parentId as string | undefined;
        const modelId = (req.model as string | null | undefined) ?? null;
        const result = await model.createArchitectStub(name, nepicId, parentId, modelId);
        return { ...result };
      }

      case 'create-nepic': {
        const slug = req.slug as string;
        const displayName = req.displayName as string;
        const result = await model.createNepic(slug, displayName);
        return { ...result };
      }

      case 'start': {
        const name = req.name as string;
        const prompt = (req.prompt as string) || null;
        const nepicId = req.nepicId as string | undefined;
        const result = await model.startAgentByName(name, prompt, ptySpawner, nepicId);
        return { ...result };
      }

      case 'done': {
        const sessionId = req.sessionId as string;
        model.setAgentDone(sessionId);
        return { id: reqId };
      }

      case 'stop': {
        const name = req.name as string;
        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, name);
        if (!resolved.ok) {
          throw new Error(resolved.error);
        }
        const agent = resolved.agent;
        ptySpawner.kill(agent.id);
        await model.setAgentExitedById(agent.id);
        return { id: reqId };
      }

      case 'pause': {
        const name = req.name as string;
        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, name);
        if (!resolved.ok) {
          throw new Error(resolved.error);
        }
        const agent = resolved.agent;
        if (!ptySpawner.isRunning(agent.id)) {
          throw new Error(`agent '${agent.name}' is not running`);
        }
        const ok = ptySpawner.pause(agent.id);
        if (ok) model.setAgentPaused(agent.id, true);
        return { id: reqId, ok };
      }

      case 'resume': {
        const name = req.name as string;
        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, name);
        if (!resolved.ok) {
          throw new Error(resolved.error);
        }
        const agent = resolved.agent;
        if (!ptySpawner.isRunning(agent.id)) {
          throw new Error(`agent '${agent.name}' is not running`);
        }
        const ok = ptySpawner.resume(agent.id);
        if (ok) model.setAgentPaused(agent.id, false);
        return { id: reqId, ok };
      }

      case 'set-status': {
        const napkinSlug = req.napkinSlug as string;
        const status = req.status as string;
        if (!VALID_PHASES.includes(status as typeof VALID_PHASES[number])) {
          throw new Error(
            `unknown phase '${status}' — use: ${VALID_PHASES.join(', ')}`,
          );
        }
        await model.setNapkinStatus(napkinSlug, status);
        return { id: reqId };
      }

      case 'create-worktree': {
        const napkinSlug = req.napkinSlug as string;
        const baseBranch = (req.baseBranch as string | undefined) || undefined;
        const napkin = model.getNapkins().find((n) => n.slug === napkinSlug);
        if (!napkin) throw new Error(`napkin '${napkinSlug}' not found`);
        const result = await createWorktree(projectCwd, napkinSlug, { baseBranch });
        if (!result.ok) throw new Error(result.error || 'failed to create worktree');
        await model.setNapkinWorktree(napkinSlug, result.path!);
        return { id: reqId, path: result.path, branch: result.branch };
      }

      case 'remove-worktree': {
        const napkinSlug = req.napkinSlug as string;
        const force = (req.force as boolean) ?? false;
        const napkin = model.getNapkins().find((n) => n.slug === napkinSlug);
        if (!napkin) throw new Error(`napkin '${napkinSlug}' not found`);
        const result = await removeWorktree(projectCwd, napkinSlug, { force });
        if (!result.ok) throw new Error(result.error || 'failed to remove worktree');
        await model.setNapkinWorktree(napkinSlug, null);
        return { id: reqId };
      }

      case 'list-worktrees': {
        const trees = await listWorktrees(projectCwd);
        return { id: reqId, worktrees: trees };
      }

      case 'status': {
        const query = (req.query as { napkin?: string; agent?: string; nepic?: string }) || {};
        const result = model.getStatus(query);
        return { id: reqId, ...result };
      }

      case 'ps': {
        const tree = model.getAllAgentsTree();
        return { id: reqId, agents: tree };
      }

      case 'poke': {
        const name = req.name as string;
        const message = req.message as string;
        const esc = (req.esc as boolean) || false;
        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, name);
        if (!resolved.ok) {
          throw new Error(resolved.error);
        }
        enqueue(resolved.agent.id, message, esc);
        return { id: reqId };
      }

      case 'ask': {
        // Agent-to-agent Q&A.
        //
        // Writes a `<consultations-dir>/<ts>-<from-name>-to-<to-name>.q.md` file
        // with the question, and enqueues a structured prompt into the target's
        // PTY that points at both that file and the matching `.a.md` answer
        // path. The target reads the question, writes its answer to the .a.md
        // file, and continues idling. The asker (CLI) blocks on the .a.md file
        // appearing (or returns immediately with --wait 0).
        //
        // Consultation files live under the asker's napkin if the asker is a
        // napkin-bound agent; otherwise under `.nap/consultations/`. This keeps
        // an audit trail in the workitem's own folder.
        const target = req.target as string;
        const question = req.question as string;
        const askerSessionId = (req.askerSessionId as string | null) ?? null;
        if (!target || typeof target !== 'string') {
          throw new Error('ask: missing target');
        }
        if (!question || typeof question !== 'string') {
          throw new Error('ask: missing question');
        }

        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, target);
        if (!resolved.ok) {
          throw new Error(`ask: ${resolved.error}`);
        }
        const targetAgent = resolved.agent;
        if (targetAgent.exited || targetAgent.archived) {
          throw new Error(
            `ask: target "${target}" has exited — agents must stay idle after \`nap-pro done\` to be reachable. Spawn a new consultant or address this to the human.`,
          );
        }

        // Find the asker — by session id if provided, falling back to a no-asker case.
        const asker = askerSessionId
          ? allAgents.find((a) => a.id === askerSessionId)
          : null;
        const askerName = asker?.name ?? 'human';

        // Pick the consultations dir. Prefer the asker's napkin; fall back to
        // the target's napkin; fall back to a project-level dir.
        let consultationsDir: string | null = null;
        if (asker?.napkinId) {
          const napkin = model.getNapkins().find((n) => n.slug === asker.napkinId);
          if (napkin) consultationsDir = path.join(napkin.path, 'consultations');
        }
        if (!consultationsDir && targetAgent.napkinId) {
          const napkin = model.getNapkins().find((n) => n.slug === targetAgent.napkinId);
          if (napkin) consultationsDir = path.join(napkin.path, 'consultations');
        }
        if (!consultationsDir) {
          // No napkin context — put it under the project-level .nap/consultations/.
          // Derive from the target's homePath which always contains the project root.
          const nepicMatch = targetAgent.homePath.match(/^(.*\/\.nap)\//);
          const napDir = nepicMatch ? nepicMatch[1] : null;
          if (!napDir) {
            throw new Error('ask: could not resolve a consultations dir');
          }
          consultationsDir = path.join(napDir, 'consultations');
        }
        await fsPromises.mkdir(consultationsDir, { recursive: true });

        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const safeFrom = askerName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const safeTo = targetAgent.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const stem = `${ts}-${safeFrom}-to-${safeTo}`;
        const questionPath = path.join(consultationsDir, `${stem}.q.md`);
        const answerPath = path.join(consultationsDir, `${stem}.a.md`);

        const qBody =
          `# Question from ${askerName} to ${targetAgent.name}\n\n` +
          `**Asked at:** ${new Date().toISOString()}\n\n` +
          `## Question\n\n${question}\n`;
        await fsPromises.writeFile(questionPath, qBody);

        const promptForTarget =
          `[CONSULT] You have a question from ${askerName}.\n\n` +
          `Question: ${question}\n\n` +
          `Read the full question at: ${questionPath}\n` +
          `Write your answer to: ${answerPath}\n\n` +
          `Answer concisely from the context you already have. If you don't know the answer or it's ambiguous, say so plainly in the answer file — don't guess. After writing the answer file, stay idle.`;
        enqueue(targetAgent.id, promptForTarget, false);

        return { id: reqId, questionPath, answerPath };
      }

      case 'key': {
        const name = req.name as string;
        const data = req.data as string;
        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, name);
        if (!resolved.ok) {
          throw new Error(resolved.error);
        }
        ptySpawner.write(resolved.agent.id, data);
        return { id: reqId };
      }

      case 'peek': {
        return { id: reqId };
      }

      case 'log': {
        const name = req.name as string;
        const tail = (req.tail as number) || 20;
        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, name);
        if (!resolved.ok) {
          throw new Error(resolved.error);
        }
        const raw = ptySpawner.getScrollback(resolved.agent.id);
        const allLines = raw.split('\n').filter(l => l.length > 0);
        const lines = allLines.slice(-tail);
        return { id: reqId, lines };
      }

      case 'nap-wait': {
        const name = req.name as string;
        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, name);
        if (!resolved.ok) {
          throw new Error(resolved.error);
        }
        const agent = resolved.agent;
        let status = 'running';
        if (agent.exited) status = 'exited';
        else if (agent.done) status = 'done';
        return { id: reqId, status };
      }

      case 'hook-permission-request': {
        const agentId = req.agentId as string;
        const tool = req.tool as string;
        const command = req.command as string;
        const payload = (req.payload as object) || {};

        // Reject duplicate — agent already has a pending approval
        if (pendingRegistry.has(agentId)) {
          throw new Error(`agent '${agentId}' already has a pending approval`);
        }

        // Set model state
        model.setAgentPendingApproval(agentId, {
          tool,
          command,
          timestamp: Date.now(),
          payload,
        });

        emitActivity(agentId, 'permission-requested', `${tool}(${command})`, {
          tool,
          command,
        });

        // Poke guardian if present + running
        const guardian = model.findAgentByRole('guardian');
        if (guardian && guardian.running) {
          const agent = model.getAllAgents().find(a => a.id === agentId);
          const agentName = agent?.name ?? agentId;
          const napkinSlug = agent?.napkinId ?? 'unknown';
          const role = agent?.role ?? 'unknown';
          const taskPath = agent?.homePath ? agent.homePath + '/prompt.md' : 'unknown';
          const pokeMessage = `[permission-request from: ${agentName} | napkin: ${napkinSlug} | role: ${role}]\ntool: ${tool}\ncommand: ${command}\ntask: ${taskPath}`;
          enqueue(guardian.id, pokeMessage);
        }

        // Create long-lived Promise — hangs until permission-response resolves it
        const result = await new Promise<PermissionResult>((resolve) => {
          const keepaliveTimer = setInterval(() => {
            if (!conn.destroyed) {
              conn.write(serialize({ type: 'ping' }));
            }
          }, 60_000);

          pendingRegistry.set(agentId, { resolve, conn, keepaliveTimer });

          // Clean up if client disconnects before resolution
          conn.on('close', () => {
            const entry = pendingRegistry.get(agentId);
            if (entry) {
              clearInterval(entry.keepaliveTimer);
              pendingRegistry.delete(agentId);
              model.clearPendingApproval(agentId);
            }
          });
        });

        // Connection resolved — send decision back to the hook process
        conn.write(serialize(result));
        return LONG_LIVED;
      }

      case 'permission-list': {
        const entries: Array<{ agentId: string; name: string; tool: string; command: string; timestamp: number }> = [];
        for (const [agentId] of pendingRegistry) {
          const agent = model.getAllAgents().find(a => a.id === agentId);
          const approval = agent?.pendingApproval;
          entries.push({
            agentId,
            name: agent?.name ?? agentId,
            tool: approval?.tool ?? '',
            command: approval?.command ?? '',
            timestamp: approval?.timestamp ?? 0,
          });
        }
        return { id: reqId, pending: entries };
      }

      case 'permission-response': {
        let agentId = req.agentId as string;
        const decision = req.decision as string;
        const message = (req.message as string) || undefined;
        const interrupt = (req.interrupt as boolean) || false;

        // Try direct lookup (UUID), then resolve by name
        let entry = pendingRegistry.get(agentId);
        if (!entry) {
          const allAgents = model.getAllAgents();
          const resolved = resolveByName(allAgents, agentId);
          if (resolved.ok) {
            agentId = resolved.agent.id;
            entry = pendingRegistry.get(agentId);
          }
        }

        if (!entry) {
          throw new Error(`no pending approval for agent '${req.agentId as string}'`);
        }

        // Clean up
        clearInterval(entry.keepaliveTimer);
        pendingRegistry.delete(agentId);
        model.clearPendingApproval(agentId);

        emitActivity(
          agentId,
          decision === 'allow' ? 'permission-allowed' : 'permission-denied',
          decision === 'allow' ? 'permission allowed' : `permission denied${message ? `: ${message}` : ''}`,
          { decision, message, interrupt },
        );

        // Resolve the hanging hook-permission-request Promise
        entry.resolve({ decision, message, interrupt: interrupt || undefined });

        return { id: reqId };
      }

      default:
        throw new Error(`unknown request type: ${type}`);
    }
  };
}
