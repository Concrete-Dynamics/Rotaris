/**
 * The platform preflight: the machine checks a suite depends on, and what a named
 * proof's registry record adds — its hosts, its `requires` and its per-host clauses,
 * read from `tools/proof-registry/registry.mjs`.
 */
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { app, buildCheck, bundleCheck, displayCheck, displayTargets, electron, endpointCheck, environmentCheck, formatReport, mainEntry, newestSourceMtime } from './preflight.mjs';
import { nodeCheck, parseArgs, platformCheck, probeTargets, proofChecks, repo, runPreflight, scratchCheck, suggestIds } from './preflight.mjs';
import { connectTargets, probeDisplay, readProbe } from './preflight.mjs';
import { PROOFS } from '../../../tools/proof-registry/registry.mjs';
import { app as harnessApp, electron as harnessElectron, mainEntry as harnessMainEntry, repo as harnessRepo } from './lib/harness.mjs';

describe('preflight — the paths the harness resolves', () => {
  it('electron, the main entry and the roots are the harness\'s own expressions', () => {
    expect(repo).toBe(harnessRepo);
    expect(app).toBe(harnessApp);
    expect(electron).toBe(harnessElectron);
    expect(mainEntry).toBe(harnessMainEntry);
  });
});

describe('preflight — arguments', () => {
  it('proof ids and flags are read; an unknown flag is refused', () => {
    expect(parseArgs(['mcp-proof', 'live-run', '--json'])).toEqual({ help: false, json: true, ids: ['mcp-proof', 'live-run'], unknown: [] });
    expect(parseArgs(['--skip-build']).unknown).toEqual(['--skip-build']);
    expect(parseArgs(['--help']).help).toBe(true);
  });
});

