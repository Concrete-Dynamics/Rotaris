import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instant, type Instant } from '@rotaris/kernel';
import { DIAGNOSTICS_LEVELS as CONTRACT_LEVELS } from '@rotaris/contracts';
import { DIAGNOSTICS_LEVELS as STORE_LEVELS, PREFERENCE_KEYS } from '@rotaris/platform';
import type { AppLogRecord } from './app-log.js';
import {
  APP_LOG_STREAM,
  DiagnosticsCaptures,
  DIAGNOSTICS_BOUNDS,
  MANIFEST_FILE,
  SegmentedJsonLines,
  createRunDirectory,
  defaultDiagnosticsBase,
  diagnosticsBase,
  manifestChecksumHolds,
  perUserDiagnosticsBase,
  readJsonLines,
  readStream,
  runDirectoryStamp,
  segmentName,
  type DiagnosticsCapturesDeps,
} from './diagnostics.js';

/** 2026-11-03T10:11:12.345Z, the fake clock's reading: a window's start, in the run directory's name and the manifest. */
const START = instant(Date.UTC(2026, 10, 3, 10, 11, 12, 345));
const PID = 4242;

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-diagnostics-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function captures(extra: Partial<DiagnosticsCapturesDeps> & { clock?: { at: Instant } } = {}) {
  const clock = extra.clock ?? { at: START };
  const warnings: string[] = [];
  const infos: string[] = [];
  const registry = new DiagnosticsCaptures({
    now: () => clock.at,
    pid: PID,
    app: () => ({ name: 'Rotaris', version: '0.9.0' }),
    platform: { os: 'win32', arch: 'arm64', runtime: 'electron44.1.1' },
    perUserData: join(dir, 'per-user-data'),
    warn: (m) => warnings.push(m),
    info: (m) => infos.push(m),
    ...extra,
  });
  return { registry, warnings, infos, clock };
}

const line = (i: number): AppLogRecord => ({ at: '2026-11-03T10:11:12.345Z', level: 'info', source: 'main', message: `line ${String(i).padStart(4, '0')}` });
/** Every file under `root`, as relative paths. */
const tree = (root: string): string[] => (existsSync(root) ? readdirSync(root, { recursive: true, encoding: 'utf8' }).sort() : []);

describe('REQ-STARTUP-129: the level is one of the three, from the preference store alone', () => {
  it('holds the same three levels in the store and on the wire, off first', () => {
    expect([...STORE_LEVELS]).toEqual(['off', 'light', 'deep']);
    expect([...CONTRACT_LEVELS]).toEqual([...STORE_LEVELS]);
  });

  it('reads off where nothing is stored or the stored value is not one of the three', () => {
    const coerce = PREFERENCE_KEYS['diagnostics/level'].coerce;
    expect(coerce(undefined)).toBe('off');
    expect(coerce('LIGHT')).toBe('off');
    expect(coerce('verbose')).toBe('off');
    expect(coerce('light')).toBe('light');
    expect(coerce('deep')).toBe('deep');
    expect(PREFERENCE_KEYS['diagnostics/outputDir'].coerce('  ')).toBeUndefined();
  });
});

describe('REQ-STARTUP-130: off is zero work and zero disk writes', () => {
  it('creates no directory and writes no file, under the chosen folder or the workspace, however many lines are logged', () => {
    const { registry, warnings, infos } = captures();
    const workspace = join(dir, 'ws');
    mkdirSync(workspace);
    expect(registry.open(1, { level: 'off', outputDir: join(dir, 'chosen'), workspace })).toEqual({ state: 'off' });
    expect(registry.open(2, { level: 'off', outputDir: undefined, workspace })).toEqual({ state: 'off' });
    for (let i = 0; i < 100; i += 1) registry.record(line(i));
    expect(tree(dir)).toEqual(['ws']);
    expect(registry.stateOf(1)).toEqual({ state: 'off' });
    expect([...warnings, ...infos]).toEqual([]);
  });
});

