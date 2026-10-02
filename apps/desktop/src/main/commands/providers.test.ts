import { describe, expect, it } from 'vitest';
import type { ProviderSignInResult } from '@rotaris/contracts';
import type { ReauthenticationOutcome } from '@rotaris/providers';
import { providersCommands } from './providers.js';
import type { CommandAt, CommandContext } from './context.js';

/**
 * REQ-NOTIFY-068 — "Recovery changes the model or the credentials": a provider/model pair that failed authentication is
 * refused by the recovery dialog and its retry until its provider's credentials change (`AuthRecovery.credentialsChanged`).
 * Under Settings the credentials change through four commands; each is driven here with a stand-in provider service and
 * a spy recovery, and each must release the provider's pairs exactly when the credential store changed — never on a
 * refusal that left the stored credential as it was, or the next dialog would offer the same provider with the same key.
 */

type Answers = {
  signIn?: ProviderSignInResult;
  replaceKey?: ReauthenticationOutcome;
  setBaseUrl?: { ok: true; value: string } | { ok: false; error: string };
  signOut?: { outcome: 'signed-out' | 'nothing' | 'failed' | 'unknown'; message: string };
  deleteInstance?: { ok: true; value: { message: string; credentialRemoved: boolean; snapshotRemoved: boolean } } | { ok: false; error: string };
  status?: string;
};

function harness(answers: Answers) {
  const released: string[] = [];
  const providers = {
    displayName: (id: string) => id,
    status: () => answers.status ?? 'auth: api-key',
    signInWithKey: async () => answers.signIn,
    addInstance: async () => answers.signIn,
    replaceKey: async () => answers.replaceKey,
    setBaseUrl: async () => answers.setBaseUrl,
    signOut: async () => answers.signOut,
    deleteInstance: async () => answers.deleteInstance,
  } as unknown as CommandContext['providers'];
  const ctx = {
    afterProviderChange: async () => undefined,
    authRecovery: { credentialsChanged: (id: string) => { released.push(id); } } as unknown as CommandContext['authRecovery'],
    healthCache: new Map(),
    log: () => undefined,
    presentProvider: async () => undefined,
    providerChoices: () => [],
    providerPayloads: new Map(),
    providerRows: () => [],
    providers,
    raiseNotice: () => undefined,
    recoveryFor: () => ({ kind: 'none' }) as unknown as ReturnType<CommandContext['recoveryFor']>,
  } as unknown as Parameters<typeof providersCommands>[0];
  return { commands: providersCommands(ctx), released };
}

const at = { senderId: 1 } as unknown as CommandAt;
const signedIn = (id: string): ProviderSignInResult => ({ outcome: 'signed-in', id, displayName: id, discovered: 2, message: `Login complete for ${id}; discovered 2 models.`, keyValidated: true });

