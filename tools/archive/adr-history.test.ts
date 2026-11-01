/**
 * The ADR history kind of the archive (`tools/archive/adr-history.mjs`, R-092), over a fixture record on disk: a header
 * with a revision bullet, a Decision section whose correction is the decision as it reads, a first execution with a
 * correction that holds only the falsified reason, one that holds its replacement, a struck sentence beside its dated
 * replacement and a struck phrase inside a sentence, and a part with a correction that points at the section below.
 * What must hold: exactly the history leaves, the record keeps one line where each passage stood, the links in a moved
 * passage reach what they reached, and a second run changes nothing.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { commit, plan, stillLive } from './migrate.mjs';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { passagesOf } from './adr-history.mjs';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { firstSentenceEnd } from './text.mjs';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { checkRecord } from '../check-record-links.mjs';

const ADR = 'docs/architecture/adr/0007-a-record.md';
const PART = 'docs/architecture/adr/0007-a-record/02-second-execution.md';
const HISTORY = 'docs/archive/architecture/adr/0007-history.md';

const DECISION_CORRECTION = '*Corrected 2026-09-13, by the coverage.* **Creating the parent is inside the try**, so a failure is reported.';
const INSIDE_CORRECTION = [
  '*Corrected 2026-09-30, the claim above kept as it was built:* "every write" listed refused writes too. That reason is',
  'kept here beside its replacement: the list now skips a refused write.',
].join('\n');

const FIXTURE: Record<string, string> = {
  'docs/README.md': ['# The record', '', '## The archive', '', 'What moves there.', ''].join('\n'),
  'docs/spec/01-domain.md': '# Domain\n',
  [ADR]: [
    '# ADR-0007 — A record',
    '',
    '- **Status:** proposed',
    '- **Date:** 2026-08-31',
    '- **Revised:** 2026-09-01, to carry SR-1 (one running instance).',
    '- **Revised again:** 2026-09-02, against `../spikes/a-spike.md`. **Every decision survives.** Two reasons do',
    '  not, and each is corrected in place (see [the spec](../../spec/01-domain.md)).',
    '',
    '## Decision',
    '',
    'The parent is created first.',
    '',
    DECISION_CORRECTION,
    '',
    '## First execution — 2026-09-05',
    '',
    'Point 2 reads each pair three times.',
    '',
    '**Corrected 2026-10-01 (R-067): point 2 described the readings, and they were not taken that way.** The falsified',
    'claim was "three times". See [the spec](../../spec/01-domain.md).',
    '',
    'The replacement: each pair is read seven times, interleaved.',
    '',
    'The list holds every write.',
    '',
    INSIDE_CORRECTION,
    '',
    'The loop stops. ~~The MCP loop withholds a tool the lists do not name, the same fail-closed reading.~~ *Falsified',
    '2026-09-29 by the verifier, kept beside its replacement:* the loop drops it from the map alone.',
    '',
    'Seven ~~eight~~ members dispatch to nothing. *Corrected 2026-10-02:* seven.',
    '',
  ].join('\n'),
  [PART]: [
    '# ADR-0007 — A record — Second execution',
    '',
    'Part 2 of 2 of [ADR-0007](../0007-a-record.md), which indexes every part.',
    '',
    '## Second execution — 2026-09-06',
    '',
    'The lock is held through the continued run.',
    '',
    '*Corrected 2026-09-29 (R-067): "held through the continued run" was true of the first continue only. The claim is',
    'kept as it was measured; what the later continue does now is the section "the lock taken back" below.*',
    '',
    '**Found: nothing in this record.**',
    '',
  ].join('\n'),
};

let root: string;

function write(at: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(at, path)), { recursive: true });
    writeFileSync(join(at, path), text);
  }
}

const read = (path: string) => readFileSync(join(root, path), 'utf8');

function snapshot(at: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out[relative(at, full).split(sep).join('/')] = readFileSync(full, 'utf8');
    }
  };
  walk(at);
  return out;
}

function migrate() {
  const result = plan(root);
  commit(result.changed);
  return result;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'archive-adr-history-'));
  write(root, FIXTURE);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('ADR history — what is history', () => {
  it('starts from a fixture the link gate passes', () => {
    expect(checkRecord(root).problems).toEqual([]);
  });

  it('finds a revision\'s explanation, a correction that holds only the falsified reason, and a whole struck sentence', () => {
    const found = passagesOf(read(ADR), { index: true }).map((p: { kind: string; date: string; line: number }) => [p.kind, p.date, p.line]);
    expect(found).toEqual([
      ['revision', '2026-09-02', 6],
      ['correction', '2026-10-01', 19],
      ['struck', '2026-09-29', 29],
    ]);
    expect(passagesOf(read(PART), { index: false }).map((p: { kind: string; date: string }) => [p.kind, p.date])).toEqual([['correction', '2026-09-29']]);
  });

  it('leaves what is decision: a correction under Decision, one that holds its replacement, a struck word, a one-sentence revision', () => {
    migrate();
    const adr = read(ADR);
    expect(adr).toContain(DECISION_CORRECTION);
    expect(adr).toContain(INSIDE_CORRECTION);
    expect(adr).toContain('Seven ~~eight~~ members dispatch to nothing.');
    expect(adr).toContain('- **Revised:** 2026-09-01, to carry SR-1 (one running instance).\n');
    expect(adr).toContain('The replacement: each pair is read seven times, interleaved.');
  });
});

describe('ADR history — the move', () => {
  it('replaces each passage with one History line and moves it verbatim under its anchor', () => {
    const { moves } = migrate();
    expect(moves.map((m: { id: string; from: string; to: string }) => [m.id, m.from, m.to])).toEqual([
      ['ADR-0007 revision 2026-09-02', ADR, `${HISTORY}#revision-2026-09-02`],
      ['ADR-0007 correction 2026-10-01', ADR, `${HISTORY}#correction-2026-10-01`],
      ['ADR-0007 struck 2026-09-29', ADR, `${HISTORY}#struck-2026-09-29`],
      ['ADR-0007 correction 2026-09-29', PART, `${HISTORY}#correction-2026-09-29`],
    ]);
    const adr = read(ADR);
    expect(adr).toContain(
      '- **Revised again:** 2026-09-02, against `../spikes/a-spike.md`. *History: [the revision of 2026-09-02](../../archive/architecture/adr/0007-history.md#revision-2026-09-02).*\n\n## Decision',
    );
    expect(adr).toContain(
      '## First execution — 2026-09-05\n\nPoint 2 reads each pair three times.\n\n' +
        '*History: [the correction of 2026-10-01](../../archive/architecture/adr/0007-history.md#correction-2026-10-01).*\n\n' +
        'The replacement: each pair is read seven times, interleaved.',
    );
    expect(adr).toContain(
      'The loop stops. *History: [the struck text of 2026-09-29](../../archive/architecture/adr/0007-history.md#struck-2026-09-29).* *Falsified',
    );
    expect(read(PART)).toContain(
      'The lock is held through the continued run.\n\n*History: [the correction of 2026-09-29](../../../archive/architecture/adr/0007-history.md#correction-2026-09-29).*\n\n**Found',
    );
    const history = read(HISTORY);
    expect(history.startsWith('# ADR-0007 — history\n\nThe passages of [ADR-0007](../../../architecture/adr/0007-a-record.md)')).toBe(true);
    expect(history).toContain(
      [
        '<a id="revision-2026-09-02"></a>',
        '',
        '**The revision of 2026-09-02**, from [0007-a-record.md](../../../architecture/adr/0007-a-record.md), the header:',
        '',
        '**Every decision survives.** Two reasons do',
        'not, and each is corrected in place (see [the spec](../../../spec/01-domain.md)).',
      ].join('\n'),
    );
    expect(history).toContain('claim was "three times". See [the spec](../../../spec/01-domain.md).');
    expect(history).toContain('~~The MCP loop withholds a tool the lists do not name, the same fail-closed reading.~~');
    expect(checkRecord(root).problems).toEqual([]);
  });

  it('changes nothing on a second run, and --check is red before the move and green after', () => {
    expect(stillLive(root)).toEqual([
      `${ADR}:6 (an ADR's revision of 2026-09-02)`,
      `${ADR}:19 (an ADR's correction of 2026-10-01)`,
      `${ADR}:29 (an ADR's struck text of 2026-09-29)`,
      `${PART}:9 (an ADR's correction of 2026-09-29)`,
    ]);
    migrate();
    const before = snapshot(root);
    const again = plan(root);
    expect(again.moves).toEqual([]);
    expect(again.changed.size).toBe(0);
    expect(snapshot(root)).toEqual(before);
    expect(stillLive(root)).toEqual([]);
  });

  it('gives a second passage of the same kind and date its own anchor, after the first', () => {
    migrate();
    write(root, { [PART]: `${read(PART)}\n**Corrected 2026-09-29 (fin7): the second.** Falsified.\n\nThe replacement: the third.\n` });
    const { moves } = migrate();
    expect(moves.map((m: { to: string }) => m.to)).toEqual([`${HISTORY}#correction-2026-09-29-2`]);
    expect(read(HISTORY).indexOf('id="correction-2026-09-29-2"')).toBeGreaterThan(read(HISTORY).indexOf('id="correction-2026-09-29"'));
    expect(checkRecord(root).problems).toEqual([]);
  });
});

describe('the first sentence of a Markdown text', () => {
  it('ends after closing emphasis, never inside it, a bracket, code or an abbreviation', () => {
    const at = (text: string) => {
      const end = firstSentenceEnd(text);
      return end < 0 ? null : text.slice(0, end);
    };
    expect(at('- **Revised 2026-09-02.** Two things.')).toBe('- **Revised 2026-09-02.**');
    expect(at('- **Revised:** 2026-09-01. **Every decision survives. Four reasons** do not.')).toBe('- **Revised:** 2026-09-01.');
    expect(at('**Every decision survives. Four reasons do not.** Rest.')).toBe('**Every decision survives. Four reasons do not.**');
    expect(at('Read `a. B` and (see e.g. ADR-1. It) then. Next')).toBe('Read `a. B` and (see e.g. ADR-1. It) then.');
    expect(at('One sentence only.')).toBeNull();
  });
});
