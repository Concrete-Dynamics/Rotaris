/**
 * The orchestrated-build skill's own self-test, run by the gate: the skill rewrites itself as it learns, and every
 * mechanism it relies on (resume from journals, lane order, each bundle's review and landing from its own tree, the repair
 * loop, the halt, acceptance replay, live-run authorization) is pinned there. A change that breaks one turns `pnpm check` red.
 */
import { describe, it } from 'vitest';
// @ts-expect-error — the skill's tool is plain ESM, run by node without a build step.
import { selfTest } from '../.agents/skills/orchestrated-build/scripts/orchestration.mjs';

describe('the orchestrated-build skill', () => {
  it('passes its self-test', async () => {
    await selfTest({ quiet: true });
  }, 60_000);
});
