import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import type { CaptureHost } from './host.js';
import { categoryProbe, chordEvent, matchProbe, parseSelectors, parseSteps, selectWait, settleAt, targetProbe } from './host.js';

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

  it('aims a click at a point AND asks what is drawn there, so a covered element is not pressed in silence', () => {
    const probe = targetProbe('.row--system', null);
    expect(probe).toContain(JSON.stringify('.row--system'));
    // The two halves that make a miss visible: the hit test, and the covering element being named.
    expect(probe).toContain('document.elementFromPoint(x, y)');
    // Reached means the element itself or something inside it; an ancestor answering is a miss.
    expect(probe).toContain('over === b || b.contains(over)');
    expect(probe).not.toContain('over.contains(b)');
    // The point is taken two frames after the scroll, and the element looked up AGAIN there: a pooled
    // transcript re-binds the slot a rect was read from, and the press would land on its new row.
    expect(probe).toContain('requestAnimationFrame(() => requestAnimationFrame(go))');
    expect(probe.match(/b = find\(\)/g)?.length).toBe(2);
    // The text form quotes what it was given, exactly as the match probe does.
    expect(targetProbe('.btn', `it's`)).toContain(`x.textContent.trim() === "it's"`);
  });

  it('carries `~` on a step whose selector holds a tilde of its own', () => {
    // The tilde is read off the TIME, never off the selector, so `~` inside a selector is just a character.
    expect(parseSteps('[data-x="~a"]@~50')[0]).toEqual({ selector: '[data-x="~a"]', arg: null, at: 50, until: true });
    expect(parseSteps('[data-x="~a"]@50')[0]!.until).toBe(false);
  });

  it('reads `@from~ms` as the waiting form whose wait starts at `from`, and only that form carries `from`', () => {
    // part-j-proof's steer-rest Pause: no steer dialog open is true from the run's start, so the wait must start after
    // the Steer was pressed (docs/defects/fixed/part-j-proofs-steer-rest-presses-pause-as-soon-as-the-run-starts.md).
    const [late] = parseSteps('body:not(:has(.dialog.steer)) .pause@3800~9000');
    expect(late).toEqual({ selector: 'body:not(:has(.dialog.steer)) .pause', arg: null, at: 9000, until: true, from: 3800 });
    expect(parseSteps('.x>>Go@~900')[0]).not.toHaveProperty('from');
    expect(parseSteps('.x>>Go@900')[0]).not.toHaveProperty('from');
    expect(parseSteps('[data-x="1~2"]>>a@0~50')[0]).toEqual({ selector: '[data-x="1~2"]', arg: 'a', at: 50, until: true, from: 0 });
  });

  it('waits a select step on the control alone, keeping its deadline, because its argument is the value to choose', () => {
    const [waiting] = parseSteps('select[aria-label="Egress policy"]>>deny@~6000');
    // The waiting form survives: a select drawn late is chosen when it appears, not missed at an instant.
    expect(selectWait(waiting!)).toEqual({ selector: 'select[aria-label="Egress policy"]', arg: null, at: 6000, until: true });
    // Matching on `deny` as the control's TEXT would wait for a select that never exists.
    expect(matchProbe(selectWait(waiting!).selector, selectWait(waiting!).arg)).toContain('=> true');
    // The appointment form is unchanged: it still fires at its instant.
    const [fixed] = parseSteps('select>>read-only@1800');
    expect(selectWait(fixed!)).toEqual({ selector: 'select', arg: null, at: 1800, until: false });
    // The value itself is not lost — the seam reads it from the original step.
    expect(waiting!.arg).toBe('deny');
  });

  it('reads a Settings category as its point AND whether it is the selected one, quoting the label it was given', () => {
    const probe = categoryProbe(`it's`);
    expect(probe).toContain(JSON.stringify(`it's`));
    expect(probe).toContain(`.nav-list__item`);
    // The verification half: without it a deflected press reads exactly like a landed one.
    expect(probe).toContain(`classList.contains('is-selected')`);
  });
});

/**
 * The waiting form's start (`@from~ms`): the step looks at nothing before `from`, so a selector already true at the
 * launch is not taken for the effect of the step it follows
 * (`docs/defects/fixed/part-j-proofs-steer-rest-presses-pause-as-soon-as-the-run-starts.md`).
 */
describe('settleAt — when the waiting form starts looking', () => {
  const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };
  const harness = () => {
    const clock = new FakeClock();
    const probes: string[] = [];
    const host = { win: { webContents: { executeJavaScript: (code: string) => { probes.push(code); return Promise.resolve(true); } } }, clocks: clock, log: () => undefined } as unknown as CaptureHost;
    return { clock, probes, host };
  };

  it('`@~ms` looks at once: a selector true at the launch settles the step at the launch', async () => {
    const { probes, host } = harness();
    let settled = false;
    void settleAt(host, parseSteps('.pause@~9000')[0]!).then(() => { settled = true; });
    await flush();
    expect(probes).toHaveLength(1);
    expect(settled).toBe(true);
  });

  it('`@from~ms` looks at nothing before `from`, then settles on the first match', async () => {
    const { clock, probes, host } = harness();
    let settled = false;
    void settleAt(host, parseSteps('.pause@3800~9000')[0]!).then(() => { settled = true; });
    await flush();
    clock.advance(3_799);
    await flush();
    expect(probes).toHaveLength(0);
    expect(settled).toBe(false);
    clock.advance(1);
    await flush();
    expect(probes).toHaveLength(1);
    expect(settled).toBe(true);
  });
});
