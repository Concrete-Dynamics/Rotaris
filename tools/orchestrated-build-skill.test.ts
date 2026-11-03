/**
 * The orchestrated-build skill's own self-test, run by the gate: the skill rewrites itself as it learns, and every
 * mechanism it relies on (resume from journals, lane order, each bundle's review and landing from its own tree, the repair
 * loop, the halt, acceptance replay, live-run authorization) is pinned there. A change that breaks one turns `pnpm check` red.
 */
import { describe, it } from 'vitest';

// Loaded by URL rather than named in an import declaration, so that the tooling project's `checkJs` does not reach into
// the skill's own script, which changes only under the skill's improvement process (its SKILL.md; R-091, hardening.md
// §3.5 row 4). The one export used is typed here.
const TOOL = new URL('../.agents/skills/orchestrated-build/scripts/orchestration.mjs', import.meta.url).href;
const { selfTest } = (await import(TOOL)) as { selfTest: (options: { quiet: boolean }) => Promise<void> };

describe('the orchestrated-build skill', () => {
  it('passes its self-test', async () => {
    await selfTest({ quiet: true });
  }, 60_000);
});
