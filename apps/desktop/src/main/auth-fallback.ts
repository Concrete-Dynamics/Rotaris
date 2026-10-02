import type { AcknowledgementKind, ReauthPrompt, ReauthSubmitResult } from '@rotaris/contracts';
import { KEY_NOT_STORED } from './auth-recovery.js';

/**
 * REQ-NOTIFY-069/070/071/078, REQ-MONITOR-147 (the 401 note's parts A and B) — the authentication class's automatic half:
 * the session's first authentication failure restarted on the configured fallback, and the non-modal re-authentication
 * prompt beside the continuing run. Main's focus gate (`RunFailurePublisher`, `run-failure-notice.ts`) asks this FIRST for a
 * failure classified authentication (REQ-NOTIFY-060/067) and opens the recovery dialog of REQ-NOTIFY-072
 * (`auth-recovery.ts`) only where this answers `dialog`.
 *
 * - **The first failure** (REQ-NOTIFY-070): where automatic recovery may be attempted (REQ-NOTIFY-069: a run channel, a
 *   configuration service and a recorded last prompt), the run host pins the configured `fallback_model` as the session's
 *   model override and restarts the run (`Sessions.restartOnFallback`); an error acknowledgement names the model that
 *   failed and the fallback now in use, and the prompt opens. The pair that failed joins the session's refused pairs
 *   (REQ-NOTIFY-068, `AuthRecovery.refuse`), so a later dialog never offers it back with the same credentials.
 * - **No usable fallback** — none configured, the fallback is the model that failed, or the failed model is unknown — is
 *   REQ-NOTIFY-072's first case: `dialog`, and the session's first failure is spent.
 * - **A second failure** — any while the session's first failure is spent, the fallback's own and a model chosen by hand
 *   in the dialog included (REQ-NOTIFY-075: the automatic fallback is not tried again) — is `dialog`.
 * - **A restart that cannot begin** clears the bookkeeping and answers `generic` (REQ-NOTIFY-070's last sentence); so does
 *   a precondition REQ-NOTIFY-069 names that does not hold. `stale`: a run of the session is active again, so the failure
 *   was superseded and nothing is raised.
 *
 * **The prompt** (REQ-NOTIFY-071/078, ADR-0048): it names the primary that failed, says the run continues on the fallback
 * and that re-authenticating switches back from the next iteration, quotes the provider's error, and offers a dismissal
 * that keeps the fallback. Submitting it saves a key supplied — through the provider key store, validated first
 * (`ProviderService.reauthenticateWithKey`, REQ-NOTIFY-202), REQ-NOTIFY-077's acknowledgement where it could not be stored —
 * clears the bookkeeping so a further fallback attempt is available, and has the run host re-pin the primary
 * (`Sessions.repinPrimary`); the acknowledgement says whether the switch applies from the live run's next iteration or for
 * the next run. A device-code or browser provider is offered no key field: those sign-in flows are owed, and the prompt
 * says so in the provider service's own words. Opening the recovery dialog closes every prompt (REQ-NOTIFY-079,
 * `closeAllPrompts`).
 *
 * The bookkeeping lives here, in main, for the life of the process (OQ-180's reading): the pin itself is the run host's,
 * durable in the session's timeline, so after a relaunch the session runs on the fallback and its next failure is the
 * fallback's own, which this then reads as a first failure whose fallback is the model that failed — the dialog's case.
 */
export interface ModelPair {
  readonly provider: string;
  readonly model: string;
  readonly key: string | null;
}
export interface FallbackRestarted {
  readonly failed: ModelPair;
  readonly fallback: ModelPair & { readonly key: string };
}
/**
 * The run host's answer to `session.restartOnFallback`. A refusal carries the run host's code (`session.<code>`, or the
 * continuation lease's own), which says whether the session has no usable fallback (the dialog's case) or the restart
 * could not begin (the generic notice).
 */
export type RestartAnswer = { readonly ok: true; readonly value: FallbackRestarted } | { readonly ok: false; readonly code: string; readonly reason: string };

/** What the automatic half did with one authentication failure — what the focus gate publishes next. */
export type FallbackOutcome =
  | { readonly kind: 'restarted'; readonly restart: FallbackRestarted }
  | { readonly kind: 'dialog'; readonly reason: string }
  | { readonly kind: 'generic'; readonly reason: string }
  | { readonly kind: 'stale'; readonly reason: string };

