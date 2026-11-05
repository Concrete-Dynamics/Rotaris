import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { toIsoUtc, type Instant } from '@rotaris/kernel';
import type { DiagnosticsCapture, DiagnosticsLevel } from '@rotaris/contracts';
import type { AppLogRecord } from './app-log.js';

/**
 * Opt-in diagnostics (domain 11's "Opt-in diagnostics"), the slice hardening bundle D2 builds (R-091,
 * `docs/architecture/hardening/02-the-findings.md` §3.4): the `light` level writes the application log's recorded lines
 * (PD-MONITOR-002: `info` and above unless `ROTARIS_APP_LOG_LEVEL` says otherwise) as JSON lines into a run directory of
 * each main window built while the level is not `off`, beside a `manifest.json`, so a packaged Windows build — whose
 * standard output nobody reads — keeps its log where a person can find it.
 *
 * - **One source** (REQ-STARTUP-129): the preference store's `diagnostics/level` and `diagnostics/outputDir`, read when a
 *   main window is built. A later choice reaches the windows built afterwards and never alters a running capture
 *   (REQ-SHELL-163). No environment variable is read here.
 * - **Off is nothing** (REQ-STARTUP-130): no capture object, no directory, no file, no timer; the application log asks the
 *   registry and the registry, holding no capture, returns at once.
 * - **The run directory** (REQ-STARTUP-131): `<base>/<yyyymmddTHHMMSSZ>-<pid>/`, created exclusively, the first free `-2`,
 *   `-3`, … taken when the name is held; a base that cannot be written leaves the window open with the capture inactive,
 *   and the card says why. The base is the chosen folder; else the window's workspace's default, but only when that folder
 *   is an existing directory when the window is built and the run directory can be created there; else — a window built
 *   with no workspace, or for a path that is a file, missing, unreachable or unwritable —
 *   `<per-user data directory>/diagnostics/rotaris` (PD-STARTUP-011 revision 2, ruling OQ-541; REQ-STARTUP-145). The
 *   base is decided inside the window's build, fixed then, and moved neither by what the window's open then does nor by
 *   a workspace opened later; nothing is created under a path that is not an existing directory. The inactive cases are
 *   the per-user base itself unwritable, and a chosen folder unwritable, which is never redirected.
 * - **The manifest** (REQ-STARTUP-132, REQ-STARTUP-157): schema 3, the app's identity, the creation time, the platform
 *   triple, the full effective configuration with every bound and cadence of REQ-STARTUP-133, and a self-checksum.
 * - **The bound** (REQ-STARTUP-133): the stream is at most four segment files of at most 8 MiB, the oldest replaced.
 * - **The reader** (REQ-STARTUP-138): `readJsonLines` tolerates a crash-truncated final line.
 *
 * **Not built here** (hardening D2 builds the light level for the application log only, and cites no requirement it does
 * not build): the metric and span streams, the heartbeat and the triggers, snapshots and their `snapshots/` directory,
 * `summary.json` and `summary.md` at close, and `deep`'s allocation captures. `deep` is accepted and stored, since the
 * control offers it, and captures what `light` does; what it adds is unbuilt, the owed list of
 * `docs/architecture/codebase/20-where-the-next-work-lands.md` naming each requirement. The application log's place in the run
 * directory, which REQ-STARTUP-132's list of artifacts did not name, is PD-STARTUP-011's (ruled on OQ-480).
 */

const MIB = 1024 * 1024;

/**
 * REQ-STARTUP-133's bounds and cadences, every one of which `manifest.json` records (REQ-STARTUP-132, REQ-STARTUP-157), so a
 * run reads without the build that wrote it. Only the stream bound is enforced by this slice; the others are what the
 * requirement fixes for the parts not yet built, recorded so the manifest is the full effective configuration.
 */
export const DIAGNOSTICS_BOUNDS = {
  streamSegmentBytes: 8 * MIB,
  streamSegments: 4,
  snapshotBudgetBytes: 16 * MIB,
  metricSamples: 4096,
  spanSamples: 1024,
  spanNames: 128,
  otherSpanName: '__other__',
  heartbeatMs: 250,
  metricIntervalMs: 1000,
  triggers: { eventLoopLagMs: 1000, cooldownMs: 60_000, rssGrowthBytes: 256 * MIB, threadGrowth: 8 },
  deep: { allocationIntervalMs: 300_000, tracingWindowMs: 2000, slowThresholdMs: 1000, sitesPerCapture: 20, sitesInSummary: 10 },
} as const;

