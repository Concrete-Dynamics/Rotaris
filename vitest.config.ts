import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';

// ADR-0001 consequence 5 / ADR-0056: the requirement-symbol artifact is
// regenerated before collection, by the same generator the build uses.
const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * The suites that drive a real process and read what the operating system has done with it: a shell through a real
 * PTY, Git against a scratch repository, a stdio child, a recording proxy and its client. Each takes a reading that is
 * only true once the host has got round to it — a process gone from the task list, a handle released, a prompt
 * returned — and beside some 570 other files on a hosted Windows runner's four cores the host had not, in a different
 * one of these files each time
 * (docs/defects/the-windows-gate-goes-red-on-a-different-test-each-time-on-one-tree.md). They run as a project of their
 * own, after every other file has finished: the readings are taken on a host that is doing nothing else but these
 * suites, `realProcessWorkers` of them at a time. Nothing is retried and no bound is widened; a red in one of them is a
 * red.
 *
 * A file belongs here when it spawns a real process and asserts on timing or on operating-system state. Add it by
 * path; `tools/vitest-config.test.ts` holds that every path here names files.
 */
export const REAL_PROCESS_SUITES: readonly string[] = [
  'packages/agent-tools/src/terminal/**/*.test.ts',
  'apps/desktop/src/main/terminal-load.test.ts',
  'apps/desktop/scripts/lib/terminal-shapes.test.ts',
  'apps/desktop/scripts/lib/model-traffic.test.ts',
  'packages/mcp/src/mcp.test.ts',
  'packages/workspace/src/git/**/*.test.ts',
  'packages/workspace/src/delivery/runs.test.ts',
  'tools/worktree/**/*.test.ts',
  'tools/check-conflict-markers.test.ts',
];

/**
 * How many real-process files run side by side. One on a host with fewer than eight cores — the hosted runners, where
 * the readings went red beside other work — and half the cores above that, where most of each file's time is a wait on
 * a shell and a core stays free for every one of them (the owner, 2026-11-20: the whole suite took 282 s on 24 cores,
 * 245 s of them these files in a row).
 */
export const realProcessWorkers = (cores: number): number => (cores < 8 ? 1 : Math.floor(cores / 2));
const REAL_PROCESS_WORKERS = realProcessWorkers(availableParallelism());
const EXCLUDED = ['**/node_modules/**', '**/dist/**', '**/out/**'];

export default defineConfig({
  // The build-time verification flag (`apps/desktop/src/main/seams.d.ts`): true in every build but the packaged one, so
  // tests run the seams as an ordinary build compiles them in. Its false side is the packaged build's, which
  // `apps/desktop/scripts/package.mjs`'s seam check asserts on the artifact.
  define: { __ROTARIS_SEAMS__: 'true' },
  resolve: {
    alias: {
      '@rotaris/kernel': `${root}packages/kernel/src/index.ts`,
      '@rotaris/contracts': `${root}packages/contracts/src/index.ts`,
      '@rotaris/platform': `${root}packages/platform/src/index.ts`,
      '@rotaris/config': `${root}packages/config/src/index.ts`,
      '@rotaris/hooks': `${root}packages/hooks/src/index.ts`,
      '@rotaris/providers': `${root}packages/providers/src/index.ts`,
      '@rotaris/store': `${root}packages/store/src/index.ts`,
      '@rotaris/engine': `${root}packages/engine/src/index.ts`,
      '@rotaris/agent-tools': `${root}packages/agent-tools/src/index.ts`,
      '@rotaris/model': `${root}packages/model/src/index.ts`,
      '@rotaris/mcp': `${root}packages/mcp/src/index.ts`,
      '@rotaris/workspace': `${root}packages/workspace/src/index.ts`,
      '@rotaris/shell': `${root}packages/shell/src/index.ts`,
      '@rotaris/ui-core': `${root}packages/ui-core/src/index.ts`,
      '@rotaris/ui': `${root}packages/ui/src/index.ts`,
      '@rotaris/release-naming': `${root}tools/release-naming/src/index.ts`,
    },
  },
  test: {
    // Two projects over one configuration (`extends: true`): every file but the real-process suites, in parallel; then
    // those suites alone, `REAL_PROCESS_WORKERS` files at a time (`sequence.groupOrder`: a higher group starts when the
    // lower has finished).
    projects: [
      { extends: true, test: { name: 'parallel', include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tools/**/*.test.ts'], exclude: [...EXCLUDED, ...REAL_PROCESS_SUITES], sequence: { groupOrder: 0 } } },
      { extends: true, test: { name: 'real-process', include: [...REAL_PROCESS_SUITES], exclude: EXCLUDED, fileParallelism: REAL_PROCESS_WORKERS > 1, maxWorkers: REAL_PROCESS_WORKERS, sequence: { groupOrder: 1 } } },
    ],
    globalSetup: ['./tools/symbol-artifact/global-setup.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Mock hygiene (R-091, hardening F1): before each test every spy is restored and its calls cleared, and every
    // `vi.stubEnv` and `vi.stubGlobal` is undone, so nothing one test stubs leaks into the next in its file
    // (`tools/vitest-config.test.ts` pins all four).
    restoreMocks: true,
    clearMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    // Coverage (R-091, hardening F1): measured by `pnpm test:coverage` (`vitest run --coverage`), never by `pnpm test` or
    // the gate, whose time is the owner's budget; CI's gate job runs it after `pnpm check` (hardening G2). The floor only
    // rises: `autoUpdate` rewrites the four figures below in this file, rounded down to the integer, whenever a whole-suite run
    // measures more, and that rewrite is committed with the change that earned it. A run below a figure fails.
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/desktop/src/**/*.{ts,tsx}'],
      exclude: ['**/generated/**', '**/*.test.ts', '**/*.test-support.ts', '**/spike/**', '**/*.d.ts'],
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        autoUpdate: (measured: number) => Math.floor(measured),
        lines: 75,
        functions: 64,
        branches: 64,
        statements: 71,
      },
    },
  },
});
