import { CONTRACT_SCHEMA_VERSION, ProcessRequestEnvelopeSchema, ServiceAnswerEnvelopeSchema, WorkspaceServiceRequestSchema, type ProcessMessage, type ProcessReply, type ServiceAsk, type ServiceAskEnvelope, type WorkspaceServiceRequest } from '@rotaris/contracts';
import { millis, toIsoUtc, type Millis, type WorkspaceId } from '@rotaris/kernel';
import { dataLayout, nodeClocks, readOrMintMachineId, resolveUserDirs } from '@rotaris/platform';
import { establishWorkspaceId, openWorkspaceStore, forgetSpelling, REFUSAL_LEASE_MS, type ResolvedStore, type RunHostControl } from '@rotaris/store';
import { assessRestore, backupWorkspace, capture as captureCheckpoint, checkAttach, createWorktree, deleteNamespace, deleteRefs, listRefs, performRestore, preview as previewCheckpoint, readGitView, readRepository, removeWorktree, restore as restoreCheckpoint, sessionWorktreePath, validateBranchName } from '@rotaris/workspace';
import { bootstrapConfigFile, commitConfigFields, commitDesktopSave, readSnapshot, scopeFiles } from '@rotaris/config';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { deliveryServiceFor } from './delivery.js'; // Part AK
import { promptsRootsRead } from './prompts.js'; // Part AO
import { improvementServiceFor } from './improvements.js';
import { bootstrapAtOpen } from './open-bootstrap.js';

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

/*
 * PD-WORKSPACE-002 — the home the instruction-file discovery reads user-scope files from.
 *
 * Verification only — `ROTARIS_CAPTURE_INSTRUCTIONS_HOME` points discovery at a scratch tree, so a
 * proof exercises the home-relative bases without reading the operator's own files. It is a seam
 * rather than an override of `HOME`/`USERPROFILE` because overriding those kills the Electron
 * process before it paints on Windows (measured on the skills proof's first run, 2026-09-14).
 * A user-driven launch never sets it and takes `homedir()`.
 */
