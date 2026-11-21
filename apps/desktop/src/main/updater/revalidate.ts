import { createHash } from 'node:crypto';
import { isStrictlyNewer, parseChecksumManifest, type PlatformKey } from '@rotaris/release-naming';
import type { Flavour } from './classify.js';
import { RELEASE_SIGNING_KEYS, verifyDetachedSignature } from './keys.js';
import type { PendingRecord, RetainedUpdate } from './pending.js';

/**
 * REQ-STARTUP-172 (PD-STARTUP-008, R-117) — a pending update is verified again before it is applied, from the retained
 * bytes alone and with no network request: the retained signature verifies over the retained manifest against a key THE
 * RUNNING BUILD carries (REQ-STARTUP-167); the manifest, parsed only after that, lists the asset under its exact name
 * (REQ-STARTUP-108); the retained asset's SHA-256 equals the listed digest (and the record's); its version is strictly
 * newer than the running one in REQ-STARTUP-109's order; and its flavour and platform key are the ones the running build
 * classifies itself as (REQ-STARTUP-106). The plan's order (§3), the checks the install step already makes reused:
 * `verifyDetachedSignature`, `parseChecksumManifest`, `isStrictlyNewer` — no second implementation of any of them.
 *
 * Pure over its input: it reads nothing but the bytes handed in, and reads the asset (`retained.asset()`, about a second
 * for a 150–200 MB installer) only once the signature and the manifest have passed. Any failure means the caller
 * discards the pending update, record and files, and applies nothing (REQ-STARTUP-126 holds: nothing of the installation
 * was touched). `silent` marks the one discard REQ-STARTUP-172 says is silent — a version not newer than the running one,
 * the same or a newer build having been installed by other means; every other discard is shown under UD-4, which is the
 * caller's (a later stage's) to word. Never overridable (REQ-STARTUP-123).
 */
export type RevalidationCheck = 'signature' | 'listed' | 'digest' | 'newer' | 'installation';
export type Revalidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly check: RevalidationCheck; readonly silent: boolean; readonly sentence: string };

export interface RevalidationInput {
  readonly record: PendingRecord;
  readonly retained: RetainedUpdate;
  readonly runningVersion: string;
  /** What the running build classifies itself as. */
  readonly installation: { readonly flavour: Flavour; readonly platformKey: PlatformKey };
  /** The running build's key set; production passes nothing and gets the compiled-in set (`keys.ts`). */
  readonly keys?: readonly string[];
}

export async function revalidatePending(input: RevalidationInput): Promise<Revalidation> {
  const { record, retained } = input;
  const refuse = (check: RevalidationCheck, sentence: string, silent = false): Revalidation => ({ ok: false, check, silent, sentence });

  // 1. The signature over the exact retained manifest bytes, against a key the RUNNING build carries.
  const verdict = verifyDetachedSignature(retained.manifest, retained.signature, input.keys ?? RELEASE_SIGNING_KEYS);
  if (!verdict.verified) {
    return refuse('signature', `the kept checksum file of release ${record.version} is not signed by a key this build trusts${verdict.reason === 'no-key' ? ' (this build carries no verification key)' : ''}; the pending update was discarded and nothing was installed`);
  }

  // 2. Parsed only now; the exact name (REQ-STARTUP-108).
  const listed = parseChecksumManifest(Buffer.from(retained.manifest).toString('utf8')).find((e) => e.name === record.asset.name)?.sha256 ?? null;
  if (listed === null) return refuse('listed', `the kept checksum file lists no hash for ${record.asset.name}; the pending update was discarded and nothing was installed`);

  // 3. The retained asset's digest, streamed, against the listed one and the record's.
  const hash = createHash('sha256');
  try {
    for await (const piece of retained.asset()) hash.update(piece);
  } catch (cause) {
    return refuse('digest', `the kept ${record.asset.name} could not be read (${cause instanceof Error ? cause.message : String(cause)}); the pending update was discarded and nothing was installed`);
  }
  const actual = hash.digest('hex');
  if (actual !== listed.toLowerCase() || actual !== record.asset.sha256.toLowerCase()) {
    return refuse('digest', `the kept ${record.asset.name} does not match the published hash (expected ${listed.toLowerCase()}, got ${actual}); the pending update was discarded and nothing was installed`);
  }

  // 4. Strictly newer than what runs — otherwise the same or a newer build was installed by other means: silent.
  if (!isStrictlyNewer(record.version, input.runningVersion)) {
    return refuse('newer', `the pending update ${record.version} is not newer than the running ${input.runningVersion}; it was discarded`, true);
  }

  // 5. The installation it was selected for is the one that runs.
  if (record.flavour !== input.installation.flavour || record.platformKey !== input.installation.platformKey) {
    return refuse('installation', `the pending update was downloaded for the ${record.flavour} flavour on ${record.platformKey}, and this installation is the ${input.installation.flavour} flavour on ${input.installation.platformKey}; it was discarded`);
  }
  return { ok: true };
}
