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

/**
 * The real-process suites run as a project of their own, after every other file (`REAL_PROCESS_SUITES` in
 * `vitest.config.ts`): one file at a time on a host with fewer than eight cores, half the cores' worth above that
 * (`realProcessWorkers`). What is held here is the list and the split: a path that names no file
 * would leave a suite in neither project's intent, and a file in both would run twice, once beside everything else.
 */
describe('the real-process suites are a project of their own (vitest.config.ts)', () => {
  it('every listed path names at least one test file, and the two projects share none', async () => {
    const { REAL_PROCESS_SUITES, realProcessWorkers, default: config } = await import('../vitest.config.js');
    const { availableParallelism } = await import('node:os');
    const { globSync } = await import('node:fs');
    const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    for (const pattern of REAL_PROCESS_SUITES) expect(globSync(pattern, { cwd: root }).length, pattern).toBeGreaterThan(0);
    const projects = (config as { test?: { projects?: { test: { name: string; include: string[]; exclude: string[]; fileParallelism?: boolean; maxWorkers?: number; sequence?: { groupOrder?: number } } }[] } }).test?.projects ?? [];
    expect(projects.map((p) => p.test.name)).toEqual(['parallel', 'real-process']);
    const [parallel, real] = projects as [typeof projects[number], typeof projects[number]];
    // The parallel project leaves out exactly what the other takes in.
    for (const pattern of REAL_PROCESS_SUITES) expect(parallel.test.exclude).toContain(pattern);
    expect(real.test.include).toEqual([...REAL_PROCESS_SUITES]);
    // One file at a time below eight cores (the hosted runners' four among them), half the cores above; and only once the
    // parallel project has finished.
    expect([1, 2, 4, 7].map(realProcessWorkers)).toEqual([1, 1, 1, 1]);
    expect([8, 16, 24].map(realProcessWorkers)).toEqual([4, 8, 12]);
    const workers = realProcessWorkers(availableParallelism());
    expect(real.test.maxWorkers).toBe(workers);
    expect(real.test.fileParallelism).toBe(workers > 1);
    expect(real.test.sequence?.groupOrder ?? 0).toBeGreaterThan(parallel.test.sequence?.groupOrder ?? 0);
  });
});
