/**
 * Reading click steps back from a launch's log (`config-proof`'s Runtime and Discard scenarios, REQ-CONFIG-281/282).
 * Pinned against log text in the seam's own shape, so a step that found no control, or pressed a covered point, is
 * named instead of being read as a press.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the scripts that run it.
import { unpressedClicks } from './capture-clicks.mjs';

const toggle = '.toggle[aria-labelledby="keep-going-label"]';

describe('click steps read back from the log (REQ-CONFIG-281, REQ-CONFIG-282)', () => {
  it('answers nothing when every step logged its press', () => {
    const log = ['[main] capture: clicked "Runtime"', `[main] capture: clicked "${toggle}"`, '[main] capture: clicked "Discard"'].join('\n');
    expect(unpressedClicks(log, ['Runtime', toggle, 'Discard'])).toEqual([]);
  });

  it('names a step the seam found no control for — the sweep run that stayed on Models', () => {
    const log = [`[main] capture: no "${toggle}" control on screen`, '[main] capture: no "Discard" control on screen'].join('\n');
    expect(unpressedClicks(log, [toggle, 'Discard'])).toEqual([{ what: toggle, reason: 'never pressed' }, { what: 'Discard', reason: 'never pressed' }]);
  });

  it('names a press on a point another element covers', () => {
    const log = ['[main] capture: "Discard" is not under the pointer at 10,20 — "notice" is', '[main] capture: clicked "Discard"'].join('\n');
    expect(unpressedClicks(log, ['Discard'])).toEqual([{ what: 'Discard', reason: 'covered' }]);
  });

  it('reads a CRLF log the same way', () => {
    expect(unpressedClicks('[main] capture: clicked "Save"\r\n', ['Save'])).toEqual([]);
  });

  it('does not take a press of a longer label for the step', () => {
    expect(unpressedClicks('[main] capture: clicked "Save all"', ['Save'])).toEqual([{ what: 'Save', reason: 'never pressed' }]);
  });
});
