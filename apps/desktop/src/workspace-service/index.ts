import { CONTRACT_SCHEMA_VERSION, ProcessRequestEnvelopeSchema, ServiceAnswerEnvelopeSchema, WorkspaceServiceRequestSchema, type ProcessMessage, type ProcessReply, type ServiceAsk, type ServiceAskEnvelope, type WorkspaceServiceRequest } from '@rotaris/contracts';
import { millis, toIsoUtc, type Millis, type WorkspaceId } from '@rotaris/kernel';
import { dataLayout, nodeClocks, readOrMintMachineId, resolveUserDirs } from '@rotaris/platform';
import { establishWorkspaceId, openWorkspaceStore, forgetSpelling, REFUSAL_LEASE_MS, type ResolvedStore, type RunHostControl } from '@rotaris/store';
import { assessRestore, backupWorkspace, performRestore } from '@rotaris/workspace';
import { commitConfigFields, commitDesktopSave, readSnapshot } from '@rotaris/config';
import { mkdirSync } from 'node:fs';

/**
 * WORKSPACE SERVICE — one utilityProcess per open workspace, keyed by
 * resolved path (ADR-0002 #3). The ONLY process that resolves a workspace
 * identifier and the ONLY process that runs a schema migration (W-18, W-02):
 * it opens the store read-write once, migrates, and answers with the
 * resolved path for main to hand to the run host.
 *
 * REQ-SESSION-201's backup and restore run HERE (ADR-0002 c.7): main
 * supplies the dialogs and nothing else. The restore's instructions to the
 * run host (ADR-0058 steps 1, 3, 4a, 10) go as narrow requests back to main,
 * which forwards them — the service and the run host are siblings and never
 * talk directly. Before a restore the service closes its own connection
 * (an open handle on the target directory defeats step 9 — ADR-0058 step 7's
 * lesson one level up) and reopens, re-establishing the identifier, after.
 *
 * ADR-0037 Tier A lives here too: the configuration read, the desktop save
 * and the scoped per-field write, each followed by the load again, so the
 * reply carries the reloaded value. Git, checkpoints, the traceability engine
 * and the delivery store land with their ADRs.
 */
const port = process.parentPort;
const clocks = nodeClocks();
const dirs = resolveUserDirs();
const layout = dataLayout(dirs);
mkdirSync(layout.workspaces, { recursive: true });
const thisMachine = readOrMintMachineId(layout.machineId);
let open: ResolvedStore | null = null;

function send(m: ProcessMessage | ServiceAskEnvelope): void {
  port.postMessage(m);
}
function reply(id: number, r: ProcessReply): void {
  send({ v: CONTRACT_SCHEMA_VERSION, id, reply: r });
}
function log(message: string, level: 'info' | 'warn' = 'info'): void {
  send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'log', level, message } });
}

/** The child's side of ADR-0002 c.7: a bounded request back to main, correlated by `ask`. */
let nextAsk = 1;
const pendingAsks = new Map<number, { resolve: (r: ProcessReply) => void; reject: (e: Error) => void; cancel: () => void }>();
function ask(request: ServiceAsk, boundMs: Millis): Promise<ProcessReply> {
  const n = nextAsk++;
  return new Promise<ProcessReply>((resolve, reject) => {
    const h = clocks.timers.after(boundMs, () => { pendingAsks.delete(n); reject(new Error(`main did not answer ${request.kind} within ${boundMs} ms`)); });
    pendingAsks.set(n, { resolve, reject, cancel: () => h.cancel() });
    send({ v: CONTRACT_SCHEMA_VERSION, ask: n, request });
  });
}

/** ADR-0058's run host, reached through main. A reply that is not an acknowledgement rejects, which the restore's bound turns into a refusal. */
const runHost: RunHostControl = {
  async refuseRuns(id, leaseMs) { expectAck(await ask({ kind: 'runHost.refuseRuns', workspaceId: id, leaseMs }, millis(5_000))); },
  async closeStore(id) { expectAck(await ask({ kind: 'runHost.closeStore', workspaceId: id }, millis(5_000))); },
  async release(id) { expectAck(await ask({ kind: 'runHost.release', workspaceId: id }, millis(5_000))); },
  async reopen(id, storeFile) { expectAck(await ask({ kind: 'runHost.reopen', workspaceId: id, storeFile }, millis(5_000))); },
};
function expectAck(r: ProcessReply): void {
  if (r.kind !== 'workspace.ack' && r.kind !== 'ack') throw new Error(`run host answered ${r.kind}`);
}

function closeOwn(): void {
  if (open) { try { open.db.close(); } catch { /* */ } forgetSpelling(open.dir); open = null; }
}
function openOwn(workspaceRoot: string): ProcessReply {
  const ident = establishWorkspaceId(workspaceRoot);
  if (ident.state === 'unreadable') {
    return { kind: 'refused', code: 'workspace.identifier-unreadable', headline: 'The workspace identifier is present but cannot be read', detail: `It will not be minted over (REQ-SESSION-197). Content begins: ${ident.raw}` };
  }
  closeOwn();
  open = openWorkspaceStore(layout.workspaces, ident.id, workspaceRoot);
  const v = open.db.pragma('user_version', { simple: true }) as number;
  return { kind: 'workspace.opened', workspaceId: ident.id, storeFile: open.file, schemaVersion: v };
}

