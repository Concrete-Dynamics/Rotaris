import { isStrictlyNewer, parseChecksumManifest } from '@rotaris/release-naming';
import type { Flavour } from './classify.js';
import { CHUNK_BYTES, messageOf, streamInChunks, type DownloadProgress, type DownloadSink } from './download.js';
import type { Offer } from './feed.js';
import { RELEASE_SIGNING_KEYS, verifyDetachedSignature } from './keys.js';
import { discardPending, loadPending, pendingPaths, platformKeyOf, sweepUpdates, writePending, type PendingRecord, type UpdatesArea } from './pending.js';
import { applyUpdate, type ApplyOutcome, type StrategyFiles, type StrategySpawn } from './strategies.js';

/**
 * REQ-STARTUP-122, REQ-STARTUP-123 — the install sequence, strictly: fetch the manifest together with the signature
 * published over it → verify the signature against the compiled-in key set → parse the manifest, and only then →
 * stream the asset in 1 MiB chunks into `<data>/updates/<version>/<asset>.partial` → verify the digest → keep it as the
 * pending update (REQ-STARTUP-171: the manifest's and the signature's exact bytes beside it, the partial renamed to its
 * name, the record written last) → apply.
 * Never past a failure; every failure one sentence. The signature is checked before the manifest is parsed and
 * before any asset is fetched, so a manifest this build cannot attribute to a publisher it trusts costs the user no
 * download and reaches no parser of ours (REQ-STARTUP-167; ADR-0054: "parsing after verifying is the order, not an
 * optimisation").
 *
 * Everything that touches the network or the disk arrives through a port, so the sequence is decided here with fakes.
 * REQ-STARTUP-126 holds by construction: no step before `applyUpdate` touches the installation, and the strategies
 * keep their own rollback.
 *
 * PD-STARTUP-008 (narrowing REQ-STARTUP-122): the verified download is kept in the per-user data directory, not a fresh
 * temporary one; the order up to the digest is unchanged. Under UD-8 the portable and AppImage replace their artifact as
 * soon as the pending update is verified, which in this stage is still inside the click flow's one install.
 */
export interface NetworkResponse {
  readonly status: number;
  readonly body: AsyncIterable<Uint8Array>;
}
export interface UpdateNetwork {
  /** One GET, redirects followed (REQ-STARTUP-105), the body streamed. Rejects on a transport failure. */
  get(url: string, options: { readonly accept?: string; readonly timeoutMs?: number; readonly signal?: AbortSignal }): Promise<NetworkResponse>;
}
/**
 * REQ-STARTUP-178 (decided, R-084): "an installer started from [a pending update] is run from it and removed by that same
 * launch" — the first launch of the updated version that paints its main window. The installer flavour's setup runs from
 * its staging directory, so the process that started it can never remove that directory; it is recorded here, in the
 * per-user data directory, before the setup starts, and a later launch running the recorded version or a newer one removes
 * it (`removeHandedOffStaging`). SINCE THE PENDING UPDATE (REQ-STARTUP-171, 2026-11-21) nothing writes this record: the
 * installer runs from `<data>/updates/<version>/`, which the pending record names and the updated build's first launch
 * removes (`settleAtLaunch`). A record an earlier build wrote is still honoured, so a build updated from one removes the
 * `rotaris-update-` directory its predecessor's installer ran from. The file is read whole (`null` when there is none)
 * and cleared; clearing an absent record is not an error.
 */
export interface HandOffRecord {
  readonly version: string;
  readonly staging: string;
}
export interface HandOffRecordFile {
  read(): Promise<string | null>;
  clear(): Promise<void>;
}

/** Only a directory an earlier build's staging could have made is ever removed on a record's word: `<parent>/rotaris-update-<random>`. */
export function isStagingDirectory(path: string): boolean {
  const at = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return at > 0 && /^rotaris-update-[^\\/]+$/.test(path.slice(at + 1));
}

export const formatHandOffRecord = (record: HandOffRecord): string => `${JSON.stringify({ schema: 1, version: record.version, staging: record.staging })}\n`;

/** A record that does not parse, is of another schema, or names no staging directory is no record. */
export function parseHandOffRecord(text: string): HandOffRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { schema, version, staging } = value as Record<string, unknown>;
  if (schema !== 1 || typeof version !== 'string' || typeof staging !== 'string' || !isStagingDirectory(staging)) return null;
  return { version, staging };
}

