import { isStrictlyNewer, parseChecksumManifest } from '@rotaris/release-naming';
import type { Flavour } from './classify.js';
import { CHUNK_BYTES, messageOf, streamInChunks, type DownloadProgress, type DownloadSink } from './download.js';
import type { Offer } from './feed.js';
import { RELEASE_SIGNING_KEYS, verifyDetachedSignature } from './keys.js';
import { applyUpdate, type ApplyOutcome, type StrategyFiles, type StrategySpawn } from './strategies.js';

/**
 * REQ-STARTUP-122, REQ-STARTUP-123 — the install sequence, strictly: fetch the manifest together with the signature
 * published over it → verify the signature against the compiled-in key set → parse the manifest, and only then →
 * stream the asset into a fresh `rotaris-update-` staging directory in 1 MiB chunks → verify the digest → apply.
 * Never past a failure; every failure one sentence. The signature is checked before the manifest is parsed and
 * before any asset is fetched, so a manifest this build cannot attribute to a publisher it trusts costs the user no
 * download and reaches no parser of ours (REQ-STARTUP-167; ADR-0054: "parsing after verifying is the order, not an
 * optimisation").
 *
 * Everything that touches the network or the disk arrives through a port, so the sequence is decided here with fakes.
 * REQ-STARTUP-126 holds by construction: no step before `applyUpdate` touches the installation, and the strategies
 * keep their own rollback.
 */
export interface NetworkResponse {
  readonly status: number;
  readonly body: AsyncIterable<Uint8Array>;
}
export interface UpdateNetwork {
  /** One GET, redirects followed (REQ-STARTUP-105), the body streamed. Rejects on a transport failure. */
  get(url: string, options: { readonly accept?: string; readonly timeoutMs?: number; readonly signal?: AbortSignal }): Promise<NetworkResponse>;
}
export interface StagingArea {
  /** A fresh temporary directory whose name is prefixed `rotaris-update-` (REQ-STARTUP-122). */
  create(): Promise<string>;
  join(dir: string, name: string): string;
  /** A sink for one file inside staging; `close` flushes it. */
  open(path: string): Promise<DownloadSink & { close(): Promise<void> }>;
  removeFile(path: string): Promise<void>;
  removeDirectory(dir: string): Promise<void>;
}

/**
 * REQ-STARTUP-178 (decided, R-084): "an installer started from [a pending update] is run from it and removed by that same
 * launch" — the first launch of the updated version that paints its main window. The installer flavour's setup runs from
 * its staging directory, so the process that started it can never remove that directory; it is recorded here, in the
 * per-user data directory, before the setup starts, and a later launch running the recorded version or a newer one removes
 * it (`removeHandedOffStaging`). Until the background-update plan's pending update is built, this record is the one thing
 * the update path keeps across processes. The file is read whole (`null` when there is none), written atomically, and
 * cleared; clearing an absent record is not an error.
 */
export interface HandOffRecord {
  readonly version: string;
  readonly staging: string;
}
export interface HandOffRecordFile {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  clear(): Promise<void>;
}

/** Only a directory `StagingArea.create` could have made is ever removed on a record's word: `<parent>/rotaris-update-<random>`. */
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
 * Immediately before the setup starts: the record names the directory it runs from. A record already there names an
 * earlier hand-off's directory, which this one supersedes — REQ-STARTUP-178 keeps at most one — so that directory is
 * removed first, best-effort. Never rejects: a record that cannot be written does not stop the update.
 */
