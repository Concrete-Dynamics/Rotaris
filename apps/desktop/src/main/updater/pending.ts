import { artifactName, CHECKSUM_MANIFEST_NAME, CHECKSUM_SIGNATURE_NAME, isStrictlyNewer, KINDS_BY_PLATFORM, PLATFORM_KEYS, tryParseReleaseVersion, type PlatformKey } from '@rotaris/release-naming';
import { ARTIFACT_KIND_BY_FLAVOUR, type Flavour } from './classify.js';
import type { DownloadSink } from './download.js';
import { cleanupArtifactBackup, cleanupIncomingSibling, type StrategyFiles } from './strategies.js';

/**
 * REQ-STARTUP-171, REQ-STARTUP-178 (PD-STARTUP-008 revision 2, R-117) — THE PENDING UPDATE: the verified download kept
 * in the per-user data directory (REQ-STARTUP-145), never the temporary one, with the exact manifest and signature bytes
 * that authorised it, and the one record that describes it. The layout is the background-update plan's §3:
 *
 *   <data>/updates/pending.json                 the record, schema 1, written atomically (`writePending`)
 *   <data>/updates/<version>/SHA256SUMS.txt     the manifest's exact bytes
 *   <data>/updates/<version>/SHA256SUMS.txt.sig the signature's exact bytes
 *   <data>/updates/<version>/<asset>.partial    while downloading; renamed to <asset> only after the digest matched
 *   <data>/updates/<version>/<asset>            the verified asset (the installer runs from here)
 *
 * Only main writes any of it: everything here goes through `UpdatesArea`, a port `electron.ts` fills and nothing outside
 * main reaches. No renderer, child process, configuration value or environment variable reads or changes it, and the
 * preference store gains no key (REQ-STARTUP-146). The form is an implementation choice no surface reports.
 *
 * A record that is missing, unreadable, of a schema this build does not know, or naming files that are absent reads as no
 * pending update — never as an error — and what it named is removed (`loadPending`). A not-updatable launch never calls
 * any of it (REQ-STARTUP-173's last sentence: it leaves the record and its files exactly as it found them).
 */

/** The record's schema; a record of any other schema is no pending update. */
export const PENDING_SCHEMA = 1;
export const PENDING_RECORD_NAME = 'pending.json';
/** The same-directory temporary file the record is written through (REQ-STARTUP-071's terms). */
export const PENDING_RECORD_TEMP_NAME = 'pending.json.tmp';
/** The installer hand-off record of the click flow before this stage, kept for the cleanup of a build updated from it. */
export const LEGACY_HANDOFF_RECORD_NAME = 'installer-handoff.json';
/** The plan's apply lock (REQ-STARTUP-177), owned by the next-start apply; the sweep never touches it. */
export const APPLY_LOCK_NAME = 'apply.lock';
export const PARTIAL_SUFFIX = '.partial';
/**
 * UD-9 (PD-STARTUP-008 revision 2): an apply that did not complete is retried by at most two launches in all, after which
 * the pending update is discarded. There is no time limit on an unapplied pending update.
 */
export const MAX_APPLY_ATTEMPTS = 2;

/**
 * The plan's state machine: `downloading` → `verified` → [`swapped`] → `applying`. This stage writes `verified` (the
 * digest matched and the files are in place), `swapped` (portable and AppImage: the artifact was replaced at once, UD-8)
 * and `applying` (the installer was started from the pending directory). `downloading` is never written — a download in
 * flight leaves the previous pending update as it is until the new one is verified (UD-5) — and a record that says it is
 * read as no pending update.
 */
export const PENDING_STATES = ['downloading', 'verified', 'swapped', 'applying'] as const;
export type PendingState = (typeof PENDING_STATES)[number];

export interface PendingAsset {
  /** The asset's exact name (REQ-STARTUP-108): always `artifactName(version, kind of flavour)`. */
  readonly name: string;
  readonly size: number;
  /** The digest the manifest lists for it, lower-case hex. */
  readonly sha256: string;
}

