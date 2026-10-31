import { createServer, connect, type Server, type Socket } from 'node:net';
import { accessSync, constants, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
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
 * Order (REQ-STARTUP-164): (1) exclusive claim, its endpoint already listening (ADR-0055); (2) on failure, hand over to
 * the named instance, complete when acknowledged; (3) not acknowledged within
 * 5 s — record unreadable, no process, process dead, or process silent —
 * reclaim once and retry the claim exactly once; (4) that retry lost too —
 * another launch claimed inside the interval — hand over once more and end.
 * At most one reclaim, two claim attempts, no spin.
 *
 * The instance answers a hand-over only while the record still names it (ADR-0055 consequence 14): a process the record
 * was reclaimed from — a primary suspended past the interval and resumed — declines rather than acting as the instance.
 */

export interface InstanceRecord extends LockRecord {
  readonly endpoint: string;
}

export interface HandOver {
  /** REQ-STARTUP-163: a workspace directory the launch carries, honoured by the instance. */
  readonly workspace?: string;
  /**
   * REQ-STARTUP-121 / ADR-0055 ("The update restart is a hand-over of the record"): the successor an update restart
   * started announces itself to the instance with its own record. The pass is two steps on the one connection: the
   * instance answers `{"record":"offered"}`, the successor acknowledges with `{"ack":true}` — proving it is still
   * waiting — and only then does the instance replace the record file's contents with it in one atomic replacement and
   * answer `{"ok":true,"record":"passed"}`. From that moment the record is the successor's, and a launch arriving at any
   * moment reads either the predecessor's fields or the successor's — never an unheld record, and never one naming a
   * successor that had stopped waiting. Set by `inheritInstance` and by nothing an ordinary launch does.
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
  /**
   * Called on the instance side for every hand-over it acknowledges — and it acknowledges one only while the record, read
   * again as the hand-over arrives, still names this process (ADR-0055 consequence 14).
   */
  readonly onHandOver: (h: HandOver) => void;
  /**
   * ADR-0055 consequence 14: called on a process whose endpoint received an ordinary hand-over while the record no longer
   * names it — REQ-STARTUP-164 (3) reclaimed it meanwhile, or the record passed to a successor (REQ-STARTUP-121) — with the
   * record as it was read then (`undefined` when there was none to read). The hand-over is not acted on and is answered
   * not-acknowledged, so the launch that sent it resolves to the process the record names; what this process does with
   * the windows it already has is not decided here. Main logs it.
   */
  readonly onHandOverDeclined?: (h: HandOver, holder: InstanceRecord | undefined) => void;
  /**
   * REQ-STARTUP-121: called on the instance side once the successor has acknowledged the offer and the record has been
   * rewritten with its fields; the successor is told so as this returns. What the predecessor does then — close its
   * window and exit — is main's; this only reports it.
   */
  readonly onRecordPassed?: (successor: InstanceRecord) => void;
  /**
   * REQ-STARTUP-121 / REQ-STARTUP-161: whether this instance is waiting for a successor it started itself. The record
   * passes only while this answers true: a restart is the one case in which a second process may start, so a launch
   * that announces itself as a successor when no restart is pending — a hand-typed or stale sentinel launch — is
   * answered not-passed, the record is left as it is, and that launch ends as REQ-STARTUP-121's failure branch has it.
   * Absent is never: a claim that supplies no answer passes its record to nobody.
   */
  readonly acceptSuccessor?: (successor: InstanceRecord) => boolean;
  /**
   * REQ-STARTUP-121: called on the instance side when a successor it ACCEPTED (`acceptSuccessor` answered true) could
   * not be given the record — the record no longer names this process (REQ-STARTUP-164 (3) reclaimed it meanwhile), the
   * successor stopped waiting (it closed its connection before acknowledging the offer, or its acknowledgement did not
   * arrive within the hand-over interval — the announcement was read late, after the successor's own bound), or the
   * atomic replacement failed (a scanner or indexer holding the file through the rename). The successor, if it is still
   * there, is answered not-passed with the same reason and ends quietly; the record is left exactly as it was. Main uses
   * this to fail the restart it is waiting on, so the failure surfaces through `Update not installed` instead of a wait
   * that never ends, or a close that leaves no instance running. An announcement that was never accepted — malformed,
   * or no restart pending — does not reach this.
   */
  readonly onRecordPassFailed?: (successor: InstanceRecord, reason: string) => void;
  /** The atomic replacement of the record; `replaceDocument` unless a test substitutes one that fails. */
  readonly replaceRecord?: (file: string, content: string) => ReturnType<typeof replaceDocument>;
  readonly platform?: NodeJS.Platform;
  /**
   * Where a unix socket for the hand-over endpoint should live, on platforms that use one, ahead of every other
   * candidate (`socketDirectoryCandidates`). Production names none; a test names its own directory.
   */
  readonly socketDir?: string;
  /**
   * The environment `XDG_RUNTIME_DIR` is read from, once per launch; `process.env` unless a test substitutes one. One of the
   * platform-convention directory variables REQ-STARTUP-147 names (amended 2026-10-13, OQ-247): it locates the socket's
   * directory and decides nothing else.
   */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /**
   * The shallow directories a socket falls back to when neither the runtime directory nor the data directory can hold
   * one, each used through a private directory every claim attempt makes below it (`rotaris-XXXXXX`, OQ-248).
   * `[tmpdir(), '/tmp']` unless a test substitutes its own.
   */
  readonly tempDirs?: readonly string[];
}

/**
 * The longest path, in bytes, a unix socket address holds: `sockaddr_un`'s `sun_path` is 108 bytes on Linux and 104 on
 * macOS and the BSDs, its terminating NUL included. A longer path does not bind at all (`listen EINVAL`).
 */
export function socketPathLimit(platform: NodeJS.Platform): number {
  return platform === 'linux' ? 107 : 103;
}

/** One directory a hand-over socket may be placed in, and whether each attempt places it in a private directory below it. */
export interface SocketCandidate {
  readonly dir: string;
  /**
   * A shared temporary directory: each claim attempt makes its own `0700` directory below it under an unpredictable name
   * (`mkdtemp`), places its socket there, and removes both when the attempt loses or the instance closes (OQ-248).
   */
  readonly private: boolean;
}

/** The per-attempt directory below a temporary one, as `mkdtemp` names it: the prefix and six characters. */
const PRIVATE_PREFIX = 'rotaris-';
const PRIVATE_DIRECTORY = /^rotaris-[A-Za-z0-9]{6}$/;

export interface SocketPlacement {
  readonly platform: NodeJS.Platform;
  readonly pid: number;
  readonly endpointDir: string;
  readonly socketDir?: string | undefined;
  /** `XDG_RUNTIME_DIR` as the launch read it: unset, empty, relative or absolute. */
  readonly runtimeDir?: string | undefined;
  readonly tempDirs: readonly string[];
}

/**
 * Where a unix socket for the hand-over endpoint may be placed, in the order a launch tries them (REQ-STARTUP-161/164):
 * a socket directory the caller names; `XDG_RUNTIME_DIR`, the directory the XDG Base Directory Specification sets aside
 * for exactly this (one of REQ-STARTUP-147's platform-convention directory variables, OQ-247); the data directory beside
 * the record; and each temporary directory, below which every attempt makes a private directory of its own — the
 * "replacement directory with similar capabilities" that specification tells an application to fall back to. A directory is
 * a candidate only when it is absolute, since the record names the socket for a launch started from any working directory
 * and a relative value is one the specification calls invalid and says to ignore; and only when the socket's whole path fits
 * `socketPathLimit`, measured in bytes with this launch's pid (and, below a temporary directory, the private directory's
 * `rotaris-XXXXXX/` component).
 *
 * Until OQ-248's ruling (R-072, 2026-10-13) the fallback was one predictable `rotaris-<uid>` directory, made before the
 * claim and never removed: another local user who made that name first denied every launch the fallback
 * (`docs/defects/fixed/another-local-user-can-deny-the-instance-sockets-temporary-fallback.md`), and a launch that was handed
 * over could leave it behind (`docs/defects/fixed/a-handed-over-launch-can-leave-the-private-socket-directory-behind.md`).
 *
 * Until fin30 the claim took `XDG_RUNTIME_DIR` with `??`, so a set-but-empty value addressed the socket relative to the
 * working directory (`docs/defects/fixed/an-empty-xdg-runtime-dir-puts-the-instance-socket-in-the-working-directory.md`),
 * and with no runtime directory it listened under the data directory whatever that directory's length, so a home of
 * about fifty characters made the listen fail with `EINVAL` and the launch end with no window
 * (`docs/defects/fixed/a-deep-data-directory-leaves-the-launch-windowless.md`).
 */
export function socketDirectoryCandidates(p: SocketPlacement): SocketCandidate[] {
  const limit = socketPathLimit(p.platform);
  // The nonce is minted per attempt and always eight hex digits, so any eight stand in for it here.
  const fits = (dir: string, isPrivate: boolean): boolean =>
    Buffer.byteLength(posix.join(dir, ...(isPrivate ? [`${PRIVATE_PREFIX}XXXXXX`] : []), `instance-${p.pid}-00000000.sock`), 'utf8') <= limit;
  const out: SocketCandidate[] = [];
  const consider = (dir: string | undefined, isPrivate: boolean): void => {
    if (dir === undefined || !posix.isAbsolute(dir) || !fits(dir, isPrivate) || out.some((c) => c.dir === dir)) return;
    out.push({ dir, private: isPrivate });
  };
  consider(p.socketDir, false);
  consider(p.runtimeDir, false);
  consider(p.endpointDir, false);
  for (const temp of p.tempDirs) consider(temp, true);
  return out;
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

/** Whether two reads of the record are the same claim: the same process, at the same endpoint, acquired at the same moment. */
function sameClaim(a: InstanceRecord, b: InstanceRecord): boolean {
  return a.pid === b.pid && a.host === b.host && a.acquired_at === b.acquired_at && a.endpoint === b.endpoint;
}

/** The answer of a process the record no longer names to an ordinary hand-over (ADR-0055 consequence 14). Never `ok:true`. */
const DECLINED_LINE = `${JSON.stringify({ ok: false, reason: 'the instance record no longer names this process, so it does not act as the instance (ADR-0055)' })}\n`;

/** The predecessor's answer to a successor's announcement: passed, or refused with the check that refused it. */
type PassAnswer = { readonly passed: true } | { readonly passed: false; readonly reason: string };

function answerLine(answer: PassAnswer): string {
  return answer.passed ? '{"ok":true,"record":"passed"}\n' : `${JSON.stringify({ ok: false, reason: answer.reason })}\n`;
}

/** The offer: the first step of the pass. Deliberately not `ok:true`, so it can never be read as the pass itself. */
const OFFER_LINE = '{"record":"offered"}\n';
/** The successor's acknowledgement of the offer: it is still waiting, and takes the record. */
const ACK_LINE = '{"ack":true}\n';

/**
 * The predecessor's half of one successor's connection (REQ-STARTUP-121). `offer` writes the offer and resolves with
 * the successor's acknowledgement, or with the reason it did not come: the connection ended first, or the bound
 * elapsed on the timer port. A peer that had already closed before the offer — its announcement read late, after its
 * own bound — resolves at once.
 */
interface SuccessorLink {
  offer(timers: Timers, bound: Millis): Promise<{ readonly acknowledged: true } | { readonly acknowledged: false; readonly reason: string }>;
}

function isAck(line: string): boolean {
  try { return (JSON.parse(line) as { ack?: unknown }).ack === true; } catch { return false; }
}

/**
 * The endpoint's server. An ordinary hand-over (REQ-STARTUP-162/163) is acted on and acknowledged only while the record,
 * read again as the line arrives, names this process at this endpoint (ADR-0055 consequence 14). Until 2026-10-31 nothing
 * re-read it: a primary suspended past REQ-STARTUP-164's interval and resumed answered the hand-over queued on its pipe
 * and surfaced its window beside the instance that had reclaimed the record
 * (`docs/defects/fixed/a-primary-resumed-after-a-reclaim-goes-on-acting-as-the-instance.md`). It now answers `DECLINED_LINE`
 * and acts on nothing, and the launch, if it is still waiting, resolves to the process the record names (`claimInstance`
 * (3)/(4)). A successor's announcement is the record pass's own (`passRecord`), which reads the record itself.
 */
function listen(endpoint: string, deps: ClaimDeps, platform: NodeJS.Platform, onSuccessor: (successor: InstanceRecord, link: SuccessorLink) => Promise<PassAnswer>): Promise<Server> {
  return new Promise((resolve, reject) => {
    if (platform !== 'win32') {
      try { unlinkSync(endpoint); } catch { /* absent */ }
    }
    const server = createServer((sock: Socket) => {
      let buf = '';
      let first = true;
      /** Set while an offer waits for its acknowledgement: the next line, or `undefined` when the connection ends. */
      let awaitingAck: ((line: string | undefined) => void) | undefined;
      let peerGone = false;
      const gone = (): void => {
        peerGone = true;
        const waiter = awaitingAck;
        awaitingAck = undefined;
        waiter?.(undefined);
      };
      sock.setEncoding('utf8');
      sock.on('data', (chunk: string) => {
        buf += chunk;
        for (;;) {
          const nl = buf.indexOf('\n');
          if (nl < 0) return;
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!first) {
            // Only an offer waits for a second line; anything else after the first line is ignored.
            const waiter = awaitingAck;
            awaitingAck = undefined;
            waiter?.(line);
            continue;
          }
          first = false;
          let h: HandOver = {};
          try { h = JSON.parse(line) as HandOver; } catch { /* malformed → empty hand-over */ }
          if (h.successor !== undefined) {
            const link: SuccessorLink = {
              offer: (timers, bound) => new Promise((settle) => {
                const closed = { acknowledged: false as const, reason: 'the successor stopped waiting: it closed its connection before acknowledging the record' };
                if (peerGone || sock.destroyed) { settle(closed); return; }
                const timer = timers.after(bound, () => {
                  awaitingAck = undefined;
                  settle({ acknowledged: false, reason: 'the successor did not acknowledge the record within the hand-over interval' });
                });
                awaitingAck = (answer) => {
                  timer.cancel();
                  if (answer === undefined) settle(closed);
                  else if (isAck(answer)) settle({ acknowledged: true });
                  else settle({ acknowledged: false, reason: 'the successor answered the offer with something other than an acknowledgement' });
                };
                sock.write(OFFER_LINE);
              }),
            };
            // REQ-STARTUP-121: the record passes, or it does not, and the successor — if it is still there — is told which.
            void onSuccessor(h.successor, link).then(
              (answer) => { if (!sock.destroyed) sock.end(answerLine(answer)); },
              (cause: unknown) => { if (!sock.destroyed) sock.end(answerLine({ passed: false, reason: `the running instance failed while passing its record: ${String(cause)}` })); },
            );
            continue;
          }
          const holder = readRecord(deps.recordFile);
          if (holder === undefined || holder.pid !== deps.pid || holder.endpoint !== endpoint) {
            deps.onHandOverDeclined?.(h, holder);
            sock.end(DECLINED_LINE);
            return;
          }
          deps.onHandOver(h);
          sock.end('{"ok":true}\n');
          return;
        }
      });
      sock.on('end', gone);
      sock.on('close', gone);
      sock.on('error', () => { /* a client that vanished; 'close' follows */ });
    });
    server.once('error', reject);
    server.listen(endpoint, () => { server.off('error', reject); resolve(server); });
  });
}

/**
 * REQ-STARTUP-121, ADR-0055: the predecessor "replaces the record's contents with the successor's pid, host and
 * endpoint address in one atomic replacement" — a sibling written and renamed over, never truncate-and-rewrite, so a
 * reader observes the old fields or the new and never a half-written record that REQ-STARTUP-164 (3) would reclaim.
 * Only the holder passes its own record: a record that no longer names this process is left alone. And only a holder
 * waiting for a successor it started passes it at all (`acceptSuccessor`): an unsolicited announcement is refused.
 *
 * The pass is two steps (repaired 2026-09-28): the record is OFFERED, and rewritten only once the successor has
 * acknowledged the offer within the hand-over interval. The successor bounds its own wait for an answer by that same
 * interval and, when it expires, closes and ends; if this process's loop was blocked past that moment, its announcement
 * is still read here afterwards, and a one-step pass rewrote the record for a process that had already gone — then
 * reported the pass, and main closed the last window with no instance left running. The acknowledgement is the proof
 * the successor is still there; without it the record is left as it was and the restart fails (`onRecordPassFailed`).
 */
async function passRecord(deps: ClaimDeps, successor: InstanceRecord, link: SuccessorLink): Promise<PassAnswer> {
  const wellFormed = typeof successor.pid === 'number' && Number.isInteger(successor.pid) && successor.pid > 0
    && typeof successor.host === 'string' && successor.host === deps.machineId
    && typeof successor.acquired_at === 'string' && successor.acquired_at !== ''
    && typeof successor.endpoint === 'string' && successor.endpoint !== '';
  if (!wellFormed) return { passed: false, reason: 'the announced successor record is malformed or names another machine' };
  // Only while a restart this instance started is waiting for its successor (REQ-STARTUP-161: never a second instance).
  if (deps.acceptSuccessor?.(successor) !== true) return { passed: false, reason: 'the running instance is not waiting for a successor' };
  /**
   * From here the announcement was accepted: a restart this instance started is waiting on it. A refusal past this
   * point is that restart's failure, not a stray launch's, so it is reported (`onRecordPassFailed`) as well as answered —
   * otherwise the waiting restart would never settle (REQ-STARTUP-121's failure branch; repaired at verification).
   */
  const refuse = (reason: string): PassAnswer => {
    deps.onRecordPassFailed?.(successor, reason);
    return { passed: false, reason };
  };
  const holds = (): boolean => readRecord(deps.recordFile)?.pid === deps.pid;
  if (!holds()) return refuse('the instance record no longer names the running instance');
  // Step one: offer the record, and wait — on the timer port, bounded by the hand-over interval — for the successor to
  // acknowledge it. A successor that closed, or that is silent past the bound, has stopped waiting: nothing is rewritten.
  const acknowledgement = await link.offer(deps.timers, deps.handOverIntervalMs);
  if (!acknowledgement.acknowledged) return refuse(acknowledgement.reason);
  // Step two: the record passes. Read again first — a reclaim may have rewritten it during the wait.
  if (!holds()) return refuse('the instance record no longer names the running instance');
  const record: InstanceRecord = { pid: successor.pid, host: successor.host, acquired_at: successor.acquired_at, endpoint: successor.endpoint };
  const replaced = await (deps.replaceRecord ?? replaceDocument)(deps.recordFile, `${JSON.stringify(record)}\n`);
  if (!replaced.ok) return refuse(`the instance record could not be replaced: ${replaced.error.headline}${replaced.error.detail === undefined ? '' : ` — ${replaced.error.detail}`}`);
  deps.onRecordPassed?.(record);
  return { passed: true };
}

/**
 * Whether a candidate can hold the socket: it exists as a directory and this process may create a file in it. A directory
 * the socket goes in directly is made here when it does not exist, since a scratch runtime directory does not exist until
 * the harness's launch makes the profile that names it; a temporary directory, below which each attempt makes its own
 * private directory, is the system's and is only checked. Nothing below a temporary directory is made or trusted here: the
 * private directory is made per attempt by `placeSocket`, under a name nobody can take first (OQ-248).
 */
function preparedSocketDirectory(candidate: SocketCandidate): boolean {
  try {
    if (!candidate.private) mkdirSync(candidate.dir, { recursive: true });
    if (!statSync(candidate.dir).isDirectory()) return false;
    accessSync(candidate.dir, constants.W_OK | constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The socket directory a claim listens under: the first of `socketDirectoryCandidates` that can hold one. Read ONCE per
 * launch. `undefined` on Windows (a named pipe), and where no candidate can hold a socket — the endpoint is then addressed
 * under the data directory, its listen fails, and the claim is refused with the reason rather than left unhandled.
 */
function socketDirectoryFor(deps: ClaimDeps, platform: NodeJS.Platform): SocketCandidate | undefined {
  if (platform === 'win32') return undefined;
  const candidates = socketDirectoryCandidates({
    platform, pid: deps.pid, endpointDir: deps.endpointDir, socketDir: deps.socketDir,
    runtimeDir: (deps.env ?? process.env)['XDG_RUNTIME_DIR'],
    tempDirs: deps.tempDirs ?? [tmpdir(), '/tmp'],
  });
  return candidates.find(preparedSocketDirectory);
}

/**
 * Where one attempt's socket goes: the candidate itself, or, below a temporary directory, a fresh private directory this
 * attempt makes (`mkdtemp`: `0700`, a name nobody could have taken first) and owns — `own`, removed with the socket when the
 * attempt loses or the instance closes, so a launch that is handed over leaves nothing behind (OQ-248, R-072, 2026-10-13:
 * what an attempt creates to hold its endpoint is part of "the record itself" REQ-STARTUP-164 allows, removed when it loses).
 */
function placeSocket(base: SocketCandidate | undefined): { readonly dir?: string; readonly own?: string } | { readonly refused: string } {
  if (base === undefined || !base.private) return base === undefined ? {} : { dir: base.dir };
  try {
    const own = mkdtempSync(posix.join(base.dir, PRIVATE_PREFIX));
    return { dir: own, own };
  } catch (cause) {
    return { refused: `this launch could not make a private directory for its hand-over endpoint below ${base.dir}: ${String(cause)}; no instance record was written (REQ-STARTUP-164)` };
  }
}

/** Remove the private directory an attempt made for its endpoint, once its socket is gone; never recursively. */
function removeOwnDirectory(own: string | undefined): void {
  if (own === undefined) return;
  try { rmdirSync(own); } catch { /* not empty, or already gone */ }
}

/**
 * OQ-248: the reclaim of a record whose process is dead on this host removes the endpoint that record names with it — the
 * socket a crash or a force-quit left, and the per-attempt private directory it sat in once that is empty. Only what is
 * plainly that process's endpoint: a socket, owned by this user, named `instance-<recorded pid>-<8 hex>.sock`. Until then
 * every crash left a socket nothing would read again
 * (`docs/defects/fixed/a-reclaim-leaves-the-dead-instances-socket-behind.md`).
 */
function removeDeadEndpoint(dead: InstanceRecord, platform: NodeJS.Platform): void {
  if (platform === 'win32' || !posix.isAbsolute(dead.endpoint)) return;
  if (!new RegExp(`^instance-${dead.pid}-[0-9a-f]{8}\\.sock$`).test(posix.basename(dead.endpoint))) return;
  try {
    const stat = lstatSync(dead.endpoint);
    const uid = process.getuid?.();
    if (!stat.isSocket() || (uid !== undefined && stat.uid !== uid)) return;
    unlinkSync(dead.endpoint);
  } catch { return; }
  const parent = posix.dirname(dead.endpoint);
  if (PRIVATE_DIRECTORY.test(posix.basename(parent))) removeOwnDirectory(parent);
}

/**
 * Open the endpoint a claim attempt will name, BEFORE the record naming it is written (ADR-0055: "the endpoint is listening
 * before the record is written, not after"). A second launch that reads the record the moment it appears and connects to the
 * endpoint it names must find it accepting: one that cannot connect treats the instance as one that does not answer and,
 * by REQ-STARTUP-164 (3), reclaims, so a record written first named an address nothing served yet and two launches started
 * within one `listen` of each other could both become the instance (REQ-STARTUP-161). Repaired by fin34
 * (`docs/defects/fixed/the-instance-record-is-written-before-its-endpoint-listens.md`); until then the record was taken
 * first and given back when the listen failed. A listen that fails — no directory could hold the socket — now writes no
 * record at all: the claim is refused with the reason, which main logs before it ends the launch (REQ-STARTUP-164's bounded
 * end), and the next launch finds no record to wait on.
 */
async function openEndpoint(deps: ClaimDeps, endpoint: string, platform: NodeJS.Platform): Promise<{ readonly server: Server } | { readonly refused: string }> {
  try {
    return { server: await listen(endpoint, deps, platform, (successor, link) => passRecord(deps, successor, link)) };
  } catch (cause) {
    return { refused: `this launch could not open its hand-over endpoint ${endpoint}: ${String(cause)}; no instance record was written (REQ-STARTUP-164)` };
  }
}

/**
 * Close an endpoint whose claim was lost or refused: the server, its socket and the private directory the attempt made for
 * it, never the record, which is not ours. A launch that is handed over leaves nothing behind (OQ-248).
 */
async function closeEndpoint(server: Server, endpoint: string, platform: NodeJS.Platform, own?: string): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (platform !== 'win32') { try { unlinkSync(endpoint); } catch { /* */ } }
  removeOwnDirectory(own);
}

/** Release what this process holds: its record (only while it still names this process), its server, its socket and its directory. */
function closerFor(deps: ClaimDeps, server: Server, endpoint: string, platform: NodeJS.Platform, own?: string): () => Promise<void> {
  return async () => {
    try {
      const now = readRecord(deps.recordFile);
      if (now && now.pid === deps.pid) rmSync(deps.recordFile, { force: true });
    } catch { /* */ }
    await closeEndpoint(server, endpoint, platform, own);
  };
}

interface HandOverAnswer {
  readonly acked: boolean;
  /** The reason a refusing instance gave, when it gave one (a successor's announcement refused). */
  readonly reason?: string;
}

function readAnswer(buf: string): HandOverAnswer {
  const line = buf.slice(0, buf.indexOf('\n') < 0 ? buf.length : buf.indexOf('\n'));
  try {
    const parsed = JSON.parse(line) as { ok?: unknown; reason?: unknown };
    return parsed.ok === true ? { acked: true } : typeof parsed.reason === 'string' ? { acked: false, reason: parsed.reason } : { acked: false };
  } catch {
    return { acked: false };
  }
}

function tryHandOver(endpoint: string, h: HandOver, timers: Timers, bound: Millis): Promise<HandOverAnswer> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: HandOverAnswer) => { if (!done) { done = true; resolve(v); } };
    const t = timers.after(bound, () => { try { sock.destroy(); } catch { /* */ } finish({ acked: false }); });
    const sock = connect(endpoint);
    sock.setEncoding('utf8');
    let buf = '';
    sock.on('connect', () => sock.write(`${JSON.stringify(h)}\n`));
    sock.on('data', (c: string) => { buf += c; if (buf.includes('\n')) { t.cancel(); sock.end(); finish(readAnswer(buf)); } });
    sock.on('error', () => { t.cancel(); finish({ acked: false }); });
    sock.on('close', () => { t.cancel(); finish(readAnswer(buf)); });
  });
}

