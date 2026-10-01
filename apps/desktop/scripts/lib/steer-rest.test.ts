/**
 * `part-j-proof`'s steer-rest launch (REQ-MONITOR-134, PD-ORCH-005 clause 4): its click schedule puts the pause AFTER the
 * steer, and the store reading it asserts says the steer was pending when the pause was asked for
 * (`docs/defects/fixed/part-j-proofs-steer-rest-presses-pause-as-soon-as-the-run-starts.md`). The schedule is read
 * through the capture seam's own parser, so a step written in the waiting form is seen as one.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSteps } from '../../src/main/capture/host.js';
// @ts-expect-error — the schedule is plain ESM beside the proof that runs it.
import { NO_STEER_DIALOG, SEND_SETTLED, STEER_CLICKS, STEER_REST_CLICKS, STEER_REST_TYPE, STEER_REST_WHATS, STEER_TYPE, STEER_WHATS, steerPendingAtPause } from './steer-rest.mjs';

const clicks = parseSteps(STEER_REST_CLICKS as string);
const typed = parseSteps(STEER_REST_TYPE as string)[0]!;
const step = (what: string) => {
  const found = clicks.find((s) => (s.arg ?? s.selector) === what);
  if (!found) throw new Error(`no step logs as ${what}`);
  return found;
};
const whats = STEER_REST_WHATS as { steer: string; send: string; pause: string; continue: string };

describe("part-j-proof's steer-rest schedule (REQ-MONITOR-134, PD-ORCH-005)", () => {
  it('never looks for Pause before the dialog\'s Steer was pressed', () => {
    // The defect: `@~3400` looked at once and pressed the moment the run started, racing the Steer it was meant to follow.
    const pause = step(whats.pause);
    expect(pause.until).toBe(true);
    expect(pause.from).toBeGreaterThan(step(whats.send).at);
    expect(pause.at).toBeGreaterThan(pause.from!);
  });

  it('presses Pause only once no steer dialog is open — after the steer was accepted, never into the dialog', () => {
    expect(step(whats.pause).selector.startsWith(`${NO_STEER_DIALOG as string} `)).toBe(true);
  });

  it('opens the steer dialog only once the composer\'s send has settled, so the composer cannot take its focus back', () => {
    expect(step(whats.steer).selector.startsWith(`${SEND_SETTLED as string} `)).toBe(true);
  });

  it('types the steer only after the Steer control\'s wait has ended, and sends it after typing', () => {
    expect(step(whats.steer).until).toBe(true);
    expect(typed.arg).toBe('no-enter');
    expect(typed.at).toBeGreaterThan(step(whats.steer).at);
    expect(step(whats.send).until).toBe(false);
    expect(step(whats.send).at).toBeGreaterThan(typed.at);
  });

  it('logs every step under the name the proof reads its press back by', () => {
    expect(clicks.map((s) => s.arg ?? s.selector)).toEqual([whats.steer, whats.send, whats.pause, whats.continue]);
  });
});

describe('the steer was pending when the pause was asked for', () => {
  const ok = ['run_start', 'steering_submitted', 'run_pause_requested', 'steering_injected', 'run_end', 'run_start'];

  it('answers null for a steer submitted before the pause and injected by it', () => {
    expect(steerPendingAtPause(ok)).toBeNull();
  });

  it('names a pause requested before the steer — the race the Pause step ran', () => {
    expect(steerPendingAtPause(['run_start', 'run_pause_requested', 'steering_submitted', 'steering_injected'])).toBe('the pause was requested before the steer was submitted');
  });

  it('names a steer the run took before the pause, which left nothing pending', () => {
    expect(steerPendingAtPause(['run_start', 'steering_submitted', 'steering_injected', 'run_pause_requested'])).toMatch(/injected before the pause/);
  });

  it('names a launch that recorded no steer or no pause', () => {
    expect(steerPendingAtPause(['run_start', 'run_pause_requested'])).toBe('no steer was submitted');
    expect(steerPendingAtPause(['run_start', 'steering_submitted', 'run_end'])).toBe('no pause was requested');
  });
});

describe("part-j-proof's steer schedule, scenario 2 (REQ-MONITOR-133, REQ-MONITOR-137)", () => {
  // docs/defects/fixed/part-j-proofs-steer-launch-presses-steer-at-an-appointment-the-runs-start-can-miss.md: the launch
  // pressed Steer the run at a fixed 1900 ms, which a run starting later than that misses.
  const steps = parseSteps(STEER_CLICKS as string);
  const text = parseSteps(STEER_TYPE as string)[0]!;
  const w = STEER_WHATS as { steer: string; send: string };
  const at = (what: string) => {
    const found = steps.find((s) => (s.arg ?? s.selector) === what);
    if (!found) throw new Error(`no step logs as ${what}`);
    return found;
  };

  it('waits for Steer the run and for the composer\'s settled send, instead of pressing at an appointment', () => {
    expect(at(w.steer).until).toBe(true);
    expect(at(w.steer).selector.startsWith(`${SEND_SETTLED as string} `)).toBe(true);
  });

  it('types after the Steer step\'s deadline, and sends after typing', () => {
    expect(text.arg).toBe('no-enter');
    expect(text.at).toBeGreaterThan(at(w.steer).at);
    expect(at(w.send).until).toBe(false);
    expect(at(w.send).at).toBeGreaterThan(text.at);
  });

  it('is the steer-rest launch\'s steer, so the two launches cannot drift apart', () => {
    expect(steps).toEqual(clicks.slice(0, 2));
    expect(STEER_TYPE).toBe(STEER_REST_TYPE);
  });

  it('logs every step under the name the proof reads its press back by', () => {
    expect(steps.map((s) => s.arg ?? s.selector)).toEqual([w.steer, w.send]);
  });

  it('is the schedule part-j-proof\'s steer launch runs, and the proof asks that every step was pressed', () => {
    const proof = readFileSync(new URL('../part-j-proof.mjs', import.meta.url), 'utf8');
    const line = proof.split('\n').find((l) => l.includes("await launch('steer', s2,")) ?? '';
    expect(line).toContain('ROTARIS_CAPTURE_CLICKS: STEER_CLICKS');
    expect(line).toContain('ROTARIS_CAPTURE_TYPE: STEER_TYPE');
    expect(line).not.toMatch(/@\d/);
    expect(proof).toContain('unpressedClicks(steerLog, Object.values(STEER_WHATS))');
  });
});
