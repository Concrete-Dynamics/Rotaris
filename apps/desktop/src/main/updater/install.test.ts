import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { formatChecksumManifest } from '@rotaris/release-naming';
import type { DownloadProgress } from './download.js';
import type { Offer } from './feed.js';
import { RELEASE_SIGNING_KEYS } from './keys.js';
import { formatHandOffRecord, hashMismatchSentence, isStagingDirectory, noHashSentence, noManifestSentence, noSignatureSentence, parseHandOffRecord, removeHandedOffStaging, runInstall, untrustedSignatureSentence, type HandOffRecordFile, type InstallContext, type NetworkResponse, type UpdateNetwork } from './install.js';
import { memoryDisk, plantPending } from './memory-disk.test-support.js';
import { parsePendingRecord, PENDING_RECORD_NAME, type PendingRecord } from './pending.js';
import type { StrategyFiles, StrategySpawn } from './strategies.js';

const ASSET = 'Rotaris-0.2.0-windows-x64-portable.exe';
const TARGET = 'E:\\Rotaris-0.1.0-windows-x64-portable.exe';
const payload = Buffer.alloc(1_500_000, 9);
const digest = createHash('sha256').update(payload).digest('hex');

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { pem: publicKey.export({ type: 'spki', format: 'pem' }), privateKey };
}

/** A release as published: the manifest bytes, their signature, and the asset, all served by name. */
function published(options: { manifestEntries?: { name: string; sha256: string }[]; signedBy?: ReturnType<typeof keyPair>; manifestStatus?: number; signatureStatus?: number; assetStatus?: number; assetBytes?: Buffer; bodyFails?: boolean } = {}) {
  const pair = options.signedBy ?? keyPair();
  const manifest = Buffer.from(formatChecksumManifest(options.manifestEntries ?? [{ name: ASSET, sha256: digest }]));
  const signature = sign(null, manifest, pair.privateKey);
  const requests: string[] = [];
  const serve = (status: number, bytes: Buffer, fails = false): NetworkResponse => ({
    status,
    body: (async function* () {
      if (fails) { yield bytes.subarray(0, 10); throw new Error('ECONNRESET'); }
      // Deliver in awkward piece sizes so chunking is exercised end to end.
      for (let at = 0; at < bytes.byteLength; at += 400_000) yield bytes.subarray(at, Math.min(bytes.byteLength, at + 400_000));
    })(),
  });
  const network: UpdateNetwork = {
    get: async (url) => {
      requests.push(url);
      if (url.endsWith('/sums')) return serve(options.manifestStatus ?? 200, manifest);
      if (url.endsWith('/sig')) return serve(options.signatureStatus ?? 200, signature);
      if (url.endsWith('/asset')) return serve(options.assetStatus ?? 200, options.assetBytes ?? payload, options.bodyFails ?? false);
      throw new Error(`unexpected url ${url}`);
    },
  };
  return { pair, network, requests, manifest, signature };
}

const offer = (over: Partial<Offer> = {}): Offer => ({
  version: '0.2.0',
  asset: { name: ASSET, url: 'https://github.com/x/asset', size: payload.byteLength },
  summary: '',
  manifest: { name: 'SHA256SUMS.txt', url: 'https://github.com/x/sums', size: 100 },
  signature: { name: 'SHA256SUMS.txt.sig', url: 'https://github.com/x/sig', size: 64 },
  ...over,
});

/** `<data>/updates` on an in-memory disk (REQ-STARTUP-171); the version's directory is where the download lands. */
const ROOT = '/home/u/.local/share/rotaris/updates';
const DIR = `${ROOT}/0.2.0`;
const NOW = '2026-11-21T12:00:00.000Z';
function stagingArea(options: { writeFails?: boolean; createFails?: boolean; removeFails?: boolean } = {}) {
  const disk = memoryDisk({ root: ROOT });
  if (options.writeFails) disk.failAt('append', 'ENOSPC: no space left on device');
  if (options.createFails) disk.failAt('mkdir', 'EACCES: the data directory is not writable');
  if (options.removeFails) { for (let i = 0; i < 8; i += 1) disk.failAt('rmdir', 'EPERM: operation not permitted'); }
  return { area: disk.area, disk, tree: () => disk.tree(), record: () => { const t = disk.text(`${ROOT}/${PENDING_RECORD_NAME}`); return t === null ? null : parsePendingRecord(t); } };
}

