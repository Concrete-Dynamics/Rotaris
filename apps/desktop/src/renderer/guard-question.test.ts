import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { joinOrAsk, settleGuard, type CloseGuardHost, type PendingGuardQuestion } from './guard-question.js';

describe('the unsaved-settings question is one per window (REQ-SHELL-124, OQ-311)', () => {
  it('two overlapping askings open one question and both settle with its one answer', async () => {
    const slot: PendingGuardQuestion = { current: null };
    const opened: ((proceed: boolean) => void)[] = [];
    const first = joinOrAsk(slot, (answer) => { opened.push(answer); });
    const second = joinOrAsk(slot, (answer) => { opened.push(answer); });
    expect(opened).toHaveLength(1);
    opened[0]!(false);
    expect(await first).toBe(false);
    expect(await second).toBe(false);
    expect(slot.current).toBeNull();
  });

  it('an asking after the answer opens a fresh question', async () => {
    const slot: PendingGuardQuestion = { current: null };
    const opened: ((proceed: boolean) => void)[] = [];
    const first = joinOrAsk(slot, (answer) => { opened.push(answer); });
    opened[0]!(true);
    expect(await first).toBe(true);
    const next = joinOrAsk(slot, (answer) => { opened.push(answer); });
    expect(opened).toHaveLength(2);
    opened[1]!(false);
    expect(await next).toBe(false);
  });

  it('a second answer to one question changes nothing', async () => {
    const slot: PendingGuardQuestion = { current: null };
    let answer: ((proceed: boolean) => void) | undefined;
    const asked = joinOrAsk(slot, (a) => { answer = a; });
    answer!(true);
    answer!(false);
    expect(await asked).toBe(true);
    expect(slot.current).toBeNull();
  });
});

describe('an answer that lets the close go ahead takes the published close guard down before it is given (accept1-9)', () => {
  const guard = (): Promise<boolean> => Promise.resolve(false);
  it('Save that succeeded, or Discard: the guard is gone when the answer arrives, so a probe after it finds none', () => {
    const host: CloseGuardHost = { __rotarisCloseGuard: guard };
    let seen: unknown = 'unanswered';
    settleGuard(host, () => { seen = host.__rotarisCloseGuard; }, true);
    expect(seen).toBeUndefined();
    expect(host.__rotarisCloseGuard).toBeUndefined();
  });
  it('Cancel, or a Save that failed: the guard stays up, the form being still dirty', () => {
    const host: CloseGuardHost = { __rotarisCloseGuard: guard };
    let answered: boolean | null = null;
    settleGuard(host, (proceed) => { answered = proceed; }, false);
    expect(answered).toBe(false);
    expect(host.__rotarisCloseGuard).toBe(guard);
  });
});

/**
 * The Settings hook mounts under Electron, with a preload no `node` test environment reaches, so its use of the join is
 * pinned by its source (the pattern `settings-form-wiring.test.ts` states): the guard asks through `joinOrAsk`, and no longer
 * opens a promise of its own that replaces `guarding`. The behaviour is the cases above.
 */
describe('the Settings hook asks its guard through joinOrAsk (OQ-311)', () => {
  const text = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
  it('joins an open question rather than replacing it', () => {
    expect(text).toContain('return joinOrAsk(openQuestion.current, (answer) => setGuarding({ resolve: answer }));');
    expect(text).not.toContain('new Promise<boolean>((resolve) => setGuarding({ resolve }))');
  });
  it('answers Save, Discard and Cancel through settleGuard, never by resolving the question bare', () => {
    expect(text).toContain('settleGuard(window as unknown as CloseGuardHost, g.resolve, r.ok)');
    expect(text).toContain('settleGuard(window as unknown as CloseGuardHost, g.resolve, true)');
    expect(text).toContain('settleGuard(window as unknown as CloseGuardHost, g.resolve, false)');
    expect(text).not.toMatch(/g\.resolve\((?:r\.ok|true|false)\)/);
  });
});
