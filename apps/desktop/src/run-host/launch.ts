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