describe('preflight — node, the environment and the display', () => {
  it('node below engines.node fails; a met range and no range pass', () => {
    expect(nodeCheck('v22.4.0', '>=24.0.0').status).toBe('fail');
    expect(nodeCheck('v24.13.0', '>=24.0.0').status).toBe('pass');
    expect(nodeCheck('v24.13.0', '').message).toMatch(/no engines\.node constraint/);
  });

  it('an exported ROTARIS_* variable is a warning — every launch strips it', () => {
    expect(environmentCheck({ PATH: '/bin' }).status).toBe('pass');
    const one = environmentCheck({ ROTARIS_APP_LOG_LEVEL: 'debug' });
    expect(one.status).toBe('warn');
    expect(one.message).toContain('ROTARIS_APP_LOG_LEVEL is exported');
    expect(environmentCheck({ ROTARIS_A: '1', ROTARIS_B: '2' }).message).toContain('are exported');
  });

  it('linux needs DISPLAY or xvfb-run; win32 and darwin need neither', () => {
    expect(displayCheck({ platform: 'linux', display: ':0', xvfb: false, probe: { reached: 'socket /tmp/.X11-unix/X0', tried: [] } }).status).toBe('pass');
    expect(displayCheck({ platform: 'linux', display: undefined, xvfb: true }).status).toBe('warn');
    expect(displayCheck({ platform: 'linux', display: undefined, xvfb: false }).status).toBe('fail');
    expect(displayCheck({ platform: 'win32', display: undefined, xvfb: false }).status).toBe('pass');
    expect(displayCheck({ platform: 'darwin', display: undefined, xvfb: false }).status).toBe('pass');
  });

  it('a set DISPLAY on linux passes only when a connect reached it, and a miss names what was tried', () => {
    const reached = displayCheck({ platform: 'linux', display: ':99', xvfb: false, probe: { reached: 'abstract socket @/tmp/.X11-unix/X99', tried: [{ label: 'socket /tmp/.X11-unix/X99', error: 'ENOENT' }] } });
    expect(reached).toEqual({ name: 'display', status: 'pass', message: 'the display is available (DISPLAY=:99)' });
    const missed = displayCheck({
      platform: 'linux',
      display: ':99',
      xvfb: true,
      probe: { reached: null, tried: [{ label: 'socket /tmp/.X11-unix/X99', error: 'ENOENT' }, { label: 'abstract socket @/tmp/.X11-unix/X99', error: 'ECONNREFUSED' }] },
    });
    expect(missed.status).toBe('fail');
    expect(missed.message).toContain('no client can reach it');
    expect(missed.message).toContain('socket /tmp/.X11-unix/X99 (ENOENT), abstract socket @/tmp/.X11-unix/X99 (ECONNREFUSED)');
    expect(displayCheck({ platform: 'linux', display: 'nonsense', xvfb: true, probe: { reached: null, tried: [] } }).message).toContain('no display this check can read');
    expect(displayCheck({ platform: 'linux', display: ':0', xvfb: true }).status).toBe('fail');
    expect(displayCheck({ platform: 'win32', display: ':0', xvfb: false }).status).toBe('pass');
    expect(displayCheck({ platform: 'darwin', display: ':0', xvfb: false }).status).toBe('pass');
  });

  it('reads :N and unix:N as the socket file and its abstract name, a bare :N then TCP localhost, host:N as TCP 6000+N', () => {
    const unix = [
      { label: 'socket /tmp/.X11-unix/X7', connect: { path: '/tmp/.X11-unix/X7' } },
      { label: 'abstract socket @/tmp/.X11-unix/X7', connect: { path: '\0/tmp/.X11-unix/X7' } },
    ];
    // libX11 falls back to TCP on localhost for a bare :N only; unix:N names the socket and nothing else.
    const bare = [...unix, { label: 'tcp localhost:6007', connect: { host: 'localhost', port: 6007 } }];
    expect(displayTargets(':7')).toEqual(bare);
    expect(displayTargets(':7.1')).toEqual(bare);
    expect(displayTargets('unix:7')).toEqual(unix);
    expect(displayTargets('localhost:7')).toEqual([{ label: 'tcp localhost:6007', connect: { host: 'localhost', port: 6007 } }]);
    expect(displayTargets('build-host:10.0')).toEqual([{ label: 'tcp build-host:6010', connect: { host: 'build-host', port: 6010 } }]);
    expect(displayTargets('[::1]:2')).toEqual([{ label: 'tcp [::1]:6002', connect: { host: '::1', port: 6002 } }]);
    for (const shape of ['', 'nonsense', ':x', 'decnet::0', '/tmp/launch-x/org.xquartz:0']) expect(displayTargets(shape)).toBeNull();
  });

  it.skipIf(process.platform === 'win32')('the probe connects for real: a listening socket is reached, a missing one is tried and named', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'preflight-display-'));
    const path = join(dir, 'X0');
    const server = createServer((socket) => socket.destroy());
    await new Promise<void>((done) => server.listen(path, done));
    try {
      // The probe runs synchronously in a child; the kernel's backlog accepts the connect while this loop blocks.
      const probe = probeTargets([
        { label: 'missing', connect: { path: join(dir, 'X1') } },
        { label: 'listening', connect: { path } },
      ]);
      expect(probe).toEqual({ reached: 'listening', tried: [{ label: 'missing', error: 'ENOENT' }] });
    } finally {
      await new Promise((done) => server.close(done));
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a target that times out or errors is a miss; only a connect reaches it', () => {
    const net = (outcomes: Record<string, string>) => ({
      connect: (options: { path?: string }) => {
        const s = Object.assign(new EventEmitter(), { setTimeout: () => {}, destroy: () => {} });
        const outcome = outcomes[options.path ?? ''] ?? 'error';
        queueMicrotask(() => (outcome === 'error' ? s.emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })) : s.emit(outcome)));
        return s;
      },
    });
    const targets = [{ label: 'slow', connect: { path: 'slow' } }, { label: 'refused', connect: { path: 'refused' } }];
    return new Promise<void>((done) => {
      connectTargets(targets, net({ slow: 'timeout' }), (json: string) => {
        expect(JSON.parse(json)).toEqual({ reached: null, tried: [{ label: 'slow', error: 'no answer within 2 s' }, { label: 'refused', error: 'ECONNREFUSED' }] });
        connectTargets(targets, net({ slow: 'timeout', refused: 'connect' }), (hit: string) => {
          expect(JSON.parse(hit)).toEqual({ reached: 'refused', tried: [{ label: 'slow', error: 'no answer within 2 s' }] });
          done();
        });
      });
    });
  });

  it('an unreadable or empty answer from the probe child is a miss on every target, never a hit', () => {
    const targets = [{ label: 'socket a', connect: { path: 'a' } }, { label: 'tcp b:6000', connect: { host: 'b', port: 6000 } }];
    const missed = (error: string) => ({ reached: null, tried: [{ label: 'socket a', error }, { label: 'tcp b:6000', error }] });
    expect(readProbe(targets, { stdout: '', status: 1 })).toEqual(missed('the probe exited 1'));
    expect(readProbe(targets, { stdout: null, signal: 'SIGTERM', error: new Error('spawnSync node ETIMEDOUT') })).toEqual(missed('spawnSync node ETIMEDOUT'));
    expect(readProbe(targets, { stdout: '{"reached":"so', status: null, signal: 'SIGKILL' })).toEqual(missed('the probe exited SIGKILL'));
    for (const stdout of ['{}', 'null', '[]', '{"tried":[]}', '{"reached":"elsewhere","tried":[]}', '{"reached":1,"tried":[]}', '{"reached":"socket a"}']) {
      expect(readProbe(targets, { stdout, status: 0 })).toEqual(missed('the probe answered no result'));
    }
    expect(readProbe(targets, { stdout: '{"reached":"tcp b:6000","tried":[]}', status: 0 })).toEqual({ reached: 'tcp b:6000', tried: [] });
    // And a probe that is not a string hit never passes the check, whatever reached it.
    expect(displayCheck({ platform: 'linux', display: ':0', xvfb: true, probe: { reached: undefined, tried: [] } as never }).status).toBe('fail');
  });
});

