import { describe, expect, it } from 'vitest';
import type { CommandOutcome, LiveStatePayload } from '@rotaris/contracts';
import { createLiveStateArbiter, isEmptyLiveState } from './live-state.js';

/**
 * ADR-0037 Tier B / REQ-CONFIG-262 with REQ-SHELL-020, REQ-TOOLS-071/077 — the repair of
 * `docs/defects/a-settings-screens-live-state-outlives-the-screen-and-overrides-a-durable-write.md`.
 *
 * The run host keeps ONE live state for the whole process and overlays it on the files at every run start, so a state
 * left standing after its screen went outranks every durable write made since — the composer's permission-mode write
 * (`config.setField`, REQ-CONFIG-288) among them, which made a run the user armed `autonomous` resolve `ask`.
 * `pnpm mode-reset-proof` is the built app's own reading of that, before and after.
 *
 * The rule must live HERE, in main, rather than in one renderer: with two main windows (REQ-SHELL-020) a renderer cannot
 * see whether another window still holds a screen, and a window's close or reload destroys its document without running
 * React's cleanup at all. These cases are the rule, and two of them exist because the first attempt got them wrong:
 * **distinct states released in reverse order** (a set of identities is not enough — the survivor's VALUES must be
 * restored), and **a reload**, which reports neither a close nor a lost renderer.
 */
/** The states handed to the run host, in order, as a plain recorder — the shape `display-prefs.test.ts` uses. */
function scriptedSend() {
  const states: LiveStatePayload[] = [];
  const send = (state: LiveStatePayload): Promise<CommandOutcome> => { states.push(state); return Promise.resolve({ ok: true, value: {} }); };
  return { states, send };
}

const A = 11;
const B = 22;
const AUTONOMOUS = { runtime: { permission_mode: 'autonomous' }, circuitBreakerEnabled: true };
const RESTRICTED = { runtime: { permission_mode: 'restricted' }, circuitBreakerEnabled: false };

