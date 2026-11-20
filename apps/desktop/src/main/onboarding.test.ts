import { describe, expect, it } from 'vitest';
import { createOnboarding, type OnboardingState } from './onboarding.js';

function harness(initial: OnboardingState) {
  let state = initial;
  const lines: string[] = [];
  const onboarding = createOnboarding({
    readState: () => state,
    writeState: async (next) => { state = next; },
    log: (m) => lines.push(m),
  });
  return { onboarding, state: () => state, lines };
}

describe('the first-launch setup (PD-WORKSPACE-010)', () => {
  it('is owed at a launch that found no project, and stores that it began', () => {
    const h = harness(undefined);
    expect(h.onboarding.begin(true)).toBe(true);
    expect(h.onboarding.owed()).toBe(true);
    expect(h.state()).toBe('started');
  });

  it('is never begun by a launch that has a project, so an installation from before the directive sees none', () => {
    const h = harness(undefined);
    expect(h.onboarding.begin(false)).toBe(false);
    expect(h.state()).toBeUndefined();
  });

  it('stays owed across launches once begun, whatever the later launch opens', () => {
    const h = harness('started');
    expect(h.onboarding.begin(false)).toBe(true);
  });

  it('is not owed once ended, at a launch that again finds no project', () => {
    const h = harness('done');
    expect(h.onboarding.begin(true)).toBe(false);
  });

  it('ends once: finishing stores done, and a second finish changes nothing', async () => {
    const h = harness(undefined);
    h.onboarding.begin(true);
    expect(await h.onboarding.finish('skipped')).toBe(true);
    expect(h.state()).toBe('done');
    expect(h.onboarding.owed()).toBe(false);
    expect(await h.onboarding.finish('completed')).toBe(false);
  });

  it('is still shown for the launch when the started state cannot be stored', async () => {
    const lines: string[] = [];
    const onboarding = createOnboarding({ readState: () => undefined, writeState: () => Promise.reject(new Error('disk full')), log: (m) => lines.push(m) });
    expect(onboarding.begin(true)).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(lines.some((l) => l.includes('could not be stored'))).toBe(true);
  });
});