describe('REQ-STARTUP-131: each window\'s run directory, created exclusively', () => {
  it('names it <base>/<yyyymmddTHHMMSSZ>-<pid> from the window\'s start in UTC', () => {
    expect(runDirectoryStamp(START)).toBe('20261103T101112Z');
    const { registry } = captures();
    const state = registry.open(7, { level: 'light', outputDir: join(dir, 'out'), workspace: null });
    expect(state).toEqual({ state: 'active', level: 'light', runDirectory: join(dir, 'out', `20261103T101112Z-${PID}`) });
  });

  it('defaults to <workspace>/.rotaris/diagnostics/rotaris when no folder is chosen', () => {
    const { registry } = captures();
    const workspace = join(dir, 'ws');
    const state = registry.open(1, { level: 'light', outputDir: undefined, workspace });
    expect(defaultDiagnosticsBase(workspace)).toBe(join(workspace, '.rotaris', 'diagnostics', 'rotaris'));
    expect(state.state === 'active' && state.runDirectory).toBe(join(defaultDiagnosticsBase(workspace), `20261103T101112Z-${PID}`));
  });

  it('takes the first free -2, -3, … and never writes into a directory that exists', () => {
    const base = join(dir, 'out');
    mkdirSync(join(base, `20261103T101112Z-${PID}`), { recursive: true });
    writeFileSync(join(base, `20261103T101112Z-${PID}`, 'someone-elses.txt'), 'kept');
    const { registry } = captures();
    const a = registry.open(1, { level: 'light', outputDir: base, workspace: null });
    const b = registry.open(2, { level: 'deep', outputDir: base, workspace: null });
    expect(a.state === 'active' && a.runDirectory).toBe(join(base, `20261103T101112Z-${PID}-2`));
    expect(b.state === 'active' && b.runDirectory).toBe(join(base, `20261103T101112Z-${PID}-3`));
    expect(readdirSync(join(base, `20261103T101112Z-${PID}`))).toEqual(['someone-elses.txt']);
    expect(createRunDirectory(base, '20261103T101112Z', PID)).toBe(join(base, `20261103T101112Z-${PID}-4`));
  });

  it('opens the window with the capture inactive, and says why, when the base cannot be written', () => {
    const blocked = join(dir, 'a-file');
    writeFileSync(blocked, 'not a directory');
    const { registry, warnings } = captures();
    const state = registry.open(3, { level: 'light', outputDir: blocked, workspace: null });
    expect(state.state).toBe('inactive');
    expect(state.state === 'inactive' && state.reason).toContain(blocked);
    expect(registry.stateOf(3)).toEqual(state);
    expect(warnings).toHaveLength(1);
    registry.record(line(1)); // nothing to write to, and nothing thrown
  });

});

