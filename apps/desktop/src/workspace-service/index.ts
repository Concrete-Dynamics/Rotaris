import { CONTRACT_SCHEMA_VERSION, ProcessRequestEnvelopeSchema, WorkspaceServiceRequestSchema, type ProcessMessage, type ProcessReply, type WorkspaceServiceRequest } from '@rotaris/contracts';
import { millis } from '@rotaris/kernel';
import { dataLayout, nodeClocks, resolveUserDirs } from '@rotaris/platform';
import { establishWorkspaceId, openWorkspaceStore, forgetSpelling, type ResolvedStore } from '@rotaris/store';
import { mkdirSync } from 'node:fs';

/**
 * WORKSPACE SERVICE — one utilityProcess per open workspace, keyed by
 * resolved path (ADR-0002 #3). The ONLY process that resolves a workspace
 * identifier and the ONLY process that runs a schema migration (W-18, W-02):
 * it opens the store read-write once, migrates, and answers with the
 * resolved path for main to hand to the run host.
 *
 * Everything else it will hold — configuration, git, checkpoints, the
 * traceability engine, the delivery store, the backup — lands with its ADR.
 */
const port = process.parentPort;
const clocks = nodeClocks();
const layout = dataLayout(resolveUserDirs());
mkdirSync(layout.workspaces, { recursive: true });
let open: ResolvedStore | null = null;

function send(m: ProcessMessage): void {
  port.postMessage(m);
}
function reply(id: number, r: ProcessReply): void {
  send({ v: CONTRACT_SCHEMA_VERSION, id, reply: r });
}

function handle(req: WorkspaceServiceRequest): ProcessReply {
  switch (req.kind) {
    case 'hello':
      return { kind: 'hello', process: 'workspace-service', pid: process.pid };
    case 'ping':
      return { kind: 'pong' };
    case 'workspace.open': {
      const ident = establishWorkspaceId(req.workspaceRoot);
      if (ident.state === 'unreadable') {
        return { kind: 'refused', code: 'workspace.identifier-unreadable', headline: 'The workspace identifier is present but cannot be read', detail: `It will not be minted over (REQ-SESSION-197). Content begins: ${ident.raw}` };
      }
      open = openWorkspaceStore(layout.workspaces, ident.id, req.workspaceRoot);
      const v = open.db.pragma('user_version', { simple: true }) as number;
      return { kind: 'workspace.opened', workspaceId: ident.id, storeFile: open.file, schemaVersion: v };
    }
    case 'workspace.close': {
      if (open) { open.db.close(); forgetSpelling(open.dir); open = null; }
      return { kind: 'ack' };
    }
    case 'shutdown': {
      if (open) { try { open.db.close(); } catch { /* */ } open = null; }
      clocks.timers.after(millis(0), () => process.exit(0));
      return { kind: 'ack' };
    }
  }
}

port.on('message', (e: { data: unknown }) => {
  const env = ProcessRequestEnvelopeSchema.safeParse(e.data);
  if (!env.success) return;
  const req = WorkspaceServiceRequestSchema.safeParse(env.data.request);
  if (!req.success) { reply(env.data.id, { kind: 'refused', code: 'request.malformed', headline: 'not a workspace-service request' }); return; }
  try {
    reply(env.data.id, handle(req.data));
  } catch (err) {
    reply(env.data.id, { kind: 'refused', code: 'request.failed', headline: String(err) });
  }
});

send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'ready', process: 'workspace-service', pid: process.pid } });
