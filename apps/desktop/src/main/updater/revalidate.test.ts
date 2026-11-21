import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { formatChecksumManifest } from '@rotaris/release-naming';
import type { PendingRecord, RetainedUpdate } from './pending.js';
import { revalidatePending, type RevalidationInput } from './revalidate.js';

/**
 * REQ-STARTUP-172 — the pending update verified again from the retained bytes alone, against the running build's keys.
 * Its acceptance: one byte changed in the retained asset, manifest or signature each leads to a discard.
 */
const ASSET = 'Rotaris-0.2.0-linux-x86_64.AppImage';
const payload = Buffer.alloc(1_300_000, 5);
const digest = createHash('sha256').update(payload).digest('hex');
const pair = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { pem: publicKey.export({ type: 'spki', format: 'pem' }), privateKey };
};
const key = pair();
const manifest = Buffer.from(formatChecksumManifest([{ name: ASSET, sha256: digest }]));
const signature = sign(null, manifest, key.privateKey);
const record: PendingRecord = {
  version: '0.2.0', flavour: 'appimage', platformKey: 'linux-x86_64', asset: { name: ASSET, size: payload.byteLength, sha256: digest },
  state: 'verified', downloadedBy: '0.1.0', verifiedAt: '2026-11-21T12:00:00.000Z', applyAttempts: 0,
};
const flipped = (bytes: Uint8Array): Buffer => {
  const copy = Buffer.from(bytes);
  const at = Math.floor(copy.byteLength / 2);
  copy.writeUInt8(copy.readUInt8(at) ^ 0x01, at);
  return copy;
};

function input(over: { manifest?: Uint8Array; signature?: Uint8Array; asset?: Buffer; record?: PendingRecord; running?: string; flavour?: 'appimage' | 'portable'; keys?: readonly string[] } = {}) {
  let assetReads = 0;
  const retained: RetainedUpdate = {
    manifest: over.manifest ?? manifest,
    signature: over.signature ?? signature,
    asset: () => { assetReads += 1; const bytes = over.asset ?? payload; return (async function* () { yield bytes.subarray(0, 500_000); yield bytes.subarray(500_000); })(); },
  };
  const flavour = over.flavour ?? 'appimage';
  const value: RevalidationInput = {
    record: over.record ?? record, retained, runningVersion: over.running ?? '0.1.0',
    installation: { flavour, platformKey: flavour === 'appimage' ? 'linux-x86_64' : 'windows-x64' }, keys: over.keys ?? [key.pem],
  };
  return { value, assetReads: () => assetReads };
}

describe('revalidation — REQ-STARTUP-172', () => {
  it('passes the retained bytes of a release signed with a key the running build carries', async () => {
    expect(await revalidatePending(input().value)).toEqual({ ok: true });
  });

  it.each([
    ['the asset', { asset: flipped(payload) }, 'digest'],
    ['the manifest', { manifest: flipped(manifest) }, 'signature'],
    ['the signature', { signature: flipped(signature) }, 'signature'],
  ] as const)('one byte changed in %s is refused, never silently', async (_what, over, check) => {
    expect(await revalidatePending(input(over).value)).toMatchObject({ ok: false, check, silent: false });
  });

  it('a key the running build does not carry — one withdrawn since the download — refuses, and the asset is never read', async () => {
    const run = input({ keys: [pair().pem] });
    expect(await revalidatePending(run.value)).toMatchObject({ ok: false, check: 'signature' });
    expect(run.assetReads()).toBe(0);
    expect(await revalidatePending(input({ keys: [] }).value)).toMatchObject({ ok: false, check: 'signature', sentence: expect.stringContaining('carries no verification key') });
  });

  it('a manifest that does not list the exact name refuses, before the asset is read', async () => {
    const other = Buffer.from(formatChecksumManifest([{ name: ASSET.toLowerCase(), sha256: digest }]));
    const run = input({ manifest: other, signature: sign(null, other, key.privateKey) });
    expect(await revalidatePending(run.value)).toMatchObject({ ok: false, check: 'listed' });
    expect(run.assetReads()).toBe(0);
  });

  it('a record whose digest is not the listed one refuses', async () => {
    expect(await revalidatePending(input({ record: { ...record, asset: { ...record.asset, sha256: 'e'.repeat(64) } } }).value)).toMatchObject({ ok: false, check: 'digest' });
  });

  it('a version not newer than the running one is discarded silently; another flavour or platform key is refused', async () => {
    expect(await revalidatePending(input({ running: '0.2.0' }).value)).toMatchObject({ ok: false, check: 'newer', silent: true });
    expect(await revalidatePending(input({ running: '0.3.0' }).value)).toMatchObject({ ok: false, check: 'newer', silent: true });
    expect(await revalidatePending(input({ flavour: 'portable' }).value)).toMatchObject({ ok: false, check: 'installation', silent: false });
  });
});
