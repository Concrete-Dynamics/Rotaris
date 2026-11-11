import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProviderRow } from '@rotaris/contracts';
import { authenticatePress, KEY_PROVIDER_AUTH_SENTENCE, ProvidersCard, type ProvidersCardProps } from './Providers.js';

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

  it('fills the head\'s "Add endpoint" alone when no provider is listed: the empty state\'s own is the hairline', () => {
    const html = card([]);
    expect(filled(html)).toEqual(['Add endpoint']);
    expect([...html.matchAll(/>Add endpoint</g)]).toHaveLength(2);
  });
});

describe('a provider row\'s action cell (UIR-308, UIR-309)', () => {
  it('is a table cell of its own class, never the wrapping flex line of a Settings row', () => {
    const html = card(SIX);
    expect([...html.matchAll(/<td class="provider-row__action-cell">/g)]).toHaveLength(6);
    expect(html).not.toContain('<td class="settings__action"');
  });
});

describe('what Authenticate does (REQ-PROVIDER-050, REQ-PROVIDER-142)', () => {
  it('opens the settings and states the key sentence for a provider that signs in with a stored key', () => {
    expect(authenticatePress({ method: 'api-key' })).toEqual({ kind: 'settings', message: KEY_PROVIDER_AUTH_SENTENCE });
  });

  it('starts the flow for every other provider, and for one whose method is unknown', () => {
    expect(authenticatePress({ method: 'browser-pkce' })).toEqual({ kind: 'flow' });
    expect(authenticatePress({ method: 'device-code' })).toEqual({ kind: 'flow' });
    expect(authenticatePress({ method: null })).toEqual({ kind: 'flow' });
  });
});
