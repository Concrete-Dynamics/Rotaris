/**
 * The live run's resume scenario presses Pause on two running children, bounded, and reports what the press found and
 * what the pause held (live-run finding P7 at a68f121;
 * `docs/defects/fixed/the-resume-scenarios-pause-can-land-on-one-running-child.md`). The schedule is read through the
 * capture seam's own parser, so a step that parses as something else is seen as such.
 */
import { describe, expect, it } from 'vitest';
import { parseSteps } from '../../src/main/capture/host.js';
// @ts-expect-error — the schedule is plain ESM beside the live run that uses it.
import { ARM_ALONE, PAUSE, PRESSED, RUNNING, RUNNING_AT_PAUSE, TWO_RUNNING_WAIT_MS, pauseEvalSteps, pauseReading } from './resume-pause.mjs';

const WAIT = 840_000;

describe("the resume scenario's Pause waits for two running children, bounded (PD-ORCH-005 clauses 3, 4 and 13)", () => {
  it('the press needs two running rows, or one once the bound has run out, and the arming step first; never the first running row alone', () => {
    const [two, alone] = (PAUSE as string).split(', ');
    expect(two).toBe(`body[data-pause-armed="1"] .workspace:has(${RUNNING as string} ~ ${RUNNING as string}) button[aria-label="Pause the run"]`);
    expect(alone).toBe(`body[data-pause-armed="1"][data-pause-alone="1"] .workspace:has(${RUNNING as string}) button[aria-label="Pause the run"]`);
    // The selector before the repair matched the moment one child ran; no branch does that now without the bound's mark.
    expect((PAUSE as string).split(', ').every((branch) => branch.includes(' ~ ') || branch.startsWith('body[data-pause-armed="1"][data-pause-alone="1"] '))).toBe(true);
    // No press before the arming step has put its listener in place, so no press goes unread.
    expect((PAUSE as string).split(', ').every((branch) => branch.startsWith('body[data-pause-armed="1"]'))).toBe(true);
  });

  it('parses as one waiting click and two waiting evals, each logging its own expression', () => {
    const [click] = parseSteps(`${PAUSE as string}@~${WAIT}`);
    expect(click).toMatchObject({ selector: PAUSE, arg: null, at: WAIT, until: true });
    const evals = parseSteps((pauseEvalSteps(WAIT) as string[]).join(';;'));
    expect(evals).toEqual([
      { selector: ARM_ALONE, arg: RUNNING, at: WAIT, until: true },
      { selector: RUNNING_AT_PAUSE, arg: PRESSED, at: WAIT, until: true },
    ]);
    expect(ARM_ALONE).toContain(`}, ${TWO_RUNNING_WAIT_MS as number})`);
  });
});

/**
 * The arming step run against a stand-in for the page: the body's dataset, the document's listeners, the running rows and
 * the bound's timer, so the press mark is read as the renderer would write it.
 */
function armedPage(running: number) {
  const dataset: Record<string, string> = {};
  const listeners: Array<{ type: string; handler: (event: { target: unknown }) => void; capture: boolean }> = [];
  const timers: Array<() => void> = [];
  class Element { constructor(readonly pause: boolean) {} closest(selector: string) { return this.pause && selector === 'button[aria-label="Pause the run"]' ? this : null; } }
  const page = { running };
  const document = {
    body: { dataset },
    addEventListener: (type: string, handler: (event: { target: unknown }) => void, capture: boolean) => { listeners.push({ type, handler, capture }); },
    querySelectorAll: (selector: string) => ({ length: selector === RUNNING ? page.running : 0 }),
  };
  const answer = new Function('document', 'Element', 'setTimeout', `return ${ARM_ALONE as string}`)(document, Element, (fn: () => void, ms: number) => { if (ms === TWO_RUNNING_WAIT_MS) timers.push(fn); });
  const click = (pause: boolean) => { for (const l of listeners) if (l.type === 'click') l.handler({ target: new Element(pause) }); };
  return { answer, dataset, listeners, timers, page, click };
}

describe('the press leaves its own reading, taken in the capture phase before the product handles it', () => {
  it('arming answers true, marks the page armed and listens in the capture phase', () => {
    const page = armedPage(2);
    expect(page.answer).toBe(true);
    expect(page.dataset['pauseArmed']).toBe('1');
    expect(page.listeners).toEqual([expect.objectContaining({ type: 'click', capture: true })]);
    expect(page.timers).toHaveLength(1);
  });

  it('the Pause press writes the children running at that moment; a later press or another click writes nothing', () => {
    const page = armedPage(2);
    page.click(false);
    expect(page.dataset['runningAtPress']).toBeUndefined();
    page.click(true);
    expect(page.dataset['runningAtPress']).toBe('2');
    // The pause then takes the children out of `running`; the reading stays what the press found.
    page.page.running = 0;
    page.click(true);
    expect(page.dataset['runningAtPress']).toBe('2');
    expect(new Function('document', `return ${RUNNING_AT_PAUSE as string}`)({ body: { dataset: page.dataset } })).toBe(2);
  });

  it('a press after the bound ran out is read negative', () => {
    const page = armedPage(1);
    page.timers[0]!();
    expect(page.dataset['pauseAlone']).toBe('1');
    page.click(true);
    expect(page.dataset['runningAtPress']).toBe('-1');
  });
});

describe('what the press found and what the pause held, read back from the log', () => {
  const line = (value: number) => `[main 2026-10-07T06:52:23.900Z] info    capture: eval-at ${WAIT} ${RUNNING_AT_PAUSE as string} → ${value}`;
  const armed = `[main 2026-10-07T06:52:01.000Z] info    capture: eval-at ${WAIT} ${ARM_ALONE as string} → true`;

  it('two running and two held is enough', () => {
    expect(pauseReading([armed, line(2)].join('\n'), 2)).toEqual({ atPress: 2, boundRanOut: false, held: 2, enough: true, detail: '2 held; 2 child(ren) running at the press' });
  });

  it('one running once the bound ran out says so', () => {
    expect(pauseReading(line(-1), 1)).toMatchObject({ atPress: 1, boundRanOut: true, enough: false, detail: `1 held; 1 child(ren) running at the press, after the first had run alone for ${(TWO_RUNNING_WAIT_MS as number) / 1000} s` });
  });

  it('no reading is named, never taken for a press', () => {
    expect(pauseReading(armed, 0)).toMatchObject({ atPress: null, enough: false, detail: '0 held; no reading at the press' });
  });

  it('reads a CRLF log the same way', () => {
    expect(pauseReading(`${line(2)}\r\n`, 2).atPress).toBe(2);
  });
});
