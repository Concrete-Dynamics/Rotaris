/**
 * Acceptance finding A51 (R-067): the packaged terminal-streaming section threw on a launch that found no workspace
 * store. `launch` returned early with `error` and no `terminal` or `probe` field; the checks guarded with `!== null`,
 * an absent field is `undefined`, so `.status` of it threw a `TypeError`, `packagedTerminalStreaming` never returned,
 * and `terminal-stream-proof --packaged` lost BOTH launches' evidence and reported neither REQ-TOOLS-126 nor
 * REQ-TOOLS-127 — against the file's own rule that a read that throws is reported, never thrown.
 *
 * The repair has two hunks, and each case pins one. The end-to-end case pins the store-count return in `launch`: it now
 * carries `terminal: null` and `probe: null` like every other return, and with that return put back as it was the case
 * fails on `expected undefined to be null`. The pure case pins `packagedChecks`: its `??` guards read a missing field as
 * missing evidence, so a launch of any shape reads false instead of throwing; with the guards removed the first form's
 * `TypeError` comes back on the lost half. Each hunk alone would stop the throw on this path; the two are kept because
 * the second holds for any other early return a later edit adds.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the section is plain ESM beside the proof that runs it.
import { packagedChecks, packagedTerminalStreaming } from './packaged.mjs';

type Launch = Record<string, unknown>;
type Section = { available: boolean; enabled: Launch; disabled: Launch; checks: Record<string, boolean> };

describe('the packaged terminal-streaming section reports a launch that found no store (REQ-TOOLS-126, REQ-TOOLS-127)', () => {
  let repo: string;
  beforeEach(() => { repo = mkdtempSync(join(tmpdir(), 'rotaris-packaged-')); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  // The packaged executable is a Windows build (IC-3). On POSIX a stand-in at its path — a script that exits at once
  // and writes no store — drives the section's own `launch` into the store-count return the finding named. Windows
  // cannot execute a script under an `.exe` name, so there this case is not applicable; the pure case below still runs.
  it.skipIf(process.platform === 'win32')('REQ-TOOLS-127: both launches finding no store are reported, not thrown, and every check reads false', async () => {
    const dir = join(repo, 'apps', 'desktop', 'release', 'win-unpacked');
    mkdirSync(dir, { recursive: true });
    const exe = join(dir, 'Rotaris.exe');
    writeFileSync(exe, '#!/bin/sh\nexit 0\n');
    chmodSync(exe, 0o755);
    const section = (await packagedTerminalStreaming({ repo, afterMs: 2_500 })) as Section;
    expect(section.available).toBe(true);
    for (const launch of [section.enabled, section.disabled]) {
      expect(launch.stores).toBe(0);
      expect(launch.error).toMatch(/expected one workspace store under this launch's own LOCALAPPDATA, found 0/);
      // The store-count return now carries the same two fields every other return does.
      expect(launch.terminal).toBeNull();
      expect(launch.probe).toBeNull();
    }
    expect(Object.values(section.checks)).toHaveLength(5);
    expect(Object.values(section.checks).every((v) => v === false)).toBe(true);
  }, 60_000);

  it('REQ-TOOLS-126: the checks read an absent terminal and probe as absent, whatever shape the launch returned', () => {
    const lost = { enabled: true, painted: true, stores: 0, error: 'expected one workspace store under this launch\'s own LOCALAPPDATA, found 0' };
    const measured = (enabled: boolean, total: number) => ({
      enabled, painted: true, stores: 1,
      probe: { toolbar: { total }, previews: 0 },
      terminal: { status: 'succeeded', isError: 0, observation: 'On branch main' },
    });
    // Each half missing its fields in turn — the first form threw a TypeError on every one of these.
    for (const [on, off] of [[lost, measured(false, 0)], [measured(true, 1), { ...lost, enabled: false }], [lost, { ...lost, enabled: false }]]) {
      const checks = packagedChecks(on, off) as Record<string, boolean>;
      expect(checks.bothRanTheTerminalCall).toBe(false);
      expect(checks.agentSeesTheSameThing).toBe(false);
      if (on === lost) expect(checks.enabledSurfaceSawTheStream).toBe(false);
      if (off.stores === 0) expect(checks.disabledSurfaceSawNothing).toBe(false);
    }
    // Both halves measured: the checks still pass where the product met REQ-TOOLS-126/127.
    const both = packagedChecks(measured(true, 1), measured(false, 0)) as Record<string, boolean>;
    expect(both).toEqual({ bothPainted: true, bothRanTheTerminalCall: true, agentSeesTheSameThing: true, enabledSurfaceSawTheStream: true, disabledSurfaceSawNothing: true });
  });
});
