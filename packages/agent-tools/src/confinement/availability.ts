/**
 * ADR-0022's availability probe, owned at application lifetime.
 *
 * REQ-SANDBOX-066 fixes the cost ordering — platform check, launcher lookup on PATH, trial launch —
 * and forbids spawning a subprocess once an earlier step has failed. REQ-SANDBOX-067 requires the
 * verdict be DEMONSTRATED rather than inferred: a host that restricts unprivileged user namespaces
 * can have the launcher installed while every launch fails, so locating it settles nothing.
 * REQ-SANDBOX-068: a wrong `unavailable` costs only stricter prompting; a wrong `available` would
 * let commands run against the host with no confinement, so anything uninterpretable is a failure.
 */
import { findExecutable, spawnChild } from '@rotaris/platform';
import { millis, type Clocks } from '@rotaris/kernel';
import { renderBwrap } from './render-bwrap.js';
import { TRIAL_SPEC } from './spec.js';

/** REQ-SANDBOX-071: `unavailable` is a name in the vocabulary, not the absence of one. */
export type BackendName = 'seatbelt' | 'bubblewrap' | 'unavailable';

/**
 * REQ-SANDBOX-071: the complete answer the confinement service gives. Every surface that reports
 * availability presents this same text — the settings label (REQ-SANDBOX-116), the launch dialog
 * (REQ-SANDBOX-119/120), the run-refusal record (REQ-SANDBOX-126) and the application log — so the
 * guidance a user sees never differs by surface. Reason and remediation are empty when available.
 */
export interface AvailabilityVerdict {
  readonly available: boolean;
  readonly backend: BackendName;
  readonly reason: string;
  readonly remediation: string;
}

/** REQ-SANDBOX-069: a hard bound, never extended and never retried within the same process. */
export const TRIAL_TIMEOUT_MS = 5_000;

/**
 * REQ-SANDBOX-065: the mechanism follows from the host operating system ALONE, and the set is
 * closed at exactly two members. Comparison is by exact equality after trimming and lowercasing;
 * `win32` and every other identifier is unrecognised. No legacy identifier is recognised and none
 * may be added — a clean-room product has no earlier release to stay compatible with, and an
 * open-ended alias list could not be tested exhaustively.
 */
export function mechanismFor(platform: string): { readonly backend: BackendName; readonly launcher: string } {
  switch (platform.trim().toLowerCase()) {
    case 'darwin': return { backend: 'seatbelt', launcher: 'sandbox-exec' };
    case 'linux': return { backend: 'bubblewrap', launcher: 'bwrap' };
    default: return { backend: 'unavailable', launcher: '' };
  }
}

/** REQ-SANDBOX-073's by-hand Seatbelt trial, offered to the user verbatim and run verbatim. */
export const SEATBELT_TRIAL = `sandbox-exec -p "(version 1)(allow default)" /usr/bin/true`;

/** REQ-SANDBOX-073's by-hand bubblewrap line. Not the render: a short line a user can type. */
export const BWRAP_BY_HAND = 'bwrap --ro-bind / / --proc /proc --unshare-net -- true';

/**
 * REQ-SANDBOX-072: the reason, then the remediation on its own line; with no remediation, just the
 * reason; with no reason, a generic line reporting that no OS-level confinement can be used here.
 */
export function renderUnavailability(verdict: AvailabilityVerdict): string {
  if (verdict.reason === '') return 'No OS-level confinement can be used on this host.';
  return verdict.remediation === '' ? verdict.reason : `${verdict.reason}\n${verdict.remediation}`;
}

const AVAILABLE: AvailabilityVerdict = Object.freeze({ available: true, backend: 'unavailable' as BackendName, reason: '', remediation: '' });

const unavailable = (backend: BackendName, reason: string, remediation: string): AvailabilityVerdict => ({ available: false, backend, reason, remediation });

/**
 * REQ-SANDBOX-073, native Windows. The reason names both supported pairings; the remediation offers
 * two courses. This is the branch nearly every user of this product reaches (ESC-6, decided
 * 2026-09-02: accept the specification for the first release and say so plainly), and
 * REQ-SANDBOX-130's disclosure accompanies it on both surfaces.
 */
function windowsVerdict(): AvailabilityVerdict {
  return unavailable(
    'unavailable',
    'No OS-level confinement is available on native Windows: the only mechanisms this product uses are Seatbelt on macOS and bubblewrap on Linux.',
    'Either run this workspace under a WSL2 distribution with bubblewrap installed (`sudo apt-get install bubblewrap`), or leave `runtime.sandbox_mode` at `off`.',
  );
}

