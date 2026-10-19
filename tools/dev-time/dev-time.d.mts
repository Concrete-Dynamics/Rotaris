// The types for `dev-time.mjs`. That module is plain JavaScript on purpose — its callers are `pnpm dev-time`, the
// proof harness libraries that arm the entry clock, the `tools/worktree/` wrappers and the tests beside it, and
// none compiles TypeScript — so its contract is declared here for the tests beside it (R-075: priority 3 of the
// owner's process review of 2026-10-18, "Measure development time before optimizing checks").

/** The record schema this module writes and is willing to read back. */
export declare const SCHEMA: 1;
/** The closed set of kinds (`setup`, `build`, `gate`, `proof`, `repair`, `rebase`, `other`). */
export declare const KINDS: readonly string[];
/** `pnpm check`'s stages, in its own order. */
export declare const GATE_STAGES: readonly string[];
/** The environment variable that overrides the store directory. */
export declare const HOME_ENV: string;
/** The one file records are appended to, under the store directory. */
export declare const STORE_FILE: string;
/** The environment variable naming the context a wrapped command ran in (`check` inside a gate; `worktree:land` inside the landing). */
export declare const VIA_ENV: string;
/** The environment variable that switches the capture off: a deliberate switch records nothing, and nothing it covers stops. */
export declare const DISABLE_ENV: string;
/** The marker the tool sets on a command it measures itself, so a harness inside it does not record the same span twice. */
export declare const WRAPPED_ENV: string;

/** One record as it is written and read back. A manual span has `command`, `exitCode`, `signal` and `error` null. */
export interface DevTimeRecord {
  readonly schema: number;
  readonly kind: string;
  readonly label: string;
  readonly command: string | null;
  readonly cwd: string;
  readonly root: string | null;
  readonly repo: string | null;
  readonly branch: string | null;
  readonly head: string | null;
  readonly dirty: boolean | null;
  readonly host: { readonly platform: string; readonly arch: string; readonly node: string; readonly cpus: number; readonly memoryGb: number };
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly error: string | null;
  readonly via: string | null;
}

/** The repository facts a record carries; every one is null outside a repository. */
export interface GitFacts {
  readonly root: string | null;
  readonly repo: string | null;
  readonly branch: string | null;
  readonly head: string | null;
  readonly dirty: boolean | null;
}

/** One command as it is spawned and as a record spells it (`pretty`). */
export interface Command {
  readonly file: string;
  readonly args: string[];
  readonly pretty: string;
  readonly shell?: boolean;
}

/** The child a `spawn` answered, narrowed to what the measurement reads. `spawnSync` satisfies it. */
export interface SpawnResultLike {
  readonly status: number | null;
  readonly signal: string | null;
  readonly error?: { readonly code?: string; readonly message?: string } | null;
}
export type SpawnLike = (
  file: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; stdio: 'inherit'; windowsHide: boolean; shell: boolean },
) => SpawnResultLike;

/** A span still open for one worktree, as the pending file holds it. */
export interface StoredSpan {
  readonly kind: string;
  readonly label: string;
  readonly cwd?: string;
  readonly startedAt: string;
}
export interface PendingEntry {
  readonly file: string;
  readonly span: StoredSpan | null;
}
/** The lines `readRecords` could not read, by line number in the store file. */
export interface Skips {
  readonly unreadable: number[];
  readonly unknownSchema: number[];
  readonly malformed: number[];
}

export interface LabelTotals {
  readonly kind: string;
  readonly label: string;
  readonly count: number;
  readonly durationMs: number;
  readonly meanMs: number;
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly failures: number;
  readonly share: number;
}
export interface KindTotals {
  readonly kind: string;
  readonly count: number;
  readonly durationMs: number;
  readonly failures: number;
}
export interface Totals {
  readonly count: number;
  readonly durationMs: number;
  readonly failures: number;
  readonly byKind: KindTotals[];
  readonly byLabel: LabelTotals[];
}