describe('PD-STARTUP-011: a window with no workspace writes under the per-user data directory', () => {
  const perUser = () => perUserDiagnosticsBase(join(dir, 'per-user-data'));

  it('resolves the chosen folder first, then the workspace default, then <per-user data directory>/diagnostics/rotaris — never none', () => {
    const data = join(dir, 'per-user-data');
    expect(perUserDiagnosticsBase(data)).toBe(join(data, 'diagnostics', 'rotaris'));
    expect(diagnosticsBase({ outputDir: join(dir, 'chosen'), workspace: null }, data)).toBe(join(dir, 'chosen'));
    expect(diagnosticsBase({ outputDir: undefined, workspace: join(dir, 'ws') }, data)).toBe(defaultDiagnosticsBase(join(dir, 'ws')));
    expect(diagnosticsBase({ outputDir: undefined, workspace: null }, data)).toBe(perUserDiagnosticsBase(data));
  });

  it('captures a window built with no workspace and no chosen folder under the per-user default, its log lines and manifest there', () => {
    const { registry, warnings } = captures();
    const state = registry.open(4, { level: 'light', outputDir: undefined, workspace: null });
    expect(state).toEqual({ state: 'active', level: 'light', runDirectory: join(perUser(), `20261103T101112Z-${PID}`) });
    registry.record(line(1));
    registry.close(4);
    const runDirectory = join(perUser(), `20261103T101112Z-${PID}`);
    expect(tree(runDirectory)).toEqual([`${APP_LOG_STREAM}-01.jsonl`, MANIFEST_FILE]);
    expect(readStream(runDirectory, APP_LOG_STREAM).records).toEqual([line(1)]);
    const manifest = JSON.parse(readFileSync(join(runDirectory, MANIFEST_FILE), 'utf8')) as { configuration: { outputBase: string; outputBaseChosen: boolean } };
    expect(manifest.configuration).toMatchObject({ outputBase: perUser(), outputBaseChosen: false });
    expect(warnings).toEqual([]);
  });

  it('fixes the default when the window is built: a workspace opened in it later moves neither the capture nor the folder in force', () => {
    const { registry } = captures();
    const workspace = join(dir, 'ws');
    const built = registry.open(4, { level: 'light', outputDir: undefined, workspace: null });
    // The window has since opened a workspace: the card asks with the workspace it holds now.
    expect(registry.folderFor(4, undefined, workspace)).toBe(perUser());
    expect(registry.stateOf(4)).toEqual(built);
    expect(existsSync(defaultDiagnosticsBase(workspace))).toBe(false);
    // And the other way about: a window built for a workspace keeps that workspace's default, whatever it holds now.
    registry.open(5, { level: 'off', outputDir: undefined, workspace });
    expect(registry.folderFor(5, undefined, null)).toBe(defaultDiagnosticsBase(workspace));
    // A chosen folder is the one in force either way (REQ-SHELL-163).
    expect(registry.folderFor(4, join(dir, 'chosen'), workspace)).toBe(join(dir, 'chosen'));
    registry.close(4);
    registry.close(5);
  });

  it('is inactive only when that base itself cannot be written, and says which base', () => {
    const blocked = join(dir, 'per-user-is-a-file');
    writeFileSync(blocked, 'not a directory');
    const { registry, warnings } = captures({ perUserData: blocked });
    const state = registry.open(4, { level: 'light', outputDir: undefined, workspace: null });
    expect(state.state).toBe('inactive');
    expect(state.state === 'inactive' && state.reason).toContain(perUserDiagnosticsBase(blocked));
    expect(state.state === 'inactive' && state.reason).not.toMatch(/nowhere to be written|holds no workspace/);
    expect(warnings).toHaveLength(1);
  });

  it('creates nothing under the per-user default at off', () => {
    const { registry } = captures();
    expect(registry.open(4, { level: 'off', outputDir: undefined, workspace: null })).toEqual({ state: 'off' });
    registry.record(line(1));
    expect(existsSync(perUser())).toBe(false);
  });
});

describe('REQ-STARTUP-132: the manifest', () => {
  it('records schema 3, the identity, the start, the platform triple and every bound and cadence, under a checksum that holds', () => {
    const { registry } = captures();
    const state = registry.open(1, { level: 'light', outputDir: join(dir, 'out'), workspace: null });
    if (state.state !== 'active') throw new Error('no capture');
    const manifest = JSON.parse(readFileSync(join(state.runDirectory, MANIFEST_FILE), 'utf8')) as Record<string, unknown> & { configuration: Record<string, unknown> };
    expect(manifest['schema']).toBe(3);
    expect(manifest['app']).toEqual({ name: 'Rotaris', version: '0.9.0' });
    expect(manifest['createdAt']).toBe('2026-11-03T10:11:12.345Z');
    expect(manifest['platform']).toEqual({ triple: 'win32-arm64-electron44.1.1', os: 'win32', arch: 'arm64', runtime: 'electron44.1.1' });
    expect(manifest['pid']).toBe(PID);
    expect(manifest.configuration).toMatchObject({
      level: 'light',
      outputBase: join(dir, 'out'),
      outputBaseChosen: true,
      runDirectory: state.runDirectory,
      streams: { [APP_LOG_STREAM]: { segmentBytes: 8 * 1024 * 1024, segments: 4, maxBytes: 32 * 1024 * 1024 } },
      snapshotBudgetBytes: 16 * 1024 * 1024,
      samples: { metrics: 4096, spans: 1024, spanNames: 128, otherSpanName: '__other__' },
      cadence: { heartbeatMs: 250, metricIntervalMs: 1000 },
      triggers: { eventLoopLagMs: 1000, cooldownMs: 60_000, rssGrowthBytes: 256 * 1024 * 1024, threadGrowth: 8 },
      deep: { allocationIntervalMs: 300_000, tracingWindowMs: 2000, slowThresholdMs: 1000, sitesPerCapture: 20, sitesInSummary: 10 },
      captured: [APP_LOG_STREAM],
    });
    expect(manifest['checksum']).toMatch(/^[0-9a-f]{64}$/);
    expect(manifestChecksumHolds(manifest)).toBe(true);
    expect(manifestChecksumHolds({ ...manifest, pid: PID + 1 })).toBe(false);
  });

  it('writes nothing else into a fresh run directory but the manifest and the stream it is given', () => {
    const { registry } = captures();
    const state = registry.open(1, { level: 'light', outputDir: join(dir, 'out'), workspace: null });
    if (state.state !== 'active') throw new Error('no capture');
    expect(readdirSync(state.runDirectory)).toEqual([MANIFEST_FILE]);
    registry.record(line(1));
    expect(readdirSync(state.runDirectory).sort()).toEqual([segmentName(APP_LOG_STREAM, 1), MANIFEST_FILE].sort());
  });
});