/**
 * REQ-STARTUP-178, at a launch's first check — after its main window was shown (REQ-STARTUP-114): the recorded hand-off's
 * staging directory is removed once the running version is the recorded one or newer, the installer having replaced the
 * installation and no longer running anything from it. A running version older than the record is an installer that has
 * not completed — cancelled, failed, or still on its pages — and nothing is removed (the next hand-off supersedes it). A
 * removal that fails (Windows refuses to delete a file a process still runs from) keeps the record for a later launch and
 * is not reported, on REQ-STARTUP-115's terms. A record that does not parse names nothing that may be removed and is
 * cleared. Answers what happened, for the log line and nothing else.
 */
export async function removeHandedOffStaging(file: HandOffRecordFile, staging: Pick<UpdatesArea, 'removeDirectory'>, runningVersion: string): Promise<'nothing' | 'removed' | 'kept' | 'not-yet' | 'discarded'> {
  const text = await file.read().catch(() => null);
  if (text === null) return 'nothing';
  const record = parseHandOffRecord(text);
  if (record === null) {
    await file.clear().catch(() => undefined);
    return 'discarded';
  }
  if (isStrictlyNewer(record.version, runningVersion)) return 'not-yet';
  try {
    await staging.removeDirectory(record.staging);
  } catch {
    return 'kept';
  }
  await file.clear().catch(() => undefined);
  return 'removed';
}

export interface InstallContext {
  readonly flavour: Flavour;
  readonly target: string;
  readonly network: UpdateNetwork;
  /** `<data>/updates`, where the download is streamed and the pending update kept (REQ-STARTUP-171). */
  readonly updates: UpdatesArea;
  readonly files: StrategyFiles;
  readonly spawn: StrategySpawn;
  readonly onProgress: (p: DownloadProgress) => void;
  readonly signal?: AbortSignal;
  /** The key set to verify against; production passes nothing and gets the compiled-in set. */
  readonly keys?: readonly string[];
  /** The running version, recorded as the one that downloaded the pending update (REQ-STARTUP-171). */
  readonly runningVersion: string;
  /** Now, as ISO-8601 UTC, read from the wall clock port: the record's `verifiedAt`. */
  readonly now: () => string;
  /**
   * Asked once the download is verified and immediately before the apply starts anything (OQ-86, ruled 2026-10-06 by
   * R-071): false declines — the verified download is discarded (the pending update, record and files) and nothing is
   * started. The updater passes it for the
   * installer flavour, whose hand-off closes the windows, so a run begun while the download ran is never ended unasked —
   * and, since OQ-311 (2026-10-14, R-072), so a window's unsaved settings are asked about first; the updater keeps which
   * guard declined, and this step's sentence is not shown.
   */
  readonly beforeApply?: () => Promise<boolean>;
}

/** `retain`: the verified download could not be kept as the pending update (REQ-STARTUP-171); it was discarded. */
export type InstallStage = 'manifest' | 'signature' | 'download' | 'digest' | 'retain' | 'apply';
/**
 * What kind of failure a stage's sentence is, which REQ-STARTUP-179 and UD-4 (PD-STARTUP-008, R-117) treat differently:
 * `refusal` — no signature, a signature that does not verify, no manifest, no listed digest, a digest mismatch, an oversized
 * transfer: never retried for that release by the same process, shown with no `Try again` (OQ-555); `transport` — a request
 * that failed or ended early: silent for a download the user did not start (UD-4); `abandoned` — the caller's signal ended
 * it (a cancel, REQ-STARTUP-170, or the quit's bound): not a failure at all; `local` — this machine's disk or the apply
 * step: shown with `Try again` (REQ-STARTUP-120).
 */
export type FailureKind = 'refusal' | 'transport' | 'abandoned' | 'local';
export type InstallResult =
  /** `pending` is the record as last written: `swapped` after a replacement, `applying` after a hand-off. */
  | { readonly ok: true; readonly applied: Extract<ApplyOutcome, { ok: true }>; readonly pending: PendingRecord }
  | { readonly ok: false; readonly stage: InstallStage; readonly kind: FailureKind; readonly sentence: string }
  /** `beforeApply` answered false: the verified download was discarded and nothing was started (OQ-86). */
  | { readonly ok: false; readonly stage: 'declined'; readonly kind: 'local'; readonly sentence: string };