/** One red a next green closed: episodes are red→green runs of one kind+label, the duration their wall time. */
export interface RedEpisode {
  readonly kind: string;
  readonly label: string;
  readonly episodes: number;
  readonly reds: number;
  readonly durationMs: number;
}
/** One work still red at the last record read. */
export interface RedOpen {
  readonly kind: string;
  readonly label: string;
  readonly reds: number;
}
/** The reds reading: what each next green closed, and what is still red. */
export interface RedsReading {
  readonly closed: RedEpisode[];
  readonly stillRed: RedOpen[];
}

/** The store directory: `ROTARIS_DEV_TIME_HOME` when set, else `~/.rotaris/dev-time`. */
export declare function defaultStoreDir(env?: NodeJS.ProcessEnv, home?: string): string;
/** Whether the capture is switched off: `DISABLE_ENV` set to anything but `''`, `'0'` or `'false'`. */
export declare function disabled(env?: NodeJS.ProcessEnv): boolean;
/** The record file under a store directory. */
export declare function storePath(storeDir: string): string;
/** Parse a `<kind>:<label>` token; the kind from the closed set, the label one word. */
export declare function parseKindLabel(text: string): { kind: string; label: string } | { problem: string };
/** The repository facts of `cwd`; soft everywhere, nulls outside a repository. */
export declare function gitFacts(options?: { cwd?: string; git?: string; env?: NodeJS.ProcessEnv }): GitFacts;
/** The facts of the host the measurement ran on. */
export declare function hostFacts(): DevTimeRecord['host'];
/**
 * Every readable record under a store directory, in append order, plus the lines that could not be read — skipped,
 * and counted, with their line numbers; `missing` says the store file does not exist at all.
 */
export declare function readRecords(storeDir: string): { records: DevTimeRecord[]; skips: Skips; missing: boolean };
/** Append one record as one JSONL line; the directory is made when it is absent. Answers the file appended to. */
export declare function appendRecord(storeDir: string, record: DevTimeRecord | Record<string, unknown>): string;
/** Append one record with the whole write guarded; `false` — with a one-time warning — when the store cannot be written. */
export declare function tryAppendRecord(storeDir: string, record: DevTimeRecord | Record<string, unknown>): boolean;
/** One command line built from tokens: direct elsewhere, a quoted `cmd` line on Windows. Empty tokens throw. */
export declare function shellCommand(tokens: string[], platform?: string): Command;
/** The tokens as one line through the platform's own shell (`shell: true`), both platforms. Empty tokens throw. */
export declare function shellLine(tokens: string[]): Command;
/** The command to run `pnpm run <script>` with: pnpm's own entry via `npm_execpath` when it is set, else `pnpm`. */
export declare function pnpmCommand(script: string, args?: string[], env?: NodeJS.ProcessEnv): Command;
/**
 * Run one command under the clock, append its record, and answer the child's exit code — the child's own, with a
 * signal mapped POSIX-style (128 + n) and a spawn failure answered as 1. `saved` is false when the capture is off
 * or the store could not be written; the child carries the wrapper marker either way.
 */
export declare function runMeasured(options: {
  storeDir: string;
  kind: string;
  label: string;
  command: Command;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  spawn?: SpawnLike;
}): { record: DevTimeRecord; code: number; saved: boolean };
/**
 * The gate: the four `pnpm check` stages, in the gate's own order, each spawned with `VIA_ENV` set so the stage
 * records itself through its `package.json` wrapper. The run as a whole is recorded as one `gate:check` — `total`
 * is null for a `--stage=` subset, which is not a check. A stage that fails stops the run with its code as the
 * gate's `&&` does; `keepGoing` runs the rest anyway and answers the first failure's code; the total is recorded
 * for a failed run too. `saved` is false when the capture is off or the store could not be written.
 */