/** REQ-SANDBOX-073, unrecognised operating system: quote what was detected, and do not claim Windows. */
function unrecognisedVerdict(platform: string): AvailabilityVerdict {
  return unavailable(
    'unavailable',
    `No OS-level confinement is available: this host reports the platform identifier '${platform.trim()}', which is not one this product can confine.`,
    'The supported hosts are macOS and Linux, a WSL2 distribution included.',
  );
}

/** REQ-SANDBOX-073, launcher not found, by backend. */
function launcherMissingVerdict(backend: BackendName): AvailabilityVerdict {
  if (backend === 'seatbelt') {
    return unavailable(
      'seatbelt',
      'Seatbelt is the confinement mechanism on this host, but its launcher `sandbox-exec` was not found on PATH.',
      'macOS supplies `sandbox-exec` itself; check that `/usr/bin` is on PATH.',
    );
  }
  return unavailable(
    'bubblewrap',
    'bubblewrap is the confinement mechanism on this host, but its launcher `bwrap` was not found on PATH.',
    'Install it with `sudo apt-get install bubblewrap` or `sudo dnf install bubblewrap`.',
  );
}

/** REQ-SANDBOX-073, trial failure, by backend. The reason already carries REQ-SANDBOX-068's cause. */
function trialFailureVerdict(backend: BackendName, reason: string): AvailabilityVerdict {
  if (backend === 'seatbelt') {
    return unavailable('seatbelt', reason, `Try it by hand: ${SEATBELT_TRIAL}`);
  }
  return unavailable(
    'bubblewrap',
    reason,
    `Unprivileged user namespaces are gated by \`kernel.apparmor_restrict_unprivileged_userns\` and \`/proc/sys/kernel/unprivileged_userns_clone\`; try \`${BWRAP_BY_HAND}\` by hand. A workspace that requests confinement keeps failing for as long as the launcher fails.`,
  );
}

/** What a trial produced. REQ-SANDBOX-068: exit 0 inside the timeout is the one success criterion. */
export type TrialOutcome =
  | { readonly kind: 'exited'; readonly status: number; readonly output: string }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'launch-error'; readonly message: string };

export interface ProbeDeps {
  readonly platform: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly clocks: Clocks;
  /** REQ-SANDBOX-067: the real mechanism, never a stand-in. REQ-TOOLS-119 forbids a stub yielding "available". */
  readonly runTrial: (launcher: string, line: string, backend: BackendName) => Promise<TrialOutcome>;
  /** Step 2 of the ladder, injected so a test can reach step 3 without a launcher on the host. */
  readonly findLauncher?: (launcher: string, env: Readonly<Record<string, string | undefined>>, platform: string) => string | null;
}

/**
 * REQ-SANDBOX-068's four failure readings. Whatever the trial WRITES is irrelevant to a success
 * verdict; it matters only in naming why a failure happened.
 */
function readTrial(backend: BackendName, outcome: TrialOutcome): AvailabilityVerdict {
  const mechanism = backend === 'seatbelt' ? 'Seatbelt' : 'bubblewrap';
  switch (outcome.kind) {
    case 'exited': {
      if (outcome.status === 0) return { ...AVAILABLE, backend };
      const first = outcome.output.split('\n').map((l) => l.trim()).find((l) => l !== '');
      return trialFailureVerdict(backend, first === undefined
        ? `The ${mechanism} trial confinement exited with status ${outcome.status} and produced no output.`
        : `The ${mechanism} trial confinement exited with status ${outcome.status}: ${first}`);
    }
    case 'timeout':
      return trialFailureVerdict(backend, `The ${mechanism} trial confinement did not finish within 5 seconds and was terminated.`);
    case 'launch-error':
      return trialFailureVerdict(backend, `The ${mechanism} trial confinement could not be started at all: ${outcome.message}`);
  }
}

/** REQ-SANDBOX-070: the trial goes through the real mechanism. Rendering either line reads no path. */
export function trialLine(backend: BackendName): string {
  // The macOS trial deliberately does not follow the session pattern: Seatbelt's failure mode is
  // the profile rather than the exec chain, and REQ-SANDBOX-073 offers this exact line to the user.
  if (backend === 'seatbelt') return SEATBELT_TRIAL;
  // The Linux trial ends in the same final tokens every rendered session invocation ends in —
  // `-- /bin/sh -c 'true'`, never a bare `-- true` — so the interpreter step a real command depends
  // on is exercised by the trial rather than left untested.
  return renderBwrap(TRIAL_SPEC, 'true');
}

