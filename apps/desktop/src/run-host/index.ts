import { CONTRACT_SCHEMA_VERSION, ProcessRequestEnvelopeSchema, RunHostRequestSchema, type ProcessMessage, type ProcessReply, type RunHostRequest } from '@rotaris/contracts';
import { asSessionId, millis, ok, type Clocks, type WorkspaceId } from '@rotaris/kernel';
import { dataLayout, nodeClocks, readOrMintMachineId, resolveUserDirs } from '@rotaris/platform';
import { openStore, StoreDal, forgetSpelling, type StoreHandle } from '@rotaris/store';
import { RefusalLease, RUN_CONFIG_DEFAULTS, Sessions, type ModelSetup } from '@rotaris/engine';
import { AiSdkModelClient, DefaultAgentBackend, type ModelClient, type ModelRequest, type StreamPart } from '@rotaris/model';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

/**
 * RUN HOST — one utilityProcess, forked after `app.ready`, living exactly as
 * long as the application (ADR-0002 #2). It holds every session lock this
 * application takes, and therefore everything that writes a session: the
 * session writers, the projection owners they feed, and the runs
 * (ADR-0008, ADR-0013, ADR-0043).
 *
 * It is HANDED a resolved store path and never reads the identifier file
 * (W-18). A publication leaves here already stamped; main relays it.
 *
 * ADR-0058 step 3b: the refusal of new runs is a lease this process expires
 * itself, so a workspace service that died releases the workspace by doing
 * nothing.
 *
 * WHERE THE MODEL COMES FROM — a stopgap at this composition root, recorded
 * in docs/architecture/codebase.md: no configuration loader (ADR-0036) and no
 * credential store (ADR-0029) exist yet, so the model is read from the
 * environment. `ROTARIS_MODEL_DIALECT=scripted` selects a built-in scripted
 * client (verification only). With nothing set, a run is refused before it
 * starts (REQ-EVENTS-021). This is not a settings surface.
 */
const port = process.parentPort;
const clocks = nodeClocks();
const lease = new RefusalLease(clocks.monotonic);
const stores = new Map<string, { file: string; root: string; db: StoreHandle | null; dal: StoreDal | null }>();
const host = readOrMintMachineId(dataLayout(resolveUserDirs()).machineId);

function send(m: ProcessMessage): void {
  port.postMessage(m);
}
function reply(id: number, r: ProcessReply): void {
  send({ v: CONTRACT_SCHEMA_VERSION, id, reply: r });
}
function log(message: string, level: 'info' | 'warn' = 'info'): void {
  send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'log', level, message } });
}

/** Verification only: answers every call with a short streamed reply, one delta per 120 ms so the growth tick is visible. */
function scriptedClient(c: Clocks): ModelClient {
  return {
    async *stream(req: ModelRequest) {
      await req.resolveCredential();
      const last = req.messages.at(-1)?.content.find((p) => p.kind === 'text');
      const task = last && last.kind === 'text' ? last.text : '';
      const words = `I read your request — "${task.slice(0, 80)}" — and, with no tools yet, this is a scripted reply from the run loop.`.split(' ');
      for (const w of words) {
        if (req.signal.aborted) { yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        await new Promise<void>((resolve) => c.timers.after(millis(120), resolve));
        yield ok<StreamPart>({ kind: 'text', delta: `${w} ` });
      }
      yield ok<StreamPart>({ kind: 'usage', usage: { input: 24, output: words.length } });
      yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
    },
  };
}

function modelFromEnv(): ModelSetup | null {
  const dialect = process.env['ROTARIS_MODEL_DIALECT'];
  if (dialect === 'scripted') {
    log('model: the scripted client (ROTARIS_MODEL_DIALECT=scripted) — verification only');
    return { backend: new DefaultAgentBackend(scriptedClient(clocks)), config: { ...RUN_CONFIG_DEFAULTS, model: { providerId: 'scripted', modelId: 'scripted', dialect: 'chat' }, resolveCredential: async () => '' } };
  }
  const baseUrl = process.env['ROTARIS_MODEL_BASE_URL'];
  const modelId = process.env['ROTARIS_MODEL_ID'];
  const keyEnv = process.env['ROTARIS_MODEL_API_KEY_ENV'];
  if (!baseUrl || !modelId) {
    log('model: none configured (ROTARIS_MODEL_BASE_URL / ROTARIS_MODEL_ID unset); every run is refused before it starts (REQ-EVENTS-021)', 'warn');
    return null;
  }
  // The key is read from the variable NAMED by ROTARIS_MODEL_API_KEY_ENV, inside the request path, per request.
  const resolveCredential = async () => (keyEnv ? process.env[keyEnv] ?? '' : '');
  const client = new AiSdkModelClient({ baseUrl, onRequest: (i) => log(`model request ${i.method} ${i.url}`) });
  log(`model: ${modelId} at ${baseUrl} (${dialect === 'responses' ? 'responses' : 'chat'}; key from ${keyEnv ?? '(none)'})`);
  return {
    backend: new DefaultAgentBackend(client),
    config: { ...RUN_CONFIG_DEFAULTS, model: { providerId: 'env', modelId, dialect: dialect === 'responses' ? 'responses' : 'chat' }, resolveCredential },
  };
}

const sessions = new Sessions({
  clocks,
  pid: process.pid,
  host,
  // REQ-CONFIG-473's default until the configuration loader (ADR-0036) supplies the key.
  retentionCap: 20_000,
  warn: (m) => log(m, 'warn'),
  mintSessionId: () => randomUUID(),
  model: modelFromEnv(),
  sessionFilesDir: (dal, sid) => join(dirname(dal.db.name), 'sessions', sid),
  publisher: {
    increment: (payload) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'publish.increment', payload } }),
    snapshot: (payload) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'publish.snapshot', payload } }),
  },
  onRunResult: (sessionId, result) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'run.result', sessionId, result } }),
});

