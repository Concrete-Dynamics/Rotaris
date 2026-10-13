import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { err, mintWorkspaceId, ok } from '@rotaris/kernel';
import type { Actor, BoardProjection, ReviewPayload, Refusal, TransitionOutcome } from '@rotaris/contracts';
import { nodeClocks } from '@rotaris/platform';
import { forgetSpelling, openWorkspaceStore, type ResolvedStore } from '@rotaris/store';
import { createInThreadExecutor, createTraceabilityEngine, fsArtifactIo } from '@rotaris/workspace';
import { createDeliveryService, type DeliveryService, type RunGitPort } from './delivery.js';

/**
 * REQ-TRACE-427..433 — accepting a run's proposed technical requirement, one at a time, from the review, over the REAL
 * delivery service, a REAL store and Part AJ's REAL traceability engine reading a copy of the fixture requirement store.
 * Only Git is faked (the copy is no repository): the unit's "worktree" is a directory the fake names, where the run's
 * `proposed-requirements.json` is written as a finished run leaves it.
 *
 * docs/defects/fixed/accept-proposal-and-accept-change-work-refuse-citing-oq-45-which-closed-on-2026-09-11.md: until
 * 2026-10-13 the act was refused naming OQ-45's improvement store and the review offered no way to accept a proposal.
 */
const FIXTURE = resolve(import.meta.dirname, '..', '..', 'scripts', 'fixtures', 'requirements-store');
const USER: Actor = { kind: 'user', person: 'owner' };
const SYSTEM: Actor = { kind: 'system' };

let root: string;
let ws: string;
let r: ResolvedStore;
let s: DeliveryService;
let unitDir = '';
let unit = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rotaris-accept-proposal-'));
  ws = mkdtempSync(join(tmpdir(), 'rotaris-accept-proposal-ws-'));
  cpSync(FIXTURE, ws, { recursive: true });
  r = openWorkspaceStore(root, mintWorkspaceId('0000000000000000000000000000ac01'), ws);
  const clocks = nodeClocks();
  const git: RunGitPort = {
    checkRepository: async () => ({ ok: true, head: 'abc123' }),
    takeOver: async () => err('no tree to take over in this suite'),
    provision: async (a) => { unit = a.unit; unitDir = join(ws, '.rotaris', 'requirements', 'worktrees', a.unit); mkdirSync(unitDir, { recursive: true }); return ok({ ref: `${a.id}/${a.unit}`, path: unitDir, branch: `rotaris/req/${a.id.toLowerCase()}/${a.unit}`, baseBranch: 'main', baseRevision: 'abc123' }); },
  };
  const engine = createTraceabilityEngine({ executor: createInThreadExecutor(clocks), io: fsArtifactIo(clocks.timers), clocks });
  s = createDeliveryService({ db: r.db, workspaceRoot: ws, engine, clocks, log: () => undefined, configDir: root, git });
});
afterEach(() => { r.db.close(); forgetSpelling(r.dir); rmSync(root, { recursive: true, force: true }); rmSync(ws, { recursive: true, force: true }); });

/** REQ-101 released, its unit run and finished, its proposals file written where the run leaves it: the card rests in review. */
async function reviewWith(proposals: unknown): Promise<void> {
  const released = await s.handle({ name: 'requirements.act', workspace: ws, id: 'REQ-101', action: 'release', payload: { disclosure: 'off' } }, USER);
  expect((released.value as { ok: boolean }).ok).toBe(true);
  expect((await s.handle({ name: 'requirements.run.started', workspace: ws, id: 'REQ-101', unit, sessionId: 'session-1', permissions: 'ask' }, SYSTEM)).value).toMatchObject({ ok: true });
  mkdirSync(join(unitDir, '.rotaris'), { recursive: true });
  writeFileSync(join(unitDir, '.rotaris', 'proposed-requirements.json'), JSON.stringify(proposals));
  expect((await s.handle({ name: 'requirements.run.ended', workspace: ws, sessionId: 'session-1', outcome: 'completed', detail: 'the unit is done' }, SYSTEM)).value).toMatchObject({ settled: true, to: 'review' });
}
/** The document an acceptance wrote: `<id>-<slug>.md` in the store's directory (the create path's location rule). */
const documentOf = (id: string): string => { const dir = join(ws, 'docs', 'requirements'); const name = readdirSync(dir).find((f) => f.startsWith(`${id}-`) && f.endsWith('.md')); if (name === undefined) throw new Error(`no document for ${id} in ${dir}`); return readFileSync(join(dir, name), 'utf8'); };
const review = async (): Promise<ReviewPayload> => (await s.handle({ name: 'requirements.review', workspace: ws, id: 'REQ-101' }, USER)).value as ReviewPayload;
const accept = async (payload: Readonly<Record<string, string>>) => s.handle({ name: 'requirements.act', workspace: ws, id: 'REQ-101', action: 'accept-proposal', payload }, USER);

/** The detail's history as the reader answers it for a record it can interpret (`handles.ts`), with the reason it carries. */
type History = readonly { readonly action: string; readonly actor: Actor; readonly from: string; readonly to: string; readonly reason: string | null }[];
const historyOf = async (id: string): Promise<History> => ((await s.handle({ name: 'requirements.detail', workspace: ws, id }, USER)).value as { history: History }).history;