function targetVolume(initial: Record<string, string> = { [TARGET]: 'v0.1.0' }) {
  const files = new Map(Object.entries(initial));
  const ops: string[] = [];
  const port: StrategyFiles = {
    makeExecutable: async (p) => { ops.push(`chmod:${p}`); },
    pathKind: async (p) => (files.has(p) ? 'file' : 'absent'),
    copyFile: async (from, to) => { ops.push(`copy:${from}→${to}`); files.set(to, `copy of ${from}`); },
    copyAside: async (from, to) => { ops.push(`copy-aside:${from}→${to}`); files.set(to, files.get(from)!); },
    flushFile: async () => undefined,
    flushDirectory: async () => undefined,
    rename: async (from, to) => { ops.push(`rename:${from}→${to}`); files.set(to, files.get(from)!); files.delete(from); },
    removeFile: async (p) => { ops.push(`remove:${p}`); files.delete(p); },
  };
  return { files, ops, port };
}

function context(release: ReturnType<typeof published>, staging: ReturnType<typeof stagingArea>, volume: ReturnType<typeof targetVolume>, over: Partial<InstallContext> = {}) {
  const progress: DownloadProgress[] = [];
  const spawned: string[] = [];
  const spawn: StrategySpawn = { spawnDetached: async (exe) => { spawned.push(exe); } };
  const ctx: InstallContext = {
    flavour: 'portable', target: TARGET, network: release.network, updates: staging.area, files: volume.port, spawn,
    onProgress: (p) => progress.push(p), keys: [release.pair.pem], runningVersion: '0.1.0', now: () => NOW, ...over,
  };
  return { ctx, progress, spawned };
}