async function handle(req: WorkspaceServiceRequest): Promise<ProcessReply> {
  switch (req.kind) {
    case 'hello':
      return { kind: 'hello', process: 'workspace-service', pid: process.pid };
    case 'ping':
      return { kind: 'pong' };
    case 'workspace.open':
      return openOwn(req.workspaceRoot);
    case 'workspace.close': {
      closeOwn();
      return { kind: 'ack' };
    }
    case 'workspace.backup': {
      // REQ-SESSION-201: valid while runs are live; nothing stopped, nothing refused on a live session.
      const ident = establishWorkspaceId(req.workspaceRoot);
      if (ident.state === 'unreadable') return { kind: 'refused', code: 'workspace.identifier-unreadable', headline: 'The workspace identifier cannot be read' };
      const takenAtUtc = toIsoUtc(clocks.wall.instant());
      const r = backupWorkspace({ workspacesRoot: layout.workspaces, id: ident.id, destination: req.destination, takenAtUtc, lastSeenPath: req.workspaceRoot });
      if (!r.ok) return { kind: 'refused', code: r.error.code, headline: r.error.headline, ...(r.error.detail === undefined ? {} : { detail: r.error.detail }) };
      log(`backup of ${ident.id}: ${r.value.sessions} sessions, ${r.value.bytes} bytes → ${req.destination}`);
      return { kind: 'workspace.backedUp', destination: r.value.destination, bytes: r.value.bytes, sessions: r.value.sessions, takenAtUtc };
    }
    case 'workspace.restore.assess':
      return { kind: 'workspace.restore.assessment', assessment: assessRestore({ workspacesRoot: layout.workspaces, workspaceRoot: req.workspaceRoot, artifact: req.artifact, thisMachine }) };
    case 'workspace.restore.perform': {
      // The service's own connection would hold the target directory open (step 7's lesson); close it first.
      closeOwn();
      // 3b: the lease is renewed while the restore is genuinely still running; a dead service renews nothing.
      const targetId = assessRestore({ workspacesRoot: layout.workspaces, workspaceRoot: req.workspaceRoot, artifact: req.artifact, thisMachine }).artifact.workspaceId as WorkspaceId;
      const renew = clocks.timers.every(millis(10_000), () => { void ask({ kind: 'runHost.renewLease', workspaceId: targetId, leaseMs: REFUSAL_LEASE_MS }, millis(5_000)).catch(() => undefined); });
      let report;
      try {
        report = await performRestore({ workspacesRoot: layout.workspaces, workspaceRoot: req.workspaceRoot, artifact: req.artifact, thisMachine, decisions: req.decisions, runHost, timers: clocks.timers, wall: clocks.wall });
      } finally {
        renew.cancel();
      }
      log(`restore into ${report.restoredInto}: ok=${report.ok} abandoned=${report.abandoned} steps=${report.steps.join(',')}${report.error ? ` error=${report.error}` : ''}`);
      // Reopen — re-establishing the identifier, which the restore may have written — so the next open and migration are the ordinary ones.
      const reopened = openOwn(req.workspaceRoot);
      if (reopened.kind === 'refused') log(`reopen after restore refused: ${reopened.headline}`, 'warn');
      return { kind: 'workspace.restored', report };
    }
    case 'config.read':
      return { kind: 'config.snapshot', snapshot: readSnapshot(dirs.config, req.workspaceRoot, () => clocks.monotonic.now()) };
    case 'config.save': {
      const r = await commitDesktopSave(dirs.config, req.workspaceRoot, req.save, clocks.timers);
      if (!r.ok) return { kind: 'refused', code: `config.${r.refusal.code}`, headline: 'The settings could not be saved', detail: `${r.refusal.file}: ${r.refusal.fault}` };
      log(`configuration saved: ${req.workspaceRoot}`);
      return { kind: 'config.snapshot', snapshot: r.snapshot };
    }
    case 'config.setField': {
      const r = await commitConfigFields(dirs.config, req.workspaceRoot, req.scope, req.patch, clocks.timers);
      if (!r.ok) return { kind: 'refused', code: `config.${r.refusal.code}`, headline: 'The setting could not be written', detail: `${r.refusal.file}: ${r.refusal.fault}` };
      return { kind: 'config.snapshot', snapshot: r.snapshot };
    }
    case 'shutdown': {
      closeOwn();
      clocks.timers.after(millis(0), () => process.exit(0));
      return { kind: 'ack' };
    }
  }
}

port.on('message', (e: { data: unknown }) => {
  const answer = ServiceAnswerEnvelopeSchema.safeParse(e.data);
  if (answer.success) {
    const p = pendingAsks.get(answer.data.ask);
    if (p) { pendingAsks.delete(answer.data.ask); p.cancel(); p.resolve(answer.data.reply); }
    return;
  }
  const env = ProcessRequestEnvelopeSchema.safeParse(e.data);
  if (!env.success) return;
  const req = WorkspaceServiceRequestSchema.safeParse(env.data.request);
  if (!req.success) { reply(env.data.id, { kind: 'refused', code: 'request.malformed', headline: 'not a workspace-service request' }); return; }
  handle(req.data).then(
    (r) => reply(env.data.id, r),
    (err) => reply(env.data.id, { kind: 'refused', code: 'request.failed', headline: String(err) }),
  );
});

send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'ready', process: 'workspace-service', pid: process.pid } });
