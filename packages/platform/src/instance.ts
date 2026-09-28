import { createServer, connect, type Server, type Socket } from 'node:net';
import { mkdirSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { posix } from 'node:path';
import type { MachineId, Millis, Timers, WallClock } from '@rotaris/kernel';
import { toIsoUtc } from '@rotaris/kernel';
import { exclusiveCreate, replaceDocument } from './document.js';
import { isLockLive, type LockRecord } from './liveness.js';

/**
 * ADR-0055 alternative I — the instance claim is OUR OWN record file, on every
 * platform. REQ-STARTUP-161, -162, -164. Constraint P-16.
 *
 * The platform's primitive was measured and refused: against a primary that
 * was running but not pumping messages it blocked 20 s, performed no reclaim
 * and no retry, and the launch ended with no window (spike 16).
 *
 * The record carries `pid`, `host`, `acquired_at` — REQ-SESSION-046's three
 * names and types — plus the hand-over endpoint. It is taken by atomic
 * exclusive create and probed by the session lock's own liveness predicate.
 * The record is NOT itself the exclusion: under an exclusive create its mere
 * existence would strand every later launch for ever. What makes it an
 * exclusion is that it names a pid and a host and the launch probes them.
 *
 * Order (REQ-STARTUP-164): (1) exclusive claim; (2) on failure, hand over to
 * the named instance, complete when acknowledged; (3) not acknowledged within
 * 5 s — record unreadable, no process, process dead, or process silent —
 * reclaim once and retry the claim exactly once. At most one reclaim, two
 * claim attempts, no waiting beyond that one interval.
 */

export interface InstanceRecord extends LockRecord {
  readonly endpoint: string;
}

export interface HandOver {
  /** REQ-STARTUP-163: a workspace directory the launch carries, honoured by the instance. */
  readonly workspace?: string;
  /**
   * REQ-STARTUP-121 / ADR-0055 ("The update restart is a hand-over of the record"): the successor an update restart
   * started announces itself to the instance with its own record. The instance replaces the record file's contents
   * with it in one atomic replacement and answers `{"ok":true,"record":"passed"}`; from that moment the record is the
   * successor's, and a launch arriving at any moment reads either the predecessor's fields or the successor's — never
   * an unheld record. Set by `inheritInstance` and by nothing an ordinary launch does.
   */
  readonly successor?: InstanceRecord;
}

export type ClaimOutcome =
  | { readonly outcome: 'instance'; readonly record: InstanceRecord; readonly server: Server; readonly close: () => Promise<void> }
  | { readonly outcome: 'handed-over' }
  | { readonly outcome: 'refused'; readonly reason: string };

export interface ClaimDeps {
  readonly recordFile: string;
  readonly endpointDir: string;
  readonly machineId: MachineId;
  readonly pid: number;
  readonly wall: WallClock;
  readonly timers: Timers;
  readonly handOverIntervalMs: Millis;
  /** Called on the instance side for every hand-over it acknowledges. */
  readonly onHandOver: (h: HandOver) => void;
  /**
   * REQ-STARTUP-121: called on the instance side once the record has been rewritten with a successor's fields and the
   * successor told so. What the predecessor does then — close its window and exit — is main's; this only reports it.
   */
  readonly onRecordPassed?: (successor: InstanceRecord) => void;
  readonly platform?: NodeJS.Platform;
  /**
   * Where a unix socket for the hand-over endpoint may live, on platforms that
   * use one. The default is `endpointDir` — which is the per-user data
   * directory in production. A caller that isolates the data directory under a
   * deep scratch profile (the proofs) names a shallow directory here instead,
   * because a unix socket path is capped at 108 bytes and the data root alone
   * already overflows it.
   */
  readonly socketDir?: string;
}

export function endpointFor(endpointDir: string, pid: number, platform: NodeJS.Platform = process.platform, socketDir?: string): string {
  // A nonce beside the pid: a process that claims, closes and claims again must not collide with its own
  // still-closing endpoint, and a reclaimed pid must not inherit a dead process's name.
  const nonce = randomBytes(4).toString('hex');
  if (platform === 'win32') {
    const h = createHash('sha256').update(endpointDir).digest('hex').slice(0, 16);
    return `\\\\.\\pipe\\rotaris-${h}-${pid}-${nonce}`;
  }
  const dir = socketDir ?? endpointDir;
  // The branch is reached only for a platform that addresses a unix socket, so the separator is that
  // platform's and never the host's. A bare `join` here spelled the POSIX answer with backslashes
  // whenever the question was asked on Windows — the same class the R3 separator sweep repaired in the
  // five helpers beside this one, missed because the proof compared against the host's `sep` too.
  // The directory itself is passed through untouched: a backslash is a legal character in a POSIX
  // file name, so rewriting the caller's spelling would corrupt a directory this function cannot know is wrong.
  return posix.join(dir, `instance-${pid}-${nonce}.sock`);
}

function readRecord(file: string): InstanceRecord | undefined {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<InstanceRecord>;
    if (typeof raw.pid === 'number' && typeof raw.host === 'string' && typeof raw.acquired_at === 'string' && typeof raw.endpoint === 'string') {
      return raw as InstanceRecord;
    }
  } catch {
    /* unreadable → undefined */
  }
  return undefined;
}