/** The application log's stream in a run directory: `app-log-NN.jsonl` (PD-STARTUP-011). */
export const APP_LOG_STREAM = 'app-log';
export const MANIFEST_FILE = 'manifest.json';
export const MANIFEST_SCHEMA = 3;

/** REQ-STARTUP-131's default base for a window's workspace. */
export function defaultDiagnosticsBase(workspace: string): string {
  return join(workspace, '.rotaris', 'diagnostics', 'rotaris');
}

/**
 * PD-STARTUP-011's per-user base, for a window built with no workspace or whose workspace default cannot be created
 * (revision 2): `<per-user data directory>/diagnostics/rotaris`, the per-user data directory being REQ-STARTUP-145's,
 * whose machine-local clause it inherits.
 */
export function perUserDiagnosticsBase(perUserData: string): string {
  return join(perUserData, 'diagnostics', 'rotaris');
}

/** REQ-STARTUP-131: the window's start in UTC, `yyyymmddTHHMMSSZ`. */
export function runDirectoryStamp(at: Instant): string {
  return toIsoUtc(at).replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
}

/**
 * REQ-STARTUP-131: create `<base>/<stamp>-<pid>`, or the first free `-2`, `-3`, … after it, each exclusively — a directory
 * that exists is never written into. Throws when no name can be created (the base unwritable), which the caller reports.
 */
export function createRunDirectory(base: string, stamp: string, pid: number): string {
  mkdirSync(base, { recursive: true });
  const name = `${stamp}-${pid}`;
  for (let n = 1; ; n += 1) {
    const path = join(base, n === 1 ? name : `${name}-${n}`);
    try {
      mkdirSync(path);
      return path;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
    }
  }
}

/** JSON with every object's keys sorted, at every depth: the canonical form the manifest's checksum is taken over. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface ManifestInput {
  readonly app: { readonly name: string; readonly version: string };
  readonly createdAt: Instant;
  readonly platform: { readonly os: string; readonly arch: string; readonly runtime: string };
  readonly pid: number;
  readonly level: Exclude<DiagnosticsLevel, 'off'>;
  readonly outputBase: string;
  readonly outputBaseChosen: boolean;
  readonly runDirectory: string;
}

/**
 * REQ-STARTUP-132's `manifest.json`: schema 3, the app's identity, the creation time, the platform triple, the full
 * effective configuration, and `checksum`, the SHA-256 of the canonical JSON of everything else (REQ-STARTUP-157 leaves the
 * names to the implementation; the units are its: milliseconds, integer bytes, ISO-8601 UTC).
 */
export function diagnosticsManifest(input: ManifestInput): Record<string, unknown> {
  const body = {
    schema: MANIFEST_SCHEMA,
    app: input.app,
    createdAt: toIsoUtc(input.createdAt),
    platform: { triple: `${input.platform.os}-${input.platform.arch}-${input.platform.runtime}`, ...input.platform },
    pid: input.pid,
    configuration: {
      level: input.level,
      outputBase: input.outputBase,
      outputBaseChosen: input.outputBaseChosen,
      runDirectory: input.runDirectory,
      streams: { [APP_LOG_STREAM]: { file: `${APP_LOG_STREAM}-NN.jsonl`, segmentBytes: DIAGNOSTICS_BOUNDS.streamSegmentBytes, segments: DIAGNOSTICS_BOUNDS.streamSegments, maxBytes: DIAGNOSTICS_BOUNDS.streamSegmentBytes * DIAGNOSTICS_BOUNDS.streamSegments } },
      snapshotBudgetBytes: DIAGNOSTICS_BOUNDS.snapshotBudgetBytes,
      samples: { metrics: DIAGNOSTICS_BOUNDS.metricSamples, spans: DIAGNOSTICS_BOUNDS.spanSamples, spanNames: DIAGNOSTICS_BOUNDS.spanNames, otherSpanName: DIAGNOSTICS_BOUNDS.otherSpanName },
      cadence: { heartbeatMs: DIAGNOSTICS_BOUNDS.heartbeatMs, metricIntervalMs: DIAGNOSTICS_BOUNDS.metricIntervalMs },
      triggers: DIAGNOSTICS_BOUNDS.triggers,
      deep: DIAGNOSTICS_BOUNDS.deep,
      // What this build writes into the run directory, so a reader knows an absent stream is unbuilt, not lost.
      captured: [APP_LOG_STREAM],
    },
  };
  return { ...body, checksum: createHash('sha256').update(canonicalJson(body)).digest('hex') };
}