/**
 * REQ-STARTUP-121 — the successor's side of the two-step pass. Announce; wait at most the hand-over interval for the
 * offer (the timer port's); acknowledge it; then wait for the predecessor's last word: `passed`, or a refusal with its
 * reason. Past the acknowledgement no timer runs, because the predecessor may be rewriting the record at that moment
 * and a successor that gave up then is exactly the process a record must never be left naming. Should the connection
 * end with no last word — the predecessor exited between the rewrite and its answer — the record decides: the pass
 * happened if and only if the record now names this successor.
 */
function announceSuccessor(deps: ClaimDeps, predecessorEndpoint: string, record: InstanceRecord): Promise<HandOverAnswer> {
  return new Promise((resolve) => {
    let done = false;
    let acknowledged = false;
    let buf = '';
    const finish = (v: HandOverAnswer) => { if (!done) { done = true; resolve(v); } };
    const t = deps.timers.after(deps.handOverIntervalMs, () => {
      if (acknowledged) return;
      try { sock.destroy(); } catch { /* */ }
      finish({ acked: false });
    });
    const sock = connect(predecessorEndpoint);
    sock.setEncoding('utf8');
    sock.on('connect', () => sock.write(`${JSON.stringify({ successor: record })}\n`));
    sock.on('data', (chunk: string) => {
      buf += chunk;
      for (;;) {
        const nl = buf.indexOf('\n');
        if (nl < 0 || done) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let offered = false;
        try { offered = (JSON.parse(line) as { record?: unknown }).record === 'offered'; } catch { /* not an offer */ }
        if (offered && !acknowledged) {
          acknowledged = true;
          t.cancel();
          sock.write(ACK_LINE);
          continue;
        }
        // The last word: `passed`, or a refusal and its reason. Nothing else is a pass.
        t.cancel();
        sock.end();
        const answer = readAnswer(line);
        let passed = false;
        try { passed = answer.acked && (JSON.parse(line) as { record?: unknown }).record === 'passed'; } catch { /* not an answer */ }
        finish(passed ? { acked: true } : { acked: false, ...(answer.reason === undefined ? {} : { reason: answer.reason }) });
        return;
      }
    });
    sock.on('error', () => { /* 'close' follows */ });
    sock.on('close', () => {
      t.cancel();
      if (done) return;
      if (!acknowledged) { finish(readAnswer(buf)); return; }
      const now = readRecord(deps.recordFile);
      finish(now !== undefined && now.pid === record.pid && now.endpoint === record.endpoint
        ? { acked: true }
        : { acked: false, reason: 'the running instance ended without passing its record' });
    });
  });
}