/** How main can re-authenticate a provider in this build — `ReauthPrompt`'s three methods. */
export type ProviderDescription = Pick<ReauthPrompt, 'provider' | 'method' | 'unavailableReason'>;

/** A key handed to the provider key store: stored, or refused at a named stage (`ReauthenticationOutcome`'s). */
export type KeySaved = { readonly ok: true } | { readonly ok: false; readonly stage: 'method' | 'key' | 'validation' | 'storage'; readonly message: string };

export interface AuthFallbackDeps {
  /** The error and success acknowledgements (REQ-NOTIFY-070/077/078), on the transient stack. */
  readonly acknowledge: (kind: AcknowledgementKind, title: string, body?: string) => void;
  /** REQ-NOTIFY-071: the prompt drawn in (non-null) or taken out of (null) the window that follows the session. */
  readonly publishPrompt: (sessionId: string, prompt: ReauthPrompt | null) => void;
  /** The provider whose credentials were refused, by the identity the run host named it with. */
  readonly describeProvider: (providerIdentity: string) => ProviderDescription;
  /** REQ-NOTIFY-078 / REQ-NOTIFY-202: a supplied key into the provider key store — validated, then stored — or why not. */
  readonly saveKey: (providerId: string, apiKey: string) => Promise<KeySaved>;
  /** REQ-NOTIFY-078: the run host takes the authentication pin back; where the primary applies from. */
  readonly repinPrimary: (sessionId: string, primary: Pick<ModelPair, 'provider' | 'model'>) => Promise<{ readonly ok: true; readonly applies: 'next-iteration' | 'next-run' } | { readonly ok: false; readonly reason: string }>;
  /** The run channel: the run host pins and restarts, or says why not. A rejection is the channel missing (REQ-NOTIFY-069). */
  readonly restartOnFallback: (sessionId: string) => Promise<RestartAnswer>;
  /** REQ-NOTIFY-069: whether the configuration service for the session's workspace is running. */
  readonly configurationService: (sessionId: string) => boolean;
  /** REQ-NOTIFY-068: the pair failed authentication in the session with the credentials its provider holds (`AuthRecovery.refuse`). */
  readonly refusePair: (sessionId: string, pair: Pick<ModelPair, 'provider' | 'model'>) => void;
  /** REQ-NOTIFY-068: the provider's credentials changed — a key stored through the prompt (`AuthRecovery.credentialsChanged`). */
  readonly credentialsChanged: (providerId: string) => void;
  readonly log: (message: string) => void;
}

/** `provider/model`, the way the run's own messages name a pair. */
export const pairLabel = (pair: Pick<ModelPair, 'provider' | 'model'>): string => `${pair.provider}/${pair.model}`;

/**
 * The run host's refusals that mean the session has NO USABLE FALLBACK — REQ-NOTIFY-072's "a first one with no usable
 * fallback": none is configured, the fallback is the model that failed, or the run did not record which model failed (a
 * failure that was no root model call's), so no fallback can be said to differ from it.
 */
export const NO_USABLE_FALLBACK: ReadonlySet<string> = new Set(['session.no-fallback', 'session.fallback-failed', 'session.no-model-failure']);
/** The run host's refusal that means a run of the session is active again: the failure was superseded. */
export const RUN_ACTIVE = 'session.run-active';

/** REQ-NOTIFY-070's acknowledgement: an error acknowledgement naming the model that failed and the fallback now in use. */
export function fallbackAcknowledgement(r: FallbackRestarted): { readonly title: string; readonly body: string } {
  return { title: `Authentication failed on ${pairLabel(r.failed)}`, body: `The run restarted on the fallback model ${pairLabel(r.fallback)}, which stays in use for this session.` };
}

/** REQ-NOTIFY-071's copy, pure so a test can hold every word of it. */
export function reauthPromptOf(sessionId: string, restarted: FallbackRestarted, provider: ProviderDescription, error: string): ReauthPrompt {
  const pair = (p: ModelPair) => ({ provider: p.provider, model: p.model, modelKey: p.key });
  return { sessionId, primary: pair(restarted.failed), fallback: pair(restarted.fallback), ...provider, error };
}