/** Whether a manifest's checksum is the SHA-256 of its canonical JSON without the checksum field (REQ-STARTUP-132). */
export function manifestChecksumHolds(manifest: Record<string, unknown>): boolean {
  const { checksum, ...body } = manifest;
  return checksum === createHash('sha256').update(canonicalJson(body)).digest('hex');
}

export interface SegmentBounds { readonly segmentBytes: number; readonly segments: number }

/** `<stem>-NN.jsonl`, numbered from 01 in the order written; the number only rises, so the name orders the stream. */
export function segmentName(stem: string, n: number): string {
  return `${stem}-${String(n).padStart(2, '0')}.jsonl`;
}

/**
 * One JSON-lines stream of REQ-STARTUP-133: at most `segments` files of at most `segmentBytes` each. A record that would
 * take the open segment past its bound opens the next; once `segments` exist, the oldest is removed first, so the stream
 * never holds more than `segments × segmentBytes`. A record is written whole or not at all, never split across segments,
 * and one larger than a segment is not written (counted in `oversized`). Writes are synchronous, like the log they serve.
 * A write that fails stops the stream for good — `failed` says so and `onFailure` is told once — so a full disk never
 * turns the application log into an error of its own.
 */
export class SegmentedJsonLines {
  #fd: number | null = null;
  #size = 0;
  #next = 1;
  readonly #kept: number[] = [];
  #failed = false;
  #oversized = 0;

  constructor(
    private readonly dir: string,
    private readonly stem: string,
    private readonly bounds: SegmentBounds,
    private readonly onFailure: (cause: unknown) => void = () => undefined,
  ) {}

