import type { AcknowledgementKind, AuthRecoveryMethod, AuthRecoveryModel, AuthRecoveryPayload, AuthRecoveryResult, ProcessReply } from '@rotaris/contracts';

/**
 * REQ-NOTIFY-069/072..077, REQ-NOTIFY-079/080, REQ-MONITOR-147 (the 401 note's parts C and D) — main's half of the
 * authentication recovery. Main classifies a failed run (`failure-class.ts`, REQ-NOTIFY-060/067); for an authentication failure it asks the
 * run host for the facts (`session.authRecovery`) and opens the 560 px modal recovery dialog over them, or answers that it
 * cannot, so the caller takes the generic failure path (REQ-NOTIFY-069: a run channel, a configuration service and a
 * recorded last prompt must all exist).
 *
 * Pure of Electron: the window is `present`/`close`, the run host is `request`, so a test drives it with plain objects.
 *
 * The automatic first-failure fallback restart (REQ-NOTIFY-070/071, the note's parts A and B) is not on this branch's base
 * (`origin/main`): every authentication failure the preconditions admit opens this dialog, a first one with a usable
 * fallback included, where the fallback is listed among the models to choose by hand. When part A lands it goes ahead of
 * this in `onAuthenticationFailure`'s caller and this dialog keeps REQ-NOTIFY-072's two cases.
 */
export interface AuthRecoveryDeps {
  /** The run host's request path (`session.authRecovery`, `session.authRestart`). */
  readonly request: (req: { kind: 'session.authRecovery'; sessionId: string } | { kind: 'session.authRestart'; sessionId: string; modelKey: string | null }) => Promise<ProcessReply>;
  /** The provider's display name, where the provider store knows one; else the id itself. */
  readonly providerName: (id: string) => string;
  /** Opens the dialog over the window following the session, closing any recovery dialog already open (REQ-NOTIFY-079). */
  readonly present: (payload: AuthRecoveryPayload) => void;
  /** Closes the session's recovery dialog, if one is open. */
  readonly close: (sessionId: string) => void;
  readonly log: (message: string) => void;
  /** REQ-NOTIFY-076: how the provider can be re-authenticated here (`ProviderService.reauthentication`). */
  readonly reauthentication: (providerId: string) => { readonly method: AuthRecoveryMethod; readonly message: string };
  /**
   * REQ-NOTIFY-076/077 / REQ-NOTIFY-202: the provider key store's path — the key validated, then stored, the stage that refused
   * named (`ProviderService.reauthenticateWithKey`); on success the caller has also refreshed what depends on the provider.
   */
  readonly reauthenticate: (providerId: string, apiKey: string) => Promise<{ readonly ok: true; readonly message: string } | { readonly ok: false; readonly stage: 'method' | 'key' | 'validation' | 'storage'; readonly message: string }>;
  /** REQ-NOTIFY-077's two error acknowledgements, on the transient stack (REQ-NOTIFY-003). */
  readonly acknowledge: (kind: AcknowledgementKind, title: string, body?: string) => void;
}

/** REQ-NOTIFY-077's two titles. */
export const KEY_NOT_STORED = 'The key could not be stored';
export const RESTART_AFTER_REAUTH_FAILED = 'The run could not be restarted after re-authentication';

/** Why the dialog was not opened, for the caller's log line; the caller then raises the generic notice. */
export type AuthRecoveryOpened = { readonly opened: true } | { readonly opened: false; readonly reason: string };

export class AuthRecovery {
  constructor(private readonly deps: AuthRecoveryDeps) {}

  /**
   * REQ-NOTIFY-072: an authentication failure of `sessionId`'s run, its failure text `error`. Opens the recovery dialog, or
   * answers why it did not (REQ-NOTIFY-069's preconditions, or a run host that could not answer).
   */
  async onAuthenticationFailure(sessionId: string, error: string): Promise<AuthRecoveryOpened> {
    let reply: ProcessReply;
    try {
      reply = await this.deps.request({ kind: 'session.authRecovery', sessionId });
    } catch (cause) {
      return { opened: false, reason: `the run host did not answer: ${cause instanceof Error ? cause.message : String(cause)}` };
    }
    if (reply.kind === 'refused') return { opened: false, reason: [reply.headline, reply.detail].filter(Boolean).join(': ') };
    if (reply.kind !== 'session.authRecovery') return { opened: false, reason: `the run host answered ${reply.kind}` };
    if (!reply.lastPrompt) return { opened: false, reason: 'no prompt is recorded for the session (REQ-NOTIFY-069)' };
    const named = <T extends { readonly key: string | null; readonly provider: string; readonly model: string }>(m: T): T & AuthRecoveryModel => ({ ...m, providerName: this.deps.providerName(m.provider) });
    const subject = reply.failed ?? reply.active;
    const provider = subject?.provider ?? '';
    const how = provider === '' ? { method: 'configuration' as const, message: 'The provider that failed is not known, so it cannot be re-authenticated here.' } : this.deps.reauthentication(provider);
    const payload: AuthRecoveryPayload = {
      sessionId,
      failed: reply.failed === null ? null : named(reply.failed),
      active: reply.active === null ? null : named(reply.active),
      models: reply.models.map(named),
      error,
      reauth: { provider, providerName: provider === '' ? 'the provider' : this.deps.providerName(provider), method: how.method, message: how.message },
    };
    this.deps.present(payload);
    this.deps.log(`authentication recovery: the dialog is open for session ${sessionId} (${payload.failed === null ? 'the failed model unknown' : `${payload.failed.provider}/${payload.failed.model} failed`}; ${payload.models.length} model(s) configured)`);
    return { opened: true };
  }

