import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { err, mintWorkspaceId, ok } from '@rotaris/kernel';
import type { Actor, BoardProjection, CriterionOutcome, RequirementDetail, RequirementsShape, ReviewPayload, ShapeView, SurveyOutcome, TransitionOutcome } from '@rotaris/contracts';
import { nodeClocks } from '@rotaris/platform';
import { forgetSpelling, openWorkspaceStore, type ResolvedStore } from '@rotaris/store';
import { createInThreadExecutor, createTraceabilityEngine, fsArtifactIo, measureShape, recordOf, writeShapeRecord } from '@rotaris/workspace';
import { createDeliveryService, type DeliveryService, type RunGitPort } from './delivery.js';

/**
 * PD-TRACE-002 (REQ-ADOPT-041 to REQ-ADOPT-051) over the REAL delivery service, a REAL store and the REAL traceability engine: a workspace the built-in
 * layout reads nothing from is read through its accepted shape (clause 4), its document's status is taken (clause 5),
 * a tick and a status word are written surgically (clause 6), and an acceptance is written in the run's worktree and
 * committed there (clause 8). Git's provisioning is faked into a real repository so the commit is Git's own.
 */
const USER: Actor = { kind: 'user', person: 'owner' };
const SYSTEM: Actor = { kind: 'system' };
const DOC = '# Stories\n\n### US-1 Login works\n\nStatus: Todo\n\n- [ ] rejects a bad password\n- [x] accepts a good one\n\n### US-2 Logout works\n\nStatus: Done\n\n### US-3 Lockout\n\nStatus: In Progress\n';
const SHAPE: RequirementsShape = {
  version: 1, identifier: 'US-\\d+', implRoots: ['src'], testRoots: [], obligations: 'optional', notes: '',
  stores: [{ dir: 'docs/stories', definition: '^###\\s+(?<id>US-\\d+)\\s+(?<title>.+)$', criteria: true, status: { pattern: '^Status:\\s*(?<status>[A-Za-z ]+?)\\s*$', words: [{ word: 'Todo', delivery: 'backlog' }, { word: 'In Progress', delivery: 'running' }, { word: 'Done', delivery: 'done' }] } }],
};

let root: string;
let ws: string;
let r: ResolvedStore;
let s: DeliveryService;
let unitDir = '';
let unit = '';
const changed: number[] = [];

const git = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd, encoding: 'utf8' });

function start(): void {
  const clocks = nodeClocks();
  const port: RunGitPort = {
    checkRepository: async () => ({ ok: true, head: 'abc123' }),
    takeOver: async () => err('no tree to take over in this suite'),
    provision: async (a) => {
      unit = a.unit;
      unitDir = join(root, 'worktrees', a.unit);
      mkdirSync(unitDir, { recursive: true });
      cpSync(join(ws, 'docs'), join(unitDir, 'docs'), { recursive: true });
      git(unitDir, 'init', '-q');
      git(unitDir, 'add', '-A');
      git(unitDir, 'commit', '-q', '-m', 'base');
      return ok({ ref: `${a.id}/${a.unit}`, path: unitDir, branch: `rotaris/req/${a.id.toLowerCase()}/${a.unit}`, baseBranch: 'main', baseRevision: 'abc123' });
    },
  };
  const engine = createTraceabilityEngine({ executor: createInThreadExecutor(clocks), io: fsArtifactIo(clocks.timers), clocks });
  s = createDeliveryService({ db: r.db, workspaceRoot: ws, engine, clocks, log: () => undefined, configDir: root, git: port, onChanged: (g) => changed.push(g) });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rotaris-surveyed-'));
  ws = mkdtempSync(join(tmpdir(), 'rotaris-surveyed-ws-'));
  mkdirSync(join(ws, 'docs', 'stories'), { recursive: true });
  mkdirSync(join(ws, 'src'), { recursive: true });
  writeFileSync(join(ws, 'docs', 'stories', 'auth.md'), DOC);
  writeFileSync(join(ws, 'src', 'login.ts'), '// US-1\n');
  expect(writeShapeRecord(ws, recordOf(SHAPE, measureShape(ws, SHAPE), 'survey', '2026-11-21T00:00:00.000Z'))).toEqual({ ok: true });
  r = openWorkspaceStore(root, mintWorkspaceId('0000000000000000000000000000ac02'), ws);
  changed.length = 0;
  start();
});
afterEach(() => { r.db.close(); forgetSpelling(r.dir); rmSync(root, { recursive: true, force: true }); rmSync(ws, { recursive: true, force: true }); });

