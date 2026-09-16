import type { ProcessReply, RunHostRequest } from '@rotaris/contracts';
import type { Sessions } from '@rotaris/engine';
import { prepareRun, type ConfigureDeps, type ConfiguredRun } from './configuration.js';

export type LaunchRequest = Extract<RunHostRequest, { kind: 'session.start' }>;

export interface LaunchDeps {
  readonly workspaceRoot: string;
  readonly attended: boolean;
  readonly configuration: ConfigureDeps;
  readonly leaseCredentials: (providers: readonly string[]) => Promise<Readonly<Record<string, string>>>;
  /**
   * ADR-0022 / REQ-SANDBOX-097: the availability decision is settled BEFORE the run does anything
   * else. Awaiting it here — off every interface thread, in the run host's own process — is what
   * lets `prepareRun` read a warm cache synchronously (REQ-SANDBOX-067).
   */
  readonly settleConfinement?: (() => Promise<unknown>) | undefined;
  /** Starts synchronously with the captured setup, after every pre-start refusal has been checked. */
  readonly start: (setup: ConfiguredRun, bearers: Readonly<Record<string, string>>) => ReturnType<Sessions['start']>;
}

/** What a continuation's lease refresh resolved to: the fresh bearers, or the refusal that stands in the run's place. */
export type ContinuationLease = { readonly kind: 'leased'; readonly bearers: Readonly<Record<string, string>> } | { readonly kind: 'refused'; readonly reply: ProcessReply };

/** What the lease refresh needs: the capture inputs and the one bounded ask — no `start`, it launches nothing itself. */
export type ContinuationLeaseDeps = Pick<LaunchDeps, 'workspaceRoot' | 'attended' | 'configuration' | 'leaseCredentials'>;

/**
 * ADR-0030 / REQ-PROVIDER-066 for the CONTINUATION paths (`session.continue`, `session.prompt`,
 * `session.planDecision`): a paused or resumed session launches its run through `setupFor` →
 * `configure`, which reads the bearers of the LAST launch's lease — empty after an application
 * restart, so the continuation's first model call went out with no `Authorization` header at all
 * (the 401 recorded in a defect note, removed once repaired). The repair
 * takes the same lease a launch takes, per continuation: main answers with the stored credential
 * for the providers the current configuration names, and the caller publishes the map so the run's
 * per-request resolvers read it. The user notices nothing. One refusal: an entry provider main
 * cannot resolve — including a lease main did not answer, the same outcome a launch gives
 * (REQ-WORKSPACE-137) — worded as that requirement's sentence.
 */
export async function leaseForContinuation(workspaceRoot: string, deps: ContinuationLeaseDeps): Promise<ContinuationLease> {
  const prepared = prepareRun(workspaceRoot, deps.attended, deps.configuration);
  // A configuration that will not load is refused by `setupFor` with its real report; lease nothing here.
  if (!prepared.ok) return { kind: 'leased', bearers: {} };
  const bearers = prepared.value.authProviders.length > 0
    ? await deps.leaseCredentials(prepared.value.authProviders).catch(() => ({} as Readonly<Record<string, string>>))
    : {};
  if (prepared.value.entryAuthProvider !== null && !bearers[prepared.value.entryAuthProvider]) {
    return { kind: 'refused', reply: { kind: 'refused', code: 'session.provider-auth', headline: 'Provider authentication required', detail: 'Authenticate at least one configured provider before continuing this run.' } };
  }
  return { kind: 'leased', bearers };
}

/** What a lease answered about the providers a run names: REQ-PROVIDER-067's report, as the wire carries it. */
export interface LeaseReport {
  readonly authenticated: readonly string[];
  readonly unresolved: Readonly<Record<string, string>>;
}

/**
 * REQ-PROVIDER-068: an unresolved credential "is reported once in the opening report instead of producing a
 * warning at every check". The continuation re-lease above is this product's standing substitute for that
 * requirement's keep-fresh timer, and it runs on `session.continue`, `session.prompt` AND `session.planDecision`
 * — so one prompt wrote the whole report three times over state that had not moved, naming the same expired
 * credential each time (measured 2026-09-16, session `6696f6ed`).
 *
 * The opening report per workspace root is kept whole: it is the report REQ-PROVIDER-068 requires. After it,
 * only what CHANGED is said, and a report identical to the last one says nothing at all. A change that is
 * neither a provider gained nor a reason changed — the set itself moved, because the configuration did — falls
 * back to the full sentence rather than to silence.
 */
