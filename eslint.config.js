// @ts-check
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import { createNodeResolver, importX } from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import globals from 'globals';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import rotaris from './tools/eslint-rules/index.js';

/**
 * The dependency matrix of docs/architecture — packages follow process
 * boundaries, and arrows point downward only. A violation fails `pnpm lint`,
 * not review. See docs/architecture/README.md §1 and constraints W-01, W-02,
 * W-18, W-19.
 *
 * Element types are package directories. `apps/desktop` is split into its five
 * composition roots so that the renderer cannot reach platform or store, and
 * main cannot reach store.
 */
const ELEMENTS = [
  { type: 'kernel', pattern: 'packages/kernel/**' },
  { type: 'contracts', pattern: 'packages/contracts/**' },
  { type: 'platform', pattern: 'packages/platform/**' },
  // ADR-0036's loader (first slice) sits below every process-side package that reads configuration; hooks (ADR-0015) beside model.
  { type: 'config', pattern: 'packages/config/**' },
  { type: 'hooks', pattern: 'packages/hooks/**' },
  // ADR-0028/0029/0030 (Part K): providers sit beside hooks over config; instantiated by main, which leases bearers to the run host.
  { type: 'providers', pattern: 'packages/providers/**' },
  { type: 'store', pattern: 'packages/store/**' },
  { type: 'engine', pattern: 'packages/engine/**' },
  { type: 'agent-tools', pattern: 'packages/agent-tools/**' },
  { type: 'model', pattern: 'packages/model/**' },
  { type: 'mcp', pattern: 'packages/mcp/**' },
  { type: 'workspace', pattern: 'packages/workspace/**' },
  { type: 'shell', pattern: 'packages/shell/**' },
  { type: 'ui-core', pattern: 'packages/ui-core/**' },
  { type: 'ui', pattern: 'packages/ui/**' },
  { type: 'release-naming', pattern: 'tools/release-naming/**' },
  { type: 'app-main', pattern: 'apps/desktop/src/main/**' },
  { type: 'app-preload', pattern: 'apps/desktop/src/preload/**' },
  { type: 'app-renderer', pattern: 'apps/desktop/src/renderer/**' },
  { type: 'app-run-host', pattern: 'apps/desktop/src/run-host/**' },
  { type: 'app-workspace-service', pattern: 'apps/desktop/src/workspace-service/**' },
];

/** @type {Record<string, string[]>} allowed imports, by element type */
const ALLOW = {
  kernel: [],
  contracts: ['kernel'],
  platform: ['kernel'],
  store: ['kernel', 'platform'],
  config: ['kernel', 'contracts', 'platform'],
  hooks: ['kernel', 'contracts', 'platform', 'config'],
  providers: ['kernel', 'contracts', 'platform', 'config'],
  // engine → model: the run loop drives `AgentBackend` (ADR-0026); model sits over kernel only, so the arrow still points down.
  engine: ['kernel', 'contracts', 'store', 'platform', 'model', 'config'],
  'agent-tools': ['kernel', 'contracts', 'store', 'platform', 'config'],
  model: ['kernel'],
  mcp: ['kernel', 'platform'],
  workspace: ['kernel', 'contracts', 'store', 'platform', 'config'],
  shell: ['kernel', 'contracts', 'platform', 'release-naming'],
  'ui-core': ['kernel', 'contracts'],
  ui: ['kernel', 'contracts', 'ui-core'],
  'release-naming': [],
  'app-main': ['kernel', 'contracts', 'platform', 'shell', 'release-naming', 'providers', 'config'],
  'app-preload': ['contracts'],
  'app-renderer': ['kernel', 'contracts', 'ui-core', 'ui'],
  'app-run-host': ['kernel', 'contracts', 'platform', 'store', 'engine', 'agent-tools', 'model', 'mcp', 'config', 'hooks'],
  'app-workspace-service': ['kernel', 'contracts', 'platform', 'store', 'workspace', 'config'],
};

const boundaryRules = Object.entries(ALLOW).map(([from, allow]) => ({
  from: [from],
  allow: allow.map((type) => ({ to: { element: { type } } })),
}));

