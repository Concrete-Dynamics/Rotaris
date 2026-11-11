import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProviderRow } from '@rotaris/contracts';
import { authenticatePress, authenticateWords, KEY_PROVIDER_FIRST_SENTENCE, KEY_PROVIDER_REPLACE_SENTENCE, NO_PROVIDERS_HINT, ProvidersCard, READING_PROVIDERS, type ProvidersCardProps } from './Providers.js';

/**
 * PD-CONFIG-009 and the 2026-11-11 critique's UIR-307/308/309: the providers card draws one filled control, its rows'
 * action cell is a table cell, and a key provider's Authenticate opens the settings its answer stands in.
 */
const row = (over: Partial<ProviderRow>): ProviderRow => ({
  id: 'deepseek', displayName: 'DeepSeek', method: 'api-key', methodLabel: 'Paste an API key', authenticated: false, status: 'unauthenticated',
  displayMask: null, baseUrl: null, modelCount: 0, userDefined: false, available: true, lastError: null, health: null, ...over,
});
const done = async () => ({ ok: true, message: '' });
const card = (rows: readonly ProviderRow[], over: Partial<ProvidersCardProps> = {}) => renderToStaticMarkup(createElement(ProvidersCard, {
  rows, loading: false, error: null, onAdd: () => undefined, onReauthenticate: () => undefined, onCheck: async () => undefined,
  onSave: done, onValidate: done, onSignOut: done, onDelete: done, onRefreshAll: done, ...over,
}));
const filled = (html: string) => [...html.matchAll(/<button[^>]*class="[^"]*\bbtn-primary\b[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);
const SIX: readonly ProviderRow[] = [
  row({ id: 'claude-code', displayName: 'Claude Code (subscription)' }),
  row({ id: 'codex', displayName: 'OpenAI Codex', method: 'browser-pkce', methodLabel: 'Sign in on a browser page' }),
  row({ id: 'concrete-cloud', displayName: 'Rotaris Cloud (recommended)', method: 'browser-pkce', available: false }),
  row({ id: 'copilot', displayName: 'GitHub Copilot', method: 'device-code' }),
  row({ id: 'deepseek' }),
  row({ id: 'openai-compatible', displayName: 'OpenAI-compatible', authenticated: true, status: 'authenticated', displayMask: 'sk-…1234' }),
];

describe('the providers card draws one filled control (PD-CONFIG-009, over REQ-CONFIG-371; §1.7)', () => {
  it('fills "Add endpoint" alone over six rows, five of them unauthenticated — it filled seven', () => {
    expect(filled(card(SIX))).toEqual(['Add endpoint']);
  });

  it('draws a row\'s Authenticate and Re-authenticate as the same hairline, first in the row', () => {
    const html = card(SIX);
    const actions = [...html.matchAll(/<div class="provider-row__actions">(.*?)<\/div>/g)].map((m) => m[1] ?? '');
    expect(actions).toHaveLength(6);
    for (const a of actions) expect(/^<button[^>]*class="btn btn-secondary btn-compact"[^>]*>(Authenticate|Re-authenticate)</.test(a)).toBe(true);
    expect(actions.filter((a) => a.includes('>Re-authenticate<'))).toHaveLength(1);
  });

  it('draws one "Add endpoint" when no provider is listed, the head\'s, and names it in the state\'s sentence (REQ-CONFIG-388, REQ-NOTIFY-006)', () => {
    const html = card([]);
    expect(filled(html)).toEqual(['Add endpoint']);
    expect([...html.matchAll(/>Add endpoint</g)]).toHaveLength(1);
    expect(html).toContain('data-providers-empty');
    expect(html).toContain(NO_PROVIDERS_HINT);
    expect(NO_PROVIDERS_HINT).toMatch(/Add endpoint above\.$/);
  });

  it('states a read that failed by its error alone, never as an empty list', () => {
    const html = card([], { error: 'The provider list could not be read.' });
    expect(html).toContain('The provider list could not be read.');
    expect(html).not.toContain('data-providers-empty');
    expect(html).not.toContain('No providers were discovered');
  });

  it('states a read in flight as a read, never as an empty list', () => {
    const html = card([], { loading: true });
    expect(html).toContain(`data-providers-reading="true">${READING_PROVIDERS}<`);
    expect(html).not.toContain('data-providers-empty');
    expect(html).not.toContain('No providers were discovered');
    expect(filled(html)).toEqual(['Add endpoint']);
  });
});

describe('a provider row\'s action cell (UIR-308, UIR-309)', () => {
  it('is a table cell of its own class, never the wrapping flex line of a Settings row', () => {
    const html = card(SIX);
    expect([...html.matchAll(/<td class="provider-row__action-cell">/g)]).toHaveLength(6);
    expect(html).not.toContain('<td class="settings__action"');
  });
});

describe('what Authenticate does (REQ-PROVIDER-141, REQ-PROVIDER-050, REQ-PROVIDER-142)', () => {
  it('sends a key provider with no stored key to its key field, saying the provider signs in with a key', () => {
    expect(authenticatePress({ method: 'api-key', authenticated: false })).toEqual({ kind: 'key-field', message: KEY_PROVIDER_FIRST_SENTENCE });
  });

  it('sends a key provider with a stored key to its key field, saying a replacement key must be entered and saved (REQ-PROVIDER-141)', () => {
    expect(authenticatePress({ method: 'api-key', authenticated: true })).toEqual({ kind: 'key-field', message: KEY_PROVIDER_REPLACE_SENTENCE });
    expect(KEY_PROVIDER_REPLACE_SENTENCE).toMatch(/replacement key/);
  });

  it('starts the flow for every other provider, and for one whose method is unknown', () => {
    expect(authenticatePress({ method: 'browser-pkce', authenticated: false })).toEqual({ kind: 'flow' });
    expect(authenticatePress({ method: 'device-code', authenticated: true })).toEqual({ kind: 'flow' });
    expect(authenticatePress({ method: null, authenticated: false })).toEqual({ kind: 'flow' });
  });
});

describe('the words on Authenticate (REQ-CONFIG-372)', () => {
  const health = (state: NonNullable<ProviderRow['health']>['state']): ProviderRow['health'] => ({ state, detail: '' } as ProviderRow['health']);

  it('takes its text from stored credentials', () => {
    expect(authenticateWords({ authenticated: false, health: null }).text).toBe('Authenticate');
    expect(authenticateWords({ authenticated: true, health: null }).text).toBe('Re-authenticate');
  });

  it('names a row nobody has checked "Authenticate": an unknown connection is not a connection — it was named "Re-authenticate"', () => {
    expect(authenticateWords({ authenticated: false, health: null }).name).toBe('Authenticate');
    expect(authenticateWords({ authenticated: true, health: null }).name).toBe('Authenticate');
    expect(card(SIX)).toContain('aria-label="Authenticate DeepSeek"');
    expect(card(SIX)).not.toContain('aria-label="Re-authenticate');
  });

  it('names a connected row "Re-authenticate": healthy, or partly usable', () => {
    expect(authenticateWords({ authenticated: true, health: health('healthy') }).name).toBe('Re-authenticate');
    expect(authenticateWords({ authenticated: true, health: health('warning') }).name).toBe('Re-authenticate');
  });

  it('names every row not known to be connected "Authenticate": unauthenticated, unknown, being checked, in error, unavailable', () => {
    expect(authenticateWords({ authenticated: true, health: health('unauthenticated') })).toEqual({ text: 'Re-authenticate', name: 'Authenticate' });
    for (const state of ['unknown', 'checking', 'error', 'coming_soon'] as const) expect(authenticateWords({ authenticated: true, health: health(state) }).name).toBe('Authenticate');
  });
});