describe('the install sequence — REQ-STARTUP-122', () => {
  it('runs strictly: manifest and signature fetched, the signature verified, the manifest parsed, the asset streamed into the pending directory, the digest verified, kept, then applied', async () => {
    const release = published();
    const staging = stagingArea();
    const volume = targetVolume();
    const { ctx, progress } = context(release, staging, volume);
    const result = await runInstall(offer(), ctx);
    const pending: PendingRecord = {
      version: '0.2.0', flavour: 'portable', platformKey: 'windows-x64', asset: { name: ASSET, size: payload.byteLength, sha256: digest },
      state: 'swapped', downloadedBy: '0.1.0', verifiedAt: NOW, applyAttempts: 0,
    };
    expect(result).toEqual({ ok: true, applied: { ok: true, outcome: 'replaced', message: 'The update is installed. Restart Rotaris to run it.' }, pending });
    // The order of the network round trips is the requirement's: manifest, signature, and only then the asset.
    expect(release.requests).toEqual(['https://github.com/x/sums', 'https://github.com/x/sig', 'https://github.com/x/asset']);
    // Streamed into `<data>/updates/<version>/<asset>.partial`, 1 MiB at a time, with a final settle report.
    expect(progress).toEqual([{ bytesSoFar: 1_048_576, claimedTotal: payload.byteLength }, { bytesSoFar: payload.byteLength, claimedTotal: payload.byteLength }]);
    expect(staging.disk.ops).toContain(`open:${DIR}/${ASSET}.partial`);
    // The verified file was placed beside the target from the pending directory and the swap performed (UD-8).
    expect(volume.ops[0]).toBe(`copy:${DIR}/${ASSET}→${TARGET}.update`);
    expect(volume.files.get(TARGET)).toBe(`copy of ${DIR}/${ASSET}`);
    // REQ-STARTUP-171: kept as the pending update — the exact manifest and signature bytes beside the asset, the record.
    expect(staging.tree()).toEqual(['0.2.0/Rotaris-0.2.0-windows-x64-portable.exe', '0.2.0/SHA256SUMS.txt', '0.2.0/SHA256SUMS.txt.sig', 'pending.json']);
    expect(staging.disk.files.get(`${DIR}/SHA256SUMS.txt`)).toEqual(release.manifest);
    expect(staging.disk.files.get(`${DIR}/SHA256SUMS.txt.sig`)).toEqual(release.signature);
    expect(staging.disk.files.get(`${DIR}/${ASSET}`)).toEqual(payload);
    expect(staging.record()).toEqual(pending);
  });

  it('a release publishing no checksum file is refused with the fixed sentence before any request is made', async () => {
    const release = published();
    const { ctx } = context(release, stagingArea(), targetVolume());
    expect(await runInstall(offer({ manifest: null }), ctx)).toEqual({ ok: false, stage: 'manifest', kind: 'refusal', sentence: noManifestSentence('0.2.0') });
    expect(noManifestSentence('0.2.0')).toBe('release 0.2.0 publishes no checksum file; refusing to install an unverifiable download');
    expect(release.requests).toEqual([]);
  });

  it('a release publishing no signature over its manifest is refused, and nothing is downloaded (REQ-STARTUP-123, REQ-STARTUP-167)', async () => {
    const release = published();
    const { ctx } = context(release, stagingArea(), targetVolume());
    const result = await runInstall(offer({ signature: null }), ctx);
    expect(result).toEqual({ ok: false, stage: 'signature', kind: 'refusal', sentence: noSignatureSentence('0.2.0') });
    expect(release.requests).toEqual([]);
  });

  it('a failed manifest fetch fails with `could not read the checksum file: HTTP <status>`, and a failed signature fetch the same way', async () => {
    const m = published({ manifestStatus: 404 });
    expect(await runInstall(offer(), context(m, stagingArea(), targetVolume()).ctx)).toEqual({ ok: false, stage: 'manifest', kind: 'transport', sentence: 'could not read the checksum file: HTTP 404' });
    expect(m.requests).toEqual(['https://github.com/x/sums']);
    const s = published({ signatureStatus: 503 });
    expect(await runInstall(offer(), context(s, stagingArea(), targetVolume()).ctx)).toEqual({ ok: false, stage: 'signature', kind: 'transport', sentence: 'could not read the signature over the checksum file: HTTP 503' });
    expect(s.requests).toEqual(['https://github.com/x/sums', 'https://github.com/x/sig']);
  });

  it('a signature that does not verify against a carried key refuses the install, downloads nothing and reaches no parser', async () => {
    const release = published();
    const staging = stagingArea();
    const other = keyPair();
    const { ctx } = context(release, staging, targetVolume(), { keys: [other.pem] });
    const result = await runInstall(offer(), ctx);
    expect(result).toEqual({ ok: false, stage: 'signature', kind: 'refusal', sentence: untrustedSignatureSentence('0.2.0', false) });
    expect(untrustedSignatureSentence('0.2.0', false)).toBe('the checksum file of release 0.2.0 was not published by a holder of a key this build trusts; nothing was downloaded and nothing was installed — obtain the release from the release page instead');
    expect(release.requests).not.toContain('https://github.com/x/asset');
    expect(staging.tree()).toEqual([]);
  });

  it('with no keys injected the compiled-in set governs: a release signed by a key the build does not carry is refused, nothing downloaded', async () => {
    expect(RELEASE_SIGNING_KEYS).toHaveLength(1);
    const release = published();
    const staging = stagingArea();
    const { ctx } = context(release, staging, targetVolume());
    const { keys: _injected, ...production } = ctx;
    const result = await runInstall(offer(), production);
    expect(result).toEqual({ ok: false, stage: 'signature', kind: 'refusal', sentence: untrustedSignatureSentence('0.2.0', false) });
    expect(release.requests).toEqual(['https://github.com/x/sums', 'https://github.com/x/sig']);
    expect(staging.tree()).toEqual([]);
  });

  it('with an injected EMPTY set (every key withdrawn) every manifest is refused with one sentence saying so, and nothing is downloaded', async () => {
    const release = published();
    const staging = stagingArea();
    const { ctx } = context(release, staging, targetVolume(), { keys: [] });
    const result = await runInstall(offer(), ctx);
    expect(result).toEqual({ ok: false, stage: 'signature', kind: 'refusal', sentence: untrustedSignatureSentence('0.2.0', true) });
    expect(untrustedSignatureSentence('0.2.0', true)).toContain('(this build carries no verification key)');
    expect(release.requests).toEqual(['https://github.com/x/sums', 'https://github.com/x/sig']);
    expect(staging.tree()).toEqual([]);
  });

  it('a manifest altered after signing does not verify, so its parser is never reached (a tampered digest cannot be accepted)', async () => {
    const release = published();
    // Serve a manifest whose bytes differ from the signed ones.
    const tampered: UpdateNetwork = {
      get: async (url, o) => (url.endsWith('/sums') ? { status: 200, body: (async function* () { yield Buffer.from(formatChecksumManifest([{ name: ASSET, sha256: 'f'.repeat(64) }])); })() } : release.network.get(url, o)),
    };
    const { ctx } = context(release, stagingArea(), targetVolume(), { network: tampered });
    expect(await runInstall(offer(), ctx)).toMatchObject({ ok: false, stage: 'signature' });
  });

  it('a downloaded file for which the manifest lists no hash is removed with the fixed sentence', async () => {
    const release = published({ manifestEntries: [{ name: 'Rotaris-0.2.0-windows-x64-setup.exe', sha256: digest }] });
    const staging = stagingArea();
    const volume = targetVolume();
    const { ctx } = context(release, staging, volume);
    expect(await runInstall(offer(), ctx)).toEqual({ ok: false, stage: 'digest', kind: 'refusal', sentence: noHashSentence(ASSET) });
    expect(noHashSentence(ASSET)).toBe(`no published hash for ${ASSET}; the download was discarded`);
    expect(staging.tree()).toEqual([]);
    expect(staging.tree()).toEqual([]);
    expect(volume.ops).toEqual([]);
  });

  it('a hash mismatch deletes the file with the fixed sentence and installs nothing; the comparison is case-insensitive', async () => {
    const wrong = 'a'.repeat(64);
    const release = published({ manifestEntries: [{ name: ASSET, sha256: wrong }] });
    const staging = stagingArea();
    const volume = targetVolume();
    const { ctx } = context(release, staging, volume);
    expect(await runInstall(offer(), ctx)).toEqual({ ok: false, stage: 'digest', kind: 'refusal', sentence: hashMismatchSentence(ASSET, wrong, digest) });
    expect(hashMismatchSentence('n', 'e', 'a')).toBe('n does not match the published hash (expected e, got a); the download was discarded and nothing was installed');
    expect(staging.tree()).toEqual([]);
    expect(volume.ops).toEqual([]);
    // Upper-case digest in the manifest still matches: the parser lower-cases and the comparison ignores case.
    const upper = published({ manifestEntries: [{ name: ASSET, sha256: digest.toUpperCase() }] });
    expect(await runInstall(offer(), context(upper, stagingArea(), targetVolume()).ctx)).toMatchObject({ ok: true });
  });

  it('a write failure deletes the partial file and fails with `could not write the download to <path>: <error>` (REQ-STARTUP-124)', async () => {
    const release = published();
    const staging = stagingArea({ writeFails: true });
    const { ctx } = context(release, staging, targetVolume());
    expect(await runInstall(offer(), ctx)).toEqual({ ok: false, stage: 'download', kind: 'local', sentence: `could not write the download to ${DIR}/${ASSET}.partial: ENOSPC: no space left on device` });
    expect(staging.tree()).toEqual([]);
    expect(staging.tree()).toEqual([]);
  });

  it('a download that ends early, a non-200 asset response, and an unmakeable pending directory each fail with one sentence and leave nothing behind', async () => {
    const early = published({ bodyFails: true });
    const s1 = stagingArea();
    expect(await runInstall(offer(), context(early, s1, targetVolume()).ctx)).toEqual({ ok: false, stage: 'download', kind: 'transport', sentence: `the download of ${ASSET} ended early: ECONNRESET` });
    expect(s1.tree()).toEqual([]);
    const status = published({ assetStatus: 302 });
    expect(await runInstall(offer(), context(status, stagingArea(), targetVolume()).ctx)).toEqual({ ok: false, stage: 'download', kind: 'transport', sentence: `could not download ${ASSET}: HTTP 302` });
    const nostaging = published();
    expect(await runInstall(offer(), context(nostaging, stagingArea({ createFails: true }), targetVolume()).ctx)).toMatchObject({ ok: false, stage: 'download', sentence: `could not make the directory ${DIR} for the download: EACCES: the data directory is not writable` });
  });

  it('a transfer longer than the size the feed states is ended and refused with its own sentence, discards what it wrote and installs nothing (REQ-STARTUP-169, REQ-STARTUP-179)', async () => {
    // The manifest lists the long body's own digest, so nothing but the bound can refuse it.
    const long = Buffer.concat([payload, Buffer.alloc(400_000, 1)]);
    const release = published({ assetBytes: long, manifestEntries: [{ name: ASSET, sha256: createHash('sha256').update(long).digest('hex') }] });
    const staging = stagingArea();
    const volume = targetVolume();
    const { ctx, progress } = context(release, staging, volume);
    expect(await runInstall(offer(), ctx)).toEqual({ ok: false, stage: 'download', kind: 'refusal', sentence: `${ASSET} is larger than the ${payload.byteLength} bytes the release feed states for it; the download was ended and discarded, and nothing was installed` });
    expect(progress.every((p) => p.bytesSoFar <= payload.byteLength)).toBe(true);
    expect(staging.tree()).toEqual([]);
    expect(staging.tree()).toEqual([]);
    expect(volume.ops).toEqual([]);
    expect(volume.files.get(TARGET)).toBe('v0.1.0');
  });

  it('an abort during the download discards the partial file (REQ-SHELL-121: no partially written file is left)', async () => {
    const controller = new AbortController();
    const release = published();
    const staging = stagingArea();
    const { ctx } = context(release, staging, targetVolume(), { signal: controller.signal, onProgress: () => controller.abort() });
    const result = await runInstall(offer(), ctx);
    expect(result).toEqual({ ok: false, stage: 'download', kind: 'abandoned', sentence: `the download of ${ASSET} was abandoned before it finished` });
    expect(staging.tree()).toEqual([]);
    expect(staging.tree()).toEqual([]);
  });

  it('an apply failure reports the strategy\'s sentence, and the installation is byte-for-byte what it was (REQ-STARTUP-126)', async () => {
    const release = published();
    const volume = targetVolume({});
    const staging = stagingArea();
    // The directory is there and the artifact is not: no released-artifact target.
    const files: StrategyFiles = { ...volume.port, pathKind: async (p) => (p === 'E:' ? 'directory' : 'absent') };
    const { ctx } = context(release, staging, volume, { files });
    expect(await runInstall(offer(), ctx)).toEqual({ ok: false, stage: 'apply', kind: 'local', sentence: 'this Rotaris was not installed from a released artifact' });
    expect(volume.ops).toEqual([]);
    expect(staging.tree()).toEqual([]);
  });

  it('the installer flavour hands off with quit required, from the pending directory, counting the attempt before the setup starts (REQ-STARTUP-178, UD-9)', async () => {
    const setup = 'Rotaris-0.2.0-windows-x64-setup.exe';
    const release = published({ manifestEntries: [{ name: setup, sha256: digest }] });
    const staging = stagingArea();
    const recordAtSpawn: (PendingRecord | null)[] = [];
    const spawned: string[] = [];
    const spawn: StrategySpawn = { spawnDetached: async (exe) => { recordAtSpawn.push(staging.record()); spawned.push(exe); } };
    const { ctx } = context(release, staging, targetVolume(), { flavour: 'installer', target: 'C:\\Users\\u\\AppData\\Local\\Rotaris', spawn });
    const result = await runInstall(offer({ asset: { name: setup, url: 'https://github.com/x/asset', size: payload.byteLength } }), ctx);
    expect(result).toMatchObject({ ok: true, applied: { ok: true, outcome: 'handed-off', quitRequired: true, message: 'Rotaris will close so the installer can replace it.' }, pending: { state: 'applying', applyAttempts: 1 } });
    expect(spawned).toEqual([`${DIR}/${setup}`]);
    expect(recordAtSpawn).toEqual([expect.objectContaining({ state: 'applying', applyAttempts: 1, flavour: 'installer' })]);
    // The installer runs from the pending directory, which stays for it (removed by the updated build's first launch).
    expect(staging.tree()).toContain(`0.2.0/${setup}`);
  });

  /*
   * OQ-86 (ruled 2026-10-06 by R-071; fin21's repair round 1): `beforeApply` is the last moment before the installer is
   * started — asked only once the download is verified, and a false answer discards it and starts nothing.
   */
  it('beforeApply is asked after the digest is verified and before the installer starts; declined, the pending update is discarded and nothing is spawned', async () => {
    const setup = 'Rotaris-0.2.0-windows-x64-setup.exe';
    const release = published({ manifestEntries: [{ name: setup, sha256: digest }] });
    const staging = stagingArea();
    const asked: number[] = [];
    const { ctx, spawned } = context(release, staging, targetVolume(), {
      flavour: 'installer', target: 'C:\\Users\\u\\AppData\\Local\\Rotaris',
      beforeApply: async () => { asked.push(release.requests.length); return false; },
    });
    const result = await runInstall(offer({ asset: { name: setup, url: 'https://github.com/x/asset', size: payload.byteLength } }), ctx);
    expect(result).toMatchObject({ ok: false, stage: 'declined' });
    // Asked once, after all three round trips (manifest, signature, asset).
    expect(asked).toEqual([3]);
    expect(spawned).toEqual([]);
    expect(staging.tree()).toEqual([]);
    expect(staging.tree()).toEqual([]);
  });

  it('beforeApply is never asked when the download does not verify', async () => {
    const release = published({ manifestEntries: [] });
    let asked = 0;
    const { ctx, spawned } = context(release, stagingArea(), targetVolume(), { flavour: 'installer', beforeApply: async () => { asked += 1; return true; } });
    expect(await runInstall(offer(), ctx)).toMatchObject({ ok: false, stage: 'digest' });
    expect(asked).toBe(0);
    expect(spawned).toEqual([]);
  });

  it('a quit that abandons the operation while beforeApply is answered starts nothing, even when the answer was to go on', async () => {
    const setup = 'Rotaris-0.2.0-windows-x64-setup.exe';
    const release = published({ manifestEntries: [{ name: setup, sha256: digest }] });
    const staging = stagingArea();
    const abort = new AbortController();
    const { ctx, spawned } = context(release, staging, targetVolume(), { flavour: 'installer', signal: abort.signal, beforeApply: async () => { abort.abort(); return true; } });
    expect(await runInstall(offer({ asset: { name: setup, url: 'https://github.com/x/asset', size: payload.byteLength } }), ctx)).toMatchObject({ ok: false, stage: 'download' });
    expect(spawned).toEqual([]);
    expect(staging.tree()).toEqual([]);
  });
});

