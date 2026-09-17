import { describe, expect, it } from 'vitest';
import { chordEvent, matchProbe, parseSelectors, parseSteps } from './host.js';

/**
 * The capture script's grammar, which every `*-proof` script writes and which — until this module
 * existed — could only be found to be malformed by launching Electron and reading a log.
 */
describe('the capture script grammar (verification seams)', () => {
  it('reads `selector@ms` as an appointment and `selector@~ms` as a deadline', () => {
    expect(parseSteps('.btn@1500')).toEqual([{ selector: '.btn', arg: null, at: 1500, until: false }]);
    expect(parseSteps('.btn@~1500')).toEqual([{ selector: '.btn', arg: null, at: 1500, until: true }]);
  });

  it('splits the argument on the FIRST `>>` and the time on the LAST `@`, so both may appear in a selector', () => {
    // A CSS selector may hold an `@` inside an attribute value, and a typed step's text may hold one too.
    const [step] = parseSteps('[data-mail="a@b"]>>Send@900');
    expect(step).toEqual({ selector: '[data-mail="a@b"]', arg: 'Send', at: 900, until: false });
    // `>>` inside the argument stays in the argument: the split is the first one, not every one.
    expect(parseSteps('.x>>a>>b@10')[0]).toEqual({ selector: '.x', arg: 'a>>b', at: 10, until: false });
  });

  it('takes `;;` as the step separator, trims each step, and drops the empty ones', () => {
    expect(parseSteps(' .a@1 ;; ;; .b@2 ')).toEqual([
      { selector: '.a', arg: null, at: 1, until: false },
      { selector: '.b', arg: null, at: 2, until: false },
    ]);
  });

  it('reads an unset variable and an empty one as no steps at all, so an absent seam installs nothing', () => {
    expect(parseSteps(undefined)).toEqual([]);
    expect(parseSteps('')).toEqual([]);
    expect(parseSteps('   ')).toEqual([]);
    expect(parseSelectors(undefined)).toEqual([]);
  });

  it('keeps the probe lists as plain selectors — they carry no time and no argument', () => {
    expect(parseSelectors('.a;; .b ;;.c')).toEqual(['.a', '.b', '.c']);
  });

  it('reads a chord as its modifiers and its key, and `++` as a literal plus', () => {
    expect(chordEvent('Ctrl+K')).toEqual({ keyCode: 'K', modifiers: ['control'] });
    expect(chordEvent('Ctrl+Shift+P')).toEqual({ keyCode: 'P', modifiers: ['control', 'shift'] });
    expect(chordEvent('F1')).toEqual({ keyCode: 'F1', modifiers: [] });
    expect(chordEvent('Escape')).toEqual({ keyCode: 'Escape', modifiers: [] });
    // Ctrl++ is a real binding, and the naive split leaves it with an empty key.
    expect(chordEvent('Ctrl++')).toEqual({ keyCode: '+', modifiers: ['control'] });
  });

  it('builds a match probe that quotes what it was given, so a selector holding a quote cannot break the expression', () => {
    expect(matchProbe(`[title="it's"]`, null)).toContain(JSON.stringify(`[title="it's"]`));
    // Without the text, presence alone is the condition.
    expect(matchProbe('.x', null)).toContain('=> true');
    // With it, the exact trimmed text is the condition, and it is quoted too.
    expect(matchProbe('.x', 'Accept')).toContain('x.textContent.trim() === "Accept"');
  });

  it('carries `~` on a step whose selector holds a tilde of its own', () => {
    // The tilde is read off the TIME, never off the selector, so `~` inside a selector is just a character.
    expect(parseSteps('[data-x="~a"]@~50')[0]).toEqual({ selector: '[data-x="~a"]', arg: null, at: 50, until: true });
    expect(parseSteps('[data-x="~a"]@50')[0]!.until).toBe(false);
  });
});
