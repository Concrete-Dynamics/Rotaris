import { randomBytes } from 'node:crypto';
import { mintMachineId, parseMachineId, type MachineId } from '@rotaris/kernel';
import { exclusiveCreate } from './document.js';

/**
 * REQ-SESSION-046 — what supplies `host`.
 *
 * An identifier the product mints once for this machine and keeps in the
 * machine-local location the store lives in (REQ-STARTUP-145). Never the
 * operating-system name or anything a user, an administrator or the
 * machine's own configuration can change. Renaming a machine MUST NOT change
 * it. Minted by exclusive create so two processes racing at first launch
 * agree on one value (D-29).
 *
 * TODO(IC-4): the rename experiment — `machine-id-rename.spike.test.ts`, two
 * phases the owner runs around a real rename and reboot; IC-4's first half
 * (the foreign-lock report) is discharged. Figures go into
 * docs/architecture/spikes/machine-identifier-rename.md.
 */
export function readOrMintMachineId(file: string): MachineId {
  const fresh = mintMachineId(randomBytes(16).toString('hex'));
  const r = exclusiveCreate(file, `${fresh}\n`);
  if (!r.ok) throw new Error(`machine identifier: ${r.error.headline} — ${r.error.detail ?? ''}`);
  if (r.value.minted) return fresh;
  const line = r.value.existing.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0 && !s.startsWith('#'));
  const parsed = line ? parseMachineId(line) : undefined;
  if (!parsed) {
    // Present but unreadable: this is the one value the lock predicate cannot do without, and
    // guessing would make every lock on this machine foreign. Refuse loudly rather than mint over it.
    throw new Error(`machine identifier at ${file} is present but unreadable; it must be repaired by hand, never minted over`);
  }
  return parsed;
}