function listen(endpoint: string, onHandOver: (h: HandOver) => void, platform: NodeJS.Platform, onSuccessor: (successor: InstanceRecord) => Promise<boolean>): Promise<Server> {
  return new Promise((resolve, reject) => {
    if (platform !== 'win32') {
      try { unlinkSync(endpoint); } catch { /* absent */ }
    }
    const server = createServer((sock: Socket) => {
      let buf = '';
      sock.setEncoding('utf8');
      sock.on('data', (chunk: string) => {
        buf += chunk;
        const nl = buf.indexOf('\n');
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let h: HandOver = {};
        try { h = JSON.parse(line) as HandOver; } catch { /* malformed → empty hand-over */ }
        if (h.successor !== undefined) {
          // REQ-STARTUP-121: the record passes, or it does not, and the successor is told which.
          void onSuccessor(h.successor).then((passed) => { sock.end(passed ? '{"ok":true,"record":"passed"}\n' : '{"ok":false}\n'); }, () => { sock.end('{"ok":false}\n'); });
          return;
        }
        onHandOver(h);
        sock.end('{"ok":true}\n');
      });
      sock.on('error', () => { /* a client that vanished */ });
    });
    server.once('error', reject);
    server.listen(endpoint, () => { server.off('error', reject); resolve(server); });
  });
}

/**
 * REQ-STARTUP-121, ADR-0055: the predecessor "replaces the record's contents with the successor's pid, host and
 * endpoint address in one atomic replacement" — a sibling written and renamed over, never truncate-and-rewrite, so a
 * reader observes the old fields or the new and never a half-written record that REQ-STARTUP-164 (3) would reclaim.
 * Only the holder passes its own record: a record that no longer names this process is left alone.
 */
async function passRecord(deps: ClaimDeps, successor: InstanceRecord): Promise<boolean> {
  const wellFormed = typeof successor.pid === 'number' && Number.isInteger(successor.pid) && successor.pid > 0
    && typeof successor.host === 'string' && successor.host === deps.machineId
    && typeof successor.acquired_at === 'string' && successor.acquired_at !== ''
    && typeof successor.endpoint === 'string' && successor.endpoint !== '';
  if (!wellFormed) return false;
  const current = readRecord(deps.recordFile);
  if (current === undefined || current.pid !== deps.pid) return false;
  const record: InstanceRecord = { pid: successor.pid, host: successor.host, acquired_at: successor.acquired_at, endpoint: successor.endpoint };
  const replaced = await replaceDocument(deps.recordFile, `${JSON.stringify(record)}\n`);
  if (!replaced.ok) return false;
  deps.onRecordPassed?.(record);
  return true;
}

/** The socket directory a claim listens under, created where the launch makes the profile; read ONCE per launch. */
function socketDirectoryFor(deps: ClaimDeps, platform: NodeJS.Platform): string | undefined {
  const socketDir = deps.socketDir ?? (platform === 'win32' ? undefined : process.env['XDG_RUNTIME_DIR']);
  if (platform !== 'win32' && socketDir !== undefined && socketDir !== deps.endpointDir) {
    try { mkdirSync(socketDir, { recursive: true }); } catch { /* the listen reports it */ }
  }
  return socketDir;
}

/** Release what this process holds: its record (only while it still names this process), its server, its socket. */
function closerFor(deps: ClaimDeps, server: Server, endpoint: string, platform: NodeJS.Platform): () => Promise<void> {
  return async () => {
    try {
      const now = readRecord(deps.recordFile);
      if (now && now.pid === deps.pid) rmSync(deps.recordFile, { force: true });
    } catch { /* */ }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (platform !== 'win32') { try { unlinkSync(endpoint); } catch { /* */ } }
  };
}

function tryHandOver(endpoint: string, h: HandOver, timers: Timers, bound: Millis): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => { if (!done) { done = true; resolve(v); } };
    const t = timers.after(bound, () => { try { sock.destroy(); } catch { /* */ } finish(false); });
    const sock = connect(endpoint);
    sock.setEncoding('utf8');
    let buf = '';
    sock.on('connect', () => sock.write(`${JSON.stringify(h)}\n`));
    sock.on('data', (c: string) => { buf += c; if (buf.includes('\n')) { t.cancel(); sock.end(); finish(buf.includes('"ok":true')); } });
    sock.on('error', () => { t.cancel(); finish(false); });
    sock.on('close', () => { t.cancel(); finish(buf.includes('"ok":true')); });
  });
}

