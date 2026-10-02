/**
 * ADR-0022's Linux renderer. It consumes the specification and decides nothing.
 *
 * REQ-SANDBOX-076 fixes the option sequence; the carve-outs follow the writable binds because
 * ordering decides the outcome and an exclusion placed before the workspace bind would simply be
 * covered over.
 */
import { SandboxUnavailableError } from './errors.js';
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
  // REQ-SANDBOX-077's closing paragraph, before any carve-out is rendered: case (c) cannot be established
  // under bubblewrap without creating a directory on the host, so the command is refused instead.
  refuseAbsentCarveOuts(spec);
  // REQ-SANDBOX-077, applied AFTER those binds.
  for (const carveOut of spec.carveOuts) {
    switch (carveOut.kase) {
      // (a) Outside every writable root: nothing extra is rendered.
      case 'outside': break;
      // (b) Present inside a writable root: re-bound read-only in the form that tolerates a
      // missing source, so the command still starts if the path is removed between the check and
      // the launch. Its real contents stay readable, which is what keeps `git status` working.
      case 'exists': tokens.push(flag('--ro-bind-try'), path(carveOut.path), path(carveOut.path)); break;
      // (c) Absent inside a writable root: refused above, so nothing reaches here. The rendering
      // REQ-SANDBOX-077 names for it, `--tmpfs <p> --remount-ro <p>`, was emitted until this repair
      // (2026-09-29, R-067) on the reason "both options live in the confined process's own mount view and leave nothing
      // on the host". IC-8's first Linux execution FALSIFIED that reason: bubblewrap creates the
      // mountpoint before it mounts, the mountpoint lies under a writable root bound in from the
      // host, and so an empty `.git` stayed on the host after the command ended. No mount can hide
      // a name that does not exist without a mountpoint at that name, so the requirement's own
      // fallback applies (`docs/defects/fixed/
      // the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md`).
      case 'absent': break;
    }
  }
  // REQ-SANDBOX-059: the network namespace is kept separate unless the opt-in grants network.
  if (!spec.allowNetwork) tokens.push(flag('--unshare-net'));
  // REQ-SANDBOX-076: the confined process is terminated together with its parent.
  tokens.push(flag('--die-with-parent'));
  return tokens;
}

/** The one sentence the refusal carries as its cause (REQ-SANDBOX-083's "what the underlying error was"). */
function absentCause(paths: readonly string[]): string {
  const named = paths.join(' and ');
  const them = paths.length === 1 ? 'it' : 'them';
  const exist = paths.length === 1 ? 'exists' : 'exist';
  return `${named} ${paths.length === 1 ? 'does' : 'do'} not exist inside a writable root, and bubblewrap can keep ${them} from being created only by creating ${paths.length === 1 ? 'an empty directory' : 'empty directories'} on the host, which confinement never leaves behind; confined commands here are refused until ${named} ${exist}.`;
}

/**
 * REQ-SANDBOX-077's closing paragraph and REQ-SANDBOX-078: a carve-out bubblewrap cannot establish
 * without a host-visible directory is not established by creating one. The command is refused with
 * REQ-SANDBOX-083's `SandboxUnavailableError`, which the terminal enforcement point turns into the
 * `sandbox_unavailable` refusal for this one command; the next command is rendered afresh.
 */
function refuseAbsentCarveOuts(spec: ConfinementSpec): void {
  const absent = spec.carveOuts.filter((c) => c.kase === 'absent').map((c) => c.path);
  if (absent.length > 0) throw new SandboxUnavailableError(absentCause(absent));
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
