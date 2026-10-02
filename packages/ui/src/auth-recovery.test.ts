import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthRecoveryDialog } from './AuthRecoveryDialog.js';
import { AUTH_ERROR_LIMIT, canSaveKey, modelLabel, providerErrorText, radioStep, recoveryModelList, recoveryTitle } from './auth-recovery.js';

const m = (key: string, provider: string, model: string, providerName = provider) => ({ key, provider, providerName, model });

describe('ui/auth-recovery — the recovery dialog\'s pure half (REQ-NOTIFY-072..074)', () => {
  it('REQ-NOTIFY-073: collapses runs of whitespace and truncates to 320 characters followed by an ellipsis', () => {
    expect(providerErrorText('HTTP 401\n\n  Incorrect   API key\tprovided ')).toBe('HTTP 401 Incorrect API key provided');
    const exact = 'x'.repeat(AUTH_ERROR_LIMIT);
    expect(providerErrorText(exact)).toBe(exact);
    const long = `${'word '.repeat(100)}end`;
    const drawn = providerErrorText(long);
    expect(drawn.endsWith('…')).toBe(true);
    expect(drawn.length).toBe(AUTH_ERROR_LIMIT + 1);
    expect(drawn.slice(0, AUTH_ERROR_LIMIT)).toBe(long.replace(/\s+/g, ' ').slice(0, AUTH_ERROR_LIMIT));
    expect(AUTH_ERROR_LIMIT).toBe(320);
  });

  it('REQ-NOTIFY-072: names the model that failed, else the active model, else neither', () => {
    expect(recoveryTitle({ failed: m('a1', 'a', 'alpha'), active: m('b1', 'b', 'beta') })).toBe('Authentication failed for alpha');
    expect(recoveryTitle({ failed: null, active: m('b1', 'b', 'beta') })).toBe('Authentication failed for beta');
    expect(recoveryTitle({ failed: null, active: null })).toBe('Authentication failed');
  });

  it('REQ-NOTIFY-074: other providers\' models first, then the failed provider\'s others; never the model that failed', () => {
    const models = [m('a1', 'a', 'alpha'), m('a2', 'a', 'alpha-2'), m('b1', 'b', 'beta'), m('c1', 'c', 'gamma'), m('b1', 'b', 'beta')];
    expect(recoveryModelList(models, { provider: 'a', model: 'alpha' }).map((x) => x.key)).toEqual(['b1', 'c1', 'a2']);
  });

  it('REQ-NOTIFY-074: where no other provider offers a model, every model except the one that failed; empty when that is all', () => {
    expect(recoveryModelList([m('a1', 'a', 'alpha'), m('a2', 'a', 'alpha-2')], { provider: 'a', model: 'alpha' }).map((x) => x.key)).toEqual(['a2']);
    expect(recoveryModelList([m('a1', 'a', 'alpha')], { provider: 'a', model: 'alpha' })).toEqual([]);
    expect(recoveryModelList([], { provider: 'a', model: 'alpha' })).toEqual([]);
  });

  it('labels each model with its model name and its provider', () => {
    expect(modelLabel({ model: 'beta', providerName: 'Scripted B' })).toBe('beta · Scripted B');
  });
});

