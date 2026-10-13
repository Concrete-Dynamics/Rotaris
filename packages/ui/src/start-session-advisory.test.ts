import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConfinementVerdict } from '@rotaris/contracts';
import { NO_CONFINEMENT_DISCLOSURE, StartSessionDialog, unattendedAdvisory } from './StartSessionDialog.js';

/**
 * OQ-239 (UA1, ruled 2026-10-13 under R-072; confirmed as built): the launch dialog's unattended advisory is empty for every
 * permission mode, because every run the dialog starts is attended at launch. REQ-TOOLS-072, REQ-TOOLS-192 and
 * REQ-SANDBOX-107 attach the advisory to an unattended start; the dialog is drawn inside a main window, which holds a
 * presenter registration from its creation (REQ-TOOLS-053, REQ-TOOLS-069, REQ-SANDBOX-101). Until the ruling the function
 * took the mode, the confinement and the permissive opt-in and discarded them, and its comment said the `ask`/`restricted`
 * behaviour was kept
 * (docs/defects/fixed/the-unattended-advisory-is-empty-for-every-mode-where-pd-tools-002-keeps-it-for-ask-and-restricted.md).
 */
const UNAVAILABLE: ConfinementVerdict = { available: false, backend: 'unavailable', reason: 'This host is native Windows.', remediation: 'Use WSL2.' };
const AVAILABLE: ConfinementVerdict = { available: true, backend: 'bubblewrap', reason: '', remediation: '' };
const dialog = (confinement: ConfinementVerdict | null, advisory: string) => renderToStaticMarkup(createElement(StartSessionDialog, {
  sessionId: 's1', runActive: false, defaultSandboxMode: 'off', confinement, advisory,
  onChooseAttach: async () => ({ ok: true as const, cancelled: true as const }), onAccept: () => undefined, onCancel: () => undefined,
}));
const shown = (html: string) => html.includes('data-testid="start-session-advisory"');

describe('the launch dialog\'s unattended advisory, for a run attended at launch (OQ-239; REQ-TOOLS-072, REQ-TOOLS-192, REQ-SANDBOX-107)', () => {
  it('is empty, and reads no input: a run the dialog starts has a presenter, so no permission mode, confinement or opt-in can make it unattended', () => {
    expect(unattendedAdvisory()).toBe('');
    // The inputs the old signature took and discarded are gone, so no caller can believe one is read.
    expect(unattendedAdvisory.length).toBe(0);
  });

  it('draws no advisory with confinement available or unavailable, and REQ-SANDBOX-130\'s disclosure still renders where confinement is unavailable', () => {
    const unavailable = dialog(UNAVAILABLE, unattendedAdvisory());
    expect(shown(unavailable)).toBe(false);
    expect(unavailable).toContain('data-testid="start-session-disclosure"');
    expect(unavailable).toContain(NO_CONFINEMENT_DISCLOSURE.slice(0, 40));
    const available = dialog(AVAILABLE, unattendedAdvisory());
    expect(shown(available)).toBe(false);
    expect(available).not.toContain('data-testid="start-session-disclosure"');
  });

  it('keeps the presentation seam: a non-empty advisory still renders its paragraph beside the disclosure (REQ-TOOLS-192)', () => {
    const html = dialog(UNAVAILABLE, 'A run started here would be unattended.');
    expect(shown(html)).toBe(true);
    expect(html).toContain('A run started here would be unattended.');
    expect(html).toContain('data-testid="start-session-disclosure"');
  });
});