// Engine code (ADR-0006): no bare timers, no Date.now, no performance.now.
const ENGINE_CODE = [
  'packages/kernel/src/**',
  'packages/engine/src/**',
  'packages/agent-tools/src/**',
  'packages/workspace/src/**',
  'packages/store/src/**',
  'packages/platform/src/**',
  'packages/config/src/**',
  'packages/hooks/src/**',
  'packages/providers/src/**',
  'packages/model/src/**',
  'packages/mcp/src/**',
  'apps/desktop/src/run-host/**',
  'apps/desktop/src/workspace-service/**',
];

/**
 * Import hygiene (R-091, hardening.md §3.5 row 3): a package imports only what its own `package.json` declares, or the
 * root's devDependencies where it is a test, a tool or configuration. Every workspace package with a manifest gets its
 * own block, so `packageDir` names that manifest and the root's; files under no such package answer to the root's.
 */
const ROOT = import.meta.dirname;
const WORKSPACE_PACKAGES = ['packages', 'apps', 'tools'].flatMap((group) =>
  readdirSync(join(ROOT, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, group, entry.name, 'package.json')))
    .map((entry) => `${group}/${entry.name}`),
);
/** Where a devDependency may be imported: tests and their support, the tools, the proof scripts, configuration. */
const DEV_FILES = ['**/*.test.{ts,tsx}', '**/*.test-support.ts', '**/vitest.config.ts', '**/electron.vite.config.ts', 'eslint.config.js', 'tools/**', 'apps/desktop/scripts/**', '.agents/**'];
// `includeInternal`: the workspace's own `@rotaris/*` packages count as internal (`import-x/internal-regex` below), and a
// package importing one its manifest does not declare is as extraneous as a third-party one.
/** @type {(packageDir: string[], devDependencies: boolean | string[]) => ['error', Record<string, unknown>]} */
const extraneous = (packageDir, devDependencies) => ['error', { packageDir, devDependencies, optionalDependencies: false, peerDependencies: true, includeInternal: true }];

