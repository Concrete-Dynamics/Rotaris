import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { modelError, type AgentBackend, type TurnReport } from '@rotaris/model';
import { costLabelOf, durationLabel, parseTokenSamples, RUN_CONFIG_DEFAULTS, Sessions, TOKEN_SAMPLE_CAP, toSessionRecord } from '../index.js';

const HOST = mintMachineId('0000000000000000000000000000000a') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };

/**
 * REQ-MONITOR-166: the token history is sampled BY THE RUN — every 10 s on the clock port while the session is live
 * and once more at the terminal state — the most recent 120 kept, persisted with the session so the sparkline is
 * the same when the session is reopened.
 */
describe('REQ-MONITOR-166 the run samples the token history', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-samples-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  it('samples every 10 s while the run is live, once at the end, and the record and the reopened row carry them', async () => {
    let release: (() => void) | null = null;
    const backend: AgentBackend = {
      ownsTheLoop: false,
      runTurn: async (_input, sink, signal) => {
        await new Promise<void>((resolve) => { release = resolve; signal.addEventListener('abort', () => resolve(), { once: true }); });
        sink.usage({ input: 300, output: 50 });
        const report: TurnReport = signal.aborted
          ? { status: 'failed', text: '', usage: { input: 0, output: 0 }, error: modelError({ code: 'aborted', headline: 'aborted', transient: false }) }
          : { status: 'succeeded', text: 'done', usage: { input: 300, output: 50 } };
        return report;
      },
    };
    const snapshots: number[] = [];
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: (p) => snapshots.push(p.session.usageHistory.length) }, pid: 7, host: HOST,
      retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-samples',
      model: { backend, config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => '' } },
      sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid),
    });
    const started = sessions.start(dal, 'C:/ws', 'count tokens');
    if (!started.ok) throw new Error(JSON.stringify(started.error));
    const sid = started.value;
    const running = sessions.running(sid)!;
    // Let the run reach its model call, then three periods pass on the clock.
    for (let i = 0; i < 20 && release === null; i += 1) await new Promise<void>((r) => setTimeout(r, 5));
    expect(release).not.toBeNull();
    for (let i = 0; i < 3; i += 1) { clock.advance(10_000); await new Promise<void>((r) => setTimeout(r, 0)); }
    (release as unknown as () => void)();
    await running;
    // the summary rebuild reads the row off the path; let it land before the store closes
    await new Promise<void>((r) => setTimeout(r, 40));
    const row = dal.getSession(sid)!;
    const samples = parseTokenSamples(row.token_samples);
    // three periodic samples at 0 tokens, then the terminal one after the usage arrived
    expect(samples.length).toBe(4);
    expect(samples.slice(0, 3).map((s) => s[1])).toEqual([0, 0, 0]);
    expect(samples[3]![1]).toBe(350);
    expect(samples.every((s) => /^\d{4}-\d{2}-\d{2}T/.test(s[0]))).toBe(true);
    // every periodic sample published a whole-session update carrying the history so far
    expect(snapshots.some((n) => n >= 1)).toBe(true);
    // the record carries them, the cost label its qualifier, the per-tool counts their shape
    const record = toSessionRecord(row, [], dal.toolCallCounts(sid));
    expect(record.usageHistory).toEqual(samples);
    expect(record.costLabel).toEqual({ text: 'price not established', qualifier: 'unknown' });
    expect(record.toolCalls).toEqual({ total: 0, agents: 0, byTool: [] });
    // reopened: the same history from the row (REQ-MONITOR-242's rule applied to the samples)
    expect(toSessionRecord(dal.getSession(sid)!).usageHistory).toEqual(samples);
    // the sessions card's labels
    const listed = sessions.list(dal, 'C:/ws').find((s) => s.sessionId === (sid as SessionId))!;
    expect(listed.tokens).toBe(350);
    expect(listed.busy).toBe(false);
    expect(listed.requirementId).toBeNull();
    expect(listed.durationLabel).toMatch(/^\d+:\d{2}$/);
  });

  it('keeps the most recent 120, drops what is not a sample, and formats durations and cost labels', () => {
    const many = Array.from({ length: 150 }, (_, i) => [`2026-09-05T00:00:${String(i % 60).padStart(2, '0')}.000Z`, i] as [string, number]);
    const kept = parseTokenSamples(JSON.stringify(many));
    expect(kept.length).toBe(TOKEN_SAMPLE_CAP);
    expect(kept[0]![1]).toBe(30);
    expect(parseTokenSamples('not json')).toEqual([]);
    expect(parseTokenSamples('[["t",1],["bad"],[2,"x"],5]')).toEqual([['t', 1]]);
    expect(durationLabel(null, '2026-09-05T10:00:00.000Z')).toBe('');
    expect(durationLabel('2026-09-05T10:00:00.000Z', '2026-09-05T10:00:42.000Z')).toBe('0:42');
    expect(durationLabel('2026-09-05T10:00:00.000Z', '2026-09-05T11:05:03.000Z')).toBe('1:05:03');
    // PD-MONITOR-001 revision 2: the four qualifiers, each with its fixed label, the amount under REQ-PROVIDER-121's rule.
    expect(costLabelOf('0', 'unknown')).toEqual({ text: 'price not established', qualifier: 'unknown' });
    expect(costLabelOf('0.12', 'reported')).toEqual({ text: '0.12 reported by the provider', qualifier: 'reported' });
    expect(costLabelOf('0.00154', 'reported')).toEqual({ text: '0.0015 reported by the provider', qualifier: 'reported' });
    expect(costLabelOf('0.006', 'configured')).toEqual({ text: '0.0060 at configured rates', qualifier: 'configured' });
    expect(costLabelOf('1.5', 'incomplete')).toEqual({ text: 'at least 1.50; some requests have no price', qualifier: 'incomplete' });
    // The label is the RECORDED qualifier's, never re-derived from the amount; a malformed total or qualifier reads unknown.
    expect(costLabelOf('0.12', 'unknown')).toEqual({ text: 'price not established', qualifier: 'unknown' });
    expect(costLabelOf('nonsense', 'reported')).toEqual({ text: 'nonsense (price not established)', qualifier: 'unknown' });
    expect(costLabelOf('0.12', 'estimated')).toEqual({ text: 'price not established', qualifier: 'unknown' });
  });
});
