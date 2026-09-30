import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { owesNoConfinementDisclosure, type ConfinementVerdict } from '@rotaris/contracts';
import { NO_CONFINEMENT_DISCLOSURE, StartSessionDialog } from './StartSessionDialog.js';

/**
 * REQ-SANDBOX-130's disclosure on the launch dialog, the second of the two surfaces it names. The fact it states — this
 * host cannot confine anything, and no value of the sandbox mode changes that here — is true only where no mechanism
 * exists at all (REQ-SANDBOX-065's `unavailable` backend). A Linux host without `bwrap`, or one whose trial failed, has a
 * mechanism; there the mechanism's own reason and remediation are what the dialog owes (REQ-SANDBOX-119), and the
 * settings surface draws no disclosure, so the dialog drawing one made the two surfaces disagree (REQ-SANDBOX-071).
 */
const dialog = (confinement: ConfinementVerdict | null) => renderToStaticMarkup(createElement(StartSessionDialog, {
  sessionId: 's1', runActive: false, defaultSandboxMode: 'off', confinement,
  onChooseAttach: async () => ({ ok: true as const, cancelled: true as const }), onAccept: () => undefined, onCancel: () => undefined,
}));
const disclosure = (html: string) => html.includes('data-testid="start-session-disclosure"');
const reason = (html: string) => html.includes('data-testid="start-session-sandbox-reason"');

describe('the launch dialog\'s no-mechanism disclosure (REQ-SANDBOX-130, -119, -071)', () => {
  it('is drawn on a host for which no mechanism exists at all, whatever mode is selected', () => {
    const html = dialog({ available: false, backend: 'unavailable', reason: 'This host is native Windows.', remediation: 'Use WSL2.' });
    expect(disclosure(html)).toBe(true);
    expect(html).toContain(NO_CONFINEMENT_DISCLOSURE.slice(0, 40));
  });

  it('is not drawn on a Linux host whose launcher is missing, which carries the mechanism\'s own reason instead', () => {
    const html = dialog({ available: false, backend: 'bubblewrap', reason: 'bubblewrap is the confinement mechanism on this host, but its launcher `bwrap` was not found on PATH.', remediation: 'sudo apt-get install bubblewrap' });
    expect(disclosure(html)).toBe(false);
    expect(reason(html)).toBe(true);
    expect(html).toContain('sudo apt-get install bubblewrap');
  });

  it('is not drawn where the trial failed, on either platform that has a mechanism', () => {
    for (const backend of ['bubblewrap', 'seatbelt'] as const) {
      const html = dialog({ available: false, backend, reason: 'The trial failed.', remediation: 'Run it by hand.' });
      expect(disclosure(html)).toBe(false);
      expect(reason(html)).toBe(true);
    }
  });

  it('is not drawn before the verdict has arrived, nor where confinement is available', () => {
    expect(disclosure(dialog(null))).toBe(false);
    expect(disclosure(dialog({ available: true, backend: 'bubblewrap', reason: '', remediation: '' }))).toBe(false);
  });

  it('reads the one predicate the settings surface reads too, so the two surfaces cannot disagree (REQ-SANDBOX-071)', () => {
    const verdicts: (ConfinementVerdict | null)[] = [
      null,
      { available: true, backend: 'seatbelt', reason: '', remediation: '' },
      { available: false, backend: 'seatbelt', reason: 'r', remediation: 'm' },
      { available: false, backend: 'bubblewrap', reason: 'r', remediation: 'm' },
      { available: false, backend: 'unavailable', reason: 'r', remediation: 'm' },
    ];
    expect(verdicts.map(owesNoConfinementDisclosure)).toEqual([false, false, false, false, true]);
    for (const v of verdicts) expect(disclosure(dialog(v))).toBe(owesNoConfinementDisclosure(v));
  });
});
