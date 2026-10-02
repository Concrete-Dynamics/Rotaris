import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ReauthPrompt as ReauthPromptState } from '@rotaris/contracts';
import { AppShell } from './AppShell.js';
import { REAUTH_SUBMIT_LABEL, ReauthPrompt, applyReauthPublish, reauthCopy, reauthPromptFor, seedReauthPrompts, type ReauthPrompts } from './ReauthPrompt.js';

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
    // REQ-NOTIFY-071's dismissal "meaning that the fallback is kept", in the words the surface shows.
    expect(html).toContain('data-action="reauth-keep">Keep the fallback</button>');
    expect(html).toContain(`data-action="reauth-submit">${REAUTH_SUBMIT_LABEL}</button>`);
    expect(html.indexOf('Keep the fallback')).toBeLessThan(html.indexOf(`>${REAUTH_SUBMIT_LABEL}<`));
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

  it('REQ-NOTIFY-030: the window draws the followed session\'s prompt alone — absent while another is focused, back on refocusing', () => {
    let held: ReauthPrompts = new Map();
    held = applyReauthPublish(held, 'S1', base);
    expect(reauthPromptFor(held, 'S1')).toBe(base);
    // The user focuses S2: S1's prompt is not drawn over it, and nothing S1's would act on is on screen.
    expect(reauthPromptFor(held, 'S2')).toBeNull();
    expect(reauthPromptFor(held, null)).toBeNull();
    // S2 gets its own; each session's is drawn only while it is followed.
    const s2: ReauthPromptState = { ...base, sessionId: 'S2', primary: { provider: 'openai', model: 'gpt', modelKey: 'gpt' } };
    held = applyReauthPublish(held, 'S2', s2);
    expect(reauthPromptFor(held, 'S2')).toBe(s2);
    // Refocusing S1 brings its prompt back; closing it (an answer, in any window) removes it for good.
    expect(reauthPromptFor(held, 'S1')).toBe(base);
    held = applyReauthPublish(held, 'S1', null);
    expect(reauthPromptFor(held, 'S1')).toBeNull();
    expect(reauthPromptFor(held, 'S2')).toBe(s2);
  });

  it('a window that mounts after a prompt opened draws it from the read, and a publish that reached it first wins', () => {
    const newer: ReauthPromptState = { ...base, error: 'a newer failure' };
    const seeded = seedReauthPrompts(applyReauthPublish(new Map(), 'S1', newer), [base, { ...base, sessionId: 'S3' }]);
    expect(reauthPromptFor(seeded, 'S1')).toBe(newer);
    expect(reauthPromptFor(seeded, 'S3')?.sessionId).toBe('S3');
  });

  it('ADR-0048: the shell draws the prompt inside the rail-and-view region, after the title bar and the notice slot, never over them', () => {
    const panel = createElement(ReauthPrompt, { prompt: base, onSubmit: async () => ({ ok: true as const, applies: 'next-run' as const }), onDismiss: async () => undefined });
    const html = renderToStaticMarkup(createElement(AppShell, { version: '0.0.0', workspacePath: '/w', home: '/h', sessionName: null, onChooseWorkspace: () => undefined, statusItems: [], windowPanel: panel }));
    const body = html.indexOf('<div class="body"');
    const prompt = html.indexOf('data-testid="reauth-prompt"');
    expect(html.indexOf('class="notice-slot"')).toBeLessThan(body);
    expect(body).toBeGreaterThan(-1);
    expect(prompt).toBeGreaterThan(body);
    expect(prompt).toBeLessThan(html.indexOf('<footer class="status-strip"'));
  });
});
