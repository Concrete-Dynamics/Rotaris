/**
 * ADR-0022's four pieces, joined: the shared specification, the two thin renderers, the shared
 * quoting, and the availability verdict owned at application lifetime.
 *
 * REQ-SANDBOX-074: there is no silent fallback, STRUCTURALLY. Preparing a command for confinement
 * yields either a new confined command string or an availability error; it never yields the
 * original command. Mode `off` is the single exception and does no probing at all — which is why
 * it is settled before this module is reached, not inside it.
 */
import { renderBwrap } from './render-bwrap.js';
import { renderSeatbelt } from './render-seatbelt.js';
import { computeConfinement, type ConfinementSpec, type SpecDeps, type SpecInput } from './spec.js';
import type { AvailabilityVerdict, BackendName } from './availability.js';
import { renderUnavailability } from './availability.js';
import { SandboxUnavailableError } from './errors.js';

export * from './availability.js';
export * from './errors.js';
export * from './quote.js';
export * from './render-bwrap.js';
export * from './render-seatbelt.js';
export * from './spec.js';

/** REQ-SANDBOX-071's stable error-class name, for the observation that carries it. */
export const SANDBOX_ERROR_CLASS = 'SandboxUnavailableError';

/** REQ-SANDBOX-085: the launcher prefixes that identify confinement which failed to START. */
export const LAUNCHER_PREFIXES: readonly string[] = Object.freeze(['bwrap:', 'sandbox-exec:', 'sandbox_apply:']);

export interface WrapRequest {
  readonly spec: SpecInput;
  readonly verdict: AvailabilityVerdict;
}

/**
 * How the terminal enforcement point reaches the confinement in force.
 *
 * REQ-SANDBOX-093: the specification is resolved AFRESH for each call, from the issuing run's
 * configuration and the conversation's actual working directory, worktree-aware — so the port takes
 * the execution root and is asked again for the next command rather than consulted once at start.
 *
 * `null` is mode `off`: REQ-SANDBOX-088 requires that the shell then receive exactly the characters
 * the caller submitted, with no probing and no added cost, so the port returns nothing to do rather
 * than a verdict to inspect.
 */
export interface ConfinementPort {
  resolve(executionRoot: string): WrapRequest | null;
}

/**
 * Turn a submitted command into its confined form, or throw. Throwing rather than returning a
 * fallback is REQ-SANDBOX-074's structure: there is no return value that could be mistaken for the
 * original command, so no later edit can introduce a silent fallback by forgetting a branch.
 */
export function wrapForConfinement(request: WrapRequest, command: string, deps?: SpecDeps): { readonly line: string; readonly spec: ConfinementSpec } {
  if (!request.verdict.available) throw new SandboxUnavailableError(renderUnavailability(request.verdict));
  const spec = computeConfinement(request.spec, deps);
  return { line: renderFor(request.verdict.backend, spec, command), spec };
}

function renderFor(backend: BackendName, spec: ConfinementSpec, command: string): string {
  switch (backend) {
    case 'seatbelt': return renderSeatbelt(spec, command);
    case 'bubblewrap': return renderBwrap(spec, command);
    // Unreachable while the verdict is available — `unavailable` never reports `available: true` —
    // and kept as a throw rather than a fallthrough so that a future backend name added without a
    // renderer refuses the command instead of running it unconfined (REQ-SANDBOX-074).
    case 'unavailable': throw new SandboxUnavailableError('No confinement backend is available on this host.');
  }
}

/**
 * REQ-SANDBOX-085's output test: EVERY non-empty line, across standard output and standard error
 * as one set, begins with a launcher prefix. One line without such a prefix prevents relabelling,
 * so a program that merely fails inside a working sandbox is never reported as broken confinement;
 * a command that produced no output at all is not relabelled either.
 */
export function outputIsLauncherOnly(output: string): boolean {
  const lines = output.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  if (lines.length === 0) return false;
  return lines.every((line) => LAUNCHER_PREFIXES.some((prefix) => line.startsWith(prefix)));
}