describe('preflight — the build and the scratch', () => {
  it('falls back through missing, stale and fresh', () => {
    expect(buildCheck({ path: mainEntry, exists: false, buildMtimeMs: 0, newest: null }).message).toContain('unless --skip-build');
    const stale = buildCheck({ path: mainEntry, exists: true, buildMtimeMs: 100, newest: { label: 'apps/desktop/src/a.ts', mtimeMs: 200 } });
    expect(stale.status).toBe('warn');
    expect(stale.message).toContain('apps/desktop/src/a.ts');
    expect(buildCheck({ path: mainEntry, exists: true, buildMtimeMs: 300, newest: { label: 'apps/desktop/src/a.ts', mtimeMs: 200 } }).status).toBe('pass');
  });

  it('the newest source skips a newer test file and a generated tree', () => {
    const src = 'src';
    const sub = join(src, 'sub');
    const tree: Record<string, Array<{ name: string, dir: boolean }>> = {
      [src]: [{ name: 'a.test.ts', dir: false }, { name: 'a.ts', dir: false }, { name: 'generated', dir: true }, { name: 'sub', dir: true }],
      [join(src, 'generated')]: [{ name: 'requirements.ts', dir: false }],
      [sub]: [{ name: 'b.tsx', dir: false }],
    };
    const mtimes: Record<string, number> = {
      [join(src, 'a.test.ts')]: 500,
      [join(src, 'a.ts')]: 20,
      [join(src, 'generated', 'requirements.ts')]: 900,
      [join(sub, 'b.tsx')]: 70,
    };
    const found = newestSourceMtime([src], { list: (dir: string) => tree[dir] ?? [], mtime: (file: string) => mtimes[file] ?? 0 });
    expect(found?.path).toBe(join(sub, 'b.tsx'));
    expect(found?.mtimeMs).toBe(70);
  });

  it('an unwritable scratch directory fails naming the error', () => {
    expect(scratchCheck({ error: 'EACCES: permission denied' }).status).toBe('fail');
    expect(scratchCheck({ error: 'EACCES: permission denied' }).message).toContain('EACCES');
    expect(scratchCheck({ error: null }).status).toBe('pass');
  });
});

describe('preflight — the bundle', () => {
  it('absent and required is a failure; absent and merely notable is a note', () => {
    expect(bundleCheck({ ok: true }).status).toBe('pass');
    const fail = bundleCheck({ ok: false, requiredBy: ['live-run'], needing: ['code-intel-proof'] });
    expect(fail.status).toBe('fail');
    expect(fail.message).toContain('pnpm code-intel:bundle');
    const note = bundleCheck({ ok: false, needing: ['code-intel-proof', 'init-proof', 'live-run'] });
    expect(note.status).toBe('note');
    expect(note.message).toContain('code-intel-proof');
  });
});

