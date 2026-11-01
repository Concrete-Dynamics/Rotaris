import { describe, expect, it, vi } from 'vitest';

/**
 * Mock hygiene, as `vitest.config.ts` sets it (R-091, hardening F1): nothing a test stubs outlives it. The first case
 * stubs an environment variable and a global, spies on a method and calls a mock; the second, which runs after it in
 * the same file, finds each undone. Without `restoreMocks`, `clearMocks`, `unstubEnvs` and `unstubGlobals` every
 * assertion of the second case fails, which is how a stub left in one test once reached the next unseen.
 */

const target = { answer: (): number => 42 };
const recorder = vi.fn();
const ENV = 'ROTARIS_TEST_MOCK_HYGIENE';
const GLOBAL = '__rotarisTestMockHygiene';

describe('mock hygiene between the tests of one file (vitest.config.ts)', () => {
  it('stubs, spies and calls', () => {
    vi.stubEnv(ENV, 'stubbed');
    vi.stubGlobal(GLOBAL, 'stubbed');
    vi.spyOn(target, 'answer').mockReturnValue(7);
    recorder('called');
    expect(process.env[ENV]).toBe('stubbed');
    expect((globalThis as Record<string, unknown>)[GLOBAL]).toBe('stubbed');
    expect(target.answer()).toBe(7);
    expect(recorder).toHaveBeenCalledTimes(1);
  });

  it('finds every stub undone, every spy restored and every call cleared', () => {
    expect(process.env[ENV]).toBeUndefined();
    expect(GLOBAL in globalThis).toBe(false);
    expect(target.answer()).toBe(42);
    expect(vi.isMockFunction(target.answer)).toBe(false);
    expect(recorder).not.toHaveBeenCalled();
  });
});