describe('the Settings commands release a provider\'s refused pairs when its credentials change (REQ-NOTIFY-068)', () => {
  it('a sign-in that signed in releases the provider the outcome names', async () => {
    const h = harness({ signIn: signedIn('openai-compatible--katalyst') });
    await h.commands['provider.signIn']({ kind: 'provider.signIn', providerId: 'openai-compatible', label: 'katalyst', baseUrl: 'https://k.example/v1', apiKey: 'sk-new' }, at);
    expect(h.released).toEqual(['openai-compatible--katalyst']);
    const k = harness({ signIn: signedIn('openai') });
    await k.commands['provider.signIn']({ kind: 'provider.signIn', providerId: 'openai', apiKey: 'sk-new' }, at);
    expect(k.released).toEqual(['openai']);
  });

  it('a refused sign-in, or one that found no models, releases nothing — the store was not written', async () => {
    for (const signIn of [
      { outcome: 'failed', message: 'Authentication failed for OpenAI: 401' },
      { outcome: 'no-models', id: 'openai', message: 'no models discovered.' },
    ] as ProviderSignInResult[]) {
      const h = harness({ signIn });
      await h.commands['provider.signIn']({ kind: 'provider.signIn', providerId: 'openai', apiKey: 'sk-bad' }, at);
      expect(h.released).toEqual([]);
    }
  });

  it('a save with a key the store accepted releases the provider', async () => {
    const h = harness({ replaceKey: { ok: true, message: 'Validated OpenAI; discovered 3 models.' } });
    const out = await h.commands['providers.save']({ kind: 'providers.save', id: 'openai', apiKey: 'sk-new', baseUrl: null, validate: true }, at);
    expect(out).toEqual({ ok: true, value: { ok: true, message: 'Saved. Validated OpenAI; discovered 3 models.' } });
    expect(h.released).toEqual(['openai']);
  });

  it('a save whose key was stored but whose models could not be recorded still releases it: the credentials did change', async () => {
    const message = 'The key for OpenAI was saved, but its discovered models could not be recorded: disk full';
    const h = harness({ replaceKey: { ok: false, stage: 'catalog', message } });
    const out = await h.commands['providers.save']({ kind: 'providers.save', id: 'openai', apiKey: 'sk-new', baseUrl: null, validate: true }, at);
    expect(out).toEqual({ ok: true, value: { ok: false, message } });
    expect(h.released).toEqual(['openai']);
  });

  it('a save the key store refused at any earlier stage releases nothing', async () => {
    for (const stage of ['method', 'key', 'validation', 'storage'] as const) {
      const h = harness({ replaceKey: { ok: false, stage, message: `refused at ${stage}` } });
      const out = await h.commands['providers.save']({ kind: 'providers.save', id: 'openai', apiKey: 'sk-bad', baseUrl: null, validate: true }, at);
      expect(out).toEqual({ ok: true, value: { ok: false, message: `refused at ${stage}` } });
      expect(h.released).toEqual([]);
    }
  });

  it('a save with a blank key, or a base URL alone, releases nothing — the key is the one the pair failed with', async () => {
    const blank = harness({ status: 'auth: api-key' });
    await blank.commands['providers.save']({ kind: 'providers.save', id: 'openai', apiKey: '   ', baseUrl: null, validate: true }, at);
    expect(blank.released).toEqual([]);
    const baseOnly = harness({ setBaseUrl: { ok: true, value: 'Validated katalyst at https://k.example/v1; discovered 2 models.' } });
    const out = await baseOnly.commands['providers.save']({ kind: 'providers.save', id: 'openai-compatible--katalyst', apiKey: '', baseUrl: 'https://k.example/v1', validate: true }, at);
    expect(out).toEqual({ ok: true, value: { ok: true, message: 'Saved. Validated katalyst at https://k.example/v1; discovered 2 models.' } });
    expect(baseOnly.released).toEqual([]);
  });

  it('a sign-out that removed the stored credential releases the provider', async () => {
    const h = harness({ signOut: { outcome: 'signed-out', message: 'Signed out of OpenAI.' } });
    await h.commands['providers.signOut']({ kind: 'providers.signOut', id: 'openai' }, at);
    expect(h.released).toEqual(['openai']);
  });

  it('a sign-out that failed, named no known provider, or found nothing stored releases nothing', async () => {
    for (const outcome of ['failed', 'unknown', 'nothing'] as const) {
      const h = harness({ signOut: { outcome, message: outcome } });
      await h.commands['providers.signOut']({ kind: 'providers.signOut', id: 'openai' }, at);
      expect(h.released).toEqual([]);
    }
  });

  it('a removal that succeeded releases the instance, and a refused one releases nothing', async () => {
    const ok = harness({ deleteInstance: { ok: true, value: { message: 'Deleted user-defined provider openai-compatible--katalyst.', credentialRemoved: true, snapshotRemoved: true } } });
    await ok.commands['providers.delete']({ kind: 'providers.delete', id: 'openai-compatible--katalyst' }, at);
    expect(ok.released).toEqual(['openai-compatible--katalyst']);
    const refused = harness({ deleteInstance: { ok: false, error: 'Unknown user-defined provider: openai-compatible--katalyst.' } });
    await refused.commands['providers.delete']({ kind: 'providers.delete', id: 'openai-compatible--katalyst' }, at);
    expect(refused.released).toEqual([]);
  });
});
