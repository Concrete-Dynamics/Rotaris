import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseChecksumManifest } from '@rotaris/release-naming';
import { selectOffer, type FeedAsset } from '../../apps/desktop/src/main/updater/feed.js';
import { runInstall, type InstallContext, type NetworkResponse, type StagingArea } from '../../apps/desktop/src/main/updater/install.js';
import type { StrategyFiles } from '../../apps/desktop/src/main/updater/strategies.js';
import { runPipelineCommand } from './cli.mjs';
import { keyFingerprint } from './signing.mjs';

/**
 * The hook between the two halves of REQ-STARTUP-167: a release the pipeline writes and signs is one the updater
 * installs, and one it signs with a key the build does not carry is one the updater refuses. The release directory is
 * produced by the pipeline's own commands, as the tag workflow runs them; the updater's `runInstall` reads it through a
 * network fake that serves those exact bytes by name (first-release-plan.md §4.6, §4.7; ADR-0054 "The updater").
 *
 * Since PD-STARTUP-012 the directory also holds the release's SBOM, listed in the manifest the pipeline signs: the update
 * path selects its artifact, the manifest and the signature by exact name and asks for nothing else (REQ-STARTUP-108).
 */

const VERSION = '0.2.0';
const PORTABLE = `Rotaris-${VERSION}-windows-x64-portable.exe`;
const SETUP = `Rotaris-${VERSION}-windows-x64-setup.exe`;
/** PD-STARTUP-012: the SBOM a release directory holds beside its artifacts, listed in the manifest the pipeline signs. */
const SBOM = `Rotaris-${VERSION}-windows-x64-sbom.cdx.json`;
const TARGET = 'E:\\Rotaris-0.1.0-windows-x64-portable.exe';

let dir: string;
let assets: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'release-agreement-'));
  assets = join(dir, 'assets');
  mkdirSync(assets);
  writeFileSync(join(assets, PORTABLE), Buffer.alloc(2_500_000, 3));
  writeFileSync(join(assets, SETUP), Buffer.alloc(1_000, 4));
  writeFileSync(join(assets, SBOM), '{"bomFormat":"CycloneDX","specVersion":"1.6"}\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function pair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string, privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string };
}

/** The pipeline's stages over the directory; every stage must pass, as in the workflow. */
function publish(signer: ReturnType<typeof pair>, carried: readonly string[]) {
  const keyRecord = join(dir, 'key-record.json');
  writeFileSync(keyRecord, JSON.stringify({ schemaVersion: 1, releases: [{ version: VERSION, keys: carried.map(keyFingerprint) }] }));
  const err: string[] = [];
  const quiet = { out: () => undefined, err: (l: string) => err.push(l) };
  expect(runPipelineCommand(['manifest', assets, `v${VERSION}`], quiet)).toBe(0);
  expect(runPipelineCommand(['sign', assets], { ...quiet, env: { ROTARIS_RELEASE_SIGNING_KEY: signer.privatePem } })).toBe(0);
  return { verified: runPipelineCommand(['verify', assets, `v${VERSION}`], { ...quiet, keyRecord, keys: carried }), err };
}

function served(name: string): NetworkResponse {
  const bytes = readFileSync(join(assets, name));
  return { status: 200, body: (async function* () { yield bytes; })() };
}

function installContext(keys: readonly string[]) {
  const requests: string[] = [];
  const staged = new Map<string, Buffer>();
  const staging: StagingArea = {
    create: async () => '/staging/rotaris-update-1',
    join: (d, n) => `${d}/${n}`,
    open: async (path) => {
      const parts: Uint8Array[] = [];
      return { write: async (c) => { parts.push(c); staged.set(path, Buffer.concat(parts)); }, close: async () => undefined };
    },
    removeFile: async (p) => { staged.delete(p); },
    removeDirectory: async () => undefined,
  };
  const volume = new Map<string, string>([[TARGET, 'v0.1.0']]);
  const files: StrategyFiles = {
    pathKind: async (p) => (volume.has(p) ? 'file' : 'absent'),
    copyFile: async (_from, to) => { volume.set(to, 'v0.2.0'); },
    copyAside: async (from, to) => { volume.set(to, volume.get(from)!); },
    flushFile: async () => undefined,
    flushDirectory: async () => undefined,
    rename: async (from, to) => { volume.set(to, volume.get(from)!); volume.delete(from); },
    removeFile: async (p) => { volume.delete(p); },
  };
  const ctx: InstallContext = {
    flavour: 'portable',
    target: TARGET,
    network: { get: async (url) => { requests.push(url); return served(url.slice(url.lastIndexOf('/') + 1)); } },
    staging,
    files,
    spawn: { spawnDetached: async () => undefined },
    onProgress: () => undefined,
    keys,
  };
  return { ctx, requests, volume };
}

