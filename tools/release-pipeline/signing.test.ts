import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RELEASE_SIGNING_KEYS as UPDATER_KEYS, verifyDetachedSignature } from '../../apps/desktop/src/main/updater/keys.js';
import {
  carriedKeyFingerprints,
  checkBuildAgainstRecord,
  checkKeyRecordShape,
  checkOfferable,
  keyFingerprint,
  keyRecordRow,
  readKeyRecord,
  RELEASE_SIGNING_KEYS,
  signManifest,
  verifyReleaseSignature,
  type KeyRecord,
} from './signing.mjs';

/**
 * The manifest's signature and the key record (REQ-STARTUP-167, REQ-STARTUP-168; first-release-plan.md §4.6, §4.7).
 * Every key here is generated for the case: no key of the release enters the repository (O-2).
 */

function pair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  };
}

const MANIFEST = Buffer.from('aa'.repeat(32) + '  Rotaris-0.2.0-windows-x64-setup.exe\n');
const record = (...releases: { version: string; keys: string[] }[]): KeyRecord => ({ schemaVersion: 1, releases });

describe('one key set, one verifier', () => {
  it('reads the updater\'s own compiled-in set, not a copy', () => {
    expect(RELEASE_SIGNING_KEYS).toBe(UPDATER_KEYS);
  });

  it('a signature the pipeline makes verifies through the updater\'s verifier, and through no other key', () => {
    const a = pair();
    const b = pair();
    const signature = signManifest(MANIFEST, a.privatePem);
    expect(signature.byteLength).toBe(64);
    expect(verifyDetachedSignature(MANIFEST, signature, [b.publicPem, a.publicPem])).toEqual({ verified: true, keyIndex: 1 });
    expect(verifyDetachedSignature(MANIFEST, signature, [b.publicPem])).toEqual({ verified: false, reason: 'not-verified' });
    expect(verifyDetachedSignature(Buffer.concat([MANIFEST, Buffer.from('\n')]), signature, [a.publicPem])).toEqual({ verified: false, reason: 'not-verified' });
  });

  it('is deterministic, so the same key over the same bytes gives the same signature (Ed25519)', () => {
    const a = pair();
    expect(signManifest(MANIFEST, a.privatePem).equals(signManifest(MANIFEST, a.privatePem))).toBe(true);
  });

  const openssl = spawnSync('openssl', ['version']).status === 0;
  it.runIf(openssl)('makes the bytes `openssl pkeyutl -sign -rawin` makes, the form O-2 documents', () => {
    const a = pair();
    const dir = mkdtempSync(join(tmpdir(), 'release-sign-'));
    try {
      writeFileSync(join(dir, 'key.pem'), a.privatePem);
      writeFileSync(join(dir, 'SHA256SUMS.txt'), MANIFEST);
      const r = spawnSync('openssl', ['pkeyutl', '-sign', '-inkey', 'key.pem', '-rawin', '-in', 'SHA256SUMS.txt', '-out', 'sig'], { cwd: dir });
      expect(r.status).toBe(0);
      expect(readFileSync(join(dir, 'sig')).equals(signManifest(MANIFEST, a.privatePem))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a key that is not an Ed25519 private key, naming the variable', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    expect(() => signManifest(MANIFEST, rsa)).toThrow(/ROTARIS_RELEASE_SIGNING_KEY holds a rsa key/);
    expect(() => signManifest(MANIFEST, 'not a key')).toThrow(/ROTARIS_RELEASE_SIGNING_KEY does not hold a private key/);
  });
});

describe('fingerprints', () => {
  it('a private key and its public half have one fingerprint, of the SPKI DER', () => {
    const a = pair();
    expect(keyFingerprint(a.privatePem)).toBe(keyFingerprint(a.publicPem));
    expect(keyFingerprint(a.publicPem)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(keyFingerprint(pair().publicPem)).not.toBe(keyFingerprint(a.publicPem));
  });

  it('a member of the set that does not parse is carried by no one, as the updater skips it', () => {
    const a = pair();
    expect(carriedKeyFingerprints(['-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n', a.publicPem])).toEqual([keyFingerprint(a.publicPem)]);
  });

  it('the row a release commits is its version and what its build carries', () => {
    const a = pair();
    expect(keyRecordRow('0.1.0', [a.publicPem])).toEqual({ version: '0.1.0', keys: [keyFingerprint(a.publicPem)] });
    expect(() => keyRecordRow('0.1', [a.publicPem])).toThrow(/not a supported product version/);
  });
});

describe('the key record\'s shape', () => {
  it('the committed record is well formed', () => {
    const read = readKeyRecord(join(__dirname, 'key-record.json'));
    expect('record' in read).toBe(true);
  });

  it('refuses another schema version, a duplicated version, a version outside the grammar and a malformed fingerprint', () => {
    const fp = `sha256:${'0'.repeat(64)}`;
    expect(checkKeyRecordShape(null)).toEqual({ problems: ['the key record is not a JSON object'] });
    expect(checkKeyRecordShape({ schemaVersion: 2, releases: [] })).toEqual({ problems: ['the key record: schemaVersion is 2, not 1'] });
    const bad = checkKeyRecordShape({
      schemaVersion: 1,
      releases: [{ version: '0.1.0', keys: [fp] }, { version: '0.1.0', keys: [fp] }, { version: '0.1.0-rc1', keys: [] }, { version: '0.2.0', keys: ['SHA256:AB'] }],
    });
    expect('problems' in bad && bad.problems).toEqual([
      'the key record: releases[1]: 0.1.0 is recorded twice',
      'the key record: releases[2]: "version" "0.1.0-rc1" is not a product version (REQ-STARTUP-029)',
      'the key record: releases[3]: "keys" must be an array of "sha256:<64 lower-case hex>" fingerprints',
    ]);
  });

  it('reports a missing or unparsable file rather than throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'key-record-'));
    try {
      expect(readKeyRecord(join(dir, 'absent.json'))).toEqual({ problems: [expect.stringMatching(/does not exist/)] });
      writeFileSync(join(dir, 'bad.json'), '{');
      expect(readKeyRecord(join(dir, 'bad.json'))).toEqual({ problems: [expect.stringMatching(/is not JSON/)] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('before the build — the key set and the record agree (REQ-STARTUP-167, REQ-STARTUP-168 (b))', () => {
  it('refuses a build that carries no key: it could never verify an update (O-2)', () => {
    const problems = checkBuildAgainstRecord(record({ version: '0.1.0', keys: [] }), '0.1.0', []);
    expect(problems).toEqual([expect.stringMatching(/^REQ-STARTUP-167: this build carries no release verification key/)]);
  });

  it('refuses a release whose row is absent, naming the row to commit', () => {
    const a = pair();
    const problems = checkBuildAgainstRecord(record(), '0.1.0', [a.publicPem]);
    expect(problems).toEqual([`REQ-STARTUP-168 (b): the key record has no row for 0.1.0; commit this row with the release, before its tag: {"version":"0.1.0","keys":["${keyFingerprint(a.publicPem)}"]}`]);
  });

  it('refuses a row that is not what the build carries, and passes one that is, in any order', () => {
    const a = pair();
    const b = pair();
    const fa = keyFingerprint(a.publicPem);
    const fb = keyFingerprint(b.publicPem);
    expect(checkBuildAgainstRecord(record({ version: '0.1.0', keys: [fa] }), '0.1.0', [a.publicPem, b.publicPem])).toHaveLength(1);
    expect(checkBuildAgainstRecord(record({ version: '0.1.0', keys: [fb, fa] }), '0.1.0', [a.publicPem, b.publicPem])).toEqual([]);
  });

  it('reads the compiled-in set when none is passed: a tree without a key is refused before anything is built', () => {
    const problems = checkBuildAgainstRecord(record(), '0.1.0');
    expect(problems.some((p) => p.startsWith('REQ-STARTUP-167: this build carries no release verification key'))).toBe(RELEASE_SIGNING_KEYS.length === 0);
    expect(problems.some((p) => p.startsWith('REQ-STARTUP-168 (b): the key record has no row for 0.1.0'))).toBe(true);
  });
});

describe('REQ-STARTUP-168 (b) — signed with a key every offerable build carries', () => {
  it('names every older recorded build that does not carry the signing key, and ignores newer ones and the release itself', () => {
    const f1 = `sha256:${'1'.repeat(64)}`;
    const f2 = `sha256:${'2'.repeat(64)}`;
    const r = record(
      { version: '0.1.0', keys: [f1] },
      { version: '0.1.1rc1', keys: [f1, f2] },
      { version: '0.2.0', keys: [f2] },
      { version: '0.3.0', keys: [f1] },
    );
    expect(checkOfferable(r, '0.2.0', f2)).toEqual([expect.stringMatching(/^REQ-STARTUP-168 \(b\): 0\.1\.0's build does not carry the signing key/)]);
    expect(checkOfferable(r, '0.2.0', f1)).toEqual([]);
    expect(checkOfferable(r, '0.1.1', f1)).toEqual([]);
  });

  it('a rotation: the release signed with the incoming key passes once every older build carries it beside the outgoing one', () => {
    const outgoing = pair();
    const incoming = pair();
    const fo = keyFingerprint(outgoing.publicPem);
    const fi = keyFingerprint(incoming.publicPem);
    const before = record({ version: '0.1.0', keys: [fo] }, { version: '0.2.0', keys: [fo, fi] });
    const signature = signManifest(MANIFEST, incoming.privatePem);
    // 0.1.0 carries only the outgoing key: signing 0.3.0 with the incoming one strands it.
    expect(verifyReleaseSignature({ manifest: MANIFEST, signature, version: '0.3.0', record: before, keys: [incoming.publicPem] })).toHaveLength(1);
    // Signed with the outgoing key, which every build carries, it passes.
    expect(verifyReleaseSignature({ manifest: MANIFEST, signature: signManifest(MANIFEST, outgoing.privatePem), version: '0.3.0', record: before, keys: [outgoing.publicPem, incoming.publicPem] })).toEqual([]);
  });

  it('a signature no carried key verifies is refused before the record is read, in the updater\'s terms', () => {
    const a = pair();
    const b = pair();
    const signature = signManifest(MANIFEST, a.privatePem);
    expect(verifyReleaseSignature({ manifest: MANIFEST, signature, version: '0.1.0', record: record(), keys: [b.publicPem] })).toEqual(['REQ-STARTUP-167: SHA256SUMS.txt.sig does not verify: no key this build carries verifies it']);
    expect(verifyReleaseSignature({ manifest: MANIFEST, signature, version: '0.1.0', record: record(), keys: [] })).toEqual(['REQ-STARTUP-167: SHA256SUMS.txt.sig does not verify: this build carries no verification key, so no signature can verify (O-2)']);
    expect(verifyReleaseSignature({ manifest: MANIFEST, signature: signature.subarray(0, 63), version: '0.1.0', record: record(), keys: [a.publicPem] })).toEqual(['REQ-STARTUP-167: SHA256SUMS.txt.sig does not verify: the signature is not a raw Ed25519 signature of 64 bytes']);
  });
});