/**
 * Resolve the launch to exactly one of two outcomes, and `refused` only for a bounded failure: two claim attempts both
 * lost (REQ-STARTUP-164); an attempt whose endpoint cannot listen anywhere, refused before any record is written
 * (`openEndpoint`); or an exclusive create that failed with an error rather than finding a record.
 */
export async function claimInstance(deps: ClaimDeps, handOver: HandOver = {}): Promise<ClaimOutcome> {
  const platform = deps.platform ?? process.platform;
  /**
   * The socket directory is chosen ONCE, before the record exists, so the environment is read once per launch. The
   * directory is created here rather than left to the listen, because a scratch runtime directory does not exist until the
   * harness's launch makes the profile that names it. Below a temporary directory each attempt then makes its own private
   * directory (`placeSocket`), and the record names the endpoint of the attempt that won.
   */
  const base = socketDirectoryFor(deps, platform);
  const attempt = async (): Promise<ClaimOutcome | 'lost'> => {
    const placed = placeSocket(base);
    if ('refused' in placed) return { outcome: 'refused', reason: placed.refused };
    const endpoint = endpointFor(deps.endpointDir, deps.pid, platform, placed.dir);
    const record: InstanceRecord = { pid: deps.pid, host: deps.machineId, acquired_at: toIsoUtc(deps.wall.instant()), endpoint };
    // The endpoint listens first; only then does the record name it (ADR-0055, REQ-STARTUP-161/164).
    const opened = await openEndpoint(deps, endpoint, platform);
    if ('refused' in opened) { removeOwnDirectory(placed.own); return { outcome: 'refused', reason: opened.refused }; }
    const r = exclusiveCreate(deps.recordFile, `${JSON.stringify(record)}\n`);
    if (r.ok && r.value.minted) {
      return { outcome: 'instance', record, server: opened.server, close: closerFor(deps, opened.server, endpoint, platform, placed.own) };
    }
    // OQ-248: what this attempt made for its endpoint goes with it; a launch that is handed over leaves nothing behind.
    await closeEndpoint(opened.server, endpoint, platform, placed.own);
    if (!r.ok) return { outcome: 'refused', reason: `${r.error.headline}: ${r.error.detail ?? ''}` };
    return 'lost';
  };

  // (1) the exclusive claim
  const first = await attempt();
  if (first !== 'lost') return first;

  // (2) hand over to the instance the record names; (3) unreadable / dead / silent → reclaim once
  const existing = readRecord(deps.recordFile);
  const live = existing ? isLockLive(existing, deps.machineId) : false;
  if (existing && live) {
    const answer = await tryHandOver(existing.endpoint, handOver, deps.timers, deps.handOverIntervalMs);
    if (answer.acked) return { outcome: 'handed-over' };
  }
  /**
   * (3) The reclaim takes any record but one naming another LIVE claim. Read again first: a record that now names another
   * claim whose process lives — another launch reclaimed it inside the interval, or the process this launch reached
   * declined because the record had moved on (ADR-0055 consequence 14) — is that claim's, and removing it would make this
   * launch a second instance beside it (REQ-STARTUP-161). It is left as it is, the retry loses, and (4) hands this launch
   * to it. A record that cannot be read, the claim that went unanswered, or another claim whose process has ended is
   * nobody's, and is reclaimed. Until 2026-10-31 the reclaim removed whatever stood there; the same day, for one commit
   * (7262da97), it left every other claim, a dead one too, and such a launch ended refused with no window.
   */
  const now = readRecord(deps.recordFile);
  const namesAnotherLiveClaim = now !== undefined && (existing === undefined || !sameClaim(now, existing)) && isLockLive(now, deps.machineId);
  if (!namesAnotherLiveClaim) {
    // OQ-248: the endpoint is the record's, so a dead process's goes with its record; a live but silent one's stays its own.
    if (existing && !live) removeDeadEndpoint(existing, platform);
    rmSync(deps.recordFile, { force: true });
  }
  const second = await attempt();
  if (second !== 'lost') return second;
  // (4) Another launch claimed the record inside the interval and is becoming the instance: hand over once more, then end,
  // having started no rival. Not done until 2026-10-31, when the launch ended refused with no window of its own or another's.
  const holder = readRecord(deps.recordFile);
  if (holder && isLockLive(holder, deps.machineId)) {
    const answer = await tryHandOver(holder.endpoint, handOver, deps.timers, deps.handOverIntervalMs);
    if (answer.acked) return { outcome: 'handed-over' };
  }
  return { outcome: 'refused', reason: 'the record was recreated by another party between the reclaim and the retry, and the hand-over to it was not acknowledged; no third attempt is made (REQ-STARTUP-164)' };
}

