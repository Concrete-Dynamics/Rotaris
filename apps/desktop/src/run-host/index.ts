import { CONTRACT_SCHEMA_VERSION, ProcessRequestEnvelopeSchema, RunHostRequestSchema, type ProcessMessage, type ProcessReply, type RunHostRequest } from '@rotaris/contracts';
import { millis, type WorkspaceId } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { openStore, StoreDal, forgetSpelling, type StoreHandle } from '@rotaris/store';
import { RefusalLease } from '@rotaris/engine';

/**
 * RUN HOST — one utilityProcess, forked after `app.ready`, living exactly as
 * long as the application (ADR-0002 #2). It holds every session lock this
 * application takes, and therefore everything that writes a session.
 *
 * It is HANDED a resolved store path and never reads the identifier file
 * (W-18). The walking skeleton opens that store read-write and reports; the
 * engine lands on top of this.
 *
 * ADR-0058 step 3b: the refusal of new runs is a lease this process expires
 * itself, so a workspace service that died releases the workspace by doing
 * nothing.
 */
const port = process.parentPort;
const clocks = nodeClocks();
const lease = new RefusalLease(clocks.monotonic);
const stores = new Map<string, { file: string; db: StoreHandle | null; dal: StoreDal | null }>();

function send(m: ProcessMessage): void {
  port.postMessage(m);
}
function reply(id: number, r: ProcessReply): void {
  send({ v: CONTRACT_SCHEMA_VERSION, id, reply: r });
}
function log(message: string): void {
  send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'log', level: 'info', message } });
}

function handle(req: RunHostRequest): ProcessReply {
  switch (req.kind) {
    case 'hello':
      return { kind: 'hello', process: 'run-host', pid: process.pid };
    case 'ping':
      return { kind: 'pong' };
    case 'workspace.opened': {
      if (lease.isRefusing(req.workspaceId as WorkspaceId)) return { kind: 'refused', code: 'workspace.refusing', headline: 'New runs are refused for this workspace while a restore is under way' };
      const db = openStore(req.storeFile);
      const dal = new StoreDal(db);
      stores.set(req.workspaceId, { file: req.storeFile, db, dal });
      const t = dal.totals();
      log(`opened ${req.storeFile} (${t.sessions} sessions, ${t.rows} rows)`);
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    }
    case 'workspace.refuseRuns':
      lease.refuse(req.workspaceId as WorkspaceId, millis(req.leaseMs));
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    case 'workspace.renewLease':
      lease.renew(req.workspaceId as WorkspaceId, millis(req.leaseMs));
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    case 'workspace.closeStore': {
      const s = stores.get(req.workspaceId);
      if (s?.db) { s.db.close(); forgetSpelling(s.file); s.db = null; s.dal = null; }
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    }
    case 'workspace.release': {
      lease.release(req.workspaceId as WorkspaceId);
      const s = stores.get(req.workspaceId);
      if (s && !s.db) { s.db = openStore(s.file); s.dal = new StoreDal(s.db); }
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    }
    case 'workspace.closing': {
      const s = stores.get(req.workspaceId);
      if (s?.db) { s.db.close(); forgetSpelling(s.file); }
      stores.delete(req.workspaceId);
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    }
    case 'shutdown': {
      for (const s of stores.values()) { try { s.db?.close(); } catch { /* */ } }
      stores.clear();
      clocks.timers.after(millis(0), () => process.exit(0));
      return { kind: 'ack' };
    }
  }
}

port.on('message', (e: { data: unknown }) => {
  const env = ProcessRequestEnvelopeSchema.safeParse(e.data);
  if (!env.success) return;
  const req = RunHostRequestSchema.safeParse(env.data.request);
  if (!req.success) { reply(env.data.id, { kind: 'refused', code: 'request.malformed', headline: 'not a run-host request' }); return; }
  try {
    reply(env.data.id, handle(req.data));
  } catch (err) {
    reply(env.data.id, { kind: 'refused', code: 'request.failed', headline: String(err) });
  }
});

send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'ready', process: 'run-host', pid: process.pid } });
