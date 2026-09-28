import { describe, expect, it } from 'vitest';
import { createSuccessorWait, passFailedSentence } from './successor.js';

const settled = (p: Promise<void>): Promise<string> =>
  Promise.race([p.then(() => 'resolved', (e: unknown) => `rejected: ${(e as Error).message}`), new Promise<string>((r) => setTimeout(() => r('pending'), 20))]);

describe('the wait for the update successor — REQ-STARTUP-121, REQ-STARTUP-161 (ADR-0055)', () => {
  it('accepts an announcement only while a restart is waiting, and resolves once the record has passed', async () => {
    const wait = createSuccessorWait();
    expect(wait.accepting()).toBe(false);
    const started = wait.start(async () => undefined);
    expect(wait.accepting()).toBe(true);
    wait.passed();
    expect(await settled(started)).toBe('resolved');
    expect(wait.accepting()).toBe(false);
  });

  it('rejects, and stops accepting, when the successor cannot be started', async () => {
    const wait = createSuccessorWait();
    const started = wait.start(async () => { throw new Error('EACCES: cannot execute'); });
    expect(await settled(started)).toBe('rejected: EACCES: cannot execute');
    expect(wait.accepting()).toBe(false);
  });

  it('rejects with the reason, and stops accepting, when an accepted successor could not be given the record — the wait never stays armed', async () => {
    const wait = createSuccessorWait();
    const started = wait.start(async () => undefined);
    wait.failed('the instance record could not be replaced: EBUSY');
    expect(await settled(started)).toBe(`rejected: ${passFailedSentence('the instance record could not be replaced: EBUSY')}`);
    expect(wait.accepting()).toBe(false);
    // A later announcement is refused, and a later report changes nothing; a new restart may wait again.
    wait.passed();
    wait.failed('late');
    const again = wait.start(async () => undefined);
    expect(wait.accepting()).toBe(true);
    wait.passed();
    expect(await settled(again)).toBe('resolved');
  });

  it('a successor that never announces itself leaves the wait pending: no timeout of its own', async () => {
    const wait = createSuccessorWait();
    const started = wait.start(async () => undefined);
    expect(await settled(started)).toBe('pending');
    expect(wait.accepting()).toBe(true);
  });

  it('refuses a second wait while one is pending', async () => {
    const wait = createSuccessorWait();
    void wait.start(async () => undefined);
    expect(await settled(wait.start(async () => undefined))).toBe('rejected: a restart is already waiting for its successor');
  });
});