export class LeaseReportLog {
  private readonly seen = new Map<string, { fingerprint: string; authenticated: ReadonlySet<string>; unresolved: ReadonlyMap<string, string> }>();

  report(workspaceRoot: string, report: LeaseReport | null, log: (message: string) => void): void {
    if (report === null) return;
    const authenticated = [...report.authenticated].sort();
    const unresolved = Object.entries(report.unresolved).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const fingerprint = `${authenticated.join(',')}|${unresolved.map(([id, why]) => `${id}=${why}`).join(',')}`;
    const previous = this.seen.get(workspaceRoot);
    this.seen.set(workspaceRoot, { fingerprint, authenticated: new Set(authenticated), unresolved: new Map(unresolved) });
    const whole = `credentials: leased for ${authenticated.join(', ') || 'no provider'} (workspace ${workspaceRoot})${unresolved.length > 0 ? `; unresolved: ${unresolved.map(([id, why]) => `${id} (${why})`).join(', ')}` : ''}`;
    if (previous === undefined) { log(whole); return; }
    if (previous.fingerprint === fingerprint) return;
    const gained = authenticated.filter((id) => !previous.authenticated.has(id) && previous.unresolved.has(id));
    const changed = unresolved.filter(([id, why]) => previous.unresolved.get(id) !== why);
    const delta = [...gained.map((id) => `${id} is authenticated`), ...changed.map(([id, why]) => `${id} is unresolved — ${why}`)];
    log(delta.length > 0 ? `credentials (workspace ${workspaceRoot}): ${delta.join('; ')}` : whole);
  }
}

/** REQ-TRACE-470/471, REQ-PROVIDER-066: one request owns capture, lease and start. */
export async function launchSession(req: LaunchRequest, deps: LaunchDeps): Promise<ProcessReply> {
  /*
   * REQ-SANDBOX-097: settled first, so a request for confinement the host cannot deliver fails with
   * that mechanism's reason rather than at the first shell command — and certainly never by
   * executing that command unconfined. The probe is bounded at 5.0 s and never retried.
   *
   * Guarded rather than `await deps.settleConfinement?.()`: awaiting an ABSENT optional dependency
   * still costs a microtask, which moved the credential lease across a turn and broke the overlapping
   * -launch test's synchronous expectation. With no service wired there is nothing to settle, and the
   * gate below reads a null verdict as unavailable — the fail-closed side.
   */
  if (deps.settleConfinement) await deps.settleConfinement();
  const prepared = prepareRun(deps.workspaceRoot, deps.attended, deps.configuration, req.boardPermissions, { sandboxMode: req.sandboxMode });
  if (!prepared.ok) {
    if (prepared.error.code === 'no-model') return { kind: 'refused', code: 'session.no-model', headline: 'No model configured', detail: 'Choose a model in Settings before starting a run.' };
    // REQ-SANDBOX-120: the notice's title conveys that the run did not get underway; its body
    // carries the reason and the remediation. Neither a session nor a session lock remains, because
    // the gate refused before either existed (REQ-SANDBOX-095).
    return { kind: 'refused', code: 'session.configuration', headline: 'The run was refused before it started', detail: prepared.error.reason };
  }
  const bearers = prepared.value.authProviders.length > 0
    ? await deps.leaseCredentials(prepared.value.authProviders).catch(() => ({} as Readonly<Record<string, string>>))
    : {};
  if (prepared.value.entryAuthProvider !== null && !bearers[prepared.value.entryAuthProvider]) {
    return { kind: 'refused', code: 'session.provider-auth', headline: 'Provider authentication required', detail: 'Authenticate at least one configured provider before starting a run.' };
  }
  const r = deps.start(prepared.value.complete(bearers), bearers);
  if (!r.ok) return { kind: 'refused', code: `session.${r.error.code}`, headline: 'failedBeforeStart' in r.error ? 'The run was refused before it started' : 'The session could not be started', detail: r.error.reason };
  return { kind: 'session.started', sessionId: r.value };
}