/** REQ-NOTIFY-078's acknowledgement: from the next iteration where the run is live, else for the next run. */
export function reauthAcknowledgement(prompt: ReauthPrompt, applies: 'next-iteration' | 'next-run'): { readonly title: string; readonly body: string } {
  const primary = pairLabel(prompt.primary);
  return { title: `Re-authenticated ${prompt.provider.name}`, body: applies === 'next-iteration' ? `The run switches back to ${primary} from the next iteration.` : `${primary} will be used for the next run.` };
}

export interface AuthFallback {
  /** REQ-NOTIFY-070/072: an authentication failure of `sessionId`'s run, its failure text `error` — the automatic half first. */
  onAuthenticationFailure(sessionId: string, error: string): Promise<FallbackOutcome>;
  /** The fallback this session was restarted on, while its bookkeeping stands. */
  fallbackOf(sessionId: string): FallbackRestarted | undefined;
  /** Whether the session's first authentication failure is spent — its next one is the dialog's (REQ-NOTIFY-072). */
  firstFailureSpent(sessionId: string): boolean;
  /** REQ-NOTIFY-078: clears the automatic-fallback bookkeeping, so a further fallback attempt is available. */
  clearFallback(sessionId: string): void;
  /** The prompt open for this session, if any. */
  promptOf(sessionId: string): ReauthPrompt | undefined;
  /** Every prompt open now, for a window that mounts after they opened (a reload, a new window). */
  openPrompts(): readonly ReauthPrompt[];
  /** REQ-NOTIFY-078: the prompt submitted, with the key typed into it (empty for none). */
  submitPrompt(sessionId: string, apiKey: string): Promise<ReauthSubmitResult>;
  /** REQ-NOTIFY-071: the prompt dismissed — the fallback is kept. */
  dismissPrompt(sessionId: string): boolean;
  /** REQ-NOTIFY-079: the recovery dialog opened — every prompt open is closed, each session keeping its fallback. */
  closeAllPrompts(why: string): number;
}