export interface PendingRecord {
  readonly version: string;
  readonly flavour: Flavour;
  readonly platformKey: PlatformKey;
  readonly asset: PendingAsset;
  readonly state: PendingState;
  /** The running version that downloaded it. */
  readonly downloadedBy: string;
  /** ISO-8601 UTC, when the digest matched. */
  readonly verifiedAt: string;
  /** How many applies were started from it (UD-9's count). */
  readonly applyAttempts: number;
}

/**
 * The per-user `updates` directory, as main's one writer sees it. Every path the updater hands it was made by `join` from
 * `root`; `electron.ts` fills it over Node's file system, a test over memory.
 */
export interface UpdatesArea {
  /** `dataLayout`'s `updates`: `<data>/updates`. */
  readonly root: string;
  join(dir: string, name: string): string;
  /** The names in a directory; an absent directory has none. */
  list(dir: string): Promise<readonly string[]>;
  /** Make a directory and its parents; an existing one is not an error. */
  makeDirectory(dir: string): Promise<void>;
  /** A small file read whole (the record, the manifest, the signature), or null when it is absent. */
  readFile(path: string): Promise<Uint8Array | null>;
  /** A file's bytes, streamed — the asset, for revalidation (REQ-STARTUP-172). */
  readStream(path: string): AsyncIterable<Uint8Array>;
  /** A file's size in bytes, or null when it is absent. */
  fileSize(path: string): Promise<number | null>;
  /** Write a whole file, replacing one there, and flush it to the medium before resolving. */
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  /** A sink for the asset's partial file, created exclusively; `close` flushes it to the medium. */
  open(path: string): Promise<DownloadSink & { close(): Promise<void> }>;
  /** Move `from` onto `to` in one step, replacing a file there. */
  rename(from: string, to: string): Promise<void>;
  /** Make a directory's entries durable (`flush.ts`). */
  flushDirectory(dir: string): Promise<void>;
  /** Remove a file; an absent file is not an error. */
  removeFile(path: string): Promise<void>;
  /** Remove a directory and everything in it; an absent directory is not an error. */
  removeDirectory(dir: string): Promise<void>;
}

/** The platform key a flavour's artifact is published under (REQ-STARTUP-031): a flavour's kind belongs to one key alone. */
export function platformKeyOf(flavour: Flavour): PlatformKey {
  const kind = ARTIFACT_KIND_BY_FLAVOUR[flavour];
  const key = PLATFORM_KEYS.find((p) => KINDS_BY_PLATFORM[p].includes(kind));
  if (key === undefined) throw new Error(`no platform key publishes the ${kind} artifact`);
  return key;
}

/** Where a pending update's files sit: `<root>/<version>/…`. */
export interface PendingPaths {
  readonly directory: string;
  readonly manifest: string;
  readonly signature: string;
  readonly asset: string;
  readonly partial: string;
}
export function pendingPaths(area: Pick<UpdatesArea, 'root' | 'join'>, version: string, assetName: string): PendingPaths {
  const directory = area.join(area.root, version);
  return {
    directory,
    manifest: area.join(directory, CHECKSUM_MANIFEST_NAME),
    signature: area.join(directory, CHECKSUM_SIGNATURE_NAME),
    asset: area.join(directory, assetName),
    partial: area.join(directory, `${assetName}${PARTIAL_SUFFIX}`),
  };
}

export function formatPendingRecord(record: PendingRecord): string {
  const { version, flavour, platformKey, asset, state, downloadedBy, verifiedAt, applyAttempts } = record;
  return `${JSON.stringify({ schema: PENDING_SCHEMA, version, flavour, platformKey, asset: { name: asset.name, size: asset.size, sha256: asset.sha256 }, state, downloadedBy, verifiedAt, applyAttempts }, null, 2)}\n`;
}

const FLAVOURS: readonly Flavour[] = ['installer', 'portable', 'app-bundle', 'appimage'];
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * The record, or null when the text is not one this build knows: not JSON, another schema, a field missing or of the
 * wrong kind, a version outside the release grammar (it names a directory, so it must be one), an asset name that is not
 * the exact name of that version's artifact for that flavour (REQ-STARTUP-108), or a platform key that is not the one the
 * flavour's artifact is published under. Nothing a record holds can name a path outside `<root>/<version>/`.
 */