describe('REQ-STARTUP-133: a stream is at most four segments of the segment bound, the oldest replaced', () => {
  /** Each record serialises to exactly 99 bytes and a line break: 100 bytes a line. */
  const sized = (i: number) => ({ n: i, pad: 'x'.repeat(100 - 1 - JSON.stringify({ n: i, pad: '' }).length) });

  it('rolls to the next segment at the byte bound, never splitting a line, and keeps every record across a boundary', () => {
    const stream = new SegmentedJsonLines(dir, 's', { segmentBytes: 300, segments: 4 });
    for (let i = 100; i < 107; i += 1) stream.append(sized(i));
    stream.close();
    expect(readdirSync(dir).sort()).toEqual(['s-01.jsonl', 's-02.jsonl', 's-03.jsonl']);
    expect(['s-01.jsonl', 's-02.jsonl', 's-03.jsonl'].map((name) => statSync(join(dir, name)).size)).toEqual([300, 300, 100]);
    expect(readStream(dir, 's').records.map((r) => (r as { n: number }).n)).toEqual([100, 101, 102, 103, 104, 105, 106]);
  });

  it('replaces the oldest once the fourth is full, so the stream never holds more than four segments', () => {
    const stream = new SegmentedJsonLines(dir, 's', { segmentBytes: 300, segments: 4 });
    for (let i = 100; i < 120; i += 1) {
      stream.append(sized(i));
      const files = readdirSync(dir);
      expect(files.length).toBeLessThanOrEqual(4);
      expect(files.reduce((sum, name) => sum + statSync(join(dir, name)).size, 0)).toBeLessThanOrEqual(4 * 300);
    }
    stream.close();
    // 20 records at three a segment: segments 1 to 7, of which the newest four remain.
    expect(readdirSync(dir).sort()).toEqual(['s-04.jsonl', 's-05.jsonl', 's-06.jsonl', 's-07.jsonl']);
    const read = readStream(dir, 's');
    expect(read.records.map((r) => (r as { n: number }).n)).toEqual([109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119]);
    expect(read.truncated).toBe(false);
  });

  it('does not write a record larger than a segment, and counts it', () => {
    const stream = new SegmentedJsonLines(dir, 's', { segmentBytes: 50, segments: 4 });
    stream.append({ message: 'y'.repeat(60) });
    stream.append({ n: 1 });
    stream.close();
    expect(stream.oversized).toBe(1);
    expect(readStream(dir, 's').records).toEqual([{ n: 1 }]);
  });

  it('feeds a window\'s capture every recorded line, and rolls it at the bound the registry is given', () => {
    const { registry } = captures({ bounds: { segmentBytes: 400, segments: 4 } });
    const state = registry.open(1, { level: 'light', outputDir: join(dir, 'out'), workspace: null });
    if (state.state !== 'active') throw new Error('no capture');
    for (let i = 0; i < 60; i += 1) registry.record(line(i));
    registry.close(1);
    const read = readStream(state.runDirectory, APP_LOG_STREAM);
    expect(read.segments).toHaveLength(4);
    const kept = read.records as AppLogRecord[];
    expect(kept.at(-1)).toEqual(line(59));
    // Contiguous up to the newest: nothing between the oldest kept and the newest was lost at a boundary.
    const first = Number(kept[0]?.message.slice(5));
    expect(kept.map((r) => r.message)).toEqual(Array.from({ length: 60 - first }, (_, k) => line(first + k).message));
  });

  it('stops for good on a failed write, says so once, and shows the window\'s capture as stopped', () => {
    const { registry, warnings } = captures({ bounds: { segmentBytes: 200, segments: 4 } });
    const state = registry.open(1, { level: 'light', outputDir: join(dir, 'out'), workspace: null });
    if (state.state !== 'active') throw new Error('no capture');
    writeFileSync(join(state.runDirectory, segmentName(APP_LOG_STREAM, 2)), 'in the way'); // the next segment cannot be created
    for (let i = 0; i < 10; i += 1) registry.record(line(i));
    expect(warnings).toHaveLength(1);
    expect(registry.stateOf(1).state).toBe('inactive');
    expect(readFileSync(join(state.runDirectory, segmentName(APP_LOG_STREAM, 2)), 'utf8')).toBe('in the way');
  });
});

