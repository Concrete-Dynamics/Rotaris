import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RELEASE_SIGNING_KEYS, SIGNATURE_ALGORITHM, SIGNATURE_BYTES, verifyDetachedSignature } from './keys.js';

/** A test key pair, generated per run: the repository never holds a private half (REQ-STARTUP-167). */
function pair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { pem: publicKey.export({ type: 'spki', format: 'pem' }) as string, privateKey };
}
const MANIFEST = Buffer.from(`${'a'.repeat(64)}  Rotaris-0.2.0-windows-x64-setup.exe\n`);

describe('the compiled-in key set — REQ-STARTUP-167, REQ-STARTUP-168 (a), REQ-STARTUP-159', () => {
  it('ships O-2\'s one public key, an Ed25519 SPKI PEM block whose DER is the recorded fingerprint', () => {
    expect(RELEASE_SIGNING_KEYS).toHaveLength(1);
    const pem = RELEASE_SIGNING_KEYS[0]!;
    expect(pem).toBe('-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAmMdME4nmi1zsXtUhPAfxPoabI65CowRXBAhSf5rPxAQ=\n-----END PUBLIC KEY-----\n');
    const key = createPublicKey(pem);
    expect(key.asymmetricKeyType).toBe('ed25519');
    const der = key.export({ type: 'spki', format: 'der' });
    expect(createHash('sha256').update(der).digest('hex')).toBe('e0f3d7e80e046a5d3aad59ecbc6feda255fc65e841be21237f500e0d117d1d07');
  });

  it('the compiled-in set is what a call without keys verifies against: a key it does not carry, a forged 64-byte signature and a malformed one are all refused', () => {
    const { privateKey } = pair();
    const signature = sign(null, MANIFEST, privateKey);
    expect(verifyDetachedSignature(MANIFEST, signature)).toEqual({ verified: false, reason: 'not-verified' });
    expect(verifyDetachedSignature(MANIFEST, Buffer.alloc(SIGNATURE_BYTES))).toEqual({ verified: false, reason: 'not-verified' });
    expect(verifyDetachedSignature(MANIFEST, Buffer.from('not a signature'))).toEqual({ verified: false, reason: 'malformed-signature' });
  });

  it('an injected EMPTY set (every key withdrawn) refuses every manifest as unverifiable, even one a valid key signed', () => {
    const { privateKey } = pair();
    const signature = sign(null, MANIFEST, privateKey);
    expect(verifyDetachedSignature(MANIFEST, signature, [])).toEqual({ verified: false, reason: 'no-key' });
  });

  it('is Ed25519, a raw 64-byte detached signature over the manifest\'s exact bytes', () => {
    expect(SIGNATURE_ALGORITHM).toBe('Ed25519');
    expect(SIGNATURE_BYTES).toBe(64);
    const { pem, privateKey } = pair();
    const signature = sign(null, MANIFEST, privateKey);
    expect(signature.byteLength).toBe(64);
    expect(verifyDetachedSignature(MANIFEST, signature, [pem])).toEqual({ verified: true, keyIndex: 0 });
  });

  it('a signature made by a key the build does not carry does not verify (REQ-STARTUP-167)', () => {
    const carried = pair();
    const other = pair();
    const signature = sign(null, MANIFEST, other.privateKey);
    expect(verifyDetachedSignature(MANIFEST, signature, [carried.pem])).toEqual({ verified: false, reason: 'not-verified' });
  });

  it('a manifest altered by one byte after signing does not verify', () => {
    const { pem, privateKey } = pair();
    const signature = sign(null, MANIFEST, privateKey);
    const altered = Buffer.from(MANIFEST);
    altered[0] = altered[0] === 0x61 ? 0x62 : 0x61;
    expect(verifyDetachedSignature(altered, signature, [pem])).toEqual({ verified: false, reason: 'not-verified' });
  });

  it('a build may trust more than one key: a release signed with either verifies (REQ-STARTUP-168 (a))', () => {
    const outgoing = pair();
    const incoming = pair();
    const byOutgoing = sign(null, MANIFEST, outgoing.privateKey);
    const byIncoming = sign(null, MANIFEST, incoming.privateKey);
    const set = [outgoing.pem, incoming.pem];
    expect(verifyDetachedSignature(MANIFEST, byOutgoing, set)).toEqual({ verified: true, keyIndex: 0 });
    expect(verifyDetachedSignature(MANIFEST, byIncoming, set)).toEqual({ verified: true, keyIndex: 1 });
  });

  it('bytes that are not a raw Ed25519 signature are malformed, never an exception; a key that does not parse is skipped', () => {
    const { pem, privateKey } = pair();
    expect(verifyDetachedSignature(MANIFEST, Buffer.from('not a signature'), [pem])).toEqual({ verified: false, reason: 'malformed-signature' });
    expect(verifyDetachedSignature(MANIFEST, Buffer.alloc(0), [pem])).toEqual({ verified: false, reason: 'malformed-signature' });
    const signature = sign(null, MANIFEST, privateKey);
    // An unparsable first key does not stop the second from verifying.
    expect(verifyDetachedSignature(MANIFEST, signature, ['-----BEGIN PUBLIC KEY-----\nnot a key\n-----END PUBLIC KEY-----', pem])).toEqual({ verified: true, keyIndex: 1 });
    // A key of another algorithm never verifies an Ed25519 signature.
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }) as string;
    expect(verifyDetachedSignature(MANIFEST, signature, [rsa])).toEqual({ verified: false, reason: 'not-verified' });
  });
});