const offer = {
  version: VERSION,
  asset: { name: PORTABLE, url: `https://example.invalid/${PORTABLE}`, size: 2_500_000 },
  summary: '',
  manifest: { name: 'SHA256SUMS.txt', url: 'https://example.invalid/SHA256SUMS.txt', size: 200 },
  signature: { name: 'SHA256SUMS.txt.sig', url: 'https://example.invalid/SHA256SUMS.txt.sig', size: 64 },
};

describe('the pipeline\'s release, installed by the updater (REQ-STARTUP-122, REQ-STARTUP-167)', () => {
  it('a release the pipeline signed with a carried key passes the gate and is installed, in the strict order', async () => {
    const key = pair();
    expect(publish(key, [key.publicPem]).verified).toBe(0);
    const { ctx, requests, volume } = installContext([key.publicPem]);
    const result = await runInstall(offer, ctx);
    expect(result.ok).toBe(true);
    expect(requests.map((u) => u.slice(u.lastIndexOf('/') + 1))).toEqual(['SHA256SUMS.txt', 'SHA256SUMS.txt.sig', PORTABLE]);
    expect(volume.get(TARGET)).toBe('v0.2.0');
  });

  it('a release signed with a key the build does not carry fails the gate, and the updater refuses it with nothing downloaded', async () => {
    const carried = pair();
    const stranger = pair();
    const published = publish(stranger, [carried.publicPem]);
    expect(published.verified).toBe(1);
    expect(published.err.at(-1)).toBe('error: REQ-STARTUP-167: SHA256SUMS.txt.sig does not verify: no key this build carries verifies it');
    const { ctx, requests, volume } = installContext([carried.publicPem]);
    const result = await runInstall(offer, ctx);
    expect(result).toMatchObject({ ok: false, stage: 'signature' });
    expect(requests).toHaveLength(2);
    expect(volume.get(TARGET)).toBe('v0.1.0');
  });

  it('PD-STARTUP-012, REQ-STARTUP-108: the manifest lists the SBOM, and the update path selects and fetches by exact name, never asking for it', async () => {
    const key = pair();
    expect(publish(key, [key.publicPem]).verified).toBe(0);
    // The signed manifest carries the SBOM's line beside the artifacts', as `sha256sum -c` reads it.
    const listed = parseChecksumManifest(readFileSync(join(assets, 'SHA256SUMS.txt'), 'utf8')).map((e) => e.name);
    expect(listed).toEqual([PORTABLE, SBOM, SETUP]);
    // The feed offers every file the draft attaches, the SBOM among them; the offer is chosen by exact name alone.
    const feed: FeedAsset[] = readdirSync(assets).map((name) => ({ name, url: `https://example.invalid/${name}`, size: readFileSync(join(assets, name)).byteLength }));
    expect(feed.map((a) => a.name)).toContain(SBOM);
    for (const [flavour, name] of [['portable', PORTABLE], ['installer', SETUP]] as const) {
      const chosen = selectOffer({ version: VERSION, body: '', assets: feed }, '0.1.0', flavour);
      expect(chosen?.asset.name).toBe(name);
      expect(chosen?.manifest?.name).toBe('SHA256SUMS.txt');
      expect(chosen?.signature?.name).toBe('SHA256SUMS.txt.sig');
    }
    const selected = selectOffer({ version: VERSION, body: '', assets: feed }, '0.1.0', 'portable')!;
    const { ctx, requests, volume } = installContext([key.publicPem]);
    const result = await runInstall(selected, ctx);
    expect(result.ok).toBe(true);
    expect(requests.map((u) => u.slice(u.lastIndexOf('/') + 1))).toEqual(['SHA256SUMS.txt', 'SHA256SUMS.txt.sig', PORTABLE]);
    expect(volume.get(TARGET)).toBe('v0.2.0');
  });
});
