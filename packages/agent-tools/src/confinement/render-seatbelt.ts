/**
 * ADR-0022's macOS renderer. It consumes the specification and decides nothing.
 *
 * REQ-SANDBOX-075 fixes what the profile observably permits; the denials appear AFTER every
 * allowance because in Seatbelt position decides effect, and a denial placed before the workspace
 * allowance would simply be covered over.
 */
import { profileQuote, shellQuote } from './quote.js';
import type { ConfinementSpec } from './spec.js';

/** REQ-SANDBOX-075: writable in every active mode, so `read-only` means "no writable root beyond these". */
const TEMP_SUBPATHS: readonly string[] = Object.freeze(['/tmp', '/private/tmp', '/var/tmp', '/private/var/tmp', '/private/var/folders']);

/** REQ-SANDBOX-075: data may be written to these device nodes in every active mode. */
const DEVICE_NODES: readonly string[] = Object.freeze([
  '/dev/null', '/dev/zero', '/dev/random', '/dev/urandom', '/dev/tty',
  '/dev/stdin', '/dev/stdout', '/dev/stderr', '/dev/dtracehelper',
]);

/** The profile text alone, so a test can read it without unpicking a shell line. */
export function seatbeltProfile(spec: ConfinementSpec): string {
  const lines: string[] = ['(version 1)', '(deny default)'];
  // Permitted in every active mode (REQ-SANDBOX-075). Reads are deliberately unrestricted
  // (REQ-SANDBOX-060): ordinary developer tooling depends on wide read access.
  lines.push('(allow process-exec)', '(allow process-fork)', '(allow sysctl-read)', '(allow signal)', '(allow file-read*)');
  lines.push(`(allow file-write* ${TEMP_SUBPATHS.map((p) => `(subpath ${profileQuote(p)})`).join(' ')})`);
  lines.push(`(allow file-write-data ${DEVICE_NODES.map((p) => `(literal ${profileQuote(p)})`).join(' ')})`);
  // One allowance per effective writable root, in the specification's order (REQ-SANDBOX-058).
  for (const root of spec.writableRoots) lines.push(`(allow file-write* (subpath ${profileQuote(root)}))`);
  // REQ-SANDBOX-047 / REQ-SANDBOX-059: the network is permitted or refused as a whole, with no
  // distinction by destination.
  if (spec.allowNetwork) lines.push('(allow network*)');
  // After every allowance, and only for a name that lies inside a writable root: case (a) needs
  // nothing, the read-only root already refusing the write (REQ-SANDBOX-077 (a)).
  for (const carveOut of spec.carveOuts) {
    if (carveOut.kase === 'outside') continue;
    lines.push(`(deny file-write* (subpath ${profileQuote(carveOut.path)}))`);
  }
  return lines.join('\n');
}

/**
 * REQ-SANDBOX-079: `sandbox-exec -p '<profile>' /bin/sh -c '<command>'`. The submitted command
 * travels in as a SINGLE shell argument and is never split apart again (REQ-SANDBOX-063), and the
 * wrapper never changes the working directory (REQ-SANDBOX-062) — the inner shell inherits it.
 */
export function renderSeatbelt(spec: ConfinementSpec, command: string): string {
  return `sandbox-exec -p ${shellQuote(seatbeltProfile(spec))} /bin/sh -c ${shellQuote(command)}`;
}
