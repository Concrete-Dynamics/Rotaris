import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { symbolArtifactPlugin } from '../../tools/symbol-artifact/ensure.mjs';

/**
 * ADR-0056 — electron-vite over Vite, chosen for exactly two properties:
 * several named inputs per section, and an isolated-entry preload.
 *
 *  - main section: three node entries — main, run-host, workspace-service —
 *    sharing one externalisation rule; native modules stay external so the
 *    rebuild-and-unpack obligation applies to them.
 *  - preload: ONE self-contained file, no shared chunk (a sandboxed preload
 *    cannot load a chunk at run time — a correctness setting), and nothing
 *    from this package's `dependencies` external (a sandboxed preload cannot
 *    `require` one either — the same correctness setting, below).
 *  - renderer: ONE bundle reused by every window, role by route
 *    (REQ-UIBENCH-112 true by construction).
 *  - assets bundled, not fetched; strict CSP; no remote origin.
 */
const repo = resolve(__dirname, '..', '..');

/**
 * The verification seams are compiled in or compiled OUT, and the build says which.
 *
 * `ROTARIS_BUILD=package` (set by `scripts/package.mjs` for its own `electron-vite build`) makes
 * `__ROTARIS_SEAMS__` false, and rollup then removes every branch guarded by it — the scripted clicks, the typed
 * text, the chords, the renderer `eval`, the persona and OS-input seams, the theme proof's whole capture pass and
 * the driver's listener. What survives in a packaged build is the three the packaged probe itself needs
 * (`ROTARIS_CAPTURE_PNG`, `_PROMPT`, `_AFTER_MS`), and nothing that can be scripted from outside.
 *
 * Without this the shipped binary carried all of it, gated on an environment variable at launch: about 240 lines
 * of main, able to click, type and evaluate script in a window the user had signed into, for anything that could
 * set a variable in the app's environment. The proofs need that surface; the product never did.
 */
const seams = process.env['ROTARIS_BUILD'] !== 'package';
const designSystem = resolve(repo, 'docs', 'design', 'system');
const designAssets = resolve(repo, 'docs', 'design', 'assets');

const WORKSPACE_PACKAGES = ['@rotaris/kernel', '@rotaris/contracts', '@rotaris/platform', '@rotaris/config', '@rotaris/hooks', '@rotaris/providers', '@rotaris/store', '@rotaris/engine', '@rotaris/agent-tools', '@rotaris/model', '@rotaris/mcp', '@rotaris/workspace', '@rotaris/shell', '@rotaris/ui-core', '@rotaris/ui', '@rotaris/release-naming'];

// electron-vite's own default external list; it is REPLACED, not merged, once rollupOptions is given,
// so it is restated here for both node-side sections. Bundling the `electron` npm shim into main or
// the preload was measured to break both (the shim requires child_process, which the sandbox lacks).
const EXTERNAL = ['electron', /^electron\/.+/, 'better-sqlite3', 'node-pty', ...builtinModules.flatMap((m) => [m, `node:${m}`])];

// The requirement symbols every section imports through @rotaris/kernel: git-ignored, so a tree no gate or test session
// has run in has none. Each section writes them when they are absent, with the test session's own generator, and fails
// the build naming `pnpm symbols` when it cannot (tools/symbol-artifact/ensure.mjs says why that shape, and its cost).
const symbolArtifact = symbolArtifactPlugin({
  artifact: resolve(repo, 'packages/kernel/src/generated/requirements.ts'),
  generator: resolve(repo, 'tools/symbol-artifact/generate.mjs'),
});

