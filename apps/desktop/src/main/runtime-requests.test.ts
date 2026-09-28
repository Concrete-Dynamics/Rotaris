import { describe, expect, it } from 'vitest';
import { withoutRuntimeRequests, type SpellcheckerSession } from './runtime-requests.js';

function fakeSession(): SpellcheckerSession & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    setSpellCheckerEnabled: (enable) => { calls.push(`enabled ${enable}`); },
    setSpellCheckerLanguages: (languages) => { calls.push(`languages [${languages.join(',')}]`); },
  };
}

describe('a session the runtime creates makes no request of its own — REQ-STARTUP-160, REQ-SHELL-005', () => {
  it('empties the dictionary list first, so the download the session began is discarded, then turns the spellchecker off', () => {
    const session = fakeSession();
    withoutRuntimeRequests(session, () => { throw new Error('nothing is reported'); });
    expect(session.calls).toEqual(['languages []', 'enabled false']);
  });

  it('asks for no dictionary language at all, so no locale is left for a download to name (REQ-STARTUP-160)', () => {
    const languages: string[][] = [];
    withoutRuntimeRequests({ setSpellCheckerEnabled: () => undefined, setSpellCheckerLanguages: (l) => { languages.push([...l]); } }, () => undefined);
    expect(languages).toEqual([[]]);
  });

  it('a session whose spellchecker cannot be turned off is reported by name, and the session is still built (REQ-STARTUP-160)', () => {
    const reported: string[] = [];
    expect(() => {
      withoutRuntimeRequests({
        setSpellCheckerEnabled: () => undefined,
        setSpellCheckerLanguages: () => { throw new Error('not supported on this platform'); },
      }, (m) => { reported.push(m); });
    }).not.toThrow();
    expect(reported).toEqual(['REQ-STARTUP-160: the spellchecker of a new session could not be turned off, so the runtime may request a dictionary of its own: not supported on this platform']);
  });
});