export declare function runGate(options: {
  storeDir: string;
  stages?: readonly string[];
  keepGoing?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  commandFor?: (script: string, args: string[]) => Command;
  spawn?: SpawnLike;
}): { code: number; total: DevTimeRecord | null; saved: boolean };
/**
 * Record one span measured elsewhere — a build inside a proof, a script's own wall time, a worktree step. The
 * record is built from the values given; `startedAt` is derived from `endedAt - durationMs` when not given. Never
 * throws: a store that cannot be written, or a span the schema does not understand, is answered `saved: false`.
 */
export declare function recordSpan(options: {
  storeDir?: string;
  kind: string;
  label: string;
  command?: string | null;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  startedAt?: Date | null;
  durationMs: number;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
  via?: string | null;
  now?: () => Date;
}): { record: DevTimeRecord | null; saved: boolean };
/** The entry script of this process: the basename of `process.argv[1]`; empty when there is none. */
export declare function entryName(argv1?: string): string;
/**
 * What a script's own wall time is recorded as: `*-proof.mjs` a `proof`, every other `.mjs` entry an `other`, the
 * label the file name without its extension; null for anything that is no `.mjs` file name.
 */
export declare function entryRecordIdentity(name: string): { kind: string; label: string } | null;
/**
 * Arm the entry clock: at this process's exit, its whole wall time is recorded under the script's own name. Never
 * under vitest, never twice, never when the capture is off or a wrapper is already measuring it, and never for a
 * name the repository does not measure. Answers what was armed, or null.
 */
export declare function armEntryClock(options?: { storeDir?: string; env?: NodeJS.ProcessEnv }): { kind: string; label: string } | null;
/**
 * The reds, and what closed them: a failed run of one kind+label opens a red at its end, every further failed run
 * joins it, and the next success closes the episode — from the first red's end to the green's own end.
 */
export declare function redsClosed(records: DevTimeRecord[]): RedsReading;
/** The file a manual span is held in for one worktree (keyed by its top level). */
export declare function pendingFile(storeDir: string, options?: { cwd?: string; git?: string; env?: NodeJS.ProcessEnv }): string;
/** Open a manual span; refused when one is already open for the worktree. */
export declare function startSpan(options: {
  storeDir: string;
  kind: string;
  label: string;
  cwd?: string;
  git?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}): { file: string; span: { schema: number; kind: string; label: string; cwd: string; startedAt: string } } | { problem: string };
/** Close the worktree's open span and record it; wall-clock duration, clamped at zero. */
export declare function stopSpan(options: {
  storeDir: string;
  cwd?: string;
  git?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}): { record: DevTimeRecord; file: string } | { problem: string };
/** Drop the worktree's open span without recording it. */
export declare function cancelSpan(options: {
  storeDir: string;
  cwd?: string;
  git?: string;
  env?: NodeJS.ProcessEnv;
}): { span: StoredSpan; file: string } | { problem: string };
/** Every span still open under a store directory, newest first. */
export declare function listPending(storeDir: string): PendingEntry[];
/** The records inside a window of days (`null` is everything); an unparseable date is kept. */
export declare function filterByDays(records: DevTimeRecord[], days: number | null, now?: Date): DevTimeRecord[];
/** Whether a record's command ended badly: a non-zero exit, a signal, or a spawn failure. */
export declare function failedRecord(record: DevTimeRecord): boolean;
/** The report's numbers: totals, per kind, per kind+label, the label rows sorted by the time they hold. */
export declare function aggregate(records: DevTimeRecord[]): Totals;
/** A duration for a person: milliseconds under a second, then `12.3s`-style rounded to `12s`, `4m05s`, `2h06m01s`. */
export declare function formatDuration(ms: number): string;
/** One record as one line for `log`. */
export declare function formatRecordLine(record: DevTimeRecord): string;
/** The whole report as lines; it says what it read, what it skipped, what is still open and the reds next greens closed. */
export declare function formatReport(options: {
  aggregate: Totals;
  store: string;
  missing: boolean;
  skips: Skips;
  days: number | null;
  pending: PendingEntry[];
  outsideWindow?: number;
  reds?: RedsReading;
}): string[];