/**
 * REQ-STARTUP-121 / ADR-0055 — the SUCCESSOR's side of the update restart. Not an ordinary launch: it performs no
 * claim and no hand-over attempt. It opens its own hand-over endpoint, announces its record to the predecessor at
 * `predecessorEndpoint`, and becomes the instance the moment the predecessor answers that the record has passed.
 * The predecessor then closes its window and exits; a launch arriving meanwhile is handed to whichever of the two the
 * record names at that moment, and no third process is ever started.
 *
 * The one bound here is the successor's wait for the predecessor's OFFER — the hand-over interval — because the
 * predecessor offers at once, and a successor that got no offer must not become a rival: it closes its endpoint and
 * reports `refused`, and main ends it quietly while the predecessor keeps its record and its window (REQ-STARTUP-121's
 * failure branch). Once it has acknowledged an offer it waits for the predecessor's last word without a bound of its
 * own, because from that moment the record may name it: the predecessor's own bound on the acknowledgement, its
 * answer, or — should it end without one — the record itself decides (`announceSuccessor`). The predecessor's wait for
 * the successor to arrive has no bound (ADR-0055), and that wait is the updater's.
 */
export async function inheritInstance(deps: ClaimDeps, predecessorEndpoint: string): Promise<ClaimOutcome> {
  const platform = deps.platform ?? process.platform;
  const placed = placeSocket(socketDirectoryFor(deps, platform));
  if ('refused' in placed) return { outcome: 'refused', reason: placed.refused };
  const endpoint = endpointFor(deps.endpointDir, deps.pid, platform, placed.dir);
  const record: InstanceRecord = { pid: deps.pid, host: deps.machineId, acquired_at: toIsoUtc(deps.wall.instant()), endpoint };
  let server: Server;
  try {
    server = await listen(endpoint, deps, platform, (successor, link) => passRecord(deps, successor, link));
  } catch (cause) {
    removeOwnDirectory(placed.own);
    return { outcome: 'refused', reason: `the successor could not open its hand-over endpoint: ${String(cause)}` };
  }
  const close = closerFor(deps, server, endpoint, platform, placed.own);
  const answer = await announceSuccessor(deps, predecessorEndpoint, record);
  if (!answer.acked) {
    await close();
    const why = answer.reason === undefined ? 'the running instance did not pass its record within the hand-over interval' : `the running instance refused to pass its record — ${answer.reason}`;
    return { outcome: 'refused', reason: `${why}; this launch ends, and the instance keeps its record and its window (REQ-STARTUP-121)` };
  }
  return { outcome: 'instance', record, server, close };
}