describe('REQ-SHELL-163: a choice reaches the windows built afterwards and never a running capture', () => {
  it('keeps window 1 capturing after the level is set off for window 2, and stops writing when window 1 closes', () => {
    const { registry, clock } = captures();
    const one = registry.open(1, { level: 'light', outputDir: join(dir, 'out'), workspace: null });
    clock.at = instant(START + 2000);
    expect(registry.open(2, { level: 'off', outputDir: join(dir, 'out'), workspace: null })).toEqual({ state: 'off' });
    registry.record(line(1));
    if (one.state !== 'active') throw new Error('no capture');
    expect(readStream(one.runDirectory, APP_LOG_STREAM).records).toEqual([line(1)]);
    registry.close(1);
    registry.record(line(2));
    expect(readStream(one.runDirectory, APP_LOG_STREAM).records).toEqual([line(1)]);
    expect(registry.stateOf(1)).toEqual({ state: 'off' });
    expect(readdirSync(join(dir, 'out'))).toEqual([`20261103T101112Z-${PID}`]);
  });

  it('writes every line to each window capturing, each into its own run directory', () => {
    const { registry, clock } = captures();
    const one = registry.open(1, { level: 'light', outputDir: join(dir, 'out'), workspace: null });
    clock.at = instant(START + 1000);
    const two = registry.open(2, { level: 'deep', outputDir: join(dir, 'out'), workspace: null });
    registry.record(line(1));
    if (one.state !== 'active' || two.state !== 'active') throw new Error('no capture');
    expect(two.runDirectory).toBe(join(dir, 'out', `20261103T101113Z-${PID}`));
    expect(readStream(one.runDirectory, APP_LOG_STREAM).records).toEqual([line(1)]);
    expect(readStream(two.runDirectory, APP_LOG_STREAM).records).toEqual([line(1)]);
  });
});

describe('REQ-STARTUP-138: a crash-truncated final line stays readable', () => {
  it('drops a cut final record and reports it, keeping every whole one', () => {
    expect(readJsonLines('{"n":1}\n{"n":2}\n{"n":3,"mess')).toEqual({ records: [{ n: 1 }, { n: 2 }], truncated: true });
  });

  it('keeps a final record that is whole though its line break was never written', () => {
    expect(readJsonLines('{"n":1}\n{"n":2}')).toEqual({ records: [{ n: 1 }, { n: 2 }], truncated: false });
  });

  it('reads a cut number or string as cut, not as a record', () => {
    expect(readJsonLines('{"n":1}\n12')).toEqual({ records: [{ n: 1 }], truncated: true });
    expect(readJsonLines('')).toEqual({ records: [], truncated: false });
  });

  it('names a malformed line that is not the last, since no crash leaves one there', () => {
    expect(() => readJsonLines('{"n":1}\n{oops\n{"n":3}\n')).toThrow('line 2');
  });

  it('reads a run\'s stream whose newest segment a crash cut', () => {
    writeFileSync(join(dir, 's-01.jsonl'), '{"n":1}\n');
    writeFileSync(join(dir, 's-02.jsonl'), '{"n":2}\n{"n":3,"m":"cu');
    expect(readStream(dir, 's')).toEqual({ records: [{ n: 1 }, { n: 2 }], truncated: true, segments: ['s-01.jsonl', 's-02.jsonl'] });
  });

  it('records the stream bound the requirement fixes', () => {
    expect(DIAGNOSTICS_BOUNDS.streamSegmentBytes * DIAGNOSTICS_BOUNDS.streamSegments).toBe(32 * 1024 * 1024);
  });
});