const workspaceAliases = {
  '@rotaris/kernel': resolve(repo, 'packages/kernel/src/index.ts'),
  '@rotaris/contracts': resolve(repo, 'packages/contracts/src/index.ts'),
  '@rotaris/platform': resolve(repo, 'packages/platform/src/index.ts'),
  '@rotaris/config': resolve(repo, 'packages/config/src/index.ts'),
  '@rotaris/hooks': resolve(repo, 'packages/hooks/src/index.ts'),
  '@rotaris/providers': resolve(repo, 'packages/providers/src/index.ts'),
  '@rotaris/store': resolve(repo, 'packages/store/src/index.ts'),
  '@rotaris/engine': resolve(repo, 'packages/engine/src/index.ts'),
  '@rotaris/agent-tools': resolve(repo, 'packages/agent-tools/src/index.ts'),
  '@rotaris/model': resolve(repo, 'packages/model/src/index.ts'),
  '@rotaris/mcp': resolve(repo, 'packages/mcp/src/index.ts'),
  '@rotaris/workspace': resolve(repo, 'packages/workspace/src/index.ts'),
  '@rotaris/shell': resolve(repo, 'packages/shell/src/index.ts'),
  '@rotaris/ui-core': resolve(repo, 'packages/ui-core/src/index.ts'),
  '@rotaris/ui': resolve(repo, 'packages/ui/src/index.ts'),
  '@rotaris/release-naming': resolve(repo, 'tools/release-naming/src/index.ts'),
};

export default defineConfig({
  main: {
    plugins: [symbolArtifact, externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })],
    resolve: { alias: workspaceAliases },
    define: { __ROTARIS_SEAMS__: JSON.stringify(seams) },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'run-host': resolve(__dirname, 'src/run-host/index.ts'),
          'workspace-service': resolve(__dirname, 'src/workspace-service/index.ts'),
        },
        // electron-vite's default external list is replaced, not merged, once rollupOptions is given: state it.
        external: EXTERNAL,
      },
    },
  },
  preload: {
    /**
     * electron-vite 6 externalises this package's `dependencies` by DEFAULT in every node-side section
     * (`build.externalizeDeps ?? true`), and it now writes that list into the options the bundler actually reads
     * (`rolldownOptions.external`, bridged back to `rollupOptions.external`) — so the `external` list stated
     * below no longer replaces it. The preload reaches `zod` through `@rotaris/contracts`, and a sandboxed
     * preload cannot `require` a package from `node_modules`: the loader refuses it, the bridge never lands, and
     * the packaged launch opens no session (ADR-0056 rule 4 refused; measured on Electron 44.10.0, 2026-11-07).
     *
     * `build.externalizeDeps: false` is electron-vite 6's own answer for exactly this — the plugin's own type
     * carries it as the replacement for the deprecated `externalizeDepsPlugin`, and the preload types say a
     * sandboxed preload requires third-party dependencies bundled. Only `EXTERNAL` below (electron, the native
     * modules, the node builtins) stays external.  Without the plugin given here, the option decides; giving the
     * plugin would override it (`resolveConfigDrivenPlugins` skips the option when the plugin is present).
     *
     * The alternative measure — `externalizeDepsPlugin({ exclude: [...WORKSPACE_PACKAGES, 'zod'] })` — was built
     * and compared on 2026-11-07: byte-identical preload (md5 39d99be2…, 324790 B, the v5 baseline's own file).
     * This one is taken because it closes the whole class rather than the one package reached today, and because
     * the exclusion list would have to name every future `dependencies` import the preload grows.
     */
    plugins: [symbolArtifact],
    resolve: { alias: workspaceAliases },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        external: EXTERNAL,
        output: { format: 'cjs', inlineDynamicImports: true, entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [symbolArtifact, react()],
    // R-091 (hardening §3.2 row 4): the renderer's one seam, the render fault (`renderer/render-failure.tsx`), compiled out
    // of a packaged build on the same flag as main's.
    define: { __ROTARIS_SEAMS__: JSON.stringify(seams) },
    resolve: {
      // One React. pnpm's hoisted layout hands packages/ui a node_modules/.pnpm path for react while the
      // app resolves node_modules/react — one version, two real paths, two copies in the bundle, and
      // react-dom's hooks dispatcher null in the components' copy (measured 2026-09-04: a blank window).
      dedupe: ['react', 'react-dom', 'zustand'],
      alias: {
        ...workspaceAliases,
        '@design': designSystem,
        '@design-assets': designAssets,
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});
