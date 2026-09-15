/**
 * ADR-0022's Linux renderer. It consumes the specification and decides nothing.
 *
 * REQ-SANDBOX-076 fixes the option sequence; the carve-outs follow the writable binds because
 * ordering decides the outcome and an exclusion placed before the workspace bind would simply be
 * covered over.
 */
import { shellQuote } from './quote.js';
import type { ConfinementSpec } from './spec.js';

/**
 * A token is a fixed flag or a path. The distinction is carried rather than sniffed from the text:
 * deciding what to quote by whether a token starts with `--` would leave a crafted path unquoted,
 * which is exactly the hole REQ-SANDBOX-064 closes.
 */
export type BwrapToken = { readonly kind: 'flag'; readonly value: string } | { readonly kind: 'path'; readonly value: string };

const flag = (value: string): BwrapToken => ({ kind: 'flag', value });
const path = (value: string): BwrapToken => ({ kind: 'path', value });

/** The option sequence, tagged, so a test can read it without unpicking a shell line. */
export function bwrapTokens(spec: ConfinementSpec): readonly BwrapToken[] {
  const tokens: BwrapToken[] = [
    // The entire root filesystem bound read-only, then the device and proc filesystems, then a
    // fresh empty temp filesystem (REQ-SANDBOX-076).
    flag('--ro-bind'), path('/'), path('/'),
    flag('--dev'), path('/dev'),
    flag('--proc'), path('/proc'),
    flag('--tmpfs'), path('/tmp'),
  ];
  // Each effective writable root re-bound writable, in the specification's order (REQ-SANDBOX-058).
  for (const root of spec.writableRoots) tokens.push(flag('--bind'), path(root), path(root));
  // REQ-SANDBOX-077, applied AFTER those binds.
  for (const carveOut of spec.carveOuts) {
    switch (carveOut.kase) {
      // (a) Outside every writable root: nothing extra is rendered.
      case 'outside': break;
      // (b) Present inside a writable root: re-bound read-only in the form that tolerates a
      // missing source, so the command still starts if the path is removed between the check and
      // the launch. Its real contents stay readable, which is what keeps `git status` working.
      case 'exists': tokens.push(flag('--ro-bind-try'), path(carveOut.path), path(carveOut.path)); break;
      // (c) Absent inside a writable root: an empty read-only filesystem at that name, so a
      // confined command cannot bring `.git` or `.rotaris` into existence where they were absent.
      // Both options live in the confined process's own mount view and leave nothing on the host.
      case 'absent': tokens.push(flag('--tmpfs'), path(carveOut.path), flag('--remount-ro'), path(carveOut.path)); break;
    }
  }
  // REQ-SANDBOX-059: the network namespace is kept separate unless the opt-in grants network.
  if (!spec.allowNetwork) tokens.push(flag('--unshare-net'));
  // REQ-SANDBOX-076: the confined process is terminated together with its parent.
  tokens.push(flag('--die-with-parent'));
  return tokens;
}

/** The same sequence as plain text, for a diagnostic or an assertion that reads the whole line. */
export function bwrapOptions(spec: ConfinementSpec): readonly string[] {
  return bwrapTokens(spec).map((token) => token.value);
}

/**
 * REQ-SANDBOX-079: `bwrap <options…> -- /bin/sh -c '<command>'`. The submitted command travels in
 * as a SINGLE shell argument and is never split apart again (REQ-SANDBOX-063), and the wrapper
 * never changes the working directory (REQ-SANDBOX-062) — the inner shell inherits it.
 */
export function renderBwrap(spec: ConfinementSpec, command: string): string {
  const options = bwrapTokens(spec).map((token) => (token.kind === 'flag' ? token.value : shellQuote(token.value)));
  return `bwrap ${options.join(' ')} -- /bin/sh -c ${shellQuote(command)}`;
}