/**
 * Resolve the launch to exactly one of two outcomes (and `refused` only for the
 * bounded failure the requirement names: two claim attempts both lost).
 */
export async function claimInstance(deps: ClaimDeps, handOver: HandOver = {}): Promise<ClaimOutcome> {
  const platform = deps.platform ?? process.platform;
  /**
   * The socket directory is read ONCE, before the record exists: a nonce is minted per attempt and the
   * record names the endpoint the first attempt listened on, so re-reading the environment inside the
   * retry would address a directory the record never named. The directory is created here rather than
   * left to the listen, because a scratch runtime directory does not exist until the harness's launch
   * makes the profile that names it.
   */
  const socketDir = socketDirectoryFor(deps, platform);
  const attempt = async (): Promise<ClaimOutcome | 'lost'> => {
    const endpoint = endpointFor(deps.endpointDir, deps.pid, platform, socketDir);
    const record: InstanceRecord = { pid: deps.pid, host: deps.machineId, acquired_at: toIsoUtc(deps.wall.instant()), endpoint };
    const r = exclusiveCreate(deps.recordFile, `${JSON.stringify(record)}\n`);
    if (!r.ok) return { outcome: 'refused', reason: `${r.error.headline}: ${r.error.detail ?? ''}` };
    if (r.value.minted) {
      const server = await listen(endpoint, deps.onHandOver, platform, (successor) => passRecord(deps, successor));
      return { outcome: 'instance', record, server, close: closerFor(deps, server, endpoint, platform) };
    }
    return 'lost';
  };

  // (1) the exclusive claim
  const first = await attempt();
  if (first !== 'lost') return first;

  // (2) hand over to the instance the record names; (3) unreadable / dead / silent → reclaim once
  const existing = readRecord(deps.recordFile);
  const live = existing ? isLockLive(existing, deps.machineId) : false;
  if (existing && live) {
    const acked = await tryHandOver(existing.endpoint, handOver, deps.timers, deps.handOverIntervalMs);
    if (acked) return { outcome: 'handed-over' };
  }
  rmSync(deps.recordFile, { force: true });
  const second = await attempt();
  if (second !== 'lost') return second;
  return { outcome: 'refused', reason: 'the record was recreated by another party between the reclaim and the retry; no third attempt is made (REQ-STARTUP-164)' };
}

/**
 * REQ-STARTUP-121 / ADR-0055 — the SUCCESSOR's side of the update restart. Not an ordinary launch: it performs no
 * claim and no hand-over attempt. It opens its own hand-over endpoint, announces its record to the predecessor at
 * `predecessorEndpoint`, and becomes the instance the moment the predecessor answers that the record has passed.
 * The predecessor then closes its window and exits; a launch arriving meanwhile is handed to whichever of the two the
 * record names at that moment, and no third process is ever started.
 *
 * The one bound here is the successor's wait for the predecessor's ANSWER — the hand-over interval — because the
 * predecessor rewrites the record and answers at once, and a successor that got no answer must not become a rival:
 * it closes its endpoint and reports `refused`, and main ends it quietly while the predecessor keeps its record and
 * its window (REQ-STARTUP-121's failure branch). The predecessor's own wait for the successor to arrive has no bound
 * (ADR-0055), and that wait is the updater's.
 */
export async function inheritInstance(deps: ClaimDeps, predecessorEndpoint: string): Promise<ClaimOutcome> {
  const platform = deps.platform ?? process.platform;
  const socketDir = socketDirectoryFor(deps, platform);
  const endpoint = endpointFor(deps.endpointDir, deps.pid, platform, socketDir);
  const record: InstanceRecord = { pid: deps.pid, host: deps.machineId, acquired_at: toIsoUtc(deps.wall.instant()), endpoint };
  let server: Server;
  try {
    server = await listen(endpoint, deps.onHandOver, platform, (successor) => passRecord(deps, successor));
  } catch (cause) {
    return { outcome: 'refused', reason: `the successor could not open its hand-over endpoint: ${String(cause)}` };
  }
  const close = closerFor(deps, server, endpoint, platform);
  const passed = await tryHandOver(predecessorEndpoint, { successor: record }, deps.timers, deps.handOverIntervalMs);
  if (!passed) {
    await close();
    return { outcome: 'refused', reason: 'the running instance did not pass its record within the hand-over interval; this launch ends, and the instance keeps its record and its window (REQ-STARTUP-121)' };
  }
  return { outcome: 'instance', record, server, close };
}
