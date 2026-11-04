import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/*
 * `pnpm lint`'s eslint runs with a heap bound of its own (R-079, R-091;
 * docs/archive/defects/the-ci-gates-lint-runs-out-of-javascript-heap-at-nodes-default-heap-limit.md).
 * One `eslint .` holds every type-aware program (`projectService`) and import-x/no-cycle's whole module graph at once:
 * measured 2026-11-04 at 3,945 MB after a mark-compact against Node's default limit of 4,192 MB on a 16 GB host, and on
 * CI's windows-latest runner it crossed that limit and died before a single test ran. The bound is set on the eslint
 * process itself, so the local gate and CI's `pnpm check` both carry it, and it is not left to an environment variable
 * a runner may or may not export.
 */
const repo = fileURLToPath(new URL('..', import.meta.url));
const ESLINT_BIN = 'node_modules/eslint/bin/eslint.js';
/** Twice the default limit the lint ran out at: headroom over the measured 3.9 GB, within the runner's 16 GB. */
const MIN_HEAP_MB = 8192;

const lint = (JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts['lint'] ?? '';

describe('pnpm lint — eslint runs with a heap bound above its measured need (R-079, R-091)', () => {
  it('the last stage runs eslint under node with an explicit --max-old-space-size of at least 8192 MB', () => {
    const stage = /&& node --max-old-space-size=(\d+) node_modules\/eslint\/bin\/eslint\.js \. --max-warnings 0"?$/.exec(lint);
    expect(stage, `pnpm lint's last stage: ${lint.slice(-120)}`).not.toBeNull();
    expect(Number(stage?.[1])).toBeGreaterThanOrEqual(MIN_HEAP_MB);
  });

  it('no stage runs a bare `eslint`, which would take the default heap again', () => {
    expect(lint.split('&&').map((s) => s.trim().replace(/^"|"$/g, '')).filter((s) => /^eslint\b/.test(s))).toEqual([]);
  });

  it('the file it runs is eslint\'s own command-line entry, so an upgrade that moves it fails here rather than in the gate', () => {
    expect(existsSync(join(repo, ESLINT_BIN))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(repo, 'node_modules/eslint/package.json'), 'utf8')) as { bin: Record<string, string> };
    expect(join('node_modules/eslint', manifest.bin['eslint'] ?? '')).toBe(join(ESLINT_BIN));
  });
});
