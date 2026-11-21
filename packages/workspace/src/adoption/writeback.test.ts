/** PD-TRACE-002 clauses 6 to 8 (REQ-ADOPT-046, REQ-ADOPT-047): the two surgical writes, their guard against a file changed underneath, and what they leave untouched. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RequirementsShape } from '@rotaris/contracts';
import { measureShape } from './shape.js';
import { statusWordFor, storeOf, writeBack } from './writeback.js';

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'rotaris-wb-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); }
  return root;
}
const DOC = '# Stories\r\n\r\n### US-1 Login works\r\n\r\nStatus: In Progress  \r\n\r\n- [ ] rejects a bad password\r\n* [X] accepts a good one\r\n1. [ ] locks after five\r\n\r\n### US-2 Logout\n\nStatus: Todo\n';
const SHAPE: RequirementsShape = {
  version: 1, identifier: 'US-\\d+', implRoots: [], testRoots: [], obligations: 'optional', notes: '',
  stores: [{ dir: 'docs', definition: '^###\\s+(?<id>US-\\d+)\\s+(?<title>.+)$', criteria: true, status: { pattern: '^Status:\\s*(?<status>[A-Za-z ]+?)\\s*$', words: [{ word: 'Todo', delivery: 'backlog' }, { word: 'In Progress', delivery: 'running' }, { word: 'Done', delivery: 'done' }] } }],
};
const read = (root: string): string => readFileSync(join(root, 'docs/s.md'), 'utf8');

describe('write-back changes one token on one line and nothing else (clause 6)', () => {
  it('writes a status word and keeps the line endings, the trailing spaces and every other byte', () => {
    const root = project({ 'docs/s.md': DOC });
    const r = writeBack(root, SHAPE, 'US-1', { status: 'Done' });
    expect(r).toMatchObject({ ok: true, changed: true, lines: [5], document: 'docs/s.md' });
    expect(read(root)).toBe(DOC.replace('Status: In Progress  \r\n', 'Status: Done  \r\n'));
  });

  it('ticks and unticks criteria by index and text, whatever their list marker', () => {
    const root = project({ 'docs/s.md': DOC });
    const r = writeBack(root, SHAPE, 'US-1', { ticks: [{ index: 0, text: 'rejects a bad password', checked: true }, { index: 1, text: 'accepts a good one', checked: false }, { index: 2, text: 'locks after five', checked: true }] });
    expect(r).toMatchObject({ ok: true, lines: [7, 8, 9] });
    expect(read(root)).toBe(DOC.replace('- [ ] rejects', '- [x] rejects').replace('* [X] accepts', '* [ ] accepts').replace('1. [ ] locks', '1. [x] locks'));
  });

  it('writes status and ticks in one replacement, and reports the new hash the board reads next', () => {
    const root = project({ 'docs/s.md': DOC });
    const r = writeBack(root, SHAPE, 'US-1', { status: 'Done', ticks: [{ index: 0, text: 'rejects a bad password', checked: true }] });
    if (!r.ok) throw new Error(r.reason);
    expect(measureShape(root, SHAPE).documents[0]!.contentHash).toBe(r.contentHash);
  });

  it('changes nothing and says so when the document already reads that way', () => {
    const root = project({ 'docs/s.md': DOC });
    expect(writeBack(root, SHAPE, 'US-1', { status: 'In Progress', ticks: [{ index: 1, text: 'accepts a good one', checked: true }] })).toMatchObject({ ok: true, changed: false, lines: [] });
    expect(read(root)).toBe(DOC);
  });
});

describe('a write is refused, never merged, when the document is not what was read (clause 6)', () => {
  it('refuses on a changed file', () => {
    const root = project({ 'docs/s.md': DOC });
    const hash = measureShape(root, SHAPE).documents[0]!.contentHash;
    writeFileSync(join(root, 'docs/s.md'), DOC.replace('Logout', 'Sign out'));
    expect(writeBack(root, SHAPE, 'US-1', { status: 'Done' }, hash)).toMatchObject({ ok: false, reason: expect.stringMatching(/changed since the board last read it/) });
    expect(read(root)).toBe(DOC.replace('Logout', 'Sign out'));
  });
  it.each([
    ['a criterion whose text moved', { ticks: [{ index: 0, text: 'accepts a good one', checked: true }] }, /no longer reads/],
    ['a criterion that is not there', { ticks: [{ index: 7, text: 'x', checked: true }] }, /no longer reads/],
    ['a status of two lines', { status: 'Done\nmore' }, /one line/],
  ])('refuses %s', (_w, edit, reason) => {
    const root = project({ 'docs/s.md': DOC });
    expect(writeBack(root, SHAPE, 'US-1', edit)).toMatchObject({ ok: false, reason: expect.stringMatching(reason) });
    expect(read(root)).toBe(DOC);
  });
  it('refuses a requirement the shape no longer finds, and one with no place for a status', () => {
    const root = project({ 'docs/s.md': '### US-1 Login\n\n- [ ] a\n' });
    expect(writeBack(root, SHAPE, 'US-9', { status: 'Done' })).toMatchObject({ ok: false, reason: expect.stringMatching(/no longer found/) });
    expect(writeBack(root, SHAPE, 'US-1', { status: 'Done' })).toMatchObject({ ok: false, reason: expect.stringMatching(/no place to write one/) });
  });
});

describe('the word a delivery state is written as', () => {
  it('is the shape\'s own, and none where the vocabulary has none', () => {
    const store = storeOf(SHAPE, 'docs/s.md');
    expect(statusWordFor(store, 'done')).toBe('Done');
    expect(statusWordFor(store, 'review')).toBeUndefined();
    expect(storeOf(SHAPE, 'other/s.md')).toBeUndefined();
  });
});