const RETENTION = { title: 'Audit log retention', description: 'Audit entries are kept for seven years and then purged.', derivedFrom: 'REQ-101', unit: 'u1' };
const EXPORT = { title: 'Audit log export', description: 'The audit log exports as CSV.', derivedFrom: '', unit: 'u1' };

describe('REQ-TRACE-427..433: a proposed technical requirement is accepted from the review, one at a time', () => {
  it('accepting one writes a technical requirement with its origin link into the store, records the act on the review\'s requirement, and leaves the card in review', async () => {
    await reviewWith([RETENTION, EXPORT]);
    const before = await review();
    expect(before.refusal).toBeUndefined();
    expect(before.work.proposals.map((p) => [p.title, p.acceptedAs])).toEqual([['Audit log retention', null], ['Audit log export', null]]);

    const out = await accept({ proposal: '0', title: RETENTION.title });
    const value = out.value as { ok: boolean; value: TransitionOutcome };
    expect(value.ok).toBe(true);
    expect(value.value).toMatchObject({ id: 'REQ-101', from: 'review', to: 'review', startsRun: false });
    expect(out.changed).toMatchObject({ affected: null });

    const board = (await s.handle({ name: 'requirements.board', workspace: ws }, USER)).value as BoardProjection;
    const created = board.cards.find((c) => c.title === RETENTION.title);
    expect(created).toBeDefined();
    const id = created!.id;
    expect(board.cards.find((c) => c.id === 'REQ-101')!.column).toBe('review');
    // REQ-TRACE-429: the technical type and the origin link, in the store's own document format and location.
    const text = documentOf(id);
    expect(text).toMatch(/^type: technical$/m);
    expect(text).toMatch(/^derived-from: REQ-101$/m);
    expect(text).toContain(RETENTION.description);
    // REQ-TRACE-405/429: the act is attributed and recorded on the review's requirement; the new one records its creation.
    const origin = await historyOf('REQ-101');
    expect(origin.at(-1)).toMatchObject({ action: 'accept-proposal', actor: USER, from: 'review', to: 'review' });
    expect(origin.at(-1)!.reason).toContain(`accepted proposal 0 "${RETENTION.title}" (unit u1) as ${id}`);
    const createdHistory = await historyOf(id);
    expect(createdHistory.map((h) => h.action)).toEqual(['create']);
    expect(createdHistory[0]!.reason).toContain('by accepting a proposal on the review of REQ-101');

    // The review now says it was accepted, and offers the other one; accepting the same one again writes nothing.
    const after = await review();
    expect(after.work.proposals.map((p) => [p.title, p.acceptedAs])).toEqual([['Audit log retention', id], ['Audit log export', null]]);
    const again = await accept({ proposal: '0', title: RETENTION.title });
    expect((again.value as { ok: boolean; error: Refusal }).error.reason).toBe(`"${RETENTION.title}" was already accepted as ${id}; nothing was written.`);
    expect(again.changed).toBeUndefined();

    // A proposal naming no origin derives from the requirement whose run put it forward.
    expect(((await accept({ proposal: '1', title: EXPORT.title })).value as { ok: boolean }).ok).toBe(true);
    const exported = ((await s.handle({ name: 'requirements.board', workspace: ws }, USER)).value as BoardProjection).cards.find((c) => c.title === EXPORT.title)!;
    expect(documentOf(exported.id)).toMatch(/^derived-from: REQ-101$/m);
  });

  it('REQ-TRACE-432: a proposal that is not there, or no longer reads as shown, is refused in the engine\'s words and nothing is written', async () => {
    await reviewWith([RETENTION]);
    const cards = ((await s.handle({ name: 'requirements.board', workspace: ws }, USER)).value as BoardProjection).cards.length;
    const missing = await accept({ proposal: '4' });
    expect((missing.value as { error: Refusal }).error.reason).toBe("REQ-101's run put forward no proposal 4; reload the review. Nothing was written.");
    const moved = await accept({ proposal: '0', title: 'Something else' });
    expect((moved.value as { error: Refusal }).error.reason).toBe('Proposal 0 of REQ-101\'s run no longer reads "Something else"; reload the review. Nothing was written.');
    const unnamed = await accept({});
    expect((unnamed.value as { error: Refusal }).error.reason).toBe('Accepting a proposed technical requirement on REQ-101 needs the proposal to accept; none was named, so nothing was written.');
    for (const o of [missing, moved, unnamed]) expect(o.changed).toBeUndefined();
    expect(((await s.handle({ name: 'requirements.board', workspace: ws }, USER)).value as BoardProjection).cards.length).toBe(cards);
    expect((await historyOf('REQ-101')).map((h) => h.action)).not.toContain('accept-proposal');
  });

  it('accept-change-work is refused naming the offer it needs, not OQ-45 (REQ-TRACE-411..413)', async () => {
    const out = await s.handle({ name: 'requirements.act', workspace: ws, id: 'REQ-101', action: 'accept-change-work' }, USER);
    const reason = (out.value as { error: Refusal }).error.reason;
    expect(reason).toMatch(/needs the change-analysis offer of REQ-TRACE-411/);
    expect(reason).not.toMatch(/OQ-45|improvement store/);
    expect(out.changed).toBeUndefined();
  });
});
