import { type ProviderDialogPayload, type ProviderSignInPrompt, type ProviderSignInResult } from '@rotaris/contracts';
import { type CommandContext, type CommandHandlers } from './context.js';

/**
 * PROVIDERS — authentication, the health each answer caches, and the sign-in surface (REQ-PROVIDER-131/133,
 * ADR-0028). A pasted key goes to the credential store or nowhere, and is never logged. Every write ends in
 * `afterProviderChange`, which is what re-reads the slots and republishes them.
 */
export function providersCommands(
  ctx: Pick<CommandContext, 'afterProviderChange' | 'authRecovery' | 'healthCache' | 'log' | 'openSignInPage' | 'presentProvider' | 'providerChoices' | 'providerPayloads' | 'providerRows' | 'providers' | 'providerSignIns' | 'raiseNotice' | 'recoveryFor'>,
): Pick<CommandHandlers, 'providers.list' | 'providers.health' | 'providers.open' | 'provider.payload' | 'provider.signIn' | 'provider.authenticate' | 'provider.authPrompt' | 'provider.authCancel' | 'providers.save' | 'providers.validate' | 'providers.signOut' | 'providers.delete' | 'providers.refresh'> {
  const { afterProviderChange, authRecovery, healthCache, log, openSignInPage, presentProvider, providerChoices, providerPayloads, providerRows, providers, providerSignIns, raiseNotice, recoveryFor } = ctx;
  // REQ-NOTIFY-068: a provider's credentials changed, so a pair of it that failed authentication may be offered again.
  const credentialsChanged = (id: string): void => authRecovery.credentialsChanged(id);
  /** What every sign-in does once it has its one outcome (REQ-PROVIDER-012/142), by key or by the provider's own flow. */
  const settled = async (providerId: string, outcome: ProviderSignInResult, quiet = false): Promise<void> => {
    if (outcome.outcome === 'signed-in') {
      credentialsChanged(outcome.id);
      // A catalog that answers without a key validated nothing (REQ-PROVIDER-133's gap on a public catalog): health stays unchecked and the notice warns.
      healthCache.set(outcome.id, outcome.keyValidated ? { state: 'healthy', detail: outcome.message, available: true } : { state: 'unknown', detail: outcome.message, available: true });
      // PD-WORKSPACE-010: the first-launch setup states the outcome itself, in the step that asked, and passes `quiet`; a key that validated nothing still warns.
      if (!(quiet && outcome.keyValidated)) raiseNotice(outcome.keyValidated ? 'info' : 'warning', outcome.message, 'Model slots were assigned from the discovered catalog; review them under Settings → Models.', recoveryFor('config.models'));
      await afterProviderChange();
    } else if (outcome.outcome === 'failed') {
      log(`providers: sign-in failed for ${providerId}: ${outcome.message}`);
    }
  };
  return {
    'providers.list': () => {
      return { ok: true, value: providerRows() };
    },
    'providers.health': async (req) => {
      healthCache.set(req.id, { state: 'checking', detail: '', available: true });
      const h = await providers.health(req.id);
      healthCache.set(req.id, h);
      if (h.state === 'healthy') void afterProviderChange();
      return { ok: true, value: h };
    },
    'providers.open': (req) => {
      void presentProvider(req.mode, req.providerId ?? null);
      return { ok: true };
    },
    'provider.payload': (_req, { senderId }) => {
      const p = providerPayloads.get(senderId);
      if (!p) return { ok: false, code: 'provider.none', headline: 'This window was not opened for a provider sign-in' };
      const payload: ProviderDialogPayload = { mode: p.mode, providerId: p.providerId, displayName: p.providerId ? providers.displayName(p.providerId) : null, choices: providerChoices(p.providerId) };
      return { ok: true, value: payload };
    },
    'provider.signIn': async (req) => {
      // The pasted key comes in here and goes to the store or nowhere; it is never logged (REQ-PROVIDER-131).
      const outcome: ProviderSignInResult = req.providerId === 'openai-compatible'
        ? await providers.addInstance({ label: req.label ?? '', baseUrl: req.baseUrl ?? '', apiKey: req.apiKey, ...(req.replace ? { replace: true } : {}), ...(req.allowEmpty ? { allowEmpty: true } : {}) })
        : await providers.signInWithKey(req.providerId, req.apiKey, req.allowEmpty ?? false);
      await settled(req.providerId, outcome, req.quiet === true);
      return { ok: true, value: outcome };
    },
    'provider.authenticate': async (req, { senderId }) => {
      if (providerSignIns.has(senderId)) return { ok: false, code: 'provider.busy', headline: 'A sign-in is already under way in this window' };
      const pending: { readonly abort: AbortController; prompt: ProviderSignInPrompt | null } = { abort: new AbortController(), prompt: null };
      providerSignIns.set(senderId, pending);
      // REQ-PROVIDER-141: re-authenticating a provider signs it out first; the credentials changed whatever the flow then answers.
      const hadCredential = providers.status(req.providerId) !== 'unauthenticated';
      try {
        const outcome: ProviderSignInResult = await providers.signInInteractive(req.providerId, {
          reauthenticate: req.reauthenticate ?? false, allowEmpty: req.allowEmpty ?? false, signal: pending.abort.signal,
          // REQ-PROVIDER-116: the prompt opens the system browser and is shown in the window, which reads it back.
          prompt: (p) => { pending.prompt = p; openSignInPage(p.kind === 'browser' ? p.url : p.verificationUri); },
        });
        if (req.reauthenticate && hadCredential && outcome.outcome !== 'signed-in') { credentialsChanged(req.providerId); healthCache.delete(req.providerId); await afterProviderChange(); }
        await settled(req.providerId, outcome, req.quiet === true);
        return { ok: true, value: outcome };
      } finally {
        providerSignIns.delete(senderId);
      }
    },
    'provider.authPrompt': (_req, { senderId }) => {
      return { ok: true, value: { prompt: providerSignIns.get(senderId)?.prompt ?? null } };
    },
    'provider.authCancel': (_req, { senderId }) => {
      // REQ-PROVIDER-116: consumed by the flow to end a pending device or callback wait early.
      providerSignIns.get(senderId)?.abort.abort();
      return { ok: true };
    },
    'providers.save': async (req) => {
      let message = '';
      if (req.baseUrl !== null) { const r = await providers.setBaseUrl(req.id, req.baseUrl); if (!r.ok) return { ok: true, value: { ok: false, message: r.error } }; message = r.value; }
      if (req.apiKey.trim() !== '') {
        const r = await providers.replaceKey(req.id, req.apiKey, req.validate);
        // `catalog`: the key was stored and only its discovered models were not recorded — the credentials changed all the same.
        if (r.ok || r.stage === 'catalog') credentialsChanged(req.id);
        if (!r.ok) return { ok: true, value: { ok: false, message: r.message } };
        message = r.message;
      }
      else if (req.baseUrl === null && !providers.status(req.id).startsWith('auth')) return { ok: true, value: { ok: false, message: `A key is required for ${providers.displayName(req.id)}.` } };
      if (message === '') message = 'Nothing changed.';
      else { healthCache.delete(req.id); await afterProviderChange(); }
      return { ok: true, value: { ok: true, message: `Saved. ${message}` } };
    },
    'providers.validate': async (req) => {
      const r = await providers.validate(req.id);
      if (r.ok) { healthCache.set(req.id, { state: 'healthy', detail: r.value, available: true }); await afterProviderChange(); }
      else healthCache.delete(req.id);
      return { ok: true, value: r.ok ? { ok: true, message: r.value } : { ok: false, message: r.error } };
    },
    'providers.signOut': async (req) => {
      const r = await providers.signOut(req.id);
      healthCache.delete(req.id);
      // Only a sign-out that removed the stored credential changed it; a failed one, or one with nothing stored, did not.
      if (r.outcome === 'signed-out') credentialsChanged(req.id);
      log(`providers: ${r.message}`);
      await afterProviderChange();
      return { ok: true, value: { ok: r.outcome === 'signed-out' || r.outcome === 'nothing', message: r.message } };
    },
    'providers.delete': async (req) => {
      const r = await providers.deleteInstance(req.id);
      healthCache.delete(req.id);
      if (r.ok) credentialsChanged(req.id);
      if (r.ok) { log(`providers: ${r.value.message}`); await afterProviderChange(); }
      return { ok: true, value: r.ok ? { ok: true, message: r.value.message } : { ok: false, message: r.error } };
    },
    'providers.refresh': async (req) => {
      const lines: string[] = [];
      const summary = await providers.refresh(req.ids, (l) => { lines.push(l); log(`providers: ${l}`); });
      await afterProviderChange();
      return { ok: true, value: { ok: summary.complete, message: lines[lines.length - 1] ?? '' } };
    },
  };
}