/** The one place a small response (the manifest, the signature) is read whole; anything larger is not one of them. */
const SMALL_RESPONSE_LIMIT = CHUNK_BYTES;

async function readSmall(body: AsyncIterable<Uint8Array>): Promise<Uint8Array | 'too-large'> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const piece of body) {
    total += piece.byteLength;
    if (total > SMALL_RESPONSE_LIMIT) return 'too-large';
    parts.push(piece);
  }
  return Buffer.concat(parts, total);
}

type Fetched = { readonly ok: true; readonly bytes: Uint8Array } | { readonly ok: false; readonly kind: FailureKind; readonly sentence: string };

/** REQ-STARTUP-123: a failed fetch carries the transport status, `could not read the <what>: HTTP <status>`. */
async function fetchSmall(network: UpdateNetwork, url: string, what: string, signal: AbortSignal | undefined): Promise<Fetched> {
  let response: NetworkResponse;
  try {
    response = await network.get(url, signal === undefined ? {} : { signal });
  } catch (cause) {
    return { ok: false, kind: signal?.aborted === true ? 'abandoned' : 'transport', sentence: `could not read the ${what}: ${messageOf(cause)}` };
  }
  if (response.status !== 200) return { ok: false, kind: 'transport', sentence: `could not read the ${what}: HTTP ${response.status}` };
  let bytes: Uint8Array | 'too-large';
  try {
    bytes = await readSmall(response.body);
  } catch (cause) {
    return { ok: false, kind: signal?.aborted === true ? 'abandoned' : 'transport', sentence: `could not read the ${what}: ${messageOf(cause)}` };
  }
  if (bytes === 'too-large') return { ok: false, kind: 'refusal', sentence: `could not read the ${what}: it is larger than 1 MiB, which no ${what} is` };
  return { ok: true, bytes };
}

/** REQ-STARTUP-123's three signature refusals, worded here; each refuses the install and leaves nothing downloaded. */
export function noSignatureSentence(version: string): string {
  return `release ${version} publishes no signature for its checksum file; an update whose publisher cannot be established is not installed`;
}
export function untrustedSignatureSentence(version: string, noKey: boolean): string {
  return `the checksum file of release ${version} was not published by a holder of a key this build trusts${noKey ? ' (this build carries no verification key)' : ''}; nothing was downloaded and nothing was installed — obtain the release from the release page instead`;
}
/** REQ-STARTUP-123's exact sentences for the manifest and the two hash outcomes. */
export const noManifestSentence = (version: string): string => `release ${version} publishes no checksum file; refusing to install an unverifiable download`;
export const noHashSentence = (name: string): string => `no published hash for ${name}; the download was discarded`;
export const hashMismatchSentence = (name: string, expected: string, actual: string): string => `${name} does not match the published hash (expected ${expected}, got ${actual}); the download was discarded and nothing was installed`;
/** REQ-STARTUP-169's bound, worded on REQ-STARTUP-123's terms: the transfer was ended and nothing of it kept. */
export const oversizedSentence = (name: string, size: number): string => `${name} is larger than the ${size} bytes the release feed states for it; the download was ended and discarded, and nothing was installed`;