export function parsePendingRecord(text: string): PendingRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (r['schema'] !== PENDING_SCHEMA) return null;
  const { version, flavour, platformKey, asset, state, downloadedBy, verifiedAt, applyAttempts } = r;
  if (typeof version !== 'string' || tryParseReleaseVersion(version)?.version !== version) return null;
  if (typeof flavour !== 'string' || !(FLAVOURS as readonly string[]).includes(flavour)) return null;
  const f = flavour as Flavour;
  if (platformKey !== platformKeyOf(f)) return null;
  if (typeof state !== 'string' || !(PENDING_STATES as readonly string[]).includes(state)) return null;
  if (typeof downloadedBy !== 'string' || typeof verifiedAt !== 'string' || !isCount(applyAttempts)) return null;
  if (typeof asset !== 'object' || asset === null) return null;
  const a = asset as Record<string, unknown>;
  if (a['name'] !== artifactName(version, ARTIFACT_KIND_BY_FLAVOUR[f]) || !isCount(a['size']) || typeof a['sha256'] !== 'string' || !/^[0-9a-f]{64}$/.test(a['sha256'])) return null;
  return {
    version, flavour: f, platformKey: platformKeyOf(f), asset: { name: a['name'], size: a['size'], sha256: a['sha256'] },
    state: state as PendingState, downloadedBy, verifiedAt, applyAttempts,
  };
}

/**
 * REQ-STARTUP-171: written atomically on REQ-STARTUP-071's terms — a same-directory temporary file, flushed, then renamed
 * over the record, and the directory flushed — so after any interruption the record reads as it was or as it is. A
 * failure removes the temporary file and rejects; the record is then as it was.
 */
export async function writePending(area: UpdatesArea, record: PendingRecord): Promise<void> {
  const incoming = area.join(area.root, PENDING_RECORD_TEMP_NAME);
  try {
    await area.makeDirectory(area.root);
    await area.writeFile(incoming, Buffer.from(formatPendingRecord(record), 'utf8'));
    await area.rename(incoming, area.join(area.root, PENDING_RECORD_NAME));
  } catch (cause) {
    await area.removeFile(incoming).catch(() => undefined);
    throw cause;
  }
  await area.flushDirectory(area.root);
}

/**
 * Discard a pending update, record and files: the record first, then its directory, so a process ended between the two
 * leaves files no record names, which the next launch's sweep removes (REQ-STARTUP-178). A removal that fails is left for
 * a later launch and not reported (REQ-STARTUP-115's terms); the answer is for the log line alone.
 */
export async function discardPending(area: UpdatesArea, version: string): Promise<'removed' | 'kept'> {
  try {
    await area.removeFile(area.join(area.root, PENDING_RECORD_NAME));
    await area.removeDirectory(area.join(area.root, version));
    return 'removed';
  } catch {
    return 'kept';
  }
}

/** Why a record on disk read as no pending update. */
export type ReadAsAbsent = 'unreadable' | 'unknown' | 'downloading' | 'files-absent';
export interface LoadedPending {
  /** The pending update, or null when there is none. */
  readonly record: PendingRecord | null;
  /** Set when a record was there and read as no pending update; its files were removed. */
  readonly readAsAbsent: ReadAsAbsent | null;
}

/**
 * REQ-STARTUP-171: the pending update as the record and the files describe it. A missing record is none. A record that
 * cannot be read, is of an unknown schema or shape, says `downloading`, or names a manifest, a signature or an asset that
 * is absent (or an asset whose size is not the recorded one) reads as none, never as an error: the record is removed and
 * every version directory with it, since one that does not parse names nothing that could be kept. Called only where no
 * download is in flight: at a launch's first check and before an install starts.
 */