function instructionEnv(): { home: string; platform: NodeJS.Platform; machineDir?: string } {
  const home = process.env['ROTARIS_CAPTURE_INSTRUCTIONS_HOME'];
  /*
   * `ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`: the same seam for the machine-wide base, so the inventory a proof reads
   * and the injection the run host builds (which honours the same variable) name one directory. The run host reads
   * `ROTARIS_CAPTURE_SKILLS_MACHINE` ahead of it, so a proof that sets that one sets this one to the same directory
   * (`skills-proof` does). Compiled out of a packaged build, where the base is always `/etc/codex`.
   */
  const machine = __ROTARIS_SEAMS__ ? process.env['ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE'] : undefined;
  return { home: home === undefined || home === '' ? homedir() : home, platform: process.platform, ...(machine === undefined || machine === '' ? {} : { machineDir: machine }) };
}

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
/** REQ-GIT-101: every in-flight checkpoint Git operation, so a shutdown waits for it rather than killing Git mid-call. */
const inFlight = new Set<Promise<unknown>>();
function tracked<T>(p: Promise<T>): Promise<T> {
  inFlight.add(p);
  return p.finally(() => { inFlight.delete(p); });
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
    case 'workspace.open': {
      const opened = openOwn(req.workspaceRoot);
      // REQ-CONFIG-025/028: the starter file at the open, before main can start initialization's first recording, whose
      // per-field write would otherwise create the file without it (REQ-CONFIG-030; `open-bootstrap.ts`).
      if (opened.kind === 'workspace.opened') bootstrapAtOpen(dirs.config, req.workspaceRoot, log);
      return opened;
    }
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
      log(`restore into ${report.restoredInto}: ok=${report.ok} abandoned=${report.abandoned} steps=${report.steps.join(',')}${report.leftovers.length > 0 ? ` leftovers=${report.leftovers.join(',')}` : ''}${report.error ? ` error=${report.error}` : ''}`);
      // Reopen — re-establishing the identifier, which the restore may have written — so the next open and migration are the ordinary ones.
      const reopened = openOwn(req.workspaceRoot);
      if (reopened.kind === 'refused') log(`reopen after restore refused: ${reopened.headline}`, 'warn');
      return { kind: 'workspace.restored', report };
    }
    case 'config.read':
      return { kind: 'config.snapshot', snapshot: readSnapshot(dirs.config, req.workspaceRoot, () => clocks.monotonic.now(), instructionEnv()) };
    case 'config.save': {
      const r = await commitDesktopSave(dirs.config, req.workspaceRoot, req.save, clocks.timers, instructionEnv());
      if (!r.ok) return { kind: 'refused', code: `config.${r.refusal.code}`, headline: 'The settings could not be saved', detail: `${r.refusal.file}: ${r.refusal.fault}` };
      log(`configuration saved: ${req.workspaceRoot}`);
      return { kind: 'config.snapshot', snapshot: r.snapshot };
    }
    case 'config.setField': {
      const r = await commitConfigFields(dirs.config, req.workspaceRoot, req.scope, req.patch, clocks.timers, instructionEnv());
      if (!r.ok) return { kind: 'refused', code: `config.${r.refusal.code}`, headline: 'The setting could not be written', detail: `${r.refusal.file}: ${r.refusal.fault}` };
      return { kind: 'config.snapshot', snapshot: r.snapshot };
    }
    case 'config.bootstrap': {
      // REQ-WORKSPACE-038 / REQ-WORKSPACE-135: an existing file is never overwritten; the outcome is logged, the load follows.
      const files = scopeFiles(dirs.config, req.workspaceRoot);
      const r = bootstrapConfigFile(files.workspace.agents);
      if (!r.ok) return { kind: 'refused', code: `config.${r.error.code}`, headline: 'The starter configuration could not be written', detail: `${r.error.file}: ${r.error.fault}` };
      log(`configuration bootstrap for ${req.workspaceRoot}: ${r.value}`);
      return { kind: 'config.snapshot', snapshot: readSnapshot(dirs.config, req.workspaceRoot, () => clocks.monotonic.now(), instructionEnv()) };
    }
    case 'repository.read': {
      // ADR-0038 / REQ-GIT-102: every read bounded, every failure an empty value; the state is logged, never a dialog.
      const state = await readRepository(req.workspaceRoot, { clocks });
      log(`repository ${req.workspaceRoot}: git=${state.gitAvailable} repo=${state.isRepository} branch=${state.branch ?? '-'} base=${state.base ?? '-'} +${state.ahead}/-${state.behind} touched=${state.touched} uncommitted=${state.uncommitted}${state.failed.length > 0 ? ` failed=${state.failed.join(',')}` : ''} in ${state.readMs} ms`);
      return { kind: 'repository.state', state };
    }
    case 'git.view': {
      // ADR-0038 second execution / REQ-GIT-102/105: every read bounded, every failure an empty value; the count and time logged.
      const state = await readGitView(req.workspaceRoot, { clocks });
      log(`git view: ${state.reads} reads in ${state.readMs} ms (${req.workspaceRoot}: git=${state.gitAvailable} repo=${state.isRepository} branch=${state.branch ?? (state.detached ? 'detached' : '-')} upstream=${state.upstream ?? '-'} +${state.ahead}/-${state.behind} worktrees=${state.worktrees.length} history=${state.history.length} uncommitted=${state.uncommitted}${state.failed.length > 0 ? ` failed=${state.failed.join(',')}` : ''})`);
      return { kind: 'git.state', state };
    }
    case 'worktree.create': {
      // REQ-GIT-009: the name is checked first — a derived (session) name is normalised, a typed one only accepted as it is.
      const derived = req.target.kind === 'session';
      const checked = validateBranchName(req.branch, { derived });
      if (!checked.ok) return { kind: 'refused', code: 'worktree.branch', headline: checked.error, detail: checked.detail };
      let path: string;
      if (req.target.kind === 'session') {
        const p = sessionWorktreePath(req.workspaceRoot, req.target.subpath, req.target.sessionId);
        if (!p.ok) return { kind: 'refused', code: 'worktree.storage', headline: p.error };
        path = p.value;
      } else path = req.target.path;
      const r = await createWorktree({ root: req.workspaceRoot, branch: checked.name, path, collisionSafe: req.collisionSafe, route: derived ? 'session' : 'manual', ...(req.baseRevision === undefined ? {} : { baseRevision: req.baseRevision }) }, { clocks });
      if (!r.ok) { log(`worktree create refused (${req.branch} → ${path}): ${r.error.split('\n')[0]}`, 'warn'); return { kind: 'refused', code: 'worktree.create', headline: r.error }; }
      log(`worktree created: ${r.value.branch} at ${r.value.path} from ${r.value.baseBranch}@${r.value.baseRevision.slice(0, 8)}${r.value.branch !== checked.name ? ` (requested ${checked.name}; REQ-GIT-010 suffix)` : ''}`);
      return { kind: 'worktree.created', path: r.value.path, branch: r.value.branch, baseBranch: r.value.baseBranch, baseRevision: r.value.baseRevision };
    }
    case 'worktree.remove': {
      const r = await removeWorktree({ root: req.workspaceRoot, path: req.path, force: req.force }, { clocks });
      if (!r.ok) { log(`worktree remove refused (${req.path}${req.force ? ', forced' : ''}): ${r.error.error}`, 'warn'); return { kind: 'refused', code: 'worktree.remove', headline: r.error.error, needsForce: r.error.needsForce }; }
      log(`worktree removed: ${req.path}${req.force ? ' (forced)' : ''}`);
      return { kind: 'worktree.removed', path: r.value.path };
    }
    case 'worktree.checkAttach': {
      const r = await checkAttach({ root: req.workspaceRoot, path: req.path }, { clocks });
      if (!r.ok) { log(`attach refused (${req.path}): ${r.error}`, 'warn'); return { kind: 'refused', code: 'worktree.attach', headline: r.error }; }
      log(`attachable: ${req.path} on ${r.value.branch} (base ${r.value.baseBranch}@${r.value.baseRevision.slice(0, 8)})`);
      return { kind: 'worktree.attachable', path: r.value.path, branch: r.value.branch, baseBranch: r.value.baseBranch, baseRevision: r.value.baseRevision };
    }
    case 'checkpoint.capture': {
      // ADR-0039 / REQ-GIT-034: the ref is created here; the row is the run host's, after this answer (capture = ref then row).
      const r = await tracked(captureCheckpoint(req.treeRoot, { sessionId: req.sessionId, sequence: req.sequence, includeUntracked: req.includeUntracked, message: req.message }, { clocks }));
      log(`checkpoint capture ${req.sessionId}/${req.sequence} (${req.checkpointKind}, iteration ${req.iteration}): ${r.outcome}${r.outcome === 'recorded' ? ` ${r.commit.slice(0, 8)} over ${r.files.length} file(s)` : r.outcome === 'nothing-to-record' ? '' : ` — ${r.detail}`}; ${r.invocations} git invocations in ${r.elapsedMs} ms`, r.outcome === 'failed' ? 'warn' : 'info');
      if (r.outcome === 'recorded') return { kind: 'checkpoint.captured', outcome: 'recorded', ref: r.ref, commit: r.commit, files: [...r.files], invocations: r.invocations, elapsedMs: r.elapsedMs };
      if (r.outcome === 'nothing-to-record') return { kind: 'checkpoint.captured', outcome: 'nothing-to-record', invocations: r.invocations, elapsedMs: r.elapsedMs };
      return { kind: 'checkpoint.captured', outcome: r.outcome, detail: r.detail, invocations: r.invocations, elapsedMs: r.elapsedMs };
    }
    case 'checkpoint.refs': {
      const r = await tracked(listRefs(req.treeRoot, req.sessionId, { clocks }));
      return r.ok ? { kind: 'checkpoint.refs', ok: true, entries: [...r.entries] } : { kind: 'checkpoint.refs', ok: false, entries: [], detail: r.detail };
    }
    case 'checkpoint.preview': {
      const r = await tracked(previewCheckpoint(req.treeRoot, { sessionId: req.sessionId, sequence: req.sequence, commit: req.commit, includeUntracked: req.includeUntracked, candidates: req.candidates }, { clocks }));
      log(`checkpoint preview ${req.sessionId}/${req.sequence}: ${r.treeState}, ${r.entries.length} entr${r.entries.length === 1 ? 'y' : 'ies'}, ${r.dirty.length} dirty; ${r.invocations} git invocations in ${r.elapsedMs} ms`);
      return { kind: 'checkpoint.previewed', treeState: r.treeState, entries: [...r.entries], dirty: [...r.dirty], blockedReason: r.blockedReason, text: r.text, invocations: r.invocations, elapsedMs: r.elapsedMs };
    }
    case 'checkpoint.restore': {
      const r = await tracked(restoreCheckpoint(req.treeRoot, { sessionId: req.sessionId, sequence: req.sequence, commit: req.commit, entries: req.entries }, { clocks }));
      log(`checkpoint restore ${req.sessionId}/${req.sequence}: ${r.ok ? `${r.touched.length} path(s) touched` : `failed — ${r.detail}`}; ${r.invocations} git invocations in ${r.elapsedMs} ms`, r.ok ? 'info' : 'warn');
      return r.ok ? { kind: 'checkpoint.restored', ok: true, touched: [...r.touched], invocations: r.invocations, elapsedMs: r.elapsedMs } : { kind: 'checkpoint.restored', ok: false, touched: [], detail: r.detail, invocations: r.invocations, elapsedMs: r.elapsedMs };
    }
    case 'checkpoint.prune': {
      // REQ-GIT-041/049: compare-and-swap on the recorded commit; a failure is reported, never raised.
      const r = await tracked(deleteRefs(req.treeRoot, req.sessionId, req.refs, { clocks }));
      if (r.failed.length > 0) log(`checkpoint prune ${req.sessionId}: ${r.deleted} deleted, ${r.failed.length} left: ${r.failed.map((f) => `${f.ref}: ${f.detail}`).join('; ')}`, 'warn');
      return { kind: 'checkpoint.pruned', deleted: r.deleted, failed: r.failed };
    }
    case 'checkpoint.deleteNamespace': {
      // Part U / REQ-GIT-069: every ref of the session in that tree, best-effort — the listing's failure (a moved or vanished
      // repository, no Git) is the detail, never a raise; the run host logs the leftover and deletes the record regardless.
      const r = await tracked(deleteNamespace(req.treeRoot, req.sessionId, { clocks }));
      log(`checkpoint namespace ${req.sessionId} in ${req.treeRoot}: ${r.deleted} ref(s) deleted${r.detail === undefined ? '' : ` — ${r.detail}`}`, r.detail === undefined ? 'info' : 'warn');
      return r.detail === undefined ? { kind: 'checkpoint.namespaceDeleted', deleted: r.deleted } : { kind: 'checkpoint.namespaceDeleted', deleted: r.deleted, detail: r.detail };
    }
    // Part AK — ADR-0041's delivery store, served from the process that owns the store's writable connection. The
    // engine was `ENGINE_NOT_MERGED` until Part AJ merged (2026-09-09); it is now the one engine `traceability.ts`
    // holds for this process, so the board's pass and the four operations share one I/O owner (ADR-0040 specific 6).
    case 'requirements.command': {
      if (!open) return { kind: 'refused', code: 'workspace.none', headline: 'Open a workspace before reading its requirements' };
      const { engineFor } = await import('./traceability.js');
      const r = await deliveryServiceFor(open, { workspaceRoot: req.workspaceRoot, engine: engineFor(clocks, log), clocks, log }).handle(req.command, req.actor, req.disclosure);
      return { kind: 'requirements.result', value: r.value, ...(r.changed === undefined ? {} : { changed: r.changed }) };
    }
    // Part AJ
    case 'traceability.operate': {
      // ADR-0040 / REQ-TRACE-508..512: one of the four toolchain operations against this workspace's repository root,
      // run by the one I/O owner with its passes on a worker thread; loaded on first use so this table gains one block.
      const { traceabilityOperate } = await import('./traceability.js');
      return traceabilityOperate(req, clocks, log);
    }
    case 'traceability.cancel': {
      const { traceabilityCancel } = await import('./traceability.js');
      return traceabilityCancel(req, clocks, log);
    }
    // Part AO — REQ-CHAT-160: the three prompt roots, read here because this is the process that reads the user's files.
    case 'prompts.roots.read':
      return promptsRootsRead({ workspaceRoot: req.workspaceRoot, configDir: dirs.config }, log);
    case 'improvements.command': {
      if (!open) return { kind: 'refused', code: 'workspace.none', headline: 'Open a workspace before reading improvement artifacts' };
      const result = await improvementServiceFor(open, { workspaceRoot: req.workspaceRoot, configFile: scopeFiles(dirs.config, req.workspaceRoot).workspace.agents, clocks, log }).handle(req.command);
      return { kind: 'improvements.result', value: result.value, ...(result.changed === undefined ? {} : { changed: result.changed }) };
    }
    case 'shutdown': {
      // REQ-GIT-101: an in-flight checkpoint Git operation finishes first; the wait is bounded by REQ-GIT-033's limits alone.
      if (inFlight.size > 0) { log(`shutdown: waiting for ${inFlight.size} in-flight checkpoint operation(s)`); await Promise.allSettled([...inFlight]); }
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
