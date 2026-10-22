// @ts-check
/**
 * The manifest's signature and the key record (REQ-STARTUP-032, REQ-STARTUP-167, REQ-STARTUP-168;
 * first-release-plan.md §4.6, §4.7; ADR-0054, "Ruled — what the update path establishes (ESC-8)" and "The updater").
 *
 * ONE VERIFIER. The pipeline verifies the signature it made through the updater's own `verifyDetachedSignature`,
 * against the updater's own compiled-in `RELEASE_SIGNING_KEYS` (`apps/desktop/src/main/updater/keys.ts`), imported
 * here by path. So "the signature verifies against a key the release's own artifacts carry" (REQ-STARTUP-038, §5's
 * gate) is decided by the code an installed build runs, not by a second reading of the same format that could drift.
 *
 * THE SIGNATURE. Ed25519 (RFC 8032), raw, 64 bytes, over the manifest's exact bytes — the form ADR-0054 and `keys.ts`
 * fix and OQ-83 asks the record about. Ed25519 is deterministic, so `sign` below and `openssl pkeyutl -sign -rawin`
 * produce the same bytes for the same key and manifest. The private key is read from one environment variable, the
 * pipeline secret of O-2, and never written to disk by this tool.
 *
 * THE KEY RECORD (`key-record.json`). REQ-STARTUP-168 (b): a release is signed with a key every published artifact it
 * may be offered to carries, decided before publishing "from the releases already published and the keys their
 * artifacts carry". That is a fact about builds that already shipped, so it cannot be recomputed from the checkout
 * (ADR-0054) and is committed instead: one row per release, the version and the fingerprints of the keys its build
 * carries. A release's own row is committed with the release, before its tag, and the pipeline holds the row equal to
 * what the build carries; every older row is a build REQ-STARTUP-107 may offer this release to, so the signing key must
 * be in each. A row for a release that was tagged and never published makes the check stricter, never looser.
 */
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { compareReleaseVersions, parseReleaseVersion, tryParseReleaseVersion } from '../release-naming/src/index.ts';
import { RELEASE_SIGNING_KEYS, SIGNATURE_BYTES, verifyDetachedSignature } from '../../apps/desktop/src/main/updater/keys.ts';

/** The environment variable the signing step reads the private key from: the pipeline secret of O-2, a PKCS#8 PEM. */
export const SIGNING_KEY_VARIABLE = 'ROTARIS_RELEASE_SIGNING_KEY';

/** The key record's schema version; a record of any other version is refused rather than guessed at. */
export const KEY_RECORD_SCHEMA_VERSION = 1;

/** The key set the build carries, re-exported so the CLI and its tests read the same array the updater does. */
export { RELEASE_SIGNING_KEYS };

/**
 * A key's fingerprint: `sha256:` and the SHA-256 of its SubjectPublicKeyInfo DER, in lower-case hexadecimal. Taken from
 * the public half, so a private key and its public half have the same fingerprint. Throws on a PEM that is not an
 * Ed25519 key.
 */
