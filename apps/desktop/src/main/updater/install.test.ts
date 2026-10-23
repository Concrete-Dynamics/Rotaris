import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { formatChecksumManifest } from '@rotaris/release-naming';
import type { DownloadProgress, DownloadSink } from './download.js';
import type { Offer } from './feed.js';
import { RELEASE_SIGNING_KEYS } from './keys.js';
import { hashMismatchSentence, noHashSentence, noManifestSentence, noSignatureSentence, runInstall, untrustedSignatureSentence, type InstallContext, type NetworkResponse, type StagingArea, type UpdateNetwork } from './install.js';
import type { StrategyFiles, StrategySpawn } from './strategies.js';

const ASSET = 'Rotaris-0.2.0-windows-x64-portable.exe';
const TARGET = 'E:\\Rotaris-0.1.0-windows-x64-portable.exe';
const payload = Buffer.alloc(1_500_000, 9);
const digest = createHash('sha256').update(payload).digest('hex');

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { pem: publicKey.export({ type: 'spki', format: 'pem' }) as string, privateKey };
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

/** An in-memory staging area recording every directory it made and every file it holds. */
function stagingArea(options: { writeFails?: boolean; createFails?: boolean } = {}) {
  const dirs = new Set<string>();
  const files = new Map<string, Buffer>();
  let n = 0;
  const area: StagingArea = {
    create: async () => {
      if (options.createFails) throw new Error('EACCES: temp is not writable');
      const dir = `/tmp/rotaris-update-${++n}`;
      dirs.add(dir);
      return dir;
    },
    join: (dir, name) => `${dir}/${name}`,
    open: async (path) => {
      const parts: Uint8Array[] = [];
      files.set(path, Buffer.alloc(0));
      const sink: DownloadSink & { close(): Promise<void> } = {
        write: async (chunk) => {
          if (options.writeFails) throw new Error('ENOSPC: no space left on device');
          parts.push(chunk);
          files.set(path, Buffer.concat(parts));
        },
        close: async () => undefined,
      };
      return sink;
    },
    removeFile: async (path) => { files.delete(path); },
    removeDirectory: async (dir) => { dirs.delete(dir); },
  };
  return { area, dirs, files };
}

function targetVolume(initial: Record<string, string> = { [TARGET]: 'v0.1.0' }) {
  const files = new Map(Object.entries(initial));
  const ops: string[] = [];
  const port: StrategyFiles = {
    pathKind: async (p) => (files.has(p) ? 'file' : 'absent'),
    copyFile: async (from, to) => { ops.push(`copy:${from}→${to}`); files.set(to, `copy of ${from}`); },
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
    flavour: 'portable', target: TARGET, network: release.network, staging: staging.area, files: volume.port, spawn,
    onProgress: (p) => progress.push(p), keys: [release.pair.pem], ...over,
  };
  return { ctx, progress, spawned };
}