  /**
   * REQ-NOTIFY-074: the model chosen in the dialog is pinned and the run restarts. On success the dialog closes; a refusal is
   * answered as the sentence the dialog shows, and the dialog stays.
   */
  async retry(payload: AuthRecoveryPayload, modelKey: string): Promise<AuthRecoveryResult> {
    let reply: ProcessReply;
    try {
      reply = await this.deps.request({ kind: 'session.authRestart', sessionId: payload.sessionId, modelKey });
    } catch (cause) {
      return { ok: false, message: `The run could not be restarted: ${cause instanceof Error ? cause.message : String(cause)}` };
    }
    if (reply.kind === 'refused') return { ok: false, message: [reply.headline, reply.detail].filter(Boolean).join(': ') };
    if (reply.kind !== 'session.authRestarted') return { ok: false, message: `The run could not be restarted: the run host answered ${reply.kind}.` };
    this.deps.close(payload.sessionId);
    this.deps.log(`authentication recovery: session ${payload.sessionId} restarted on ${reply.pinned === null ? 'the same model' : `${reply.pinned.to.key} (${reply.pinned.to.provider}/${reply.pinned.to.model})`}`);
    return { ok: true };
  }

  /**
   * REQ-NOTIFY-076/077: the dialog's second path for a key-based provider — the key stored through the provider key store,
   * then the run restarted with the same prompt on the same model (`session.authRestart` with no key). A key that cannot be
   * stored, and a run that cannot be restarted after the key was stored, each raise their own error acknowledgement; every
   * refusal is also the sentence the dialog shows, and the dialog stays. The key is never logged.
   */
  async reauthenticate(payload: AuthRecoveryPayload, apiKey: string): Promise<AuthRecoveryResult> {
    const { provider, providerName, method, message } = payload.reauth;
    if (method !== 'api-key') return { ok: false, message };
    if (apiKey.trim() === '') return { ok: false, message: `Enter the new API key for ${providerName}.` };
    const stored = await this.deps.reauthenticate(provider, apiKey);
    if (!stored.ok) {
      if (stored.stage !== 'storage') return { ok: false, message: stored.message };
      this.deps.acknowledge('fail', KEY_NOT_STORED, `${providerName}: ${stored.message}`);
      this.deps.log(`authentication recovery: the key for ${provider} could not be stored (${stored.message})`);
      return { ok: false, message: `${KEY_NOT_STORED}: ${stored.message}` };
    }
    this.deps.log(`authentication recovery: ${provider} re-authenticated (${stored.message})`);
    let reply: ProcessReply;
    try {
      reply = await this.deps.request({ kind: 'session.authRestart', sessionId: payload.sessionId, modelKey: null });
    } catch (cause) {
      reply = { kind: 'refused', code: 'session.unanswered', headline: 'The run host did not answer', detail: cause instanceof Error ? cause.message : String(cause) };
    }
    if (reply.kind !== 'session.authRestarted') {
      const why = reply.kind === 'refused' ? [reply.headline, reply.detail].filter(Boolean).join(': ') : `the run host answered ${reply.kind}`;
      this.deps.acknowledge('fail', RESTART_AFTER_REAUTH_FAILED, `${providerName} was re-authenticated and its key is saved; ${why}`);
      return { ok: false, message: `${providerName} was re-authenticated, but the run could not be restarted: ${why}` };
    }
    this.deps.close(payload.sessionId);
    this.deps.log(`authentication recovery: session ${payload.sessionId} restarted after re-authenticating ${provider}`);
    return { ok: true };
  }

  /** REQ-NOTIFY-080: Cancel closes the dialog and does nothing else; the run stays failed and its notice stays on screen. */
  cancel(payload: AuthRecoveryPayload): void {
    this.deps.close(payload.sessionId);
    this.deps.log(`authentication recovery: the dialog for session ${payload.sessionId} was cancelled`);
  }
}