  get failed(): boolean { return this.#failed; }
  get oversized(): number { return this.#oversized; }

  append(record: unknown): void {
    if (this.#failed) return;
    const line = `${JSON.stringify(record)}\n`;
    const bytes = Buffer.byteLength(line);
    if (bytes > this.bounds.segmentBytes) { this.#oversized += 1; return; }
    try {
      if (this.#fd === null || this.#size + bytes > this.bounds.segmentBytes) this.#roll();
      writeSync(this.#fd as number, line);
      this.#size += bytes;
    } catch (cause) {
      this.#failed = true;
      this.close();
      this.onFailure(cause);
    }
  }

  close(): void {
    if (this.#fd === null) return;
    const fd = this.#fd;
    this.#fd = null;
    try { closeSync(fd); } catch { /* already gone */ }
  }

  #roll(): void {
    this.close();
    if (this.#kept.length >= this.bounds.segments) {
      // A segment someone already removed is replaced all the same.
      try { unlinkSync(join(this.dir, segmentName(this.stem, this.#kept.shift() as number))); } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause; }
    }
    const n = this.#next;
    this.#next += 1;
    this.#fd = openSync(join(this.dir, segmentName(this.stem, n)), 'wx');
    this.#kept.push(n);
    this.#size = 0;
  }
}

/**
 * REQ-STARTUP-138: the records of one JSON-lines text. A final line with no line break after it is what a crash leaves
 * mid-write: kept when it reads as a whole record, dropped otherwise and reported as `truncated`, so a crashed session's
 * stream stays readable. A malformed line anywhere else is not a crash's and is reported as an error naming its line.
 */
export function readJsonLines(text: string): { readonly records: unknown[]; readonly truncated: boolean } {
  const lines = text.split('\n');
  const tail = lines.pop() as string; // '' when the text ends in a line break
  const records = lines.map((line, i) => {
    try { return JSON.parse(line) as unknown; } catch { throw new Error(`line ${i + 1} is not a JSON record`); }
  });
  if (tail === '') return { records, truncated: false };
  try {
    const last = JSON.parse(tail) as unknown;
    if (last !== null && typeof last === 'object') return { records: [...records, last], truncated: false };
  } catch { /* a cut record */ }
  return { records, truncated: true };
}

/** REQ-STARTUP-138: one stream of a run directory, its segments read in the order written. */
export function readStream(dir: string, stem: string): { readonly records: unknown[]; readonly truncated: boolean; readonly segments: readonly string[] } {
  const pattern = new RegExp(`^${stem}-(\\d+)\\.jsonl$`);
  const segments = readdirSync(dir).flatMap((name) => { const m = pattern.exec(name); return m ? [{ name, n: Number(m[1]) }] : []; }).sort((a, b) => a.n - b.n).map((s) => s.name);
  const records: unknown[] = [];
  let truncated = false;
  for (const name of segments) {
    const read = readJsonLines(readFileSync(join(dir, name), 'utf8'));
    records.push(...read.records);
    truncated ||= read.truncated;
  }
  return { records, truncated, segments };
}

/** What main reads from the preference store when it builds a main window (REQ-STARTUP-129). */
export interface DiagnosticsChoice {
  readonly level: DiagnosticsLevel;
  /** `diagnostics/outputDir`; undefined means REQ-STARTUP-131's default. */
  readonly outputDir: string | undefined;
  /** The workspace the window is built for, or null for a window that holds none. */
  readonly workspace: string | null;
}

/**
 * The folder a window would write under before anything on disk is checked: the chosen one, else its workspace's default
 * (REQ-STARTUP-131), else — a window that holds no workspace — the per-user default under `perUserData` (PD-STARTUP-011).
 * Never none. It is the card's folder at `off`, where nothing is checked (REQ-STARTUP-130); a window built at `light` or
 * `deep` may take the per-user base in place of its workspace's default (`DiagnosticsCaptures.open`).
 */
export function diagnosticsBase(choice: Pick<DiagnosticsChoice, 'outputDir' | 'workspace'>, perUserData: string): string {
  if (choice.outputDir !== undefined) return choice.outputDir;
  return choice.workspace === null ? perUserDiagnosticsBase(perUserData) : defaultDiagnosticsBase(choice.workspace);
}

/** Whether `path` is an existing directory now: a file, a missing or an unreachable path is not (REQ-SHELL-010 (b)'s check). */
export function isExistingDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

/**
 * PD-STARTUP-011 revision 2's fallback: the workspace default a window could not take, and why, in the words the card and
 * the capture's first line both use.
 */
export interface DiagnosticsFallback {
  /** The workspace default, `<workspace>/.rotaris/diagnostics/rotaris`, that the window did not write under. */
  readonly from: string;
  /** Why: the workspace path is not an existing folder, or the errno the run directory's creation there met. */
  readonly cause: string;
}

export interface DiagnosticsCapturesDeps {
  readonly now: () => Instant;
  readonly pid: number;
  /** The app's identity, asked when a capture starts (the installed version is read lazily in main). */
  readonly app: () => ManifestInput['app'];
  readonly platform: ManifestInput['platform'];
  /**
   * REQ-STARTUP-145's per-user data directory, under which a window built with no workspace and no chosen folder writes
   * (PD-STARTUP-011). Main passes the one it resolved at start (`resolveUserDirs().data`).
   */
  readonly perUserData: string;
  /**
   * Whether a path is an existing directory (PD-STARTUP-011 revision 2): the workspace default is tried only under one, so
   * nothing is created under a path that is a file, missing or unreachable. Main passes `isExistingDirectory`.
   */
  readonly isDirectory: (path: string) => boolean;
  /** A line for the application log, at `warning`: a capture that could not start or stopped. */
  readonly warn: (message: string) => void;
  /** A line for the application log, at `info`: a capture that started, naming its directory. */
  readonly info: (message: string) => void;
  readonly bounds?: SegmentBounds;
}

interface Running { readonly level: Exclude<DiagnosticsLevel, 'off'>; readonly runDirectory: string; readonly stream: SegmentedJsonLines }

/**
 * Every main window's capture, keyed by window. `open` is called once when a window is built, `close` when it is gone, and
 * `record` for every line the application log records — fed to every running capture, so each window's run directory
 * holds the instance's log for as long as that window lived. With no capture running, `record` does nothing at all.
 */
export class DiagnosticsCaptures {
  readonly #running = new Map<number, Running>();
  readonly #inactive = new Map<number, { readonly level: Exclude<DiagnosticsLevel, 'off'>; readonly reason: string }>();
  /**
   * The default base each window was built with, kept whatever its level, so the card's folder in force stays the one fixed
   * when the window was built and is moved neither by its open nor by a workspace opened later (PD-STARTUP-011): at `off`
   * its workspace's default unchecked (REQ-STARTUP-130), otherwise the base the capture took — the workspace default or, in
   * its place, the per-user base — with the fallback where one was taken. A map entry, nothing on disk and no timer, so
   * `off` stays zero work in REQ-STARTUP-130's sense.
   */
  readonly #builtWith = new Map<number, { readonly base: string; readonly fallback: DiagnosticsFallback | undefined }>();

  constructor(private readonly deps: DiagnosticsCapturesDeps) {}

  /**
   * REQ-STARTUP-129 to REQ-STARTUP-132: start `windowId`'s capture as `choice` stands now, or nothing at `off`. Called when
   * the window is built, before its workspace is opened, so the base decided here depends on nothing the open does
   * (PD-STARTUP-011 revision 2, OQ-541).
   */
  open(windowId: number, choice: DiagnosticsChoice): DiagnosticsCapture {
    this.close(windowId);
    const unchecked = diagnosticsBase({ outputDir: undefined, workspace: choice.workspace }, this.deps.perUserData);
    if (choice.level === 'off') {
      this.#builtWith.set(windowId, { base: unchecked, fallback: undefined });
      return { state: 'off' };
    }
    const level = choice.level;
    const started = this.deps.now();
    // A chosen folder is the person's choice (REQ-STARTUP-129): never checked first and never redirected.
    if (choice.outputDir !== undefined) {
      this.#builtWith.set(windowId, { base: unchecked, fallback: undefined });
      const made = this.#create(choice.outputDir, true, level, started);
      if (!made.ok) return this.#inactivate(windowId, level, `Diagnostics could not create a run directory in ${choice.outputDir}: ${made.cause}. This window opened without them.`);
      return this.#start(windowId, level, made.runDirectory, undefined);
    }
    const perUser = perUserDiagnosticsBase(this.deps.perUserData);
    let fallback: DiagnosticsFallback | undefined;
    if (choice.workspace !== null) {
      const workspaceBase = defaultDiagnosticsBase(choice.workspace);
      if (this.deps.isDirectory(choice.workspace)) {
        const made = this.#create(workspaceBase, false, level, started);
        if (made.ok) {
          this.#builtWith.set(windowId, { base: workspaceBase, fallback: undefined });
          return this.#start(windowId, level, made.runDirectory, undefined);
        }
        fallback = { from: workspaceBase, cause: made.cause };
      } else {
        fallback = { from: workspaceBase, cause: `${choice.workspace} is not an existing folder` };
      }
    }
    this.#builtWith.set(windowId, { base: perUser, fallback });
    const made = this.#create(perUser, false, level, started);
    if (!made.ok) {
      const before = fallback === undefined ? '' : `, after the workspace's own folder ${fallback.from} could not be written (${fallback.cause})`;
      return this.#inactivate(windowId, level, `Diagnostics could not create a run directory in ${perUser}: ${made.cause}${before}. This window opened without them.`);
    }
    return this.#start(windowId, level, made.runDirectory, fallback);
  }

  /** The window's run directory under `base` with its manifest, or the errno (else the message) that stopped it. */
  #create(base: string, chosen: boolean, level: Exclude<DiagnosticsLevel, 'off'>, started: Instant): { readonly ok: true; readonly runDirectory: string } | { readonly ok: false; readonly cause: string } {
    try {
      const runDirectory = createRunDirectory(base, runDirectoryStamp(started), this.deps.pid);
      const manifest = diagnosticsManifest({ app: this.deps.app(), createdAt: started, platform: this.deps.platform, pid: this.deps.pid, level, outputBase: base, outputBaseChosen: chosen, runDirectory });
      writeFileSync(join(runDirectory, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
      return { ok: true, runDirectory };
    } catch (cause) {
      return { ok: false, cause: (cause as NodeJS.ErrnoException).code ?? String(cause) };
    }
  }

  /**
   * The capture runs: its stream opened and its first line written. Where the per-user base was taken in place of the
   * workspace default, that first line names the base and the cause (PD-STARTUP-011 revision 2).
   */
  #start(windowId: number, level: Exclude<DiagnosticsLevel, 'off'>, runDirectory: string, fallback: DiagnosticsFallback | undefined): DiagnosticsCapture {
    const stream = new SegmentedJsonLines(runDirectory, APP_LOG_STREAM, this.deps.bounds ?? { segmentBytes: DIAGNOSTICS_BOUNDS.streamSegmentBytes, segments: DIAGNOSTICS_BOUNDS.streamSegments }, (cause) => {
      // Removed before the warning is written, so the warning does not come back to the stream that failed.
      this.#running.delete(windowId);
      this.#inactive.set(windowId, { level, reason: `Diagnostics stopped writing to ${runDirectory}: ${(cause as NodeJS.ErrnoException).code ?? String(cause)}.` });
      this.deps.warn(`diagnostics: window ${windowId}'s capture stopped writing to ${runDirectory}: ${String(cause)}`);
    });
    this.#running.set(windowId, { level, runDirectory, stream });
    const instead = fallback === undefined ? '' : `, the per-user folder, because the workspace's own folder ${fallback.from} could not be written (${fallback.cause})`;
    this.deps.info(`diagnostics: window ${windowId} captures at ${level} in ${runDirectory}${instead}`);
    return { state: 'active', level, runDirectory };
  }

  /** The window is gone, so its stream is closed and nothing more is written. */
  close(windowId: number): void {
    this.#running.get(windowId)?.stream.close();
    this.#running.delete(windowId);
    this.#inactive.delete(windowId);
    this.#builtWith.delete(windowId);
  }

  /**
   * REQ-SHELL-163's "folder currently in force" for `windowId`: `outputDir` when one is chosen, else the base recorded when
   * the window was built (PD-STARTUP-011 revision 2) — the one its capture writes under, its workspace's default or the
   * per-user one in its place, and at `off` its workspace's default unchecked. A window this registry was never told of
   * (none in the product; every main window is opened here when built) reads `workspaceNow`.
   */
  folderFor(windowId: number, outputDir: string | undefined, workspaceNow: string | null): string {
    if (outputDir !== undefined) return outputDir;
    return this.#builtWith.get(windowId)?.base ?? diagnosticsBase({ outputDir, workspace: workspaceNow }, this.deps.perUserData);
  }

  /** The workspace default `windowId` could not take when it was built, and why, or undefined (PD-STARTUP-011 revision 2). */
  fallbackOf(windowId: number): DiagnosticsFallback | undefined {
    return this.#builtWith.get(windowId)?.fallback;
  }

  /** One recorded line of the application log, to every running capture. */
  record(record: AppLogRecord): void {
    if (this.#running.size === 0) return;
    for (const running of [...this.#running.values()]) running.stream.append(record);
  }

  /** The capture of `windowId` as the card shows it. */
  stateOf(windowId: number): DiagnosticsCapture {
    const running = this.#running.get(windowId);
    if (running) return { state: 'active', level: running.level, runDirectory: running.runDirectory };
    const inactive = this.#inactive.get(windowId);
    return inactive ? { state: 'inactive', ...inactive } : { state: 'off' };
  }

  #inactivate(windowId: number, level: Exclude<DiagnosticsLevel, 'off'>, reason: string): DiagnosticsCapture {
    this.#inactive.set(windowId, { level, reason });
    this.deps.warn(`diagnostics: window ${windowId}: ${reason}`);
    return { state: 'inactive', level, reason };
  }
}
