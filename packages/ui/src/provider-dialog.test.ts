import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProviderChoice, ProviderDialogPayload } from '@rotaris/contracts';
import { KEY_INSTRUCTION, OAUTH_INSTRUCTION, ProviderDialog } from './ProviderDialog.js';

const choice = (over: Partial<ProviderChoice>): ProviderChoice => ({ id: 'codex', displayName: 'OpenAI Codex (Sign in with ChatGPT)', method: 'browser-pkce', methodLabel: 'Sign in on a browser page', hint: 'Direct provider API — OpenAI, destination: chatgpt.com.', defaultBaseUrl: null, custom: false, available: true, unavailabilityReason: null, ...over });
const draw = (payload: ProviderDialogPayload): string => renderToStaticMarkup(createElement(ProviderDialog, { payload, onSubmit: async () => ({ outcome: 'cancelled' as const }), onAuthenticate: async () => ({ outcome: 'cancelled' as const }), onClose: () => undefined }));

/** R-111 — REQ-PROVIDER-096/116: the authentication window's resting state for each kind of provider. */
describe('ui/ProviderDialog — what the window offers before a sign-in starts', () => {
  it('a browser or device-code provider shows the start instruction, no key field, and an enabled Authenticate', () => {
    const html = draw({ mode: 'reauthenticate', providerId: 'codex', displayName: 'OpenAI Codex', choices: [choice({})] });
    expect(html).toContain('Re-authenticate OpenAI Codex');
    expect(html).toContain(OAUTH_INSTRUCTION.replace("'", '&#x27;'));
    expect(html).not.toContain('id="provider-key"');
    expect(html).not.toContain('does not provide yet');
    expect(html).toMatch(/<button[^>]*data-action="authenticate"(?![^>]*disabled)/);
  });

  it('an API-key provider shows the key instruction and its masked field', () => {
    const html = draw({ mode: 'authenticate', providerId: 'deepseek', displayName: 'DeepSeek', choices: [choice({ id: 'deepseek', displayName: 'DeepSeek', method: 'api-key', methodLabel: 'Paste an API key' })] });
    expect(html).toContain(KEY_INSTRUCTION.replace("'", '&#x27;'));
    expect(html).toContain('type="password"');
  });

  it('PD-PROVIDER-002: a provider connected through the local tool shows its own sentence, no key field, and an enabled Authenticate', () => {
    const sentence = 'Rotaris will use the Claude Code tool installed and signed in on this computer.';
    const html = draw({ mode: 'authenticate', providerId: 'claude-code', displayName: 'Claude Code (subscription)', choices: [choice({ id: 'claude-code', displayName: 'Claude Code (subscription)', method: 'api-key', methodLabel: 'Paste an API key', localInstruction: sentence })] });
    expect(html).toContain(sentence);
    expect(html).not.toContain('id="provider-key"');
    expect(html).toMatch(/<button[^>]*data-action="authenticate"(?![^>]*disabled)/);
  });

  it('an unavailable provider says why, offers no field and disables Authenticate', () => {
    const reason = 'Claude Code is not installed on this computer.';
    const html = draw({ mode: 'authenticate', providerId: 'claude-code', displayName: 'Claude Code (subscription)', choices: [choice({ id: 'claude-code', displayName: 'Claude Code (subscription)', method: 'api-key', methodLabel: 'Paste an API key', available: false, unavailabilityReason: reason, localInstruction: 'x' })] });
    expect(html).toContain(reason);
    expect(html).not.toContain('id="provider-key"');
    expect(html).toMatch(/<button[^>]*disabled[^>]*data-action="authenticate"|<button[^>]*data-action="authenticate"[^>]*disabled/);
  });

  it('PD-PROVIDER-004: Rotaris Cloud is a browser sign-in that starts enabled; its Server section waits for the stored choice, so the first paint offers only Authenticate', () => {
    const html = draw({ mode: 'authenticate', providerId: 'concrete-cloud', displayName: 'Rotaris Cloud (recommended)', choices: [choice({ id: 'concrete-cloud', displayName: 'Rotaris Cloud (recommended)' })] });
    expect(html).toContain(OAUTH_INSTRUCTION.replace("'", '&#x27;'));
    expect(html).not.toContain('id="provider-key"');
    expect(html).toMatch(/<button[^>]*data-action="authenticate"(?![^>]*disabled)/);
  });
});
