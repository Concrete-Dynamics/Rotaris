import { createPublicKey, verify, type KeyObject } from 'node:crypto';

/**
 * REQ-STARTUP-167, REQ-STARTUP-168 (a) — the set of public verification keys this build carries, and the one
 * signature format it accepts. Compiled into main's bundle (ADR-0054, "The key set"): the artifact resolves it
 * from within what was installed with no additional download (REQ-STARTUP-159), and nothing at run time adds to
 * it, replaces it or disables it — no configuration value, no preference, no environment variable, no interface
 * control and nothing the product downloads. There is no key file to ship, because a key file would be the very
 * surface REQ-STARTUP-167 forbids.
 *
 * THE SET IS EMPTY ON THIS TREE. O-2 (first-release-plan.md §6) — generating the signing key pair — is the owner's
 * act and is still owed. With no key, `verifyDetachedSignature` answers `no-key` for every manifest, the install
 * step refuses with one sentence, and nothing is downloaded (REQ-STARTUP-122/123). That is the intended outcome
 * of an empty set, not a stub: the mechanism is whole and its trust anchor is absent.
 *
 * WHAT O-2 ADDS, AND WHERE. One element in `RELEASE_SIGNING_KEYS` below: the public half of the release signing
 * key as an SPKI PEM text block (`-----BEGIN PUBLIC KEY-----` … `-----END PUBLIC KEY-----`), which is exactly what
 * `openssl pkey -in <private.pem> -pubout` prints for a key made with `openssl genpkey -algorithm ed25519`. The
 * private half never enters the repository: it is the release pipeline's secret (§4.7). A rotation appends the
 * incoming key here while the outgoing one is still carried (REQ-STARTUP-168 (a)); a withdrawal removes the key
 * so no build produced afterwards carries it (REQ-STARTUP-168 (d)); builds already shipped keep what they were
 * built with. Which keys each shipped build carried is the pipeline's key record (§4.7), decided at the gate
 * (REQ-STARTUP-168 (b)), and is not recomputed from here.
 *
 * THE SIGNATURE FORMAT. Ed25519 (RFC 8032), through Node's `crypto`. `SHA256SUMS.txt.sig` holds the raw 64-byte
 * signature over the manifest's exact published bytes (REQ-STARTUP-032) — no armour, no envelope, no digest step
 * of ours in between — which is what `openssl pkeyutl -sign -inkey <private.pem> -rawin -in SHA256SUMS.txt -out
 * SHA256SUMS.txt.sig` writes. The specification leaves the form of a key and of a signature to the implementation
 * (domain 11's Data & Formats); ADR-0054 records this choice and OQ-83 asks whether the record should fix it.
 */
export const SIGNATURE_ALGORITHM = 'Ed25519' as const;
/** The raw Ed25519 signature is exactly this long; anything else is not a signature of this format. */
export const SIGNATURE_BYTES = 64;

/** The compiled-in set. Empty until O-2; see the module comment for what goes here and in which encoding. */
export const RELEASE_SIGNING_KEYS: readonly string[] = [];

export type SignatureVerdict =
  | { readonly verified: true; readonly keyIndex: number }
  /**
   * `no-key`: the build carries no key at all (O-2 owed, or every key withdrawn). `malformed-signature`: the
   * bytes are not a raw Ed25519 signature. `not-verified`: no carried key verifies it — the case REQ-STARTUP-167
   * names, "a signature made by a key the running build does not carry SHALL be treated as not verifying".
   */
  | { readonly verified: false; readonly reason: 'no-key' | 'malformed-signature' | 'not-verified' };

function loadKey(pem: string): KeyObject | null {
  try {
    const key = createPublicKey(pem);
    return key.asymmetricKeyType === 'ed25519' ? key : null;
  } catch {
    // A key that does not parse verifies nothing. It is left out of the set rather than aborting the check, so a
    // second, well-formed key in the same set still verifies (REQ-STARTUP-168 (a)).
    return null;
  }
}

/**
 * Verify a detached signature over the manifest's exact bytes against the carried set. Pure over its arguments;
 * the production caller passes `RELEASE_SIGNING_KEYS` and a test passes a generated pair.
 */
export function verifyDetachedSignature(manifest: Uint8Array, signature: Uint8Array, keys: readonly string[] = RELEASE_SIGNING_KEYS): SignatureVerdict {
  if (keys.length === 0) return { verified: false, reason: 'no-key' };
  if (signature.byteLength !== SIGNATURE_BYTES) return { verified: false, reason: 'malformed-signature' };
  for (const [keyIndex, pem] of keys.entries()) {
    const key = loadKey(pem);
    if (key === null) continue;
    try {
      // Ed25519 takes no digest algorithm: the first argument is null by the platform's own contract.
      if (verify(null, manifest, key, signature)) return { verified: true, keyIndex };
    } catch {
      // A verification error is a non-verification, never a thrown exception out of the update path.
    }
  }
  return { verified: false, reason: 'not-verified' };
}
