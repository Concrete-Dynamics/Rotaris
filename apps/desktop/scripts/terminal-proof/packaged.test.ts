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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the section is plain ESM beside the proof that runs it.
import { autoOpenedStreams, launchEnvironment, packagedChecks, packagedTerminalStreaming } from './packaged.mjs';
// @ts-expect-error — plain ESM beside the packaging script.
import { FORBIDDEN, KEPT } from '../lib/seam-check.mjs';

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
      expect(launch.surface).toBeNull();
    }
    expect(Object.values(section.checks)).toHaveLength(6);
    expect(Object.values(section.checks).every((v) => v === false)).toBe(true);
  }, 60_000);

  it('REQ-TOOLS-126: the checks read an absent terminal and surface as absent, whatever shape the launch returned', () => {
    const lost = { enabled: true, painted: true, stores: 0, error: 'expected one workspace store under this launch\'s own LOCALAPPDATA, found 0' };
    const measured = (enabled: boolean, opened: string[]) => ({
      enabled, painted: true, stores: 1, model: { requests: 3, toolsRequests: 2, terminalCalls: 1, classifications: 1 },
      surface: { autoOpened: opened },
      terminal: { status: 'succeeded', isError: 0, observation: 'On branch main' },
    });
    // Each half missing its fields in turn — the first form threw a TypeError on every one of these.
    for (const [on, off] of [[lost, measured(false, [])], [measured(true, ['s1']), { ...lost, enabled: false }], [lost, { ...lost, enabled: false }]]) {
      const checks = packagedChecks(on, off) as Record<string, boolean>;
      expect(checks.bothRanTheTerminalCall).toBe(false);
      expect(checks.agentSeesTheSameThing).toBe(false);
      expect(checks.bothCallsFromTheShippedClient).toBe(false);
      if (on === lost) expect(checks.enabledSurfaceSawTheStream).toBe(false);
      if (off.stores === 0) expect(checks.disabledSurfaceSawNothing).toBe(false);
    }
    // Both halves measured: the checks still pass where the product met REQ-TOOLS-126/127.
    const both = packagedChecks(measured(true, ['s1']), measured(false, [])) as Record<string, boolean>;
    expect(both).toEqual({ bothPainted: true, bothRanTheTerminalCall: true, bothCallsFromTheShippedClient: true, agentSeesTheSameThing: true, enabledSurfaceSawTheStream: true, disabledSurfaceSawNothing: true });
    // The key off with the window opened anyway, or on with none opened, is a red.
    expect(packagedChecks(measured(true, []), measured(false, ['s2']))).toMatchObject({ enabledSurfaceSawTheStream: false, disabledSurfaceSawNothing: false });
  });
});

/*
 * docs/defects/fixed/terminal-proofs-packaged-launch-drives-seams-a-packaged-build-compiles-out.md: the packaged launch set
 * `ROTARIS_MODEL_DIALECT=scripted`, `ROTARIS_SCRIPT=git` and `ROTARIS_CAPTURE_EVAL_AT`, which a packaged build compiles out
 * (ADR-0056; `seam-check.mjs`'s FORBIDDEN), and named a `provider: scripted` model a packaged build answers with no client
 * (OQ-312). Against any package `pnpm package` produces, it measured nothing. It now reaches the stub through the shipped model
 * client and reads REQ-SHELL-109's auto-open line from main's log.
 */