async function handle(req: RunHostRequest): Promise<ProcessReply> {
  switch (req.kind) {
    case 'hello':
      return { kind: 'hello', process: 'run-host', pid: process.pid };
    case 'ping':
      return { kind: 'pong' };
    case 'workspace.opened': {
      if (lease.isRefusing(req.workspaceId as WorkspaceId)) return { kind: 'refused', code: 'workspace.refusing', headline: 'New runs are refused for this workspace while a restore is under way' };
      const db = openStore(req.storeFile);
      const dal = new StoreDal(db);
      stores.set(req.workspaceId, { file: req.storeFile, root: req.workspaceRoot, db, dal });
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
    case 'session.start': {
      if (lease.isRefusing(req.workspaceId as WorkspaceId)) return { kind: 'refused', code: 'workspace.refusing', headline: 'New runs are refused for this workspace while a restore is under way' };
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const r = sessions.start(s.dal, s.root, req.prompt);
      if (!r.ok) {
        // REQ-SESSION-082: a refusal before the run starts is reported at once, marked as such, with no session behind it.
        if ('failedBeforeStart' in r.error) return { kind: 'refused', code: `session.${r.error.code}`, headline: 'The run was refused before it started', detail: r.error.reason };
        return { kind: 'refused', code: `session.${r.error.code}`, headline: 'The session could not be started', detail: r.error.reason };
      }
      log(`session ${r.value} started; row 0 recorded; the run is executing`);
      return { kind: 'session.started', sessionId: r.value };
    }
    case 'session.prompt': {
      const r = sessions.prompt(asSessionId(req.sessionId), req.prompt);
      if (!r.ok) return { kind: 'refused', code: `session.${r.error.code}`, headline: r.error.code === 'run-active' ? r.error.reason : 'The prompt could not be recorded', detail: r.error.reason };
      return { kind: 'ack' };
    }
    case 'session.control':
      return { kind: 'control.result', result: sessions.control(req.request) };
    case 'session.attach':
      return sessions.attach(asSessionId(req.sessionId)) ? { kind: 'ack' } : { kind: 'refused', code: 'session.not-live', headline: 'That session is not live' };
    case 'session.detach':
      return { kind: 'ack' };
    case 'session.reconcile':
      return sessions.reconcile(asSessionId(req.sessionId)) ? { kind: 'ack' } : { kind: 'refused', code: 'session.not-live', headline: 'That session is not live' };
    case 'session.pageOlder': {
      const page = sessions.pageOlder(asSessionId(req.sessionId), req.beforeIndex);
      if (!page) return { kind: 'refused', code: 'session.not-live', headline: 'That session is not live' };
      return { kind: 'session.page', sessionId: req.sessionId, rows: page.rows, oldest: page.oldest };
    }
    case 'shutdown': {
      // ADR-0014 / REQ-MONITOR-255: every run asked to stop before any is waited on; the reply follows their terminal results.
      await sessions.closeAll();
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
  handle(req.data).then(
    (r) => reply(env.data.id, r),
    (err) => reply(env.data.id, { kind: 'refused', code: 'request.failed', headline: String(err) }),
  );
});

send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'ready', process: 'run-host', pid: process.pid } });