export default tseslint.config(
  {
    // The proof directories hold scratch workspaces a real model may write code into (the slice's third prompt did).
    ignores: ['.proof/**', '**/node_modules/**', '.live-run/**', '**/dist/**', '**/out/**', '**/release/**', 'docs/**', '.slice-proof/**', '.overview-proof/**', '.fetch-proof/**', '.git-proof/**', '.resilience-proof/**', '.checkpoint-proof/**', '.sessions-proof/**', '.mcp-proof/**', '.part-h-proof/**', '.part-j-proof/**', '.config-proof/**', '.theme-proof/**', 'packages/kernel/src/generated/**', 'packages/*/spike/**', '.mission-proof/**', '.artifacts-proof/**', '.code-intel-proof/**', '.library-proof/**', 'apps/desktop/resources/**', 'apps/desktop/.cache/**', '.traceability-proof/**', '.requirements-proof/**' /* Part AK2 — the board proof's evidence directory (the plan's Reservations, ruled 2026-09-09: both files); delivery-proof never had a line here */,
      // Part AP
      '.requirements-runs-proof/**', '.chat-controls-proof/**',
      // The driver (2026-09-11): the scratch profile a driven app runs against, and its proof's evidence.
      '.drive/**', '.driver-proof/**', '.layout-proof/**',
      // `pnpm test:coverage`'s report (R-091, hardening F1): generated HTML and lcov, never linted.
      'coverage/**',
      // The proof scripts are linted since R-091 (hardening.md §3.5 row 4); what they hand the model or the traceability
      // proof as a workspace is material, not tooling, and stays out as `tsconfig.scripts.json` leaves it out.
      'apps/desktop/scripts/fixtures/todo-app/**', 'apps/desktop/scripts/fixtures/requirements-store/**'],
  },
  // Type-aware (R-091, hardening.md §3.5 row 1): every TypeScript file is parsed against its project, so the rules
  // that need types (a dropped promise, a switch that misses a member) run in the gate. The stylistic set stays out.
  // Since R-091: a disable directive that suppresses nothing fails the gate, as a warning does (`--max-warnings 0`).
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  ...tseslint.configs.recommendedTypeChecked,
  // The JavaScript files (the tools' and proof scripts' `.mjs`, this file) keep the untyped `recommended` rules: their
  // types are checked by `pnpm typecheck` (`tsconfig.scripts.json`, `checkJs`), not by the type-aware lint.
  { files: ['**/*.{js,mjs,cjs}'], ...tseslint.configs.disableTypeChecked },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        // Every TypeScript file belongs to a project the root solution references (`tsconfig.json`; R-091, hardening.md
        // §3.5 row 4), the tests and tools included, so none is linted against a default project.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: false }],
      // A rejection handed on as it arrived (a caught `unknown`, a promise's own reason) is passed through unchanged.
      '@typescript-eslint/prefer-promise-reject-errors': ['error', { allowThrowingUnknown: true }],
      // Off, measured (hardening.md §3.5 row 1): the first type-aware run raised 308, and the sampled ones in the run
      // loop are TypeScript's narrowing kept across an `await` or a callback that mutates the value (a stop requested
      // while a turn awaited, a timeout's flag set by its timer), where removing the check changes behaviour. Turning
      // it on is the `strict-type-checked` plan's, which reads each site (hardening.md §4).
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // Off: an `async` function with no `await` is how this codebase implements a promise-returning port with a
      // synchronous body (the fakes and stubs behind every `ToolPort`, `ModelClient` and store reader, and the
      // command handlers that return a value or throw): `async` turns its throw into a rejection, which a plain
      // function returning `Promise.resolve(…)` would not. The first type-aware run counted 954 such functions.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { boundaries, rotaris },
    settings: {
      'boundaries/elements': ELEMENTS,
      'boundaries/ignore': ['**/*.test.ts', '**/*.test.tsx', 'tools/**', 'vitest.config.ts', 'eslint.config.js'],
      'import/resolver': { typescript: { project: './tsconfig.json' } },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      'boundaries/element-types': ['error', { default: 'disallow', rules: boundaryRules }],
      'boundaries/no-unknown': 'off',
      'boundaries/no-unknown-files': 'off',
      // Electron is imported only in the composition roots and shell's adapters.
      'rotaris/no-electron-outside-roots': 'error',
    },
  },
  {
    // Import hygiene beside the boundaries plugin (R-091, hardening.md §3.5 row 3): the boundaries matrix polices the
    // edges between the workspace's elements; these rules police the import graph itself and the manifests.
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    plugins: { 'import-x': importX },
    settings: {
      // `import-x`'s own TypeScript settings (`flatConfigs.typescript`): without the parser named for `.ts`, the rules
      // that read the imported module (`no-cycle`) cannot parse it and see no edge at all.
      ...importX.flatConfigs.typescript.settings,
      // The workspace's packages are internal, not external: import-x counts any module outside the linted file's own
      // package as external, so without this `ignoreExternal` below skipped every `@rotaris/*` edge and a cycle that
      // crossed packages went unseen (review of R-091's landing). Third-party modules stay external and untraversed.
      'import-x/internal-regex': '^@rotaris/',
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: join(ROOT, 'tsconfig.json') }), createNodeResolver()],
    },
    rules: {
      'import-x/no-cycle': ['error', { maxDepth: Infinity, ignoreExternal: true }],
      'import-x/no-duplicates': 'error',
      'import-x/no-self-import': 'error',
      'import-x/no-extraneous-dependencies': extraneous([ROOT], DEV_FILES),
    },
  },
  ...WORKSPACE_PACKAGES.map((dir) => ({
    files: [`${dir}/**/*.{ts,tsx,mts,cts,js,mjs,cjs}`],
    rules: {
      // `apps/desktop` is bundled by electron-vite, which inlines its devDependencies (the workspace packages among
      // them) and keeps `dependencies` external: there a devDependency is a bundled dependency, not a tool.
      'import-x/no-extraneous-dependencies': extraneous([join(ROOT, dir), ROOT], dir === 'apps/desktop' ? true : DEV_FILES),
    },
  })),
  {
    // The `any`-flow rules hold product code, not tests: vitest's asymmetric matchers (`expect.any`,
    // `expect.stringContaining`) are typed `any`, and a test reads a stored record back through `JSON.parse`. The tools'
    // `.mjs` are typed since E2 (`tsconfig.scripts.json`, hardening.md §3.5 row 4), but a listed typecheck exception's
    // exports are still inferred, often as `any`.
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    // The tooling's typecheck exceptions (R-091, hardening.md §3.5 row 4): a file `tsconfig.scripts.json` cannot check yet
    // opens with `// @ts-nocheck — <why>`, listed in `tools/typecheck-exceptions.json`, whose test holds the two together
    // and lets the list only shrink. Everywhere else the recommended ban stands.
    files: ['apps/desktop/scripts/**/*.{mjs,cjs,js}', 'tools/**/*.{mjs,js}'],
    rules: {
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-nocheck': 'allow-with-description' }],
    },
  },
  {
    // A CommonJS file loads its modules with `require`: Electron's preload and main of the terminal proof's page, the
    // packaging hooks electron-builder loads, the fd gate `--require` puts in front of it.
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // The proof libraries hand the renderer functions as source (`READ_LONGTASKS`, a wait condition, a probe), and their
    // tests rebuild them with `new Function` exactly as the page evaluates them, which is the thing under test.
    files: ['apps/desktop/scripts/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-implied-eval': 'off',
    },
  },
  {
    files: ENGINE_CODE,
    // The two named exceptions: kernel's FakeClock (it IS a clock) and platform's adapter (it IS the adapter).
    ignores: ['**/*.test.ts', 'packages/kernel/src/clock/**', 'packages/platform/src/clock.ts'],
    rules: {
      'rotaris/no-bare-timers': 'error',
    },
  },
  {
    // ADR-0031 (accepted narrowed, R-049): money.ts is the one place arithmetic on an amount lives.
    files: ['packages/*/src/**/*.{ts,tsx}', 'apps/desktop/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', 'packages/kernel/src/money.ts'],
    rules: {
      'rotaris/money-only-in-money-ts': 'error',
    },
  },
  {
    files: ['packages/ui/src/**/*.{ts,tsx}', 'apps/desktop/src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
    },
  },
  {
    // Sandboxed renderer: no Node built-ins, ever (ADR-0044).
    files: ['packages/ui/src/**', 'packages/ui-core/src/**', 'apps/desktop/src/renderer/**', 'apps/desktop/src/preload/**'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      // `node:*` holds every built-in's prefixed form; the bare names are listed one by one (R-091 added the network,
      // crypto and worker modules a sandboxed renderer has no more than it has a file system).
      'no-restricted-imports': ['error', { patterns: [{ group: ['node:*', 'fs', 'fs/*', 'path', 'os', 'child_process', 'crypto', 'net', 'http', 'https', 'http2', 'tls', 'dgram', 'dns', 'worker_threads', 'cluster', 'better-sqlite3'], message: 'Renderer code has no filesystem, no network socket, no process and no store handle (ADR-0044, W-01).' }] }],
    },
  },
  {
    // R-091 (the Electron security checklist, items 3, 4, 6, 8, 9 and 10): every window is built from secureWebPreferences().
    files: ['apps/desktop/src/**/*.{ts,tsx}', 'packages/shell/src/electron/**/*.{ts,tsx}'],
    rules: {
      'rotaris/browser-window-uses-secure-prefs': 'error',
    },
  },
  {
    // R-092 (ReqToCode §4.6): every requirement or directive identifier a file cites — in a comment, a string, a test
    // name — resolves against the generated artifact; a withdrawn, superseded or retired one is cited only as history.
    // The coverage report's own directory is left out as that report leaves it out: its fixtures are made up.
    files: ['packages/**/*.{ts,tsx,js,mjs,cjs}', 'apps/**/*.{ts,tsx,js,mjs,cjs}', 'tools/**/*.{ts,tsx,js,mjs,cjs}'],
    ignores: ['tools/requirement-coverage/**'],
    rules: {
      // OQ-491's pending entry for REQ-ORCH-153 left with its ruling (2026-11-04): PD-ORCH-002 revision 4 narrows it.
      'rotaris/requirement-citations-resolve': 'error',
    },
  },
);