describe('the run host\'s one live state, and which window owns it (ADR-0037 Tier B, REQ-CONFIG-262)', () => {
  it('an empty payload is the "no live values" spelling every field of LiveState admits', () => {
    expect(isEmptyLiveState({})).toBe(true);
    expect(isEmptyLiveState({ runtime: {} })).toBe(false);
    expect(isEmptyLiveState(AUTONOMOUS)).toBe(false);
  });

  it('hands a window\'s values over, and tells the run host "none" only when the last holder lets go', () => {
    const s = scriptedSend();
    const live = createLiveStateArbiter({ send: s.send, log: () => undefined });
    live.publish(A, AUTONOMOUS);
    expect(s.states).toEqual([AUTONOMOUS]);
    expect(live.holders()).toBe(1);
    live.publish(B, AUTONOMOUS);
    // A published BEFORE B, so A's values were never the ones in force: its departure re-sends nothing.
    live.release(A);
    expect(live.holders()).toBe(1);
    expect(s.states).toEqual([AUTONOMOUS, AUTONOMOUS]);
    live.release(B);
    expect(live.holders()).toBe(0);
    expect(s.states).toEqual([AUTONOMOUS, AUTONOMOUS, {}]);
  });

  /**
   * The case the first attempt got wrong and the identical-state cases hid: a surviving window's VALUES must be
   * restored, not merely its membership — otherwise the run keeps resolving the DEPARTED window's settings while the
   * other window's screen is the one on screen (REQ-CONFIG-262's "what is on screen at that moment").
   */
  it('restores a surviving window\'s OWN values when another publisher leaves — distinct states, released in reverse', () => {
    const s = scriptedSend();
    const live = createLiveStateArbiter({ send: s.send, log: () => undefined });
    live.publish(A, RESTRICTED);
    live.publish(B, AUTONOMOUS);
    live.release(B);
    // A holds a screen, so its values are the live state — not B's, which the run host was holding a moment ago.
    expect(s.states).toEqual([RESTRICTED, AUTONOMOUS, RESTRICTED]);
    live.release(A);
    expect(s.states).toEqual([RESTRICTED, AUTONOMOUS, RESTRICTED, {}]);
  });

  it('the same holds for a window whose document went rather than its screen', () => {
    const s = scriptedSend();
    const live = createLiveStateArbiter({ send: s.send, log: () => undefined });
    live.publish(A, RESTRICTED);
    live.publish(B, AUTONOMOUS);
    live.gone(B);
    expect(s.states).toEqual([RESTRICTED, AUTONOMOUS, RESTRICTED]);
  });

  /** The most recent publisher among the survivors is the one the run host holds — the product's existing tie-break. */
  it('a re-publish makes a window the owner again, and the most recent survivor wins', () => {
    const s = scriptedSend();
    const live = createLiveStateArbiter({ send: s.send, log: () => undefined });
    live.publish(A, RESTRICTED);
    live.publish(B, AUTONOMOUS);
    live.release(A);
    // A left, B survives: B's values.
    expect(s.states[s.states.length - 1]).toEqual(AUTONOMOUS);
    live.publish(A, RESTRICTED);
    // A came back and published last, so A's values are the state again.
    expect(s.states[s.states.length - 1]).toEqual(RESTRICTED);
    live.release(A);
    // A left once more; B survives, so B's values return rather than A's staying.
    expect(s.states[s.states.length - 1]).toEqual(AUTONOMOUS);
    live.release(B);
    expect(s.states[s.states.length - 1]).toEqual({});
  });

  it('a window that never published lets go silently, and a second release says nothing twice', () => {
    const s = scriptedSend();
    const live = createLiveStateArbiter({ send: s.send, log: () => undefined });
    live.release(A);
    live.release(A);
    expect(s.states).toEqual([]);
    live.publish(A, AUTONOMOUS);
    live.release(A);
    live.release(A);
    expect(s.states).toEqual([AUTONOMOUS, {}]);
  });

  it('a window\'s DOCUMENT going lets go too, because a close and a reload run no React cleanup', () => {
    const s = scriptedSend();
    const live = createLiveStateArbiter({ send: s.send, log: () => undefined });
    live.publish(A, AUTONOMOUS);
    live.gone(A);
    expect(s.states).toEqual([AUTONOMOUS, {}]);
    expect(live.holders()).toBe(0);
  });

  it('the last holder going is what counts, for a close exactly as for leaving Settings', () => {
    const s = scriptedSend();
    const live = createLiveStateArbiter({ send: s.send, log: () => undefined });
    live.publish(A, RESTRICTED);
    live.publish(B, AUTONOMOUS);
    // A published before B, so A's values were never in force and its document going re-sends nothing.
    live.gone(A);
    expect(s.states).toEqual([RESTRICTED, AUTONOMOUS]);
    // B was the owner, so ITS document going is what leaves the run host with nothing.
    live.gone(B);
    expect(s.states).toEqual([RESTRICTED, AUTONOMOUS, {}]);
  });

  it('a window publishing the empty state is ignored, never read as a release', () => {
    const lines: string[] = [];
    const s = scriptedSend();
    const live = createLiveStateArbiter({ send: s.send, log: (m) => { lines.push(m); } });
    live.publish(A, AUTONOMOUS);
    live.publish(B, {});
    expect(live.holders()).toBe(1);
    expect(s.states).toEqual([AUTONOMOUS]);
    expect(lines.some((l) => l.includes('empty live state'))).toBe(true);
    // And the real owner's release still lands, so the ignored publish did not hold the slot.
    live.release(A);
    expect(s.states).toEqual([AUTONOMOUS, {}]);
  });

  it('a refused or unreachable hand-over is reported and never thrown at a window\'s teardown', async () => {
    const lines: string[] = [];
    const live = createLiveStateArbiter({
      send: (state) => (isEmptyLiveState(state) ? Promise.reject(new Error('the channel is gone')) : Promise.resolve({ ok: false, code: 'config.live-state-invalid', headline: 'The live settings were refused' })),
      log: (m) => { lines.push(m); },
    });
    live.publish(A, AUTONOMOUS);
    await Promise.resolve();
    await Promise.resolve();
    expect(lines.some((l) => l.includes('were refused'))).toBe(true);
    // A teardown must not throw: `gone` runs inside the window's close path.
    expect(() => live.gone(A)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(lines.some((l) => l.includes('could not be handed over'))).toBe(true);
  });
});