describe('preflight — the endpoints', () => {
  const store = (registry: unknown, hasKey = false) => ({
    file: 'C:/fake/endpoints.json',
    registry: () => registry,
    hasKey: () => hasKey,
  });
  const shaped = { default: 'katalyst', endpoints: { katalyst: { label: 'K', model: 'm' } } };

  it('no endpoint, no default, a dangling default and a shapeless endpoint are failures', () => {
    expect(endpointCheck({ id: 'live-run', store: store({ default: null, endpoints: {} }), env: {} }).status).toBe('fail');
    const none = endpointCheck({ id: 'live-run', store: store({ default: null, endpoints: { a: { label: 'A', model: 'm' } } }), env: {} });
    expect(none.message).toContain('no default endpoint');
    expect(endpointCheck({ id: 'live-run', store: store({ default: 'gone', endpoints: { a: { label: 'A', model: 'm' } } }), env: {} }).status).toBe('fail');
    expect(endpointCheck({ id: 'live-run', store: store({ default: 'a', endpoints: { a: { label: '', model: 'm' } } }), env: {} }).message).toContain('label');
  });

  it('a stored key and the environment key both pass; a missing key fails naming both ways', () => {
    expect(endpointCheck({ id: 'live-run', store: store(shaped, true), env: {} }).message).toContain('stored key');
    expect(endpointCheck({ id: 'live-run', store: store(shaped, false), env: { ROTARIS_LIVE_API_KEY: 'x' } }).status).toBe('pass');
    const missing = endpointCheck({ id: 'live-run', store: store(shaped, false), env: {} });
    expect(missing.status).toBe('fail');
    expect(missing.message).toContain('--set-key');
  });
});

describe('preflight — a proof id', () => {
  it('an unknown id fails with the closest ids named', () => {
    const checks = proofChecks('mcp-proff');
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe('fail');
    expect(checks[0].message).toContain('mcp-proof');
    expect(suggestIds('live-rn')).toContain('live-run');
  });

  it('an id that needs nothing beyond the harness says so; mcp-proof carries its host clause', () => {
    expect(proofChecks('fetch-proof')).toEqual([{ name: 'fetch-proof', status: 'pass', message: 'nothing beyond the standard harness' }]);
    const mcp = proofChecks('mcp-proof');
    expect(mcp.some((c: { status: string, message: string }) => c.status === 'note' && c.message.includes('win32'))).toBe(true);
  });

  it('a host a record excludes is refused before the launch', () => {
    const entry = { id: 'x-proof', platforms: ['linux'], platformNotes: ['only there'] };
    expect(platformCheck(entry, 'win32')?.status).toBe('fail');
    expect(platformCheck(entry, 'win32')?.message).toContain('linux');
    expect(platformCheck(entry, 'linux')).toBeNull();
  });

  it('every requirement the registry holds has a check or its own note', () => {
    const kinds = [...new Set(PROOFS.flatMap((p: { requires: string[] }) => p.requires))].sort();
    expect(kinds).toEqual(['a Rust toolchain (`cargo`)', 'a packaged build for `--packaged`', 'a registered endpoint with a stored key', 'code-intelligence bundle']);
    const store = { file: 'C:/fake/endpoints.json', registry: () => ({ default: 'k', endpoints: { k: { label: 'K', model: 'm' } } }), hasKey: () => true };
    for (const p of PROOFS as Array<{ id: string }>) {
      const checks = proofChecks(p.id, { bundle: { ok: true }, getStore: () => store, env: {}, cargo: () => ({ status: 0, stdout: 'cargo 1.99.1' }) });
      expect(checks.length).toBeGreaterThan(0);
      for (const c of checks as Array<{ message: string }>) expect(c.message).not.toMatch(/^no check exists/);
    }
  });
});

