import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ReauthPrompt as ReauthPromptState } from '@rotaris/contracts';
import { REAUTH_KEEP_LABEL, REAUTH_SUBMIT_LABEL, ReauthPrompt, reauthCopy } from './ReauthPrompt.js';

const ERROR = 'scripted authentication failure (HTTP 401) — HTTP 401 — Incorrect API key provided';
const base: ReauthPromptState = {
  sessionId: 'S1', primary: { provider: 'katalyst', model: 'big', modelKey: 'big' }, fallback: { provider: 'deepseek', model: 'small', modelKey: 'small' },
  provider: { id: 'katalyst', name: 'Katalyst' }, method: 'api-key', error: ERROR,
};
const render = (prompt: ReauthPromptState) => renderToStaticMarkup(createElement(ReauthPrompt, { prompt, onSubmit: async () => ({ ok: true as const, applies: 'next-iteration' as const }), onDismiss: async () => undefined }));

describe('the non-modal re-authentication prompt (REQ-NOTIFY-071/078, ADR-0048)', () => {
  it('REQ-NOTIFY-071: names the primary that failed, says the run continues on the fallback and switches back from the next iteration', () => {
    expect(reauthCopy(base)).toEqual({
      title: 'Re-authenticate Katalyst',
      body: 'katalyst/big could not authenticate. The run continues on the fallback model deepseek/small; re-authenticating switches back to katalyst/big from the next iteration.',
      method: null,
    });
  });

  it('ADR-0048: a window-level dialog with no aria-modal and no backdrop; it quotes the provider\'s error and offers the dismissal that keeps the fallback', () => {
    const html = render(base);
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain('aria-modal');
    expect(html).not.toContain('dialog-backdrop');
    expect(html).toContain('data-testid="reauth-error">scripted authentication failure (HTTP 401) — HTTP 401 — Incorrect API key provided</p>');
    expect(html).toContain(`data-action="reauth-keep">${REAUTH_KEEP_LABEL}</button>`);
    expect(html).toContain(`data-action="reauth-submit">${REAUTH_SUBMIT_LABEL}</button>`);
    expect(html.indexOf(REAUTH_KEEP_LABEL)).toBeLessThan(html.indexOf(`>${REAUTH_SUBMIT_LABEL}<`));
  });

  it('REQ-NOTIFY-078: a key-based provider is offered a masked key field', () => {
    const html = render(base);
    expect(html).toMatch(/<input[^>]*type="password"[^>]*data-testid="reauth-key"/);
    expect(html).not.toContain('data-testid="reauth-method"');
  });

  it('a device-code or browser provider is offered no key field and is told the method is unavailable in this build', () => {
    const reason = 'GitHub Copilot signs in with "Code shown here, entered at the provider", which this build does not provide yet.';
    const html = render({ ...base, provider: { id: 'copilot', name: 'GitHub Copilot' }, method: 'unavailable', unavailableReason: reason });
    expect(html).not.toContain('type="password"');
    expect(html).toContain(`data-testid="reauth-method">${reason.replace(/"/g, '&quot;')}</p>`);
  });

  it('a provider this application holds no credential for says where its key comes from, and still offers switching back', () => {
    const copy = reauthCopy({ ...base, provider: { id: 'scripted', name: 'scripted' }, method: 'none' });
    expect(copy.method).toBe('This application holds no credential for scripted; its key comes from the model configuration. Re-authenticate it there, then switch back here.');
    expect(render({ ...base, method: 'none' })).toContain('data-action="reauth-submit"');
  });
});
