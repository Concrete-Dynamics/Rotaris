/**
 * `part-j-proof`'s steer-early launch (REQ-MONITOR-137): its schedule opens the steer dialog while the composer's send
 * is still settling, inside the window main's held `session.subscribe` reply keeps open, and types only once the reply
 * has gone (`docs/defects/fixed/a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md`).
 * The schedule is read through the capture seam's own parser, so a step written in the waiting form is seen as one.
 */
import { describe, expect, it } from 'vitest';
import { parseSteps } from '../../src/main/capture/host.js';
// @ts-expect-error — the schedule is plain ESM beside the proof that runs it.
import { SEND_UNSETTLED, STEER_EARLY_CLICKS, STEER_EARLY_TYPE, STEER_EARLY_WHATS, SUBSCRIBE_HOLD_MS, steerEarlyReading } from './steer-early.mjs';
// @ts-expect-error — plain ESM, as above.
import { unpressedClicks } from './capture-clicks.mjs';

const clicks = parseSteps(STEER_EARLY_CLICKS as string);
const typed = parseSteps(STEER_EARLY_TYPE as string)[0]!;
const whats = STEER_EARLY_WHATS as { steer: string; send: string };
const step = (what: string) => {
  const found = clicks.find((s) => (s.arg ?? s.selector) === what);
  if (!found) throw new Error(`no step logs as ${what}`);
  return found;
};

describe("part-j-proof's steer-early schedule (REQ-MONITOR-137)", () => {
  it('presses Steer the run as soon as it is drawn, and only while the composer\'s send has not settled', () => {
    const steer = step(whats.steer);
    expect(steer.selector.startsWith(`${SEND_UNSETTLED as string} `)).toBe(true);
    expect(steer.until).toBe(true);
  });

  it('types after the held reply can have gone for a run that started as late as the Steer press may land', () => {
    // A press at the Steer step's deadline means the run started then at the latest; its reply goes a hold later.
    expect(typed.arg).toBe('no-enter');
    expect(typed.at).toBeGreaterThan(step(whats.steer).at + (SUBSCRIBE_HOLD_MS as number));
  });

  it('sends after typing', () => {
    expect(step(whats.send).until).toBe(false);
    expect(step(whats.send).at).toBeGreaterThan(typed.at);
  });

  it('logs every step under the name the proof reads its press back by', () => {
    expect(clicks.map((s) => s.arg ?? s.selector)).toEqual([whats.steer, whats.send]);
  });
});

describe('reading the launch back from its log', () => {
  const held = `capture: session.subscribe reply held ${String(SUBSCRIBE_HOLD_MS)} ms`;
  const released = 'capture: session.subscribe reply released';
  const pressed = `capture: clicked "${whats.steer}"`;
  const typedLine = 'capture: typed "go left"';
  const sent = `capture: clicked "${whats.send}"`;
  const read = (lines: string[]) => steerEarlyReading(lines.join('\n'), unpressedClicks) as string | null;

  it('answers null for a dialog opened before the held reply was released, and text typed after it went', () => {
    expect(read([held, pressed, released, typedLine, sent])).toBeNull();
    // Pressed before the attach was even acknowledged: the send was unsettled then too.
    expect(read([pressed, held, released, typedLine, sent])).toBeNull();
  });

  it('names a launch that exercised no window', () => {
    expect(read([pressed, typedLine, sent])).toBe('the session.subscribe reply was not held');
    expect(read([held, released, pressed, typedLine, sent])).toBe('Steer the run was not pressed before the reply was released');
    expect(read([held, pressed, typedLine, released, sent])).toBe('the text was typed before the reply was released');
  });

  it('names a step never pressed', () => {
    expect(read([held, released, typedLine, sent])).toMatch(/Steer the run"\]" never pressed$/);
    expect(read([held, pressed, released, typedLine])).toBe('"Steer" never pressed');
  });
});
