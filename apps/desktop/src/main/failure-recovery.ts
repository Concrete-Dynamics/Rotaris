import type { NoticeAction, ReauthPrompt, ReauthSubmitResult } from '@rotaris/contracts';
import { classifyFailure, type FailureClass } from './failure-class.js';
import type { NoticeStore, ReportInput } from './notices.js';

/**
 * REQ-NOTIFY-060's classes, each with the recovery it offers, for a run that ended with failure text — main's run-result
 * handler is the one caller, so this is the one writer of a run failure's notice (REQ-NOTIFY-065).
 *
 * - **authentication** (REQ-NOTIFY-067..070, REQ-MONITOR-147): on the session's first authentication failure, where
 *   automatic recovery may be attempted (REQ-NOTIFY-069: a run channel, a configuration service and a recorded last
 *   prompt), the run host pins the configured `fallback_model` as the session's model override and restarts the run with
 *   the same prompt (`Sessions.restartOnFallback`); an error acknowledgement names the model that failed and the fallback
 *   now in use. Where the restart is refused or cannot begin, the bookkeeping is cleared and the generic notice is
 *   published. A second authentication failure, or a first with no usable fallback, opens REQ-NOTIFY-072's recovery
 *   dialog — NOT BUILT: it takes the generic notice until it is (the 401 note's part C).
 * - **sandbox** (REQ-NOTIFY-061): a refused confinement mode never reaches a run result — it is refused, with its own
 *   notice, where the start, the prompt or the continue is refused (`confinementRefusalNotice`) — so it never matches here.
 * - **quota** (REQ-NOTIFY-063): the provider limit was reached, the session is preserved, the action opening model
 *   settings. REQ-NOTIFY-062's hosted-credit branch is not built: no hosted provider exists.
 * - **generic** (REQ-NOTIFY-064): the run failed and the session and the draft were kept, the failure text as detail,
 *   the action returning to the workspace view.
 *
 * - **the re-authentication prompt** (REQ-NOTIFY-071/078, ADR-0048 — the note's part B): a successful fallback restart
 *   opens the non-modal prompt in the window that follows the session. It names the primary that failed, says the run
 *   continues on the fallback and that re-authenticating switches back from the next iteration, quotes the provider's
 *   error, and offers a dismissal that keeps the fallback. Submitting it saves a key supplied (through the credential
 *   store, `providers.replaceKey`), clears the bookkeeping below so a further fallback attempt is available, and has the run
 *   host re-pin the primary (`Sessions.repinPrimary`); the acknowledgement says whether the switch applies from the live
 *   run's next iteration or for the next run. A device-code or browser provider is offered no key field: those sign-in
 *   flows are owed, and the prompt says so in the provider service's own words.
 *
 * The "first failure of a session" bookkeeping lives here, in main, for the life of the process: the pin itself is the
 * run host's, durable in the session's timeline, so after a relaunch the fallback is what a session runs on and its
 * failure reads as "the fallback is the model that failed" there (REQ-NOTIFY-075's "not tried again").
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
export type RestartAnswer = { readonly ok: true; readonly value: FallbackRestarted } | { readonly ok: false; readonly reason: string };

/** How main can re-authenticate a provider in this build — `ReauthPrompt`'s three methods. */
export type ProviderDescription = Pick<ReauthPrompt, 'provider' | 'method' | 'unavailableReason'>;