describe('the verified download kept as the pending update — REQ-STARTUP-171, REQ-STARTUP-178, UD-5', () => {
  const earlier = (version: string): PendingRecord => ({
    version, flavour: 'portable', platformKey: 'windows-x64', asset: { name: `Rotaris-${version}-windows-x64-portable.exe`, size: 0, sha256: 'b'.repeat(64) },
    state: 'verified', downloadedBy: '0.1.0', verifiedAt: NOW, applyAttempts: 0,
  });

  it('the partial is renamed to the asset only after the digest matched, and the record is written last, atomically', async () => {
    const staging = stagingArea();
    const { ctx } = context(published(), staging, targetVolume());
    await runInstall(offer(), ctx);
    const ops = staging.disk.ops;
    const renamedAt = ops.indexOf(`rename:${DIR}/${ASSET}.partial→${DIR}/${ASSET}`);
    const lastAppend = ops.map((o, i) => (o.startsWith('append:') ? i : -1)).reduce((a, b) => Math.max(a, b));
    expect(renamedAt).toBeGreaterThan(lastAppend);
    expect(ops.indexOf(`write:${DIR}/SHA256SUMS.txt`)).toBeLessThan(renamedAt);
    expect(ops.indexOf(`write:${DIR}/SHA256SUMS.txt.sig`)).toBeLessThan(renamedAt);
    const tmp = ops.indexOf(`write:${ROOT}/pending.json.tmp`);
    expect(tmp).toBeGreaterThan(renamedAt);
    expect(ops[tmp + 1]).toBe(`rename:${ROOT}/pending.json.tmp→${ROOT}/pending.json`);
  });

  it('a record that cannot be written discards the verified download, installs nothing, and says so in one sentence', async () => {
    const staging = stagingArea();
    staging.disk.failAt(`write:${ROOT}/pending.json.tmp`, 'ENOSPC: no space left on device');
    const volume = targetVolume();
    const { ctx } = context(published(), staging, volume);
    expect(await runInstall(offer(), ctx)).toEqual({ ok: false, stage: 'retain', kind: 'local', sentence: `could not keep the verified download of ${ASSET} in ${DIR}: ENOSPC: no space left on device; it was discarded and nothing was installed` });
    expect(staging.tree()).toEqual([]);
    expect(volume.ops).toEqual([]);
  });

  it('a pending update of another version stays while this one downloads and fails, and is replaced once this one is verified (UD-5)', async () => {
    const failing = stagingArea();
    plantPending(failing.disk, earlier('0.1.5'), Buffer.from('v0.1.5'));
    const wrong = published({ manifestEntries: [{ name: ASSET, sha256: 'a'.repeat(64) }] });
    expect(await runInstall(offer(), context(wrong, failing, targetVolume()).ctx)).toMatchObject({ ok: false, stage: 'digest' });
    expect(failing.record()?.version).toBe('0.1.5');
    expect(failing.tree()).toEqual(['0.1.5/Rotaris-0.1.5-windows-x64-portable.exe', '0.1.5/SHA256SUMS.txt', '0.1.5/SHA256SUMS.txt.sig', 'pending.json']);

    const replacing = stagingArea();
    plantPending(replacing.disk, earlier('0.1.5'), Buffer.from('v0.1.5'));
    expect(await runInstall(offer(), context(published(), replacing, targetVolume()).ctx)).toMatchObject({ ok: true });
    expect(replacing.record()?.version).toBe('0.2.0');
    expect(replacing.tree().filter((p) => p.startsWith('0.1.5/'))).toEqual([]);
  });

  it('a pending update of the same version is discarded before it is downloaded again', async () => {
    const staging = stagingArea();
    plantPending(staging.disk, { ...earlier('0.2.0'), asset: { name: ASSET, size: 0, sha256: digest } }, payload);
    staging.disk.plant(`${DIR}/${ASSET}.partial`, 'an earlier attempt');
    const bodyFails = published({ bodyFails: true });
    expect(await runInstall(offer(), context(bodyFails, staging, targetVolume()).ctx)).toMatchObject({ ok: false, stage: 'download' });
    expect(staging.tree()).toEqual([]);
  });

  it('an installer that cannot be started discards the pending update, record and files', async () => {
    const setup = 'Rotaris-0.2.0-windows-x64-setup.exe';
    const staging = stagingArea();
    const spawn: StrategySpawn = { spawnDetached: async () => { throw new Error('EACCES: cannot execute'); } };
    const { ctx } = context(published({ manifestEntries: [{ name: setup, sha256: digest }] }), staging, targetVolume(), { flavour: 'installer', target: 'C:\\Rotaris', spawn });
    expect(await runInstall(offer({ asset: { name: setup, url: 'https://github.com/x/asset', size: payload.byteLength } }), ctx)).toMatchObject({ ok: false, stage: 'apply' });
    expect(staging.tree()).toEqual([]);
  });
});

