/**
 * Live-run finding K2(b) (R-067): the autopsy reader printed `zero cost with tokens: true` for every session of the first
 * live run of 2026-09-29 — 7 of 7 — although each one's `cost_qualifier` was `unknown`: an unpriced endpoint has no
 * figure to record, so `0` beside real tokens is the correct total (REQ-MONITOR-166's qualifier, as PD-MONITOR-001
 * extends it). The reader now asks the question only where a figure existed, and the live run's own check no longer
 * steps around it by the endpoint's accounting kind.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateStore, openStore } from '@rotaris/store';
// @ts-expect-error — the reader's helpers are plain ESM beside the scripts that run them.
import { isZeroAmount, zeroCostCoherence, zeroCostLine } from './autopsy-coherence.mjs';

describe('the autopsy\'s zero-cost coherence line (REQ-MONITOR-166, PD-MONITOR-001)', () => {
  it.each([
    ['an unpriced run: no request had a figure, so 0 is the correct total', { cost: '0', cost_qualifier: 'unknown', tokens_input: 18_810, tokens_output: 900 }, false],
    ['a figure existed and the total is 0 against real tokens', { cost: '0', cost_qualifier: 'configured', tokens_input: 100, tokens_output: 10 }, true],
    ['a provider-reported total of 0 against real tokens', { cost: '0', cost_qualifier: 'reported', tokens_input: 100, tokens_output: 0 }, true],
    ['some requests unpriced, the priced ones summing to 0', { cost: '0.000', cost_qualifier: 'incomplete', tokens_input: 5, tokens_output: 5 }, true],
    ['a non-zero figure', { cost: '0.0123', cost_qualifier: 'configured', tokens_input: 100, tokens_output: 10 }, false],
    ['no tokens counted', { cost: '0', cost_qualifier: 'configured', tokens_input: 0, tokens_output: 0 }, false],
    ['a store from before the qualifier: the question asked as it always was', { cost: '0', tokens_input: 100, tokens_output: 10 }, true],
  ])('%s', (_name, row, expected) => {
    expect(zeroCostCoherence(row).zeroCostWithTokens).toBe(expected);
  });

  it('reads every spelling of a zero decimal as zero, and nothing else', () => {
    for (const zero of ['0', '0.0', '0.0000', '00']) expect(isZeroAmount(zero)).toBe(true);
    for (const other of ['0.0001', '1', '', '-0.5', 'n/a']) expect(isZeroAmount(other)).toBe(false);
  });

  it('prints the true|false token first — what the live run reads — then says why', () => {
    const line = zeroCostLine({ cost: '0', cost_qualifier: 'unknown', tokens_input: 10, tokens_output: 1 });
    expect(/zero cost with tokens: (true|false)/.exec(line)?.[1]).toBe('false');
    expect(line).toContain('cost_qualifier unknown');
  });
});

describe('the autopsy reader over a store (K2(b))', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-autopsy-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  /** A store with one session row carrying the given cost, qualifier and tokens, read back by `autopsy.mjs` itself. */
  function autopsyOf(cost: string, qualifier: string): string {
    const path = join(dir, 'workspace.db');
    const db = openStore(path);
    migrateStore(db);
    db.prepare("INSERT INTO sessions (session_id, workspace_root, execution_status, created_at, updated_at, run_started_at) VALUES ('K2', ?, 'completed', '2026-09-29T00:00:00.000Z', '2026-09-29T00:00:01.000Z', '2026-09-29T00:00:00.000Z')").run(dir);
    db.prepare('UPDATE sessions SET cost = ?, cost_qualifier = ?, tokens_input = 18810, tokens_output = 900 WHERE session_id = ?').run(cost, qualifier, 'K2');
    db.close();
    const repo = resolve(__dirname, '..', '..', '..', '..');
    const r = spawnSync(process.execPath, [join(repo, 'apps', 'desktop', 'scripts', 'autopsy.mjs'), path, 'K2'], { cwd: repo, encoding: 'utf8', timeout: 60_000 });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  }
  const reading = (text: string) => /zero cost with tokens: (true|false)/.exec(text)?.[1] ?? null;

  it('an unpriced session (cost_qualifier unknown) reads false — the 2026-09-29 packs read true for all seven', () => {
    expect(reading(autopsyOf('0', 'unknown'))).toBe('false');
  });

  it('a session whose cost had a figure and still totals 0 against its tokens reads true', () => {
    expect(reading(autopsyOf('0', 'configured'))).toBe('true');
  });
});