describe('the install sequence — REQ-STARTUP-122', () => {
  it('runs strictly: manifest and signature fetched, the signature verified, the manifest parsed, the asset streamed to staging, the digest verified, then applied', async () => {
    const release = published();
    const staging = stagingArea();
    const volume = targetVolume();
    const { ctx, progress } = context(release, staging, volume);
    const result = await runInstall(offer(), ctx);
    expect(result).toEqual({ ok: true, applied: { ok: true, outcome: 'replaced', message: 'The update is installed. Restart Rotaris to run it.' } });
    // The order of the network round trips is the requirement's: manifest, signature, and only then the asset.
    expect(release.requests).toEqual(['https://github.com/x/sums', 'https://github.com/x/sig', 'https://github.com/x/asset']);
    // Streamed into a fresh `rotaris-update-` directory, 1 MiB at a time, with a final settle report.
    expect(progress).toEqual([{ bytesSoFar: 1_048_576, claimedTotal: payload.byteLength }, { bytesSoFar: payload.byteLength, claimedTotal: payload.byteLength }]);
    // The verified file was placed beside the target and the swap performed; staging is gone afterwards.
    expect(volume.ops[0]).toBe(`copy:/tmp/rotaris-update-1/${ASSET}→${TARGET}.update`);
    expect(volume.files.get(TARGET)).toBe(`copy of /tmp/rotaris-update-1/${ASSET}`);
    expect(staging.dirs.size).toBe(0);
    expect(staging.files.size).toBe(0);
  });

  it('a release publishing no checksum file is refused with the fixed sentence before any request is made', async () => {
    const release = published();
    const { ctx } = context(release, stagingArea(), targetVolume());
    expect(await runInstall(offer({ manifest: null }), ctx)).toEqual({ ok: false, stage: 'manifest', sentence: noManifestSentence('0.2.0') });
    expect(noManifestSentence('0.2.0')).toBe('release 0.2.0 publishes no checksum file; refusing to install an unverifiable download');
    expect(release.requests).toEqual([]);
  });

  it('a release publishing no signature over its manifest is refused, and nothing is downloaded (REQ-STARTUP-123, REQ-STARTUP-167)', async () => {
    const release = published();
    const { ctx } = context(release, stagingArea(), targetVolume());
    const result = await runInstall(offer({ signature: null }), ctx);
    expect(result).toEqual({ ok: false, stage: 'signature', sentence: noSignatureSentence('0.2.0') });
    expect(release.requests).toEqual([]);
  });

  it('a failed manifest fetch fails with `could not read the checksum file: HTTP <status>`, and a failed signature fetch the same way', async () => {
    const m = published({ manifestStatus: 404 });
    expect(await runInstall(offer(), context(m, stagingArea(), targetVolume()).ctx)).toEqual({ ok: false, stage: 'manifest', sentence: 'could not read the checksum file: HTTP 404' });
    expect(m.requests).toEqual(['https://github.com/x/sums']);
    const s = published({ signatureStatus: 503 });
    expect(await runInstall(offer(), context(s, stagingArea(), targetVolume()).ctx)).toEqual({ ok: false, stage: 'signature', sentence: 'could not read the signature over the checksum file: HTTP 503' });
    expect(s.requests).toEqual(['https://github.com/x/sums', 'https://github.com/x/sig']);
  });

  it('a signature that does not verify against a carried key refuses the install, downloads nothing and reaches no parser', async () => {
    const release = published();
    const staging = stagingArea();
    const other = keyPair();
    const { ctx } = context(release, staging, targetVolume(), { keys: [other.pem] });
    const result = await runInstall(offer(), ctx);
    expect(result).toEqual({ ok: false, stage: 'signature', sentence: untrustedSignatureSentence('0.2.0', false) });
    expect(untrustedSignatureSentence('0.2.0', false)).toBe('the checksum file of release 0.2.0 was not published by a holder of a key this build trusts; nothing was downloaded and nothing was installed — obtain the release from the release page instead');
    expect(release.requests).not.toContain('https://github.com/x/asset');
    expect(staging.dirs.size).toBe(0);
  });

  it('with no keys injected the compiled-in set governs: a release signed by a key the build does not carry is refused, nothing downloaded', async () => {
    expect(RELEASE_SIGNING_KEYS).toHaveLength(1);
    const release = published();
    const staging = stagingArea();
    const { ctx } = context(release, staging, targetVolume());
    const { keys: _injected, ...production } = ctx;
    const result = await runInstall(offer(), production);
    expect(result).toEqual({ ok: false, stage: 'signature', sentence: untrustedSignatureSentence('0.2.0', false) });
    expect(release.requests).toEqual(['https://github.com/x/sums', 'https://github.com/x/sig']);
    expect(staging.dirs.size).toBe(0);
  });

  it('with an injected EMPTY set (every key withdrawn) every manifest is refused with one sentence saying so, and nothing is downloaded', async () => {
    const release = published();
    const staging = stagingArea();
    const { ctx } = context(release, staging, targetVolume(), { keys: [] });
    const result = await runInstall(offer(), ctx);
    expect(result).toEqual({ ok: false, stage: 'signature', sentence: untrustedSignatureSentence('0.2.0', true) });
    expect(untrustedSignatureSentence('0.2.0', true)).toContain('(this build carries no verification key)');
    expect(release.requests).toEqual(['https://github.com/x/sums', 'https://github.com/x/sig']);
    expect(staging.dirs.size).toBe(0);
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
    expect(await runInstall(offer(), ctx)).toEqual({ ok: false, stage: 'digest', sentence: noHashSentence(ASSET) });
    expect(noHashSentence(ASSET)).toBe(`no published hash for ${ASSET}; the download was discarded`);
    expect(staging.files.size).toBe(0);
    expect(staging.dirs.size).toBe(0);
    expect(volume.ops).toEqual([]);
  });

  it('a hash mismatch deletes the file with the fixed sentence and installs nothing; the comparison is case-insensitive', async () => {
    const wrong = 'a'.repeat(64);
    const release = published({ manifestEntries: [{ name: ASSET, sha256: wrong }] });
    const staging = stagingArea();
    const volume = targetVolume();
    const { ctx } = context(release, staging, volume);
    expect(await runInstall(offer(), ctx)).toEqual({ ok: false, stage: 'digest', sentence: hashMismatchSentence(ASSET, wrong, digest) });
    expect(hashMismatchSentence('n', 'e', 'a')).toBe('n does not match the published hash (expected e, got a); the download was discarded and nothing was installed');
    expect(staging.files.size).toBe(0);
    expect(volume.ops).toEqual([]);
    // Upper-case digest in the manifest still matches: the parser lower-cases and the comparison ignores case.
    const upper = published({ manifestEntries: [{ name: ASSET, sha256: digest.toUpperCase() }] });
    expect(await runInstall(offer(), context(upper, stagingArea(), targetVolume()).ctx)).toMatchObject({ ok: true });
  });

  it('a write failure deletes the partial file and fails with `could not write the download to <path>: <error>` (REQ-STARTUP-124)', async () => {
    const release = published();
    const staging = stagingArea({ writeFails: true });
    const { ctx } = context(release, staging, targetVolume());
    expect(await runInstall(offer(), ctx)).toEqual({ ok: false, stage: 'download', sentence: `could not write the download to /tmp/rotaris-update-1/${ASSET}: ENOSPC: no space left on device` });
    expect(staging.files.size).toBe(0);
    expect(staging.dirs.size).toBe(0);
  });

  it('a download that ends early, a non-200 asset response, and an unmakeable staging directory each fail with one sentence and leave nothing behind', async () => {
    const early = published({ bodyFails: true });
    const s1 = stagingArea();
    expect(await runInstall(offer(), context(early, s1, targetVolume()).ctx)).toEqual({ ok: false, stage: 'download', sentence: `the download of ${ASSET} ended early: ECONNRESET` });
    expect(s1.dirs.size).toBe(0);
    const status = published({ assetStatus: 302 });
    expect(await runInstall(offer(), context(status, stagingArea(), targetVolume()).ctx)).toEqual({ ok: false, stage: 'download', sentence: `could not download ${ASSET}: HTTP 302` });
    const nostaging = published();
    expect(await runInstall(offer(), context(nostaging, stagingArea({ createFails: true }), targetVolume()).ctx)).toMatchObject({ ok: false, stage: 'download', sentence: expect.stringContaining('staging directory') });
  });

  it('an abort during the download discards the partial file (REQ-SHELL-121: no partially written file is left)', async () => {
    const controller = new AbortController();
    const release = published();
    const staging = stagingArea();
    const { ctx } = context(release, staging, targetVolume(), { signal: controller.signal, onProgress: () => controller.abort() });
    const result = await runInstall(offer(), ctx);
    expect(result).toEqual({ ok: false, stage: 'download', sentence: `the download of ${ASSET} was abandoned before it finished` });
    expect(staging.files.size).toBe(0);
    expect(staging.dirs.size).toBe(0);
  });

  it('an apply failure reports the strategy\'s sentence, and the installation is byte-for-byte what it was (REQ-STARTUP-126)', async () => {
    const release = published();
    const volume = targetVolume({});
    const staging = stagingArea();
    // The directory is there and the artifact is not: no released-artifact target.
    const files: StrategyFiles = { ...volume.port, pathKind: async (p) => (p === 'E:' ? 'directory' : 'absent') };
    const { ctx } = context(release, staging, volume, { files });
    expect(await runInstall(offer(), ctx)).toEqual({ ok: false, stage: 'apply', sentence: 'this Rotaris was not installed from a released artifact' });
    expect(volume.ops).toEqual([]);
    expect(staging.dirs.size).toBe(0);
  });

  it('the installer flavour hands off with quit required and leaves the setup executable in staging for the installer', async () => {
    const setup = 'Rotaris-0.2.0-windows-x64-setup.exe';
    const release = published({ manifestEntries: [{ name: setup, sha256: digest }] });
    const staging = stagingArea();
    const { ctx, spawned } = context(release, staging, targetVolume(), { flavour: 'installer', target: 'C:\\Users\\u\\AppData\\Local\\Rotaris' });
    const result = await runInstall(offer({ asset: { name: setup, url: 'https://github.com/x/asset', size: payload.byteLength } }), ctx);
    expect(result).toEqual({ ok: true, applied: { ok: true, outcome: 'handed-off', quitRequired: true, message: 'Rotaris will close so the installer can replace it.' } });
    expect(spawned).toEqual([`/tmp/rotaris-update-1/${setup}`]);
    expect(staging.dirs.has('/tmp/rotaris-update-1')).toBe(true);
  });

  /*
   * OQ-86 (ruled 2026-10-06 by R-071; fin21's repair round 1): `beforeApply` is the last moment before the installer is
   * started — asked only once the download is verified, and a false answer discards it and starts nothing.
   */
  it('beforeApply is asked after the digest is verified and before the installer starts; declined, staging is discarded and nothing is spawned', async () => {
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
    expect(staging.dirs.size).toBe(0);
    expect(staging.files.size).toBe(0);
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
    expect(staging.dirs.size).toBe(0);
  });
});
