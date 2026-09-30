import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import type { CaptureHost } from './host.js';
import { installFinish } from './probe.js';

/**
 * How a capture ends (`installFinish`): the immediate exit once what it waited for has happened, the application's quit
 * when its wait timed out — `docs/defects/fixed/the-drivers-quit-skips-the-applications-shutdown.md`, the duress live
 * run's deadline quit (PD-ORCH-005 clause 3: a quit brings a live run to rest).
 */

const VARIABLES = ['ROTARIS_CAPTURE_AFTER_MS', 'ROTARIS_CAPTURE_WAIT', 'ROTARIS_CAPTURE_WAIT_MS', 'ROTARIS_CAPTURE_END_VIEW', 'ROTARIS_CAPTURE_PROBE'] as const;
const saved = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));
const dirs: string[] = [];
afterEach(() => {
  for (const v of VARIABLES) { if (saved[v] === undefined) delete process.env[v]; else process.env[v] = saved[v]; }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function host(resultSeen: () => boolean) {
  const clock = new FakeClock();
  const ended: string[] = [];
  const lines: string[] = [];
  const stub = {
    win: { webContents: { capturePage: () => Promise.resolve({ toPNG: () => Buffer.from('png') }), executeJavaScript: () => Promise.resolve(null), sendInputEvent: () => undefined } },
    clocks: clock,
    log: (m: string) => { lines.push(m); },
    resultSeen,
    exit: (code: number) => { ended.push(`exit ${code}`); },
    quit: () => { ended.push('quit'); },
  };
  return { host: stub as unknown as CaptureHost, clock, ended, lines };
}

function environment(wait: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rotaris-probe-'));
  dirs.push(dir);
  for (const v of VARIABLES) delete process.env[v];
  process.env['ROTARIS_CAPTURE_WAIT'] = wait;
  process.env['ROTARIS_CAPTURE_WAIT_MS'] = '2000';
  process.env['ROTARIS_CAPTURE_AFTER_MS'] = '100';
  return join(dir, 'capture.png');
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

describe('a capture ends by the immediate exit or by the application\'s quit (probe.ts, installFinish)', () => {
  it("ends through the application's quit when its wait timed out — a run may still be live (PD-ORCH-005 clause 3)", async () => {
    const png = environment('result');
    const h = host(() => false);
    installFinish(h.host, png, 'a prompt');
    h.clock.advance(2_500);
    h.clock.advance(100);
    await settle();
    expect(h.lines).toContain('capture: wait for result timed out after 2000 ms');
    expect(h.ended).toEqual(['quit']);
  });

  it('ends by the immediate exit when what it waited for happened', async () => {
    const png = environment('result');
    let seen = false;
    const h = host(() => seen);
    installFinish(h.host, png, 'a prompt');
    h.clock.advance(500);
    seen = true;
    h.clock.advance(500);
    h.clock.advance(100);
    await settle();
    expect(h.ended).toEqual(['exit 0']);
  });
});
