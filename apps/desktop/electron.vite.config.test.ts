import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './electron.vite.config';

const repo = fileURLToPath(new URL('../../', import.meta.url));

/**
 * ADR-0056: the requirement-symbol artifact is a build input, and every section of the build imports it through
 * @rotaris/kernel, so every section carries the plugin that writes it when it is absent (`tools/symbol-artifact/ensure.mjs`),
 * pointed at the file the kernel re-exports and the generator the test session runs
 * (docs/defects/fixed/a-fresh-clone-cannot-build-until-pnpm-symbols-has-run.md).
 */
describe('ADR-0056: each build section writes the requirement symbols it imports', () => {
  it('the kernel imports the artifact the plugin is pointed at', () => {
    expect(readFileSync(`${repo}packages/kernel/src/index.ts`, 'utf8')).toContain("from './generated/requirements.js'");
  });

  it.each(['main', 'preload', 'renderer'] as const)('the %s section carries the plugin', (section) => {
    const plugins = ((config as Record<string, { plugins?: unknown[] }>)[section]?.plugins ?? []) as { name?: string; api?: { paths?: unknown } }[];
    const plugin = plugins.find((p) => p?.name === 'rotaris:symbol-artifact');
    // Resolved the way the config resolves them: a template that joins with `/` compares unequal on Windows, where the
    // config's `resolve` spells the same path with `\` (measured on the Windows CI runner, 2026-10-31 — the run that
    // failed on exactly this).
    expect(plugin?.api?.paths).toEqual({
      artifact: resolve(repo, 'packages/kernel/src/generated/requirements.ts'),
      generator: resolve(repo, 'tools/symbol-artifact/generate.mjs'),
    });
  });
});