export function keyFingerprint(pem) {
  let key;
  try {
    key = createPublicKey(pem);
  } catch (cause) {
    throw new Error(`not a PEM key: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(`the key is ${key.asymmetricKeyType ?? 'of no known type'}, not Ed25519 (ADR-0054, "The updater")`);
  return `sha256:${createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex')}`;
}

/** The fingerprints of the keys a build carries, in set order; a member that does not parse carries nothing, as in `keys.ts`. */
export function carriedKeyFingerprints(keys = RELEASE_SIGNING_KEYS) {
  const out = [];
  for (const pem of keys) {
    try {
      out.push(keyFingerprint(pem));
    } catch {
      // `verifyDetachedSignature` skips such a member too; it verifies nothing, so it is carried by no one.
    }
  }
  return out;
}

/**
 * The detached signature over the manifest's exact bytes: raw Ed25519, 64 bytes. `privatePem` is the PKCS#8 PEM
 * `openssl genpkey -algorithm ed25519` writes. Throws, naming what is wrong, for anything else.
 */
export function signManifest(manifest, privatePem) {
  let key;
  try {
    key = createPrivateKey(privatePem);
  } catch (cause) {
    throw new Error(`${SIGNING_KEY_VARIABLE} does not hold a private key in PEM form: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(`${SIGNING_KEY_VARIABLE} holds a ${key.asymmetricKeyType ?? 'non-Ed25519'} key; the release signature is Ed25519 (ADR-0054)`);
  const signature = sign(null, manifest, key);
  if (signature.byteLength !== SIGNATURE_BYTES) throw new Error(`the signature is ${signature.byteLength} bytes, not ${SIGNATURE_BYTES}`);
  return signature;
}

/**
 * The key record read and checked for shape: `{ schemaVersion: 1, releases: [{ version, keys: ["sha256:<hex>", …] }] }`,
 * each version in REQ-STARTUP-029's grammar and named once. `{ record }` or `{ problems }`, never a throw.
 */
export function readKeyRecord(path) {
  if (!existsSync(path)) return { problems: [`the key record ${path} does not exist (REQ-STARTUP-168 (b))`] };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    return { problems: [`the key record ${path} is not JSON: ${cause instanceof Error ? cause.message : String(cause)}`] };
  }
  return checkKeyRecordShape(parsed, path);
}

/** The shape check of `readKeyRecord`, over an already-parsed value. */
export function checkKeyRecordShape(parsed, where = 'the key record') {
  const problems = [];
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { problems: [`${where} is not a JSON object`] };
  if (parsed.schemaVersion !== KEY_RECORD_SCHEMA_VERSION) problems.push(`${where}: schemaVersion is ${JSON.stringify(parsed.schemaVersion)}, not ${KEY_RECORD_SCHEMA_VERSION}`);
  if (!Array.isArray(parsed.releases)) return { problems: [...problems, `${where}: "releases" is not an array`] };
  const seen = new Set();
  const releases = [];
  for (const [i, row] of parsed.releases.entries()) {
    const at = `${where}: releases[${i}]`;
    if (row === null || typeof row !== 'object' || Array.isArray(row)) { problems.push(`${at} is not an object`); continue; }
    if (typeof row.version !== 'string' || tryParseReleaseVersion(row.version) === null) { problems.push(`${at}: "version" ${JSON.stringify(row.version)} is not a product version (REQ-STARTUP-029)`); continue; }
    if (seen.has(row.version)) problems.push(`${at}: ${row.version} is recorded twice`);
    seen.add(row.version);
    if (!Array.isArray(row.keys) || row.keys.some((k) => typeof k !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(k))) {
      problems.push(`${at}: "keys" must be an array of "sha256:<64 lower-case hex>" fingerprints`);
      continue;
    }
    releases.push({ version: row.version, keys: [...row.keys] });
  }
  return problems.length > 0 ? { problems } : { record: { schemaVersion: KEY_RECORD_SCHEMA_VERSION, releases } };
}

/** The row a release of `version` commits for the build this tree produces. */
export function keyRecordRow(version, keys = RELEASE_SIGNING_KEYS) {
  return { version: parseReleaseVersion(version).version, keys: carriedKeyFingerprints(keys) };
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/**
 * Before the build: the tree for `version` may be released only if its build carries at least one key — an empty set
 * can verify no later release, so every installation of it would be stranded at its first update (first-release-plan.md
 * §4.6: "the release still compiles the key in") — and only if the record's row for `version` is exactly the set it
 * carries, so the record says what shipped. Every problem, none when both hold.
 */
export function checkBuildAgainstRecord(record, version, keys = RELEASE_SIGNING_KEYS) {
  const problems = [];
  const carried = carriedKeyFingerprints(keys);
  if (carried.length === 0) {
    problems.push('REQ-STARTUP-167: this build carries no release verification key (RELEASE_SIGNING_KEYS in apps/desktop/src/main/updater/keys.ts is empty); O-2 writes the public half there, and a build without one could never verify an update');
  }
  const row = record.releases.find((r) => r.version === version);
  const wanted = JSON.stringify(keyRecordRow(version, keys));
  if (row === undefined) problems.push(`REQ-STARTUP-168 (b): the key record has no row for ${version}; commit this row with the release, before its tag: ${wanted}`);
  else if (!sameSet(row.keys, carried)) problems.push(`REQ-STARTUP-168 (b): the key record's row for ${version} names keys ${JSON.stringify(row.keys)}, and the build carries ${JSON.stringify(carried)}; the row must say what ships: ${wanted}`);
  return problems;
}

/**
 * REQ-STARTUP-168 (b): every recorded release older than `version` is a build REQ-STARTUP-107 may offer this release to,
 * so each must carry the key the release is signed with. The problems name each build that would be stranded.
 */
export function checkOfferable(record, version, signingFingerprint) {
  const target = parseReleaseVersion(version);
  const stranded = record.releases
    .filter((r) => compareReleaseVersions(parseReleaseVersion(r.version), target) < 0)
    .filter((r) => !r.keys.includes(signingFingerprint))
    .map((r) => r.version);
  return stranded.map((v) => `REQ-STARTUP-168 (b): ${v}'s build does not carry the signing key ${signingFingerprint}, and ${version} may be offered to it as an update; sign with a key every offerable build carries, or withdraw under REQ-STARTUP-168 (c)`);
}

const VERDICT_TEXT = {
  'no-key': 'this build carries no verification key, so no signature can verify (O-2)',
  'malformed-signature': `the signature is not a raw Ed25519 signature of ${SIGNATURE_BYTES} bytes`,
  'not-verified': 'no key this build carries verifies it',
};

/**
 * The signature half of §5's gate: the manifest's signature verifies through the updater's verifier against the keys
 * the build carries (REQ-STARTUP-038, REQ-STARTUP-167), and the key that verified it is carried by every recorded
 * release that may be offered this one (REQ-STARTUP-168 (b)). Every problem, none when the release may be published.
 */
export function verifyReleaseSignature({ manifest, signature, version, record, keys = RELEASE_SIGNING_KEYS }) {
  const verdict = verifyDetachedSignature(manifest, signature, keys);
  if (!verdict.verified) return [`REQ-STARTUP-167: SHA256SUMS.txt.sig does not verify: ${VERDICT_TEXT[verdict.reason]}`];
  const pem = keys[verdict.keyIndex];
  if (pem === undefined) return ['REQ-STARTUP-167: the verifier named a key outside the carried set'];
  return checkOfferable(record, version, keyFingerprint(pem));
}