describe('the packaged launch drives only what a packaged build keeps (ADR-0056, OQ-312)', () => {
  let repo: string;
  beforeEach(() => { repo = mkdtempSync(join(tmpdir(), 'rotaris-packaged-')); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });
  const seamFree = (env: Record<string, string | undefined>) => Object.keys(env).filter((k) => k.startsWith('ROTARIS_') && FORBIDDEN.some((name: string) => k.startsWith(name)));

  it('gives the launch the packaged probe\'s three variables and no seam, removing every inherited ROTARIS_ variable', () => {
    const env = launchEnvironment({ base: { PATH: '/bin', ROTARIS_SCRIPT: 'git', ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_EVAL_AT: 'x@1' }, scratch: '/s', localAppData: '/s/LocalAppData', preferences: '/s/preferences', png: '/s/p.png', afterMs: 9000 }) as Record<string, string>;
    expect(seamFree(env)).toEqual([]);
    const own = Object.keys(env).filter((k) => k.startsWith('ROTARIS_')).sort();
    expect(own).toEqual([...KEPT, 'ROTARIS_PREFERENCES_ROOT'].sort());
    expect(env.ROTARIS_PREFERENCES_ROOT).toBe('/s/preferences');
    expect(env.PATH).toBe('/bin');
  });

  // POSIX alone, as above: a stand-in at the executable's path records what each launch was given and exits.
  it.skipIf(process.platform === 'win32')('each launch names an OpenAI-compatible model at its own loopback stub, the auto-open preference on, and no seam in its environment', async () => {
    const dir = join(repo, 'apps', 'desktop', 'release', 'win-unpacked');
    mkdirSync(dir, { recursive: true });
    const exe = join(dir, 'Rotaris.exe');
    writeFileSync(exe, '#!/bin/sh\nfor a; do ws="$a"; done\nenv > "$ws/../env-seen.txt"\nexit 0\n');
    chmodSync(exe, 0o755);
    await packagedTerminalStreaming({ repo, afterMs: 2_500 });
    for (const [name, enabled] of [['streaming-on', true], ['streaming-off', false]] as const) {
      const scratch = join(repo, 'apps', 'desktop', 'release', 'terminal-stream-proof', name);
      const seen = Object.fromEntries(readFileSync(join(scratch, 'env-seen.txt'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
      expect(seamFree(seen)).toEqual([]);
      expect(seen.ROTARIS_CAPTURE_PROMPT).toBe('show me the tree');
      const config = readFileSync(join(scratch, 'workspace', '.rotaris', 'agents.yaml'), 'utf8');
      expect(config).toMatch(/provider: openai, model_id: terminal-stream-stub, base_url: "http:\/\/127\.0\.0\.1:\d+\/v1"/);
      expect(config).not.toMatch(/scripted/);
      expect(config).toContain(`terminal_stream_enabled: ${enabled}`);
      expect(JSON.parse(readFileSync(join(seen.ROTARIS_PREFERENCES_ROOT!, 'preferences.json'), 'utf8'))).toEqual({ 'interface/terminalPopout': true });
    }
  }, 60_000);

  it('reads REQ-SHELL-109\'s auto-open lines from main\'s log, and nothing else', () => {
    const log = [
      '[main 2026-10-15T00:00:00.000Z] info    terminal window auto-opening for st_1 (REQ-SHELL-109)',
      '[main 2026-10-15T00:00:01.000Z] info    terminal window auto-open failed: boom',
      '[main 2026-10-15T00:00:02.000Z] info    terminal window auto-opening for st_2 (REQ-SHELL-109)\r',
    ].join('\n');
    expect(autoOpenedStreams(log)).toEqual(['st_1', 'st_2']);
    expect(autoOpenedStreams('')).toEqual([]);
  });

  it('matches the line main writes', () => {
    const main = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'main', 'index.ts'), 'utf8');
    expect(main).toContain('log(`terminal window auto-opening for ${e.payload.streamId} (REQ-SHELL-109)`);');
  });

  it('refuses an `app` override that is not a seam-free build, and measures nothing', async () => {
    const out = join(repo, 'out', 'main');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'index.js'), `${KEPT.join(';')};process.env.ROTARIS_CAPTURE_EVAL_AT;`);
    const r = await packagedTerminalStreaming({ repo, app: join(out, 'index.js') }) as { available: boolean; refusal: string };
    expect(r.available).toBe(false);
    expect(r.refusal).toMatch(/is not a seam-free build \(present: ROTARIS_CAPTURE_EVAL_AT/);
    expect(existsSync(join(repo, 'apps', 'desktop', 'release', 'terminal-stream-proof'))).toBe(false);
  });
});