/**
 * One probe, in REQ-SANDBOX-066's order. Caching is the caller's (see `ConfinementService`): this
 * function performs the work and holds no state, so a test can run it as often as it likes.
 */
export async function probeOnce(deps: ProbeDeps): Promise<AvailabilityVerdict> {
  const { backend, launcher } = mechanismFor(deps.platform);
  // Step 1 — the platform check. No subprocess is spawned once it has failed (REQ-SANDBOX-066).
  if (backend === 'unavailable') {
    return deps.platform.trim().toLowerCase() === 'win32' ? windowsVerdict() : unrecognisedVerdict(deps.platform);
  }
  // Step 2 — the launcher lookup on PATH. Required, but it does not settle the question.
  const lookup = deps.findLauncher ?? ((l, env, platform) => findExecutable(l, env, platform as NodeJS.Platform));
  if (lookup(launcher, deps.env, deps.platform) === null) return launcherMissingVerdict(backend);
  // Step 3 — the trial launch, through the real mechanism.
  return readTrial(backend, await deps.runTrial(launcher, trialLine(backend), backend));
}

/**
 * REQ-SANDBOX-069's bounded trial, spawned through the product's one spawn point. The bound is read
 * from the timer port (ADR-0006) rather than from a bare `setTimeout`, so a test drives it.
 * Standard output and standard error are captured together, which is the set REQ-SANDBOX-068 reads.
 */
export function spawnTrial(clocks: Clocks, env: Readonly<Record<string, string>>): ProbeDeps['runTrial'] {
  return (_launcher, line) => new Promise<TrialOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: TrialOutcome): void => { if (!settled) { settled = true; timer.cancel(); resolve(outcome); } };
    let child: ReturnType<typeof spawnChild>;
    try {
      child = spawnChild({ command: '/bin/sh', args: ['-c', line], env, stdio: 'pipe' });
    } catch (error) {
      return resolve({ kind: 'launch-error', message: error instanceof Error ? error.message : String(error) });
    }
    const timer = clocks.timers.after(millis(TRIAL_TIMEOUT_MS), () => {
      // Still running at 5.0 s: terminated, and counted as a failure. Never extended, never retried.
      try { child.kill('SIGKILL'); } catch { /* the child is already gone; the verdict stands */ }
      finish({ kind: 'timeout' });
    });
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
    child.on('error', (error: Error) => finish({ kind: 'launch-error', message: error.message }));
    child.on('close', (status: number | null) => finish({ kind: 'exited', status: status ?? 1, output }));
  });
}

/**
 * REQ-SANDBOX-067: the trial runs at most once per process and its result is cached for later
 * probes. A cached verdict is never re-derived on its own; it is cleared only by the explicit
 * re-check of REQ-SANDBOX-129 or by restarting the application.
 */
export class ConfinementService {
  private cached: AvailabilityVerdict | null = null;
  private inFlight: Promise<AvailabilityVerdict> | null = null;

  constructor(private readonly deps: ProbeDeps) {}

  /** The cached verdict, or null while none has been taken. Never probes; never blocks a surface. */
  peek(): AvailabilityVerdict | null { return this.cached; }

  /** The verdict, probing once if none is cached. Concurrent callers share the one trial. */
  async verdict(): Promise<AvailabilityVerdict> {
    if (this.cached !== null) return this.cached;
    this.inFlight ??= probeOnce(this.deps).then((v) => { this.cached = v; this.inFlight = null; return v; });
    return this.inFlight;
  }

  /** REQ-SANDBOX-129: discard the cached verdict and probe afresh. */
  async recheck(): Promise<AvailabilityVerdict> {
    this.cached = null;
    this.inFlight = null;
    return this.verdict();
  }
}

/**
 * REQ-SANDBOX-093: confinement status is a pair (active, backend name), where active requires the
 * mode to be both SELECTED and actually available — selection alone is insufficient. Mode `off`
 * and selected-but-unavailable both report `(false, "")`, the backend name left empty so that no
 * record names a mechanism that never ran.
 */
export function confinementStatus(mode: string, verdict: AvailabilityVerdict | null): { readonly active: boolean; readonly backend: string } {
  if (mode === 'off') return { active: false, backend: '' };
  if (verdict === null || !verdict.available) return { active: false, backend: '' };
  return { active: true, backend: verdict.backend };
}
