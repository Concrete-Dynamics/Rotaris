import type { ProcessReply, RunHostRequest } from '@rotaris/contracts';
import type { Sessions } from '@rotaris/engine';
import { prepareRun, type ConfigureDeps, type ConfiguredRun } from './configuration.js';

export type LaunchRequest = Extract<RunHostRequest, { kind: 'session.start' }>;

export interface LaunchDeps {
  readonly workspaceRoot: string;
  readonly attended: boolean;
  readonly configuration: ConfigureDeps;
  readonly leaseCredentials: (providers: readonly string[]) => Promise<Readonly<Record<string, string>>>;
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
 * (the 401 recorded in `docs/defects/continue-run-sends-no-authorization-header.md`). The repair
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

/** REQ-TRACE-470/471, REQ-PROVIDER-066: one request owns capture, lease and start. */
export async function launchSession(req: LaunchRequest, deps: LaunchDeps): Promise<ProcessReply> {
  const prepared = prepareRun(deps.workspaceRoot, deps.attended, deps.configuration, req.boardPermissions);
  if (!prepared.ok) {
    if (prepared.error.code === 'no-model') return { kind: 'refused', code: 'session.no-model', headline: 'No model configured', detail: 'Choose a model in Settings before starting a run.' };
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
