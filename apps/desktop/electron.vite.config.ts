import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { builtinModules } from 'node:module';

/**
 * ADR-0056 — electron-vite over Vite, chosen for exactly two properties:
 * several named inputs per section, and an isolated-entry preload.
 *
 *  - main section: three node entries — main, run-host, workspace-service —
 *    sharing one externalisation rule; native modules stay external so the
 *    rebuild-and-unpack obligation applies to them.
 *  - preload: ONE self-contained file, no shared chunk (a sandboxed preload
 *    cannot load a chunk at run time — a correctness setting).
 *  - renderer: ONE bundle reused by every window, role by route
 *    (REQ-UIBENCH-112 true by construction).
 *  - assets bundled, not fetched; strict CSP; no remote origin.
 */
const repo = resolve(__dirname, '..', '..');
const designSystem = resolve(repo, 'docs', 'design', 'system');
const designAssets = resolve(repo, 'docs', 'design', 'assets');

const WORKSPACE_PACKAGES = ['@rotaris/kernel', '@rotaris/contracts', '@rotaris/platform', '@rotaris/store', '@rotaris/engine', '@rotaris/agent-tools', '@rotaris/model', '@rotaris/mcp', '@rotaris/workspace', '@rotaris/shell', '@rotaris/ui-core', '@rotaris/ui', '@rotaris/release-naming'];

// electron-vite's own default external list; it is REPLACED, not merged, once rollupOptions is given,
// so it is restated here for both node-side sections. Bundling the `electron` npm shim into main or
// the preload was measured to break both (the shim requires child_process, which the sandbox lacks).
const EXTERNAL = ['electron', /^electron\/.+/, 'better-sqlite3', 'node-pty', ...builtinModules.flatMap((m) => [m, `node:${m}`])];

const workspaceAliases = {
  '@rotaris/kernel': resolve(repo, 'packages/kernel/src/index.ts'),
  '@rotaris/contracts': resolve(repo, 'packages/contracts/src/index.ts'),
  '@rotaris/platform': resolve(repo, 'packages/platform/src/index.ts'),
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
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })],
    resolve: { alias: workspaceAliases },
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
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })],
    resolve: { alias: workspaceAliases },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        external: EXTERNAL,
        output: { format: 'cjs', inlineDynamicImports: true, entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
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