export interface FailureRecoveryDeps {
  readonly notices: Pick<NoticeStore, 'report' | 'acknowledge'>;
  /** REQ-NOTIFY-071: the prompt drawn in (non-null) or taken out of (null) the window that follows the session. */
  readonly publishPrompt: (sessionId: string, prompt: ReauthPrompt | null) => void;
  /** The provider whose credentials were refused, by the identity the run host named it with. */
  readonly describeProvider: (providerIdentity: string) => ProviderDescription;
  /** REQ-NOTIFY-078: a supplied key into the credential store; the refusal names why. */
  readonly saveKey: (providerId: string, apiKey: string) => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
  /** REQ-NOTIFY-078: the run host takes the authentication pin back; where the primary applies from. */
  readonly repinPrimary: (sessionId: string, primary: Pick<ModelPair, 'provider' | 'model'>) => Promise<{ readonly ok: true; readonly applies: 'next-iteration' | 'next-run' } | { readonly ok: false; readonly reason: string }>;
  /** The run channel: the run host pins and restarts, or says why not. A rejection is the channel missing (REQ-NOTIFY-069). */
  readonly restartOnFallback: (sessionId: string) => Promise<RestartAnswer>;
  /** REQ-NOTIFY-069: whether the configuration service for the session's workspace is running. */
  readonly configurationService: (sessionId: string) => boolean;
  readonly log: (message: string) => void;
}

/** What the handler did with one failure: the class that matched, and for authentication whether the run restarted. */
export type RecoveryOutcome = FailureClass | 'authentication-restarted';

/** `provider/model`, the way the run's own messages name a pair. */
export const pairLabel = (pair: Pick<ModelPair, 'provider' | 'model'>): string => `${pair.provider}/${pair.model}`;

/** REQ-NOTIFY-064's action: back to the workspace view, one of REQ-SHELL-023's seven. */
export const RETURN_TO_WORKSPACE: { readonly label: string; readonly action: NoticeAction } = { label: 'Return to the workspace', action: { kind: 'open-view', view: 'workspace' } };

/** REQ-NOTIFY-064 / REQ-NOTIFY-065: severity `error`, persistent, the failure text as copyable detail. */
export function genericFailureNotice(error: string): ReportInput {
  return { severity: 'error', title: 'The run failed', message: 'The session and the draft were kept.', detail: error, persistent: true, action: RETURN_TO_WORKSPACE };
}

/** REQ-NOTIFY-063, worded as main has published it since Part Q. */
export function quotaFailureNotice(error: string): ReportInput {
  return { severity: 'error', title: 'The provider limit was reached; the session is preserved', detail: `${error}\n\nChoose another model, or retry once the provider resets.`, persistent: true, action: { label: 'Open Models settings', action: { kind: 'open-settings', category: 'models' } } };
}

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

export interface FailureRecovery {
  /** A run ended with failure text: classify it and publish its class's recovery. */
  onRunFailed(input: { readonly sessionId: string; readonly error: string }): Promise<RecoveryOutcome>;
  /** The fallback this session was restarted on, while its bookkeeping stands. */
  fallbackOf(sessionId: string): FallbackRestarted | undefined;
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
}