export async function recordHandOff(file: HandOffRecordFile, staging: StagingArea, record: HandOffRecord): Promise<'recorded' | 'not-recorded'> {
  const earlier = parseHandOffRecord((await file.read().catch(() => null)) ?? '');
  if (earlier !== null && earlier.staging !== record.staging) await staging.removeDirectory(earlier.staging).catch(() => undefined);
  try {
    await file.write(formatHandOffRecord(record));
    return 'recorded';
  } catch {
    return 'not-recorded';
  }
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
export async function removeHandedOffStaging(file: HandOffRecordFile, staging: StagingArea, runningVersion: string): Promise<'nothing' | 'removed' | 'kept' | 'not-yet' | 'discarded'> {
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
  readonly staging: StagingArea;
  readonly files: StrategyFiles;
  readonly spawn: StrategySpawn;
  readonly onProgress: (p: DownloadProgress) => void;
  readonly signal?: AbortSignal;
  /** The key set to verify against; production passes nothing and gets the compiled-in set. */
  readonly keys?: readonly string[];
  /**
   * Asked once the download is verified and immediately before the apply starts anything (OQ-86, ruled 2026-10-06 by
   * R-071): false declines — the verified download is discarded and nothing is started. The updater passes it for the
   * installer flavour, whose hand-off closes the windows, so a run begun while the download ran is never ended unasked —
   * and, since OQ-311 (2026-10-14, R-072), so a window's unsaved settings are asked about first; the updater keeps which
   * guard declined, and this step's sentence is not shown.
   */
  readonly beforeApply?: () => Promise<boolean>;
  /**
   * Called once `beforeApply` has allowed and immediately before the apply starts anything, with the staging directory the
   * verified file sits in. The updater passes it for the installer flavour, whose setup runs from that directory, to
   * record it for the updated build's first launch to remove (REQ-STARTUP-178, `recordHandOff`). A rejection is ignored:
   * a directory that could not be recorded does not stop the update.
   */
  readonly beforeHandOff?: (staging: string) => Promise<void>;
}

export type InstallStage = 'manifest' | 'signature' | 'download' | 'digest' | 'apply';
export type InstallResult =
  | { readonly ok: true; readonly applied: Extract<ApplyOutcome, { ok: true }> }
  | { readonly ok: false; readonly stage: InstallStage; readonly sentence: string }
  /** `beforeApply` answered false: the verified download was discarded and nothing was started (OQ-86). */
  | { readonly ok: false; readonly stage: 'declined'; readonly sentence: string };

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

type Fetched = { readonly ok: true; readonly bytes: Uint8Array } | { readonly ok: false; readonly sentence: string };

/** REQ-STARTUP-123: a failed fetch carries the transport status, `could not read the <what>: HTTP <status>`. */
async function fetchSmall(network: UpdateNetwork, url: string, what: string, signal: AbortSignal | undefined): Promise<Fetched> {
  let response: NetworkResponse;
  try {
    response = await network.get(url, signal === undefined ? {} : { signal });
  } catch (cause) {
    return { ok: false, sentence: `could not read the ${what}: ${messageOf(cause)}` };
  }
  if (response.status !== 200) return { ok: false, sentence: `could not read the ${what}: HTTP ${response.status}` };
  let bytes: Uint8Array | 'too-large';
  try {
    bytes = await readSmall(response.body);
  } catch (cause) {
    return { ok: false, sentence: `could not read the ${what}: ${messageOf(cause)}` };
  }
  if (bytes === 'too-large') return { ok: false, sentence: `could not read the ${what}: it is larger than 1 MiB, which no ${what} is` };
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

export async function runInstall(offer: Offer, ctx: InstallContext): Promise<InstallResult> {
  // 1. The manifest and its signature must both be published (REQ-STARTUP-032/123), and both are fetched before anything else.
  if (offer.manifest === null) return { ok: false, stage: 'manifest', sentence: noManifestSentence(offer.version) };
  if (offer.signature === null) return { ok: false, stage: 'signature', sentence: noSignatureSentence(offer.version) };
  const manifest = await fetchSmall(ctx.network, offer.manifest.url, 'checksum file', ctx.signal);
  if (!manifest.ok) return { ok: false, stage: 'manifest', sentence: manifest.sentence };
  const signature = await fetchSmall(ctx.network, offer.signature.url, 'signature over the checksum file', ctx.signal);
  if (!signature.ok) return { ok: false, stage: 'signature', sentence: signature.sentence };

  // 2. Verify the signature. An unverified manifest reaches no parser (REQ-STARTUP-122, REQ-STARTUP-167).
  const verdict = verifyDetachedSignature(manifest.bytes, signature.bytes, ctx.keys ?? RELEASE_SIGNING_KEYS);
  if (!verdict.verified) return { ok: false, stage: 'signature', sentence: untrustedSignatureSentence(offer.version, verdict.reason === 'no-key') };

  // 3. Parse, and only now (REQ-STARTUP-113).
  const entries = parseChecksumManifest(Buffer.from(manifest.bytes).toString('utf8'));
  const published = entries.find((e) => e.name === offer.asset.name)?.sha256 ?? null;

  // 4. Stream the asset into a fresh staging directory (REQ-STARTUP-124).
  let staging: string;
  try {
    staging = await ctx.staging.create();
  } catch (cause) {
    return { ok: false, stage: 'download', sentence: `could not create a staging directory for the download: ${messageOf(cause)}` };
  }
  const downloaded = ctx.staging.join(staging, offer.asset.name);
  const discard = async (): Promise<void> => {
    await ctx.staging.removeFile(downloaded).catch(() => undefined);
    await ctx.staging.removeDirectory(staging).catch(() => undefined);
  };
  let response: NetworkResponse;
  try {
    response = await ctx.network.get(offer.asset.url, ctx.signal === undefined ? {} : { signal: ctx.signal });
  } catch (cause) {
    await discard();
    return { ok: false, stage: 'download', sentence: `could not download ${offer.asset.name}: ${messageOf(cause)}` };
  }
  if (response.status !== 200) {
    await discard();
    return { ok: false, stage: 'download', sentence: `could not download ${offer.asset.name}: HTTP ${response.status}` };
  }
  let sink: DownloadSink & { close(): Promise<void> };
  try {
    sink = await ctx.staging.open(downloaded);
  } catch (cause) {
    await discard();
    return { ok: false, stage: 'download', sentence: `could not write the download to ${downloaded}: ${messageOf(cause)}` };
  }
  const streamed = await streamInChunks(response.body, offer.asset.size, sink, ctx.onProgress, ctx.signal);
  await sink.close().catch(() => undefined);
  if (!streamed.ok) {
    await discard();
    if (streamed.why === 'write') return { ok: false, stage: 'download', sentence: `could not write the download to ${downloaded}: ${streamed.error}` };
    if (streamed.why === 'aborted') return { ok: false, stage: 'download', sentence: `the download of ${offer.asset.name} was abandoned before it finished` };
    return { ok: false, stage: 'download', sentence: `the download of ${offer.asset.name} ended early: ${streamed.error}` };
  }

  // 5. Verify the digest, case-insensitively (REQ-STARTUP-123).
  if (published === null) {
    await discard();
    return { ok: false, stage: 'digest', sentence: noHashSentence(offer.asset.name) };
  }
  if (published.toLowerCase() !== streamed.sha256.toLowerCase()) {
    await discard();
    return { ok: false, stage: 'digest', sentence: hashMismatchSentence(offer.asset.name, published, streamed.sha256) };
  }

  // 5a. OQ-86: the last moment before anything is started — a run begun while the download ran is asked about here.
  if (ctx.beforeApply !== undefined) {
    const proceed = await ctx.beforeApply();
    if (!proceed || ctx.signal?.aborted === true) {
      await discard();
      return proceed
        ? { ok: false, stage: 'download', sentence: `the download of ${offer.asset.name} was abandoned before it finished` }
        : { ok: false, stage: 'declined', sentence: 'a run is active and the user returned to the window; the verified download was discarded and nothing was started (REQ-STARTUP-046)' };
    }
  }

  // 6. Apply, by flavour (REQ-STARTUP-125).
  if (ctx.beforeHandOff !== undefined) await ctx.beforeHandOff(staging).catch(() => undefined);
  const applied = await applyUpdate(ctx.flavour, ctx.target, downloaded, ctx.files, ctx.spawn);
  if (!applied.ok) {
    await discard();
    return { ok: false, stage: 'apply', sentence: applied.sentence };
  }
  // A replacement copied the verified file beside the target, so staging is done with; a hand-off runs the setup from
  // staging and it stays until the installer has finished with it — recorded by `beforeHandOff` and removed by the updated
  // build's first launch (REQ-STARTUP-178, `removeHandedOffStaging`).
  if (applied.outcome === 'replaced') await discard();
  return { ok: true, applied };
}
