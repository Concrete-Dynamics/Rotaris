// @ts-check
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
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

export default tseslint.config(
  {
    // The proof directories hold scratch workspaces a real model may write code into (the slice's third prompt did).
    ignores: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/release/**', 'docs/**', '.slice-proof/**', '.overview-proof/**', '.fetch-proof/**', '.git-proof/**', '.resilience-proof/**', '.checkpoint-proof/**', '.part-h-proof/**', '.part-j-proof/**', '.config-proof/**', '.theme-proof/**', 'packages/kernel/src/generated/**', 'apps/desktop/scripts/**', 'packages/*/spike/**'],
  },
  ...tseslint.configs.recommended,
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
    files: ENGINE_CODE,
    // The two named exceptions: kernel's FakeClock (it IS a clock) and platform's adapter (it IS the adapter).
    ignores: ['**/*.test.ts', 'packages/kernel/src/clock/**', 'packages/platform/src/clock.ts'],
    rules: {
      'rotaris/no-bare-timers': 'error',
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
      'no-restricted-imports': ['error', { patterns: [{ group: ['node:*', 'fs', 'path', 'os', 'child_process', 'better-sqlite3'], message: 'Renderer code has no filesystem and no store handle (ADR-0044, W-01).' }] }],
    },
  },
);
