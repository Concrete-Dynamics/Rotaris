/**
 * A red's evidence is kept where the next run does not remove it
 * (`docs/defects/fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md`: the three reds of 2026-10-03
 * survived only because their logs were copied out by hand before `slice-proof` cleared its output directory).
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hostLoad, keepRed } from './proof-reds.mjs';

const scratch: string[] = [];
function dir(): string {
  const d = mkdtempSync(join(tmpdir(), 'proof-reds-'));
  scratch.push(d);
  return d;
}
afterEach(() => { for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('keepRed', () => {
  it('copies every file of the output beside a red.json naming the scenario, the error, the commit and the load', () => {
    const root = dir();
    const output = join(root, 'slice-proof');
    mkdirSync(join(output, 'nested'), { recursive: true });
    writeFileSync(join(output, 'intents-1.log'), 'intent: explicit_trivial (0.99)\n');
    writeFileSync(join(output, 'intents-1.png'), 'png');
    const at = new Date('2026-10-03T06:04:00.000Z');
    const kept = keepRed({ output, reds: join(root, 'slice-proof-reds'), scenario: 'intents', error: new Error('intents-1: classified as explicit_trivial'), commit: 'abc1234', results: { run: { status: 'completed' } }, at, load: [1.5, 1.2, 0.9] });
    expect(kept).toBe(join(root, 'slice-proof-reds', '2026-10-03T06-04-00-000Z-intents'));
    expect(readdirSync(kept).sort()).toEqual(['intents-1.log', 'intents-1.png', 'red.json']);
    expect(readFileSync(join(kept, 'intents-1.log'), 'utf8')).toBe('intent: explicit_trivial (0.99)\n');
    const red = JSON.parse(readFileSync(join(kept, 'red.json'), 'utf8'));
    expect(red).toMatchObject({ scenario: 'intents', at: '2026-10-03T06:04:00.000Z', commit: 'abc1234', load: [1.5, 1.2, 0.9], kept: ['intents-1.log', 'intents-1.png'], results: { run: { status: 'completed' } } });
    expect(red.error).toMatch(/^Error: intents-1: classified as explicit_trivial/);
  });

  it('passes the error through redact, so no secret reaches red.json', () => {
    const root = dir();
    const kept = keepRed({ output: join(root, 'absent'), reds: root, scenario: 'run', error: 'sent sk-secret-123 to the endpoint', redact: (t: string) => t.split('sk-secret-123').join('[redacted]') });
    expect(readFileSync(join(kept, 'red.json'), 'utf8')).not.toContain('sk-secret-123');
    expect(JSON.parse(readFileSync(join(kept, 'red.json'), 'utf8')).error).toBe('sent [redacted] to the endpoint');
  });

  it('records a red whose output does not exist yet, and keeps two reds apart', () => {
    const root = dir();
    const first = keepRed({ output: join(root, 'absent'), reds: root, scenario: 'first-launch', error: 'x', at: new Date('2026-10-04T10:00:00.000Z') });
    const second = keepRed({ output: join(root, 'absent'), reds: root, scenario: 'first-launch', error: 'y', at: new Date('2026-10-04T10:00:01.000Z') });
    expect(first).not.toBe(second);
    expect(readdirSync(first)).toEqual(['red.json']);
    expect(JSON.parse(readFileSync(join(second, 'red.json'), 'utf8')).kept).toEqual([]);
  });
});

describe('hostLoad', () => {
  it('reports the three load averages to two decimals', () => {
    const load = hostLoad();
    expect(load).toHaveLength(3);
    for (const v of load) expect(Math.round(v * 100) / 100).toBe(v);
  });
});