describe('an earlier build\'s installer hand-off record — REQ-STARTUP-178 (honoured, no longer written)', () => {
  /** The record's file, in memory; `fails` names the operation that rejects. */
  function recordFile(initial: string | null, fails: 'read' | null = null) {
    let text = initial;
    const port: HandOffRecordFile = {
      read: async () => { if (fails === 'read') throw new Error('EACCES'); return text; },
      clear: async () => { text = null; },
    };
    return { port, text: () => text };
  }
  /** The earlier build's staging directories, by name. */
  function legacyDirs(removeFails = false) {
    const dirs = new Set<string>();
    return { dirs, area: { removeDirectory: async (dir: string) => { if (removeFails) throw new Error('EPERM: operation not permitted'); dirs.delete(dir); } } };
  }

  it('only a `rotaris-update-` directory with a parent is a staging directory; a record naming anything else is no record', () => {
    expect(isStagingDirectory('/tmp/rotaris-update-AbC123')).toBe(true);
    expect(isStagingDirectory('C:\\Users\\u\\AppData\\Local\\Temp\\rotaris-update-x1y2')).toBe(true);
    for (const path of ['/home/u', 'C:\\Users\\u', 'rotaris-update-x', '/tmp/rotaris-update-', '/tmp/rotaris-update-x/..', '/tmp/not-rotaris-update-x', '']) expect(isStagingDirectory(path)).toBe(false);
    const record = { version: '0.2.0', staging: 'C:\\Temp\\rotaris-update-abc' };
    expect(parseHandOffRecord(formatHandOffRecord(record))).toEqual(record);
    expect(parseHandOffRecord(JSON.stringify({ schema: 1, version: '0.2.0', staging: 'C:\\Users\\u' }))).toBeNull();
    expect(parseHandOffRecord(JSON.stringify({ schema: 2, version: '0.2.0', staging: '/tmp/rotaris-update-a' }))).toBeNull();
    expect(parseHandOffRecord('{')).toBeNull();
    expect(parseHandOffRecord('null')).toBeNull();
  });

  it('removeHandedOffStaging: nothing without a record, removed at the recorded or a newer version, not yet at an older one, kept when the removal fails, a bad record discarded', async () => {
    const at = (dir: string) => formatHandOffRecord({ version: '0.2.0', staging: dir });
    const run = async (text: string | null, running: string, removeFails = false) => {
      const staging = legacyDirs(removeFails);
      staging.dirs.add('/tmp/rotaris-update-9');
      const file = recordFile(text);
      const outcome = await removeHandedOffStaging(file.port, staging.area, running);
      return { outcome, dirs: [...staging.dirs], text: file.text() };
    };
    expect(await run(null, '0.2.0')).toEqual({ outcome: 'nothing', dirs: ['/tmp/rotaris-update-9'], text: null });
    expect(await run(at('/tmp/rotaris-update-9'), '0.2.0')).toEqual({ outcome: 'removed', dirs: [], text: null });
    expect(await run(at('/tmp/rotaris-update-9'), '0.3.0')).toEqual({ outcome: 'removed', dirs: [], text: null });
    expect(await run(at('/tmp/rotaris-update-9'), '0.1.0')).toEqual({ outcome: 'not-yet', dirs: ['/tmp/rotaris-update-9'], text: at('/tmp/rotaris-update-9') });
    expect(await run(at('/tmp/rotaris-update-9'), '0.2.0', true)).toEqual({ outcome: 'kept', dirs: ['/tmp/rotaris-update-9'], text: at('/tmp/rotaris-update-9') });
    expect(await run(JSON.stringify({ schema: 1, version: '0.2.0', staging: '/home/u' }), '0.2.0')).toEqual({ outcome: 'discarded', dirs: ['/tmp/rotaris-update-9'], text: null });
    const unreadable = recordFile(at('/tmp/rotaris-update-9'), 'read');
    expect(await removeHandedOffStaging(unreadable.port, legacyDirs().area, '0.2.0')).toBe('nothing');
  });
});