export async function loadPending(area: UpdatesArea): Promise<LoadedPending> {
  let bytes: Uint8Array | null;
  try {
    bytes = await area.readFile(area.join(area.root, PENDING_RECORD_NAME));
  } catch {
    bytes = new Uint8Array(0);
  }
  if (bytes === null) return { record: null, readAsAbsent: null };
  const text = Buffer.from(bytes).toString('utf8');
  const record = parsePendingRecord(text);
  const absent = async (why: ReadAsAbsent): Promise<LoadedPending> => {
    await area.removeFile(area.join(area.root, PENDING_RECORD_NAME)).catch(() => undefined);
    await sweepUpdates(area, null);
    return { record: null, readAsAbsent: why };
  };
  if (record === null) return absent(looksLikeJson(text) ? 'unknown' : 'unreadable');
  if (record.state === 'downloading') return absent('downloading');
  const paths = pendingPaths(area, record.version, record.asset.name);
  const sizes = await Promise.all([area.fileSize(paths.manifest), area.fileSize(paths.signature), area.fileSize(paths.asset)]).catch(() => [null, null, null]);
  if (sizes[0] === null || sizes[1] === null || sizes[2] !== record.asset.size) return absent('files-absent');
  return { record, readAsAbsent: null };
}

const looksLikeJson = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

/**
 * REQ-STARTUP-178: what the update path leaves on disk is at most the one pending update with its manifest and signature.
 * Every version directory but `keep`'s is removed — an interrupted fetch's, an interrupted download's `.partial`, a
 * verified asset whose record was never written, a superseded pending update's — and inside `keep`'s directory everything
 * but its three files (a `.partial` of the same version). The record's temporary file goes too. Nothing this module did
 * not name is touched: the record, the legacy hand-off record, the apply lock and any name that is not a release version
 * stay. Never rejects; what could not be removed is retried at a later launch. Answers the names removed, for the log.
 */
export async function sweepUpdates(area: UpdatesArea, keep: PendingRecord | null): Promise<readonly string[]> {
  const removed: string[] = [];
  const entries = await area.list(area.root).catch(() => [] as readonly string[]);
  for (const name of entries) {
    if (name === PENDING_RECORD_TEMP_NAME) {
      if (await area.removeFile(area.join(area.root, name)).then(() => true, () => false)) removed.push(name);
      continue;
    }
    if (tryParseReleaseVersion(name)?.version !== name) continue;
    if (keep !== null && name === keep.version) {
      const paths = pendingPaths(area, keep.version, keep.asset.name);
      const kept = new Set([paths.manifest, paths.signature, paths.asset]);
      for (const inner of await area.list(paths.directory).catch(() => [] as readonly string[])) {
        const path = area.join(paths.directory, inner);
        if (kept.has(path)) continue;
        if (await area.removeFile(path).then(() => true, () => false)) removed.push(`${name}/${inner}`);
      }
      continue;
    }
    if (await area.removeDirectory(area.join(area.root, name)).then(() => true, () => false)) removed.push(name);
  }
  return removed;
}

/** The facts of the running build a pending update is held against. */
export interface RunningInstallation {
  readonly version: string;
  readonly flavour: Flavour;
  readonly platformKey: PlatformKey;
}

/**
 * REQ-STARTUP-178, at a launch: whether the pending update stays. `applied` — the same or a newer version runs, so it
 * was applied (or superseded by other means) and this launch, having painted, removes it; `other-installation` — a
 * different flavour or platform key is classified; `exhausted` — an apply was started from it UD-9's number of times and
 * the version it installs is still not running; otherwise `keep`.
 */
export type LaunchDisposition = 'keep' | 'applied' | 'other-installation' | 'exhausted';
export function launchDisposition(record: PendingRecord, running: RunningInstallation): LaunchDisposition {
  if (!isStrictlyNewer(record.version, running.version)) return 'applied';
  if (record.flavour !== running.flavour || record.platformKey !== running.platformKey) return 'other-installation';
  if (record.state === 'applying' && record.applyAttempts >= MAX_APPLY_ATTEMPTS) return 'exhausted';
  return 'keep';
}

/**
 * UD-5 (PD-STARTUP-008 revision 2, REQ-STARTUP-178): a pending update yields to the feed. A newer release the feed names
 * is downloaded and, once verified, replaces it (`newer`); a release the feed names that is older than the pending one —
 * withdrawn — discards it (`withdrawn`); the same version keeps it (`keep`). Pure.
 */
