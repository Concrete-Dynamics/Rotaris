import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// ADR-0001 consequence 5 / ADR-0056: the requirement-symbol artifact is
// regenerated before collection, by the same generator the build uses.
const root = fileURLToPath(new URL('.', import.meta.url));

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
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tools/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**'],
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
    // the gate, whose time is the owner's budget; CI, once hardening bundle G2 wires it in. The floor only rises:
    // `autoUpdate` rewrites the four figures below in this file, rounded down to the integer, whenever a whole-suite run
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