describe('preflight — the report', () => {
  const fakeStore = { file: 'C:/fake/endpoints.json', registry: () => ({ default: 'k', endpoints: { k: { label: 'K', model: 'm' } } }), hasKey: () => true };
  const fakeIo = (over: Record<string, unknown> = {}) => ({
    readFile: () => JSON.stringify({ engines: { node: '>=1.0.0' } }),
    exists: (path: string) => path === electron || path === mainEntry,
    list: () => [],
    mtime: () => 0,
    git: () => ({ status: 0, stdout: 'git version 2.51.0' }),
    head: () => 'abc123',
    electronVersion: () => '41.0.0',
    bundle: () => ({ ok: true }),
    scratch: () => ({ error: null }),
    sourceRoots: () => [],
    xvfb: () => true,
    display: (_display: string): { reached: string | null, tried: { label: string, error: string }[] } => { throw new Error('the display was probed'); },
    store: () => fakeStore,
    ...over,
  });

  it('linux probes a set DISPLAY: unreached fails the report, reached passes; no DISPLAY and other hosts probe nothing', () => {
    const unreached = { reached: null, tried: [{ label: 'socket /tmp/.X11-unix/X99', error: 'ENOENT' }, { label: 'abstract socket @/tmp/.X11-unix/X99', error: 'ECONNREFUSED' }] };
    const asked: string[] = [];
    const red = runPreflight({ platform: 'linux', env: { DISPLAY: ':99' }, io: fakeIo({ display: (d: string) => { asked.push(d); return unreached; } }) });
    expect(asked).toEqual([':99']);
    expect(red.ok).toBe(false);
    expect(red.checks.find((c: { name: string }) => c.name === 'display')).toMatchObject({ status: 'fail' });
    expect(formatReport(red)).toContain('FAIL  DISPLAY=:99 is set, but no client can reach it — tried socket /tmp/.X11-unix/X99 (ENOENT)');

    const green = runPreflight({ platform: 'linux', env: { DISPLAY: ':99' }, io: fakeIo({ display: () => ({ reached: 'socket /tmp/.X11-unix/X99', tried: [] }) }) });
    expect(green.ok).toBe(true);
    expect(formatReport(green)).toContain('PASS  the display is available (DISPLAY=:99)');

    // The default fake throws when probed: these four never reach it.
    expect(runPreflight({ platform: 'linux', env: {}, io: fakeIo() }).checks.find((c: { name: string }) => c.name === 'display')).toMatchObject({ status: 'warn' });
    expect(runPreflight({ platform: 'linux', env: {}, io: fakeIo({ xvfb: () => false }) }).checks.find((c: { name: string }) => c.name === 'display')).toMatchObject({ status: 'fail' });
    expect(runPreflight({ platform: 'win32', env: { DISPLAY: ':99' }, io: fakeIo() }).checks.find((c: { name: string }) => c.name === 'display')).toMatchObject({ status: 'pass' });
    expect(runPreflight({ platform: 'darwin', env: {}, io: fakeIo() }).checks.find((c: { name: string }) => c.name === 'display')).toMatchObject({ status: 'pass' });
  });

  it('a DISPLAY the targets cannot read probes nothing and fails the report', () => {
    for (const display of ['garbage', ':x', 'decnet::0']) {
      expect(probeDisplay(display)).toEqual({ reached: null, tried: [] });
      const report = runPreflight({ platform: 'linux', env: { DISPLAY: display }, io: fakeIo({ display: probeDisplay }) });
      expect(report.ok).toBe(false);
      expect(report.checks.find((c: { name: string }) => c.name === 'display')).toMatchObject({ status: 'fail', message: expect.stringContaining('no display this check can read') });
    }
  });

  it('a healthy machine passes and a named proof reads its record', () => {
    const report = runPreflight({ ids: ['mcp-proof'], env: {}, io: fakeIo() });
    expect(report.ok).toBe(true);
    expect(report.summary.fail).toBe(0);
    expect(report.headline).toContain('abc123');
    expect(report.checks.some((c: { scope: string | null, status: string }) => c.scope === 'mcp-proof' && c.status === 'note')).toBe(true);
  });

  it('a missing requirement fails and the text names the proof and the remedy', () => {
    const report = runPreflight({ ids: ['live-run'], env: {}, io: fakeIo({ bundle: () => ({ ok: false }) }) });
    expect(report.summary.fail).toBe(1);
    const text = formatReport(report);
    expect(text).toContain('live-run');
    expect(text).toContain('pnpm code-intel:bundle');
    expect(text).toContain('1 failed');
  });

  it('prints a scoped section per proof and the counts line', () => {
    const text = formatReport({
      headline: 'win32 · node v24.0.0 · abc',
      checks: [
        { scope: null, name: 'git', status: 'pass', message: 'git on PATH' },
        { scope: 'mcp-proof', name: 'mcp-proof', status: 'note', message: 'host clauses' },
      ],
      summary: { pass: 1, warn: 0, fail: 0, note: 1 },
    });
    expect(text).toMatch(/PASS {2}git on PATH/);
    expect(text).toContain('\nmcp-proof\nNOTE  host clauses');
    expect(text).toContain('1 passed, 0 warned, 0 failed, 1 noted');
  });
});