const board = async (): Promise<BoardProjection> => (await s.handle({ name: 'requirements.board', workspace: ws }, USER)).value as BoardProjection;
const detail = async (id: string): Promise<RequirementDetail> => (await s.handle({ name: 'requirements.detail', workspace: ws, id }, USER)).value as RequirementDetail;
const doc = (dir: string = ws): string => readFileSync(join(dir, 'docs', 'stories', 'auth.md'), 'utf8');
const act = async (id: string, action: 'release' | 'accept' | 'hold' | 'resume', payload?: Readonly<Record<string, string>>) => (await s.handle({ name: 'requirements.act', workspace: ws, id, action, ...(payload === undefined ? {} : { payload }) }, USER)).value as { ok: boolean; value?: TransitionOutcome; error?: { reason: string } };

describe('PD-TRACE-002: a workspace read through its accepted shape', () => {
  it('draws every extracted requirement as a card, with the state its document declares (clauses 4 and 5)', async () => {
    const b = await board();
    expect(b.surveyed).toEqual({ origin: 'local', stores: ['docs/stories'] });
    // US-2's document says Done; US-3's "In Progress" is the pipeline's to reach and is not taken as a resting state.
    expect(b.cards.map((c) => [c.id, c.title, c.column, c.health])).toEqual([['US-1', 'Login works', 'backlog', 'healthy'], ['US-2', 'Logout works', 'done', 'healthy'], ['US-3', 'Lockout', 'backlog', 'healthy']]);
    expect(b.cards[0]!.evidence.implementationTrace).toBe('satisfied');
    expect(b.source).toMatchObject({ kind: 'store', dir: 'docs/stories', writable: false, canCreate: false });
    const d = await detail('US-1');
    expect(d.place).toEqual({ document: 'docs/stories/auth.md', line: 3, endLine: 8, status: { word: 'Todo', delivery: 'backlog' }, criteria: [{ text: 'rejects a bad password', checked: false, line: 7 }, { text: 'accepts a good one', checked: true, line: 8 }] });
    const history = (await detail('US-2')).history;
    expect(history).toMatchObject([{ action: 'document-declared', from: 'backlog', to: 'done', actor: { kind: 'system' } }]);
  });

  it('answers the strip\'s read without a model, and refuses a survey it cannot ask a model for (clauses 2 and 3)', async () => {
    const view = (await s.handle({ name: 'requirements.shape', workspace: ws }, USER)).value as ShapeView;
    expect(view).toMatchObject({ state: 'accepted', origin: 'local', count: 3, drift: { mentionedCount: 0, emptyCount: 0 } });
    // No model is reachable in this suite: the survey falls back to the scripted draft and says so; nothing is recorded by it.
    const before = readFileSync(join(ws, '.rotaris', 'requirements-shape.json'), 'utf8');
    const out = (await s.handle({ name: 'requirements.survey', workspace: ws }, USER)).value as SurveyOutcome;
    expect(out).toMatchObject({ ok: true, preview: { model: 'scripted draft', count: 3 } });
    expect(readFileSync(join(ws, '.rotaris', 'requirements-shape.json'), 'utf8')).toBe(before);
    expect((await s.handle({ name: 'requirements.shape.accept', workspace: ws, token: 'not-a-token' }, USER)).value).toMatchObject({ ok: false });
  });

  it('ticks one criterion in the document, changing that mark alone, and refuses a criterion that moved (clause 6)', async () => {
    await board();
    const out = (await s.handle({ name: 'requirements.criterion', workspace: ws, id: 'US-1', index: 0, text: 'rejects a bad password', checked: true }, USER)).value as CriterionOutcome;
    expect(out).toEqual({ ok: true, document: 'docs/stories/auth.md', line: 7 });
    expect(doc()).toBe(DOC.replace('- [ ] rejects', '- [x] rejects'));
    expect((await detail('US-1')).place!.criteria[0]!.checked).toBe(true);
    // A tick is state, not specification: the card did not leave its column for it.
    expect((await board()).cards[0]!.column).toBe('backlog');
    const moved = (await s.handle({ name: 'requirements.criterion', workspace: ws, id: 'US-1', index: 0, text: 'something else', checked: false }, USER)).value as CriterionOutcome;
    expect(moved).toMatchObject({ ok: false, reason: expect.stringMatching(/no longer reads/) });
    expect(doc()).toBe(DOC.replace('- [ ] rejects', '- [x] rejects'));
  });

  it('writes the status word a delivery change maps to, uncommitted in the working tree (clauses 6 and 8)', async () => {
    await board();
    expect(await act('US-3', 'hold', { reason: 'waiting on a decision' })).toMatchObject({ ok: true, value: { to: 'blocked' } });
    // Blocked is a condition with no word in this vocabulary: nothing is written for it.
    expect(doc()).toBe(DOC);
    const back = await act('US-3', 'resume');
    expect(back).toMatchObject({ ok: true, value: { to: 'backlog', document: expect.stringMatching(/^Wrote status "Todo" to docs\/stories\/auth\.md; the change is uncommitted/) } });
    expect(doc()).toBe(DOC.replace('Status: In Progress', 'Status: Todo'));
  });

  it('an acceptance is written in the run\'s worktree and committed there, and the workspace\'s older copy does not undo it (clauses 7 and 8)', async () => {
    await board();
    expect(await act('US-1', 'release', { disclosure: 'off' })).toMatchObject({ ok: true });
    expect((await s.handle({ name: 'requirements.run.started', workspace: ws, id: 'US-1', unit, sessionId: 'session-1', permissions: 'ask' }, SYSTEM)).value).toMatchObject({ ok: true });
    expect((await s.handle({ name: 'requirements.run.ended', workspace: ws, sessionId: 'session-1', outcome: 'completed', detail: 'done' }, SYSTEM)).value).toMatchObject({ settled: true, to: 'review' });
    const review = (await s.handle({ name: 'requirements.review', workspace: ws, id: 'US-1' }, USER)).value as ReviewPayload;
    // No session row carries a summary in this suite, so nothing is reported of either criterion — and nothing is assumed met.
    expect(review.criteria).toEqual([{ index: 0, text: 'rejects a bad password', checked: false, claim: 'unstated' }, { index: 1, text: 'accepts a good one', checked: true, claim: 'unstated' }]);
    const accepted = await act('US-1', 'accept');
    expect(accepted).toMatchObject({ ok: true, value: { to: 'done', document: 'Wrote status "Done" to docs/stories/auth.md and committed it on the run\'s branch.' } });
    expect(doc(unitDir)).toBe(DOC.replace('Status: Todo', 'Status: Done'));
    expect(git(unitDir, 'log', '--format=%s', '-1').trim()).toBe('docs(US-1): the accepted criteria and status of US-1');
    expect(git(unitDir, 'status', '--porcelain').trim()).toBe('');
    // The workspace's own copy still reads Todo until the branch is merged; the board keeps the acceptance.
    expect(doc()).toBe(DOC);
    await s.handle({ name: 'requirements.refresh', workspace: ws }, USER);
    expect((await board()).cards[0]!.column).toBe('done');
  });

  it('reads the board again when a document changes by another hand (clause 10)', async () => {
    await board();
    writeFileSync(join(ws, 'docs', 'stories', 'auth.md'), DOC.replace('Status: Todo', 'Status: Done'));
    const deadline = Date.now() + 5_000;
    while (changed.length === 0 && Date.now() < deadline) await new Promise((res) => setTimeout(res, 50));
    expect(changed.length).toBeGreaterThan(0);
    expect((await board()).cards[0]!.column).toBe('done');
  });

  it('exports the shape to the repository root, and reads it from there (clause 9)', async () => {
    await board();
    expect((await s.handle({ name: 'requirements.shape.export', workspace: ws }, USER)).value).toEqual({ ok: true, path: 'rotaris-requirements-shape.json', written: 'written' });
    expect(JSON.parse(readFileSync(join(ws, 'rotaris-requirements-shape.json'), 'utf8'))).toEqual(SHAPE);
    await s.handle({ name: 'requirements.refresh', workspace: ws }, USER);
    expect((await board()).surveyed).toEqual({ origin: 'repository', stores: ['docs/stories'] });
    // A repository file that does not validate is stated on the board and draws no card around itself.
    writeFileSync(join(ws, 'rotaris-requirements-shape.json'), JSON.stringify({ ...SHAPE, write_to: 'x' }));
    await s.handle({ name: 'requirements.refresh', workspace: ws }, USER);
    const b = await board();
    expect(b.cards).toEqual([]);
    expect(b.parseErrors.map((e) => e.message).join(' ')).toMatch(/rotaris-requirements-shape\.json could not be read: .*unknown key write_to/);
    expect(existsSync(join(ws, '.rotaris', 'requirements-shape.json'))).toBe(true);
  });
});