export function createFailureRecovery(deps: FailureRecoveryDeps): FailureRecovery {
  const attempted = new Map<string, FallbackRestarted>();
  const prompts = new Map<string, ReauthPrompt>();
  const closePrompt = (sessionId: string): boolean => {
    if (!prompts.delete(sessionId)) return false;
    deps.publishPrompt(sessionId, null);
    return true;
  };
  const generic = async (error: string): Promise<'generic'> => { await deps.notices.report(genericFailureNotice(error)); return 'generic'; };

  const authentication = async (sessionId: string, error: string): Promise<RecoveryOutcome> => {
    if (attempted.has(sessionId)) {
      // REQ-NOTIFY-072: a second authentication failure opens the recovery dialog — not built (part C).
      deps.log(`authentication recovery: a second authentication failure in session ${sessionId}; the recovery dialog (REQ-NOTIFY-072) is not built, so the generic notice is published`);
      return await generic(error);
    }
    if (!deps.configurationService(sessionId)) {
      deps.log(`authentication recovery: no configuration service for session ${sessionId} (REQ-NOTIFY-069); the generic notice is published`);
      return await generic(error);
    }
    const answer = await deps.restartOnFallback(sessionId).catch((cause: unknown): RestartAnswer => ({ ok: false, reason: `the run host did not answer (${String(cause)})` }));
    if (!answer.ok) {
      attempted.delete(sessionId);
      deps.log(`authentication recovery: session ${sessionId} was not restarted on a fallback (${answer.reason}); the generic notice is published`);
      return await generic(error);
    }
    attempted.set(sessionId, answer.value);
    const ack = fallbackAcknowledgement(answer.value);
    deps.notices.acknowledge('fail', ack.title, ack.body);
    deps.log(`authentication recovery: session ${sessionId} pinned ${pairLabel(answer.value.fallback)} in place of ${pairLabel(answer.value.failed)} and restarted with the same prompt`);
    // REQ-NOTIFY-071: a successful fallback restart opens the non-modal prompt beside the continuing run.
    const prompt = reauthPromptOf(sessionId, answer.value, deps.describeProvider(answer.value.failed.provider), error);
    prompts.set(sessionId, prompt);
    deps.publishPrompt(sessionId, prompt);
    return 'authentication-restarted';
  };

  return {
    async onRunFailed({ sessionId, error }) {
      const cls = classifyFailure(error);
      if (cls === 'authentication') return await authentication(sessionId, error);
      if (cls === 'quota') { await deps.notices.report(quotaFailureNotice(error)); return 'quota'; }
      return await generic(error);
    },
    fallbackOf: (sessionId) => attempted.get(sessionId),
    clearFallback: (sessionId) => { attempted.delete(sessionId); },
    promptOf: (sessionId) => prompts.get(sessionId),
    openPrompts: () => [...prompts.values()],
    async submitPrompt(sessionId, apiKey) {
      const prompt = prompts.get(sessionId);
      if (!prompt) return { ok: false, message: 'No re-authentication prompt is open for this session.' };
      if (apiKey.trim() !== '') {
        if (prompt.method !== 'api-key') return { ok: false, message: prompt.unavailableReason ?? `${prompt.provider.name} takes no key here.` };
        const saved = await deps.saveKey(prompt.provider.id, apiKey).catch((cause: unknown) => ({ ok: false as const, message: String(cause) }));
        if (!saved.ok) {
          // REQ-NOTIFY-077's words for the dialog, taken for the prompt too: the storage failure, named.
          deps.notices.acknowledge('fail', 'The key could not be stored', saved.message);
          return { ok: false, message: saved.message };
        }
      }
      const repinned = await deps.repinPrimary(sessionId, prompt.primary).catch((cause: unknown) => ({ ok: false as const, reason: `the run host did not answer (${String(cause)})` }));
      if (!repinned.ok) {
        // The primary was not re-pinned, so the session is still on the fallback: the bookkeeping stands, and a further
        // authentication failure there is the fallback's, which is not tried again (REQ-NOTIFY-075).
        deps.notices.acknowledge('fail', `${pairLabel(prompt.primary)} could not be re-pinned`, repinned.reason);
        return { ok: false, message: repinned.reason };
      }
      // REQ-NOTIFY-078: cleared once the primary is re-pinned, so a further fallback attempt is available.
      attempted.delete(sessionId);
      closePrompt(sessionId);
      const ack = reauthAcknowledgement(prompt, repinned.applies);
      deps.notices.acknowledge('ok', ack.title, ack.body);
      deps.log(`authentication recovery: session ${sessionId} re-authenticated ${prompt.provider.id}; ${pairLabel(prompt.primary)} applies ${repinned.applies === 'next-iteration' ? 'from the next iteration' : 'for the next run'}`);
      return { ok: true, applies: repinned.applies };
    },
    dismissPrompt: (sessionId) => {
      const closed = closePrompt(sessionId);
      if (closed) deps.log(`authentication recovery: the re-authentication prompt of session ${sessionId} was dismissed; the fallback is kept`);
      return closed;
    },
  };
}