describe('ui/AuthRecoveryDialog — the drawn dialog (REQ-NOTIFY-072..074, REQ-NOTIFY-080)', () => {
  type Reauth = { provider: string; providerName: string; method: 'api-key' | 'unavailable' | 'configuration'; message: string };
  const KEYED: Reauth = { provider: 'scripted', providerName: 'scripted', method: 'api-key', message: 'Enter a new API key for scripted.' };
  const payload = (models: ReturnType<typeof m>[], reauth: Reauth = KEYED) => ({ sessionId: 'S1', failed: m('alpha', 'scripted', 'alpha', 'scripted'), active: m('alpha', 'scripted', 'alpha', 'scripted'), models, error: `HTTP 401 —   Incorrect API key provided ${'z'.repeat(400)}`, reauth });
  const draw = (models: ReturnType<typeof m>[], reauth: Reauth = KEYED) => renderToStaticMarkup(createElement(AuthRecoveryDialog, { payload: payload(models, reauth), onRetry: async () => ({ ok: true as const }), onReauthenticate: async () => ({ ok: true as const }), onCancel: () => undefined }));

  it('is a modal alert dialog titled for the model that failed, the error collapsed and truncated', () => {
    const html = draw([m('alpha', 'scripted', 'alpha', 'scripted'), m('beta', 'scripted-b', 'beta', 'Scripted B')]);
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('>Authentication failed for alpha</h1>');
    const error = /data-testid="auth-recovery-error">([^<]*)</.exec(html)?.[1] ?? '';
    expect(error.startsWith('HTTP 401 — Incorrect API key provided z')).toBe(true);
    expect(error.endsWith('…')).toBe(true);
    expect(error.length).toBe(AUTH_ERROR_LIMIT + 1);
  });

  it('lists the other provider\'s model, never the one that failed, the first chosen and Retry enabled', () => {
    const html = draw([m('alpha', 'scripted', 'alpha', 'scripted'), m('beta', 'scripted-b', 'beta', 'Scripted B')]);
    expect([...html.matchAll(/data-value="([^"]+)"/g)].map((x) => x[1])).toEqual(['beta']);
    expect(html).toContain('beta · Scripted B');
    expect(html).toMatch(/aria-checked="true"[^>]*data-value="beta"/);
    expect(html).not.toMatch(/data-action="retry"[^>]*disabled|disabled=""[^>]*data-action="retry"/);
  });

  it('REQ-NOTIFY-074: with no model to choose, says so and draws Retry disabled', () => {
    const html = draw([m('alpha', 'scripted', 'alpha', 'scripted')]);
    expect(html).toContain('data-testid="auth-recovery-empty"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-action="retry"|<button[^>]*data-action="retry"[^>]*disabled=""/);
  });

  it('REQ-NOTIFY-076: a key-based provider gets a masked key field, Save and retry disabled while it is blank', () => {
    const html = draw([m('beta', 'scripted-b', 'beta')]);
    expect(html).toContain('>Re-authenticate scripted</h2>');
    expect(html).toMatch(/<input[^>]*type="password"[^>]*data-testid="auth-recovery-key"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-action="save-and-retry"|<button[^>]*data-action="save-and-retry"[^>]*disabled=""/);
    expect(canSaveKey('')).toBe(false);
    expect(canSaveKey('   ')).toBe(false);
    expect(canSaveKey('sk-x')).toBe(true);
  });

  it('REQ-NOTIFY-076: a device-code or browser provider gets the sentence saying the method is unavailable here, and no key field', () => {
    const html = draw([m('beta', 'scripted-b', 'beta')], { provider: 'copilot', providerName: 'GitHub Copilot', method: 'unavailable', message: 'GitHub Copilot signs in with "Code shown here, entered at the provider", which this build does not provide yet, so it cannot be re-authenticated here. Choose a model from another provider instead.' });
    expect(html).toContain('data-method="unavailable"');
    expect(html).toContain('which this build does not provide yet');
    expect(html).not.toContain('data-testid="auth-recovery-key"');
    expect(html).not.toContain('data-action="save-and-retry"');
    expect(html).not.toMatch(/terminal|shell|command line/i);
  });
});

describe('the model list\'s keyboard (the radio group pattern)', () => {
  it('the arrow keys move the choice, wrapping; Home and End go to the ends; any other key is not the group\'s', () => {
    const keys = ['beta', 'gpt-4o', 'gamma'];
    expect(radioStep(keys, 'beta', 'ArrowDown')).toBe('gpt-4o');
    expect(radioStep(keys, 'gamma', 'ArrowRight')).toBe('beta');
    expect(radioStep(keys, 'beta', 'ArrowUp')).toBe('gamma');
    expect(radioStep(keys, 'gpt-4o', 'ArrowLeft')).toBe('beta');
    expect(radioStep(keys, 'gpt-4o', 'Home')).toBe('beta');
    expect(radioStep(keys, 'beta', 'End')).toBe('gamma');
    expect(radioStep(keys, null, 'ArrowDown')).toBe('beta');
    expect(radioStep(keys, 'beta', 'Enter')).toBeNull();
    expect(radioStep([], null, 'ArrowDown')).toBeNull();
  });
});