export async function runInstall(offer: Offer, ctx: InstallContext): Promise<InstallResult> {
  /** Read afresh at each use: the caller's signal can fire between any two awaits (a cancel, REQ-STARTUP-170). */
  const aborted = (): boolean => ctx.signal?.aborted === true;
  // 1. The manifest and its signature must both be published (REQ-STARTUP-032/123), and both are fetched before anything else.
  if (offer.manifest === null) return { ok: false, stage: 'manifest', kind: 'refusal', sentence: noManifestSentence(offer.version) };
  if (offer.signature === null) return { ok: false, stage: 'signature', kind: 'refusal', sentence: noSignatureSentence(offer.version) };
  const manifest = await fetchSmall(ctx.network, offer.manifest.url, 'checksum file', ctx.signal);
  if (!manifest.ok) return { ok: false, stage: 'manifest', kind: manifest.kind, sentence: manifest.sentence };
  const signature = await fetchSmall(ctx.network, offer.signature.url, 'signature over the checksum file', ctx.signal);
  if (!signature.ok) return { ok: false, stage: 'signature', kind: signature.kind, sentence: signature.sentence };

  // 2. Verify the signature. An unverified manifest reaches no parser (REQ-STARTUP-122, REQ-STARTUP-167).
  const verdict = verifyDetachedSignature(manifest.bytes, signature.bytes, ctx.keys ?? RELEASE_SIGNING_KEYS);
  if (!verdict.verified) return { ok: false, stage: 'signature', kind: 'refusal', sentence: untrustedSignatureSentence(offer.version, verdict.reason === 'no-key') };

  // 3. Parse, and only now (REQ-STARTUP-113).
  const entries = parseChecksumManifest(Buffer.from(manifest.bytes).toString('utf8'));
  const published = entries.find((e) => e.name === offer.asset.name)?.sha256 ?? null;

  // 4. Stream the asset into `<data>/updates/<version>/<asset>.partial` (REQ-STARTUP-124, REQ-STARTUP-171). A pending
  // update of this same version is replaced by this download, so it is discarded first; one of another version stays
  // until this one is verified (UD-5). Whatever the directory already holds is an earlier attempt's, and goes.
  const area = ctx.updates;
  const paths = pendingPaths(area, offer.version, offer.asset.name);
  const previous = (await loadPending(area)).record;
  if (previous?.version === offer.version) await discardPending(area, previous.version);
  const discard = async (): Promise<void> => {
    await area.removeFile(paths.partial).catch(() => undefined);
    await area.removeDirectory(paths.directory).catch(() => undefined);
  };
  try {
    await area.removeDirectory(paths.directory);
    await area.makeDirectory(paths.directory);
    await area.removeFile(paths.partial);
  } catch (cause) {
    await discard();
    return { ok: false, stage: 'download', kind: 'local', sentence: `could not make the directory ${paths.directory} for the download: ${messageOf(cause)}` };
  }
  const downloaded = paths.partial;
  let response: NetworkResponse;
  try {
    response = await ctx.network.get(offer.asset.url, ctx.signal === undefined ? {} : { signal: ctx.signal });
  } catch (cause) {
    await discard();
    return { ok: false, stage: 'download', kind: aborted() ? 'abandoned' : 'transport', sentence: `could not download ${offer.asset.name}: ${messageOf(cause)}` };
  }
  if (response.status !== 200) {
    await discard();
    return { ok: false, stage: 'download', kind: 'transport', sentence: `could not download ${offer.asset.name}: HTTP ${response.status}` };
  }
  let sink: DownloadSink & { close(): Promise<void> };
  try {
    sink = await area.open(downloaded);
  } catch (cause) {
    await discard();
    return { ok: false, stage: 'download', kind: 'local', sentence: `could not write the download to ${downloaded}: ${messageOf(cause)}` };
  }
  const streamed = await streamInChunks(response.body, offer.asset.size, sink, ctx.onProgress, ctx.signal);
  const closed = await sink.close().then(() => null, (cause: unknown) => messageOf(cause));
  if (streamed.ok && closed !== null) {
    await discard();
    return { ok: false, stage: 'download', kind: 'local', sentence: `could not write the download to ${downloaded}: ${closed}` };
  }
  if (!streamed.ok) {
    await discard();
    if (streamed.why === 'write') return { ok: false, stage: 'download', kind: 'local', sentence: `could not write the download to ${downloaded}: ${streamed.error}` };
    if (streamed.why === 'aborted') return { ok: false, stage: 'download', kind: 'abandoned', sentence: `the download of ${offer.asset.name} was abandoned before it finished` };
    // REQ-STARTUP-169/179: an oversized transfer is a refusal, not a transport failure, and its sentence says so.
    if (streamed.why === 'oversized') return { ok: false, stage: 'download', kind: 'refusal', sentence: oversizedSentence(offer.asset.name, offer.asset.size) };
    return { ok: false, stage: 'download', kind: 'transport', sentence: `the download of ${offer.asset.name} ended early: ${streamed.error}` };
  }

  // 5. Verify the digest, case-insensitively (REQ-STARTUP-123).
  if (published === null) {
    await discard();
    return { ok: false, stage: 'digest', kind: 'refusal', sentence: noHashSentence(offer.asset.name) };
  }
  if (published.toLowerCase() !== streamed.sha256.toLowerCase()) {
    await discard();
    return { ok: false, stage: 'digest', kind: 'refusal', sentence: hashMismatchSentence(offer.asset.name, published, streamed.sha256) };
  }

  // REQ-STARTUP-170: a cancel holds through the verification — a signal that arrived after the last byte ends it here,
  // before anything is kept, and the partial goes like any other abandoned download's.
  if (aborted()) {
    await discard();
    return { ok: false, stage: 'download', kind: 'abandoned', sentence: `the download of ${offer.asset.name} was abandoned before it finished` };
  }

  // 6. Keep it as the pending update (REQ-STARTUP-171): the manifest's and the signature's exact bytes beside it, each
  // flushed; the partial renamed to its name only now that the digest matched; the directory flushed; and the record
  // written last and atomically — so a process ended anywhere before the record leaves files no record names, which the
  // next launch removes (REQ-STARTUP-178), and never a record naming what is not there.
  let pending: PendingRecord = {
    version: offer.version, flavour: ctx.flavour, platformKey: platformKeyOf(ctx.flavour),
    asset: { name: offer.asset.name, size: streamed.bytes, sha256: streamed.sha256.toLowerCase() },
    state: 'verified', downloadedBy: ctx.runningVersion, verifiedAt: ctx.now(), applyAttempts: 0,
  };
  try {
    await area.writeFile(paths.manifest, manifest.bytes);
    await area.writeFile(paths.signature, signature.bytes);
    await area.rename(paths.partial, paths.asset);
    await area.flushDirectory(paths.directory);
    await writePending(area, pending);
  } catch (cause) {
    await discard();
    return { ok: false, stage: 'retain', kind: 'local', sentence: `could not keep the verified download of ${offer.asset.name} in ${paths.directory}: ${messageOf(cause)}; it was discarded and nothing was installed` };
  }
  // UD-5: a pending update of another version is superseded by this one, now verified — its directory, and anything else
  // no record names, goes (REQ-STARTUP-178).
  await sweepUpdates(area, pending);

  // REQ-STARTUP-170: a cancel that arrived while the verified download was being kept leaves nothing either — the pending
  // update it would have become is discarded and nothing is applied.
  if (ctx.beforeApply === undefined && aborted()) {
    await discardPending(area, offer.version);
    return { ok: false, stage: 'download', kind: 'abandoned', sentence: `the download of ${offer.asset.name} was abandoned before it finished` };
  }

  // 6a. OQ-86: the last moment before anything is started — a run begun while the download ran is asked about here.
  if (ctx.beforeApply !== undefined) {
    const proceed = await ctx.beforeApply();
    if (!proceed || aborted()) {
      await discardPending(area, offer.version);
      return proceed
        ? { ok: false, stage: 'download', kind: 'abandoned', sentence: `the download of ${offer.asset.name} was abandoned before it finished` }
        : { ok: false, stage: 'declined', kind: 'local', sentence: 'a run is active and the user returned to the window; the verified download was discarded and nothing was started (REQ-STARTUP-046)' };
    }
  }

  // 7. Apply, by flavour (REQ-STARTUP-125), from the pending directory. A hand-off is counted before the installer starts
  // (UD-9's attempts), so an installer that never completes is counted however its process ends; the installer runs from
  // `<data>/updates/<version>/`, which the updated build's first launch removes with the record (REQ-STARTUP-178). A
  // record write that fails here is not a failure of the update: the record stays `verified`, and the launch that runs
  // the new version removes it all the same.
  if (ctx.flavour === 'installer') {
    const applying: PendingRecord = { ...pending, state: 'applying', applyAttempts: pending.applyAttempts + 1 };
    if (await writePending(area, applying).then(() => true, () => false)) pending = applying;
  }
  const applied = await applyUpdate(ctx.flavour, ctx.target, paths.asset, ctx.files, ctx.spawn);
  if (!applied.ok) {
    await discardPending(area, offer.version);
    return { ok: false, stage: 'apply', kind: 'local', sentence: applied.sentence };
  }
  // UD-8: the portable and AppImage replaced their artifact at once; the pending files and `<name>.old` stay until a
  // launch of the replaced artifact has painted (REQ-STARTUP-176, REQ-STARTUP-178; `settleAtLaunch`).
  if (applied.outcome === 'replaced') {
    const swapped: PendingRecord = { ...pending, state: 'swapped' };
    if (await writePending(area, swapped).then(() => true, () => false)) pending = swapped;
  }
  return { ok: true, applied, pending };
}