export type FeedDisposition = 'keep' | 'newer' | 'withdrawn';
export function yieldToFeed(pending: Pick<PendingRecord, 'version'>, latest: string): FeedDisposition {
  if (isStrictlyNewer(latest, pending.version)) return 'newer';
  if (isStrictlyNewer(pending.version, latest)) return 'withdrawn';
  return 'keep';
}

/** What a launch's first check did with the update path's files, for its log lines. */
export interface LaunchSettlement {
  /** The pending update that stays, or null. */
  readonly pending: PendingRecord | null;
  /** A record that read as no pending update, and why. */
  readonly readAsAbsent: ReadAsAbsent | null;
  /** A record this launch discarded, and why; `kept` when the removal failed and is left for a later launch. */
  readonly discarded: { readonly version: string; readonly why: Exclude<LaunchDisposition, 'keep'>; readonly outcome: 'removed' | 'kept' } | null;
  /** The artifact's `<name>.old` (portable, AppImage): removed, nothing there, or left for a later launch. */
  readonly backup: 'removed' | 'nothing' | 'kept';
  /** The swap's own sibling beside the artifact, left by a process ended inside the swap. */
  readonly incoming: 'removed' | 'nothing' | 'kept';
  /** Names the sweep removed. */
  readonly swept: readonly string[];
}

/**
 * REQ-STARTUP-176, REQ-STARTUP-178, REQ-STARTUP-115 — the update path's launch-time step, run once per process by an
 * updatable build's first check, which follows its first main window's show (REQ-STARTUP-114): the pending update read
 * (and removed where it reads as none); removed where this launch runs its version or a newer one, or classifies another
 * installation, or UD-9's attempts are spent; the artifact's `<name>.old` removed only where no pending update holds it —
 * a `swapped` record whose version is not yet running is the replaced artifact not yet launched, and its backup stays
 * until a launch of the replaced artifact has painted (REQ-STARTUP-176, UD-11); the swap's sibling a killed swap left
 * beside the artifact removed; then the sweep. Never rejects.
 */
export async function settleAtLaunch(area: UpdatesArea, files: StrategyFiles, installation: { readonly flavour: Flavour; readonly target: string }, runningVersion: string): Promise<LaunchSettlement> {
  const loaded = await loadPending(area);
  let pending = loaded.record;
  let discarded: LaunchSettlement['discarded'] = null;
  if (pending !== null) {
    const why = launchDisposition(pending, { version: runningVersion, flavour: installation.flavour, platformKey: platformKeyOf(installation.flavour) });
    if (why !== 'keep') {
      discarded = { version: pending.version, why, outcome: await discardPending(area, pending.version) };
      pending = null;
    }
  }
  // With no pending update left, a `<name>.old` beside the artifact is the previous update's backup, and this launch —
  // which runs the artifact and has painted — is the later launch REQ-STARTUP-176 waits for. A removal that fails is
  // retried at a later launch (REQ-STARTUP-115). A pending update that stays holds its backup.
  const backup = pending === null ? await cleanupArtifactBackup(installation.flavour, installation.target, files) : 'nothing';
  // The swap's sibling is never another process's: a launch, before any install starts, removes it whatever the record says.
  const incoming = await cleanupIncomingSibling(installation.flavour, installation.target, files);
  const swept = await sweepUpdates(area, pending);
  return { pending, readAsAbsent: loaded.readAsAbsent, discarded, backup, incoming, swept };
}

/** The retained bytes a pending update is revalidated from (REQ-STARTUP-172), or null when one of them is absent. */
export interface RetainedUpdate {
  readonly manifest: Uint8Array;
  readonly signature: Uint8Array;
  /** The asset's bytes, read only when the revalidation reaches the digest. */
  readonly asset: () => AsyncIterable<Uint8Array>;
}
export async function readRetained(area: UpdatesArea, record: PendingRecord): Promise<RetainedUpdate | null> {
  const paths = pendingPaths(area, record.version, record.asset.name);
  const [manifest, signature] = await Promise.all([area.readFile(paths.manifest), area.readFile(paths.signature)]).catch(() => [null, null]);
  if (manifest === null || signature === null) return null;
  return { manifest, signature, asset: () => area.readStream(paths.asset) };
}