export function createAuthFallback(deps: AuthFallbackDeps): AuthFallback {
  /**
   * By session, the first authentication failure that was taken: the restart it took, or null where it had no usable
   * fallback and went to the dialog. Present means spent — the session's next authentication failure is the dialog's.
   */
  const spent = new Map<string, FallbackRestarted | null>();
  const prompts = new Map<string, ReauthPrompt>();
  const closePrompt = (sessionId: string): boolean => {
    if (!prompts.delete(sessionId)) return false;
    deps.publishPrompt(sessionId, null);
    return true;
  };

  return {
    async onAuthenticationFailure(sessionId, error) {
      if (!deps.configurationService(sessionId)) {
        return { kind: 'generic', reason: 'no configuration service is running for the session\'s workspace (REQ-NOTIFY-069)' };
      }
      const earlier = spent.get(sessionId);
      if (earlier !== undefined) {
        // REQ-NOTIFY-072/075: a second authentication failure; the automatic fallback is not tried again.
        return { kind: 'dialog', reason: `a second authentication failure in the session${earlier === null ? '' : ` (the fallback ${pairLabel(earlier.fallback)} was tried)`}` };
      }
      const answer = await deps.restartOnFallback(sessionId).catch((cause: unknown): RestartAnswer => ({ ok: false, code: 'unanswered', reason: `the run host did not answer (${String(cause)})` }));
      if (!answer.ok) {
        if (NO_USABLE_FALLBACK.has(answer.code)) {
          spent.set(sessionId, null);
          deps.log(`authentication recovery: session ${sessionId} has no usable fallback (${answer.reason}); the recovery dialog's case (REQ-NOTIFY-072)`);
          return { kind: 'dialog', reason: answer.reason };
        }
        if (answer.code === RUN_ACTIVE) return { kind: 'stale', reason: answer.reason };
        // REQ-NOTIFY-070: the restart could not begin — the bookkeeping is cleared (a further attempt stays available).
        spent.delete(sessionId);
        deps.log(`authentication recovery: session ${sessionId} was not restarted on a fallback (${answer.reason}); the generic notice is published`);
        return { kind: 'generic', reason: answer.reason };
      }
      spent.set(sessionId, answer.value);
      // REQ-NOTIFY-068: the primary failed with the credentials its provider holds; it is offered back only once they change.
      deps.refusePair(sessionId, answer.value.failed);
      const ack = fallbackAcknowledgement(answer.value);
      deps.acknowledge('fail', ack.title, ack.body);
      deps.log(`authentication recovery: session ${sessionId} pinned ${pairLabel(answer.value.fallback)} in place of ${pairLabel(answer.value.failed)} and restarted with the same prompt`);
      // REQ-NOTIFY-071: a successful fallback restart opens the non-modal prompt beside the continuing run.
      const prompt = reauthPromptOf(sessionId, answer.value, deps.describeProvider(answer.value.failed.provider), error);
      prompts.set(sessionId, prompt);
      deps.publishPrompt(sessionId, prompt);
      return { kind: 'restarted', restart: answer.value };
    },
    fallbackOf: (sessionId) => spent.get(sessionId) ?? undefined,
    firstFailureSpent: (sessionId) => spent.has(sessionId),
    clearFallback: (sessionId) => { spent.delete(sessionId); },
    promptOf: (sessionId) => prompts.get(sessionId),
    openPrompts: () => [...prompts.values()],
    async submitPrompt(sessionId, apiKey) {
      const prompt = prompts.get(sessionId);
      if (!prompt) return { ok: false, message: 'No re-authentication prompt is open for this session.' };
      if (apiKey.trim() !== '') {
        if (prompt.method !== 'api-key') return { ok: false, message: prompt.unavailableReason ?? `${prompt.provider.name} takes no key here.` };
        const saved = await deps.saveKey(prompt.provider.id, apiKey).catch((cause: unknown): KeySaved => ({ ok: false, stage: 'storage', message: String(cause) }));
        if (!saved.ok) {
          // REQ-NOTIFY-077's words, the dialog's and the prompt's alike: a key that could not be STORED is acknowledged as such;
          // a key the provider refused (or one with no valid form) is the sentence the prompt shows, and nothing changed.
          if (saved.stage === 'storage') deps.acknowledge('fail', KEY_NOT_STORED, `${prompt.provider.name}: ${saved.message}`);
          return { ok: false, message: saved.stage === 'storage' ? `${KEY_NOT_STORED}: ${saved.message}` : saved.message };
        }
        // REQ-NOTIFY-068: the credentials changed, so the provider's refused pairs may be offered and retried again.
        deps.credentialsChanged(prompt.provider.id);
      }
      const repinned = await deps.repinPrimary(sessionId, prompt.primary).catch((cause: unknown) => ({ ok: false as const, reason: `the run host did not answer (${String(cause)})` }));
      if (!repinned.ok) {
        // The primary was not re-pinned, so the session is still on the fallback: the bookkeeping stands, and a further
        // authentication failure there is the fallback's, which is not tried again (REQ-NOTIFY-075).
        deps.acknowledge('fail', `${pairLabel(prompt.primary)} could not be re-pinned`, repinned.reason);
        return { ok: false, message: repinned.reason };
      }
      // REQ-NOTIFY-078: cleared once the primary is re-pinned, so a further fallback attempt is available.
      spent.delete(sessionId);
      closePrompt(sessionId);
      const ack = reauthAcknowledgement(prompt, repinned.applies);
      deps.acknowledge('ok', ack.title, ack.body);
      deps.log(`authentication recovery: session ${sessionId} re-authenticated ${prompt.provider.id}; ${pairLabel(prompt.primary)} applies ${repinned.applies === 'next-iteration' ? 'from the next iteration' : 'for the next run'}`);
      return { ok: true, applies: repinned.applies };
    },
    dismissPrompt: (sessionId) => {
      const closed = closePrompt(sessionId);
      if (closed) deps.log(`authentication recovery: the re-authentication prompt of session ${sessionId} was dismissed; the fallback is kept`);
      return closed;
    },
    closeAllPrompts: (why) => {
      const open = [...prompts.keys()];
      for (const sessionId of open) closePrompt(sessionId);
      if (open.length > 0) deps.log(`authentication recovery: ${open.length} re-authentication prompt(s) closed (${why}); each session keeps its fallback`);
      return open.length;
    },
  };
}
