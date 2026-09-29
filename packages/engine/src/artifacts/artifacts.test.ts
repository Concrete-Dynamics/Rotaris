import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, type SessionId } from '@rotaris/kernel';
import { normaliseArtifactTags } from '@rotaris/contracts';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { ArtifactStore } from './store.js';
import { artifactOps } from './port.js';
import { deriveImportance, mintArtifactId, uniqueSlug } from './record.js';
import { renderSidecar, SIDECAR_SECTIONS } from './sidecar.js';
import { fullContextBlock, siblingIndexBlock, siblingIndexOrder, SIBLING_INDEX_BUDGET } from './context.js';

/**
 * Part Y — the session artifact store (REQ-LIBRARY-087..101), against the real store on disk. What is measured
 * here is what the requirements fix: the indivisible write, the tag refusal word for word, the slug's
 * uniquification, the derived importance, supersession in both directions, REQ-LIBRARY-090's section omission
 * and order, hydration's tolerances, and REQ-LIBRARY-097's total order with its elision.
 */
describe('engine/artifacts — the session artifact store', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let sid: SessionId;
  const warnings: string[] = [];

  const storeFor = (io?: Partial<{ read(f: string): string; write(f: string, c: string): void; remove(f: string): void }>) =>
    new ArtifactStore({ dal, sessionId: sid, directory: () => join(dir, 'files'), wall: clock, warn: (m) => warnings.push(m), ...(io ? { io } : {}) });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-artifacts-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    sid = asSessionId('S-art');
    dal.upsertSession({ session_id: sid, execution_status: 'running', workspace_root: 'C:/ws', created_at: '2026-09-07T00:00:00.000Z', updated_at: '2026-09-07T00:00:00.000Z' });
    warnings.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const publish = (store: ArtifactStore, over: Partial<{ slug: string; title: string; body: string; tags: string[]; supersedes: string | null }> = {}) =>
    store.publish({ slug: 'the-plan', title: 'The plan', body: 'First line of the body.\n\nMore.', tags: ['research'], supersedes: null, createdBy: 'planner-1', persona: 'planner', ...over });

  it('REQ-LIBRARY-087: the record, its index entry and its document are one indivisible step — an injected failure leaves NEITHER', () => {
    const store = storeFor({ write: () => { throw new Error('the disk refused'); } });
    const r = publish(store);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('write');
    // No row, and therefore no index entry: the transaction that would have carried both rolled back.
    expect(dal.artifactCount(sid)).toBe(0);
    expect(store.hydrate().records).toEqual([]);
  });

  it('REQ-LIBRARY-093/101: a publish stores the body as key_findings, the first line capped at 280 as the summary, and the CANONICAL name as created_by', () => {
    const store = storeFor();
    const long = `${'x'.repeat(400)}\nsecond line`;
    const r = publish(store, { body: long });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toMatch(/^art_[0-9A-Za-z]{8}$/);
    expect(r.value.status).toBe('published');
    expect(r.value.keyFindings).toBe(long);
    expect(r.value.summary).toHaveLength(280);
    expect(r.value.createdBy).toBe('planner-1');
    expect(r.value.sourcePersona).toBe('planner');
    // The document is a FILE beside the session's other files, named flat (REQ-SESSION-002).
    expect(readdirSync(join(dir, 'files'))).toEqual([`artifact-${r.value.id}.md`]);
  });

  it("REQ-LIBRARY-089: an invalid tag refuses the publish WHOLE, with the requirement's own wording, naming the tag as supplied", () => {
    const store = storeFor();
    const r = publish(store, { tags: [' Research ', 'research', 'Nonsense'] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toBe('Invalid tag(s): Nonsense. Valid tags are: research, planning, implementation, review, verification, errors');
    // No record, no file, no partial state.
    expect(dal.artifactCount(sid)).toBe(0);
    expect(readdirSync(dir).includes('files')).toBe(false);
  });

  it('REQ-LIBRARY-089: normalisation folds case and trims; a duplicate collapses rather than refusing; order of first occurrence is kept', () => {
    expect(normaliseArtifactTags([' Research ', 'RESEARCH', 'planning'])).toEqual({ ok: true, tags: ['research', 'planning'] });
    const store = storeFor();
    const r = publish(store, { tags: [' Review ', 'review', 'Errors'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.tags).toEqual(['review', 'errors']);
  });

  it('REQ-LIBRARY-088: a slug is kebab-cased, capped at 64 and uniquified with -2, -3 within the session', () => {
    expect(uniqueSlug('the plan', new Set())).toBe('the-plan');
    expect(uniqueSlug('the-plan', new Set(['the-plan']))).toBe('the-plan-2');
    expect(uniqueSlug('the-plan', new Set(['the-plan', 'the-plan-2']))).toBe('the-plan-3');
    expect(uniqueSlug('x'.repeat(120), new Set()).length).toBeLessThanOrEqual(64);
    const store = storeFor();
    const a = publish(store);
    const b = publish(store);
    const c = publish(store, { title: 'The Plan!' });
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) expect([a.value.slug, b.value.slug, c.value.slug]).toEqual(['the-plan', 'the-plan-2', 'the-plan-3']);
  });

  it('REQ-LIBRARY-088: importance is DERIVED — high exactly for a child report whose status is not succeeded', () => {
    expect(deriveImportance('child_report', 'failed')).toBe('high');
    expect(deriveImportance('child_report', 'partial')).toBe('high');
    expect(deriveImportance('child_report', 'succeeded')).toBe('normal');
    expect(deriveImportance('agent_published', 'published')).toBe('normal');
    const store = storeFor();
    const failed = store.materialiseChildReport({ taskId: 'bg_1', canonicalName: 'tester-1', persona: 'tester', status: 'failed', summary: 's', keyFindings: ['a'], editedFiles: [], createdFiles: [], commands: [], highlightPaths: [], snippets: [], tags: [] });
    expect(failed.ok && failed.value.record.importance).toBe('high');
  });

  it('REQ-LIBRARY-095: supersession links BOTH directions, re-renders both documents, and refuses self-supersession', () => {
    const store = storeFor();
    const first = publish(store);
    clock.advance(1000);
    const second = publish(store, { slug: 'the-plan-again', title: 'The plan again' });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(store.supersede(second.value.id, second.value.id)).toEqual({ ok: false, error: { code: 'self-supersede', reason: 'An artifact cannot supersede itself' } });
    const r = store.supersede(second.value.id, first.value.id);
    expect(r.ok).toBe(true);
    expect(store.lookup(first.value.id)!.supersededBy).toBe(second.value.id);
    expect(store.lookup(second.value.id)!.supersedes).toBe(first.value.id);
    // Both documents were re-rendered, so the links are readable without this application.
    expect(readFileSync(join(dir, 'files', `artifact-${first.value.id}.md`), 'utf8')).toContain(`superseded_by: ${JSON.stringify(second.value.id)}`);
    expect(readFileSync(join(dir, 'files', `artifact-${second.value.id}.md`), 'utf8')).toContain(`supersedes: ${JSON.stringify(first.value.id)}`);
    // REQ-LIBRARY-096: superseded artifacts are hidden by default and reachable with the flag.
    expect(store.list().map((x) => x.id)).toEqual([second.value.id]);
    expect(store.list({ includeSuperseded: true }).map((x) => x.id)).toEqual([first.value.id, second.value.id]);
    expect(store.supersede(second.value.id, 'art_nothing')).toEqual({ ok: false, error: { code: 'not-found', reason: "Unknown artifact: 'art_nothing'" } });
  });

  it('REQ-LIBRARY-096: ALL supplied tags are required, the order is ascending by creation time, and lookup takes an id or a slug', () => {
    const store = storeFor();
    clock.advance(1000);
    const a = publish(store, { slug: 'a', tags: ['research', 'planning'] });
    clock.advance(1000);
    const b = publish(store, { slug: 'b', tags: ['research'] });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(store.list().map((x) => x.slug)).toEqual(['a', 'b']);
    expect(store.list({ tags: ['research'] }).map((x) => x.slug)).toEqual(['a', 'b']);
    expect(store.list({ tags: ['research', 'planning'] }).map((x) => x.slug)).toEqual(['a']);
    expect(store.lookup('a')!.id).toBe(a.value.id);
    expect(store.lookup(a.value.id)!.slug).toBe('a');
    expect(store.lookup('nope')).toBeNull();
  });

  it('REQ-LIBRARY-096/099: a read marks the actor a consumer AT MOST ONCE and it persists', () => {
    const store = storeFor();
    const r = publish(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ops = artifactOps(store, { canonicalName: 'coding-agent-1', persona: 'coding-agent' });
    expect(ops.read(r.value.id, []).ok).toBe(true);
    expect(ops.read(r.value.slug, ['summary']).ok).toBe(true);
    expect(store.lookup(r.value.id)!.consumedBy).toEqual(['coding-agent-1']);
    expect(ops.read('art_missing', [])).toEqual({ ok: false, error: 'not-found:art_missing' });
  });

  it('REQ-LIBRARY-090: sections are omitted ENTIRELY when empty and keep the fixed order; a record with only a body renders as frontmatter, title and its findings', () => {
    const store = storeFor();
    const bare = publish(store, { body: 'just a body' });
    expect(bare.ok).toBe(true);
    if (!bare.ok) return;
    const text = readFileSync(join(dir, 'files', `artifact-${bare.value.id}.md`), 'utf8');
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain('title: "The plan"');
    expect(text).not.toContain('## Highlight Paths');
    expect(text).not.toContain('## Snippets');
    expect(text).not.toContain('## Edited Files');
    expect(text).not.toContain('## Created Files');
    // `edited_at` is absent until a person edits the body, and no placeholder stands in for it.
    expect(text).not.toContain('edited_at:');
    // PD-LIBRARY-001: no Commands section while the record carries none, on REQ-LIBRARY-090's omit rule.
    expect(text).not.toContain('## Commands');
    const full = renderSidecar({
      ...bare.value, summary: 'S', keyFindings: 'K',
      highlightPaths: [{ path: 'a.ts', reason: 'why' }], snippets: [{ path: 'a.ts', language: 'ts', code: 'const x = 1;' }],
      editedFiles: [{ path: 'b.ts', changeType: 'modified' }], createdFiles: ['c.ts'],
      commands: [{ command: 'pnpm test', exitCode: 0 }, { command: 'wc -l x', exitCode: 1 }, { command: 'tail -f log', exitCode: null }],
    });
    const order = SIDECAR_SECTIONS.map((h) => full.indexOf(`## ${h}`));
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(full).toContain('- `a.ts` — why');
    expect(full).toContain('- `b.ts` (modified)');
    // PD-LIBRARY-001: the status is in WORDS, a success carries no decoration, and the order is the run order.
    expect(full).toContain('- `pnpm test`\n');
    expect(full).toContain('- `wc -l x` — **failed, exit 1**');
    expect(full).toContain('- `tail -f log` — exit status not recorded');
    expect(full.indexOf('pnpm test')).toBeLessThan(full.indexOf('wc -l x'));
    // …and Commands sits immediately before Edited Files, which is the only place PD-LIBRARY-001 moves.
    expect(full.indexOf('## Commands')).toBeLessThan(full.indexOf('## Edited Files'));
    expect(full.indexOf('## Snippets')).toBeLessThan(full.indexOf('## Commands'));
  });

  it('PD-LIBRARY-001: a command cannot break the span it is rendered in, and the filter matches the document', () => {
    const store = storeFor();
    const bare = store.materialiseChildReport({
      taskId: 'bg_cmd', canonicalName: 'coding-agent-1', persona: 'coding-agent', status: 'succeeded', summary: 's',
      keyFindings: [], editedFiles: [], createdFiles: [], commands: [], highlightPaths: [], snippets: [], tags: [], conversationId: 'bg_cmd',
    });
    expect(bare.ok).toBe(true);
    if (!bare.ok) return;
    // A newline would end the list item and a backtick would close the span: neither may survive verbatim.
    const awkward = renderSidecar({ ...bare.value.record, commands: [{ command: 'echo "a"\nWrite-Host `b`', exitCode: 0 }] });
    const line = awkward.split('\n').find((l) => l.startsWith('- `')) ?? '';
    expect(line).toBe('- `echo "a"\\nWrite-Host ‵b‵`');
    expect(line.split('`').length - 1).toBe(2);
    // REQ-LIBRARY-099's filtered view renders from the same columns, so it cannot disagree with the document.
    const filtered = store.sections({ ...bare.value.record, commands: [{ command: 'pnpm check', exitCode: 2 }] }, ['commands']);
    expect(filtered).toContain('## Commands');
    expect(filtered).toContain('- `pnpm check` — **failed, exit 2**');
    expect(store.sections(bare.value.record, ['commands'])).toBe('');
  });

  it('PD-LIBRARY-001: the TOOL path filters `commands` too — artifactOps.read returns the Commands section, not the whole document', () => {
    // The store-level test above passes while the tool path drifts: the port held its own section
    // allow-list that omitted `commands`, so a filtered read fell through to the full body. This pins
    // the interface a model actually reaches (a defect note, removed once repaired).
    const store = storeFor();
    const r = store.materialiseChildReport({
      taskId: 'bg_cmd_tool', canonicalName: 'coding-agent-1', persona: 'coding-agent', status: 'succeeded', summary: 's',
      keyFindings: ['the body line that must NOT come back'], editedFiles: [], createdFiles: [],
      commands: [{ command: 'pnpm check', exitCode: 0 }, { command: 'node -e "process.exit(7)"', exitCode: 7 }, { command: 'tail -f log', exitCode: null }],
      highlightPaths: [], snippets: [], tags: [], conversationId: 'bg_cmd_tool',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ops = artifactOps(store, { canonicalName: 'orchestrator', persona: 'orchestrator' });
    const read = ops.read(r.value.record.id, ['commands']);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.text).toBe([
      '## Commands',
      '',
      '- `pnpm check`',
      '- `node -e "process.exit(7)"` — **failed, exit 7**',
      '- `tail -f log` — exit status not recorded',
    ].join('\n'));
    // The filtered read is still a read: the reader is marked a consumer (REQ-LIBRARY-099).
    expect(store.lookup(r.value.record.id)!.consumedBy).toContain('orchestrator');
  });

  it('REQ-LIBRARY-094/133: an edit moves the body and `edited_at` and NOTHING else', () => {
    const store = storeFor();
    const r = publish(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    clock.advance(1000);
    const saved = store.editBody(r.value.id, '# edited by hand');
    expect(saved.ok).toBe(true);
    const after = store.lookup(r.value.id)!;
    expect(after.editedAt).not.toBeNull();
    expect(after.editedAt! > after.createdAt).toBe(true);
    expect({ slug: after.slug, title: after.title, tags: after.tags, status: after.status, createdAt: after.createdAt })
      .toEqual({ slug: r.value.slug, title: r.value.title, tags: r.value.tags, status: r.value.status, createdAt: r.value.createdAt });
    expect(store.body(r.value.id)).toEqual({ ok: true, value: { text: '# edited by hand', fallback: false } });
    expect(store.editBody('art_nothing', 'x')).toEqual({ ok: false, error: { code: 'not-found', reason: "Unknown artifact: 'art_nothing'" } });
  });

  it('REQ-LIBRARY-091/134: hydration tolerates all five conditions and never raises; an unreadable document leaves the record usable', () => {
    const store = storeFor();
    // (1) a session whose store holds no artifacts at all.
    expect(store.hydrate()).toEqual({ records: [], warnings: [] });
    const r = publish(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // (2) a record that fails validation is SKIPPED, with a warning.
    dal.db.prepare('UPDATE artifacts SET status = ? WHERE id = ?').run('invented', r.value.id);
    const skipped = store.hydrate();
    expect(skipped.records).toEqual([]);
    expect(skipped.warnings[0]).toContain('outside the set REQ-LIBRARY-088 forms');
    dal.db.prepare('UPDATE artifacts SET status = ? WHERE id = ?').run('published', r.value.id);
    // (3) an index that cannot be read: a warning and zero artifacts, never a raise.
    const broken = new ArtifactStore({ dal: { artifactsOf: () => { throw new Error('the index is gone'); } } as unknown as StoreDal, sessionId: sid, directory: () => dir, wall: clock, warn: (m) => warnings.push(m) });
    expect(broken.hydrate().records).toEqual([]);
    expect(broken.hydrate().warnings[0]).toContain('could not be read');
    // (4) a document that cannot be read leaves the record LISTED and is reported by the surface that wanted it.
    rmSync(join(dir, 'files', `artifact-${r.value.id}.md`));
    expect(store.hydrate().records.map((x) => x.id)).toEqual([r.value.id]);
    const body = store.body(r.value.id);
    expect(body.ok).toBe(false);
    // The REASON only: REQ-LIBRARY-134's wording `Could not load artifact: <err>` belongs to the surface, and
    // the proof's first run found it applied twice when the store worded it too.
    if (!body.ok) expect({ code: body.error.code, doubled: /Could not load artifact/.test(body.error.reason) }).toEqual({ code: 'body', doubled: false });
    // (5) an empty stored body falls back to the rendered form of the record.
    writeFileSync(join(dir, 'files', `artifact-${r.value.id}.md`), '   \n');
    const fallback = store.body(r.value.id);
    expect(fallback.ok && fallback.value.fallback).toBe(true);
    if (fallback.ok) expect(fallback.value.text).toContain(`id: ${JSON.stringify(r.value.id)}`);
  });

  it('REQ-LIBRARY-092: materialisation is idempotent on the task id and updates IN PLACE, preserving what the requirement lists', () => {
    const store = storeFor();
    const first = store.materialiseChildReport({ taskId: 'bg_1', canonicalName: 'tester-1', persona: 'tester', status: 'failed', summary: 'it failed', keyFindings: ['one'], editedFiles: ['a.ts'], createdFiles: [], commands: [], highlightPaths: [], snippets: [], tags: ['verification'] });
    expect(first.ok && first.value.created).toBe(true);
    if (!first.ok) return;
    clock.advance(1000);
    const again = store.materialiseChildReport({ taskId: 'bg_1', canonicalName: 'tester-1', persona: 'tester', status: 'succeeded', summary: 'it passed', keyFindings: ['two'], editedFiles: [], createdFiles: [], commands: [], highlightPaths: [], snippets: [], tags: [] });
    expect(again.ok && again.value.created).toBe(false);
    if (!again.ok) return;
    expect(dal.artifactCount(sid)).toBe(1);
    expect(again.value.record.id).toBe(first.value.record.id);
    expect(again.value.record.slug).toBe(first.value.record.slug);
    expect(again.value.record.title).toBe(first.value.record.title);
    expect(again.value.record.createdAt).toBe(first.value.record.createdAt);
    expect(again.value.record.editedAt).toBeNull();
    // The status and the derived importance did move: a report that succeeded is no longer high.
    expect(again.value.record.status).toBe('succeeded');
    expect(again.value.record.importance).toBe('normal');
  });

  /**
   * REQ-LIBRARY-092 as amended 2026-09-29 (OQ-113, R-067): the canonical name keys a materialisation only for a record that
   * carries no task id, so two children with different task ids never share or overwrite one artifact. The repair of
   * docs/defects/fixed/a-reused-canonical-name-overwrites-an-earlier-iterations-report-artifact.md.
   */
  it('REQ-LIBRARY-092 (OQ-113): a later child that reuses an earlier child\'s canonical name materialises its own artifact, and the earlier report is left as it was', () => {
    const store = storeFor();
    const earlier = store.materialiseChildReport({ taskId: 'bg_1', canonicalName: 'build', persona: 'coding-agent', status: 'succeeded', summary: 'iteration 1 built it', keyFindings: ['one'], editedFiles: [], createdFiles: [], commands: [], highlightPaths: [], snippets: [], tags: [] });
    if (!earlier.ok) throw new Error('earlier');
    clock.advance(1000);
    // A second `build` in a later iteration — a fresh task id, the same canonical name — here a stub report that ends cancelled.
    const later = store.materialiseChildReport({ taskId: 'bg_2', canonicalName: 'build', persona: 'coding-agent', status: 'cancelled', summary: 'iteration 2 was declined', keyFindings: [], editedFiles: [], createdFiles: [], commands: [], highlightPaths: [], snippets: [], tags: [] });
    if (!later.ok) throw new Error('later');
    expect(later.value.created).toBe(true);
    expect(later.value.record.id).not.toBe(earlier.value.record.id);
    expect(dal.artifactCount(sid)).toBe(2);
    const rows = dal.artifactsOf(sid);
    expect(rows.map((r) => [r.source_task_id, r.status, r.summary])).toEqual([['bg_1', 'succeeded', 'iteration 1 built it'], ['bg_2', 'cancelled', 'iteration 2 was declined']]);
    // Each keeps its own identity: the later one is the newest in the session's listing, under a slug of its own.
    expect(later.value.record.createdAt > earlier.value.record.createdAt).toBe(true);
    expect(later.value.record.slug).not.toBe(earlier.value.record.slug);
    // And each still updates in place on its own task id.
    const again = store.materialiseChildReport({ taskId: 'bg_1', canonicalName: 'build', persona: 'coding-agent', status: 'failed', summary: 'iteration 1, again', keyFindings: [], editedFiles: [], createdFiles: [], commands: [], highlightPaths: [], snippets: [], tags: [] });
    expect(again.ok && again.value.created).toBe(false);
    expect(again.ok && again.value.record.id).toBe(earlier.value.record.id);
    expect(dal.artifactsOf(sid).map((r) => [r.source_task_id, r.summary])).toEqual([['bg_1', 'iteration 1, again'], ['bg_2', 'iteration 2 was declined']]);
  });

  it('REQ-LIBRARY-092 (OQ-113): the canonical name keys only a record that carries no task id, and never an artifact another task wrote', () => {
    const store = storeFor();
    const report = (taskId: string, summary: string) => store.materialiseChildReport({ taskId, canonicalName: 'tester-1', persona: 'tester', status: 'succeeded', summary, keyFindings: [], editedFiles: [], createdFiles: [], commands: [], highlightPaths: [], snippets: [], tags: [] });
    const bare = report('', 'no task id');
    expect(bare.ok && bare.value.created).toBe(true);
    const bareAgain = report('', 'no task id, again');
    expect(bareAgain.ok && bareAgain.value.created).toBe(false);
    expect(dal.artifactCount(sid)).toBe(1);
    // A record with a task id never takes the task-less artifact over by name, nor is it taken over.
    const tasked = report('bg_7', 'a task of its own');
    expect(tasked.ok && tasked.value.created).toBe(true);
    const bareThird = report('', 'no task id, a third time');
    expect(bareThird.ok && bareThird.value.created).toBe(false);
    expect(dal.artifactsOf(sid).map((r) => [r.source_task_id || '', r.summary]).sort()).toEqual([['', 'no task id, a third time'], ['bg_7', 'a task of its own']]);
  });

  it('REQ-LIBRARY-092: the artifact_published entry is recorded once, and its id is linked back onto the record', () => {
    const entries: { name: string; metadata: Record<string, unknown> }[] = [];
    const store = new ArtifactStore({
      dal, sessionId: sid, directory: () => join(dir, 'files'), wall: clock, warn: (m) => warnings.push(m),
      timeline: (name, _message, metadata) => { entries.push({ name, metadata }); return { ordinal: entries.length, id: `abcdefabcde${entries.length}` }; },
    });
    const first = store.materialiseChildReport({ taskId: 'bg_9', canonicalName: 'planner-1', persona: 'planner', status: 'succeeded', summary: 's', keyFindings: [], editedFiles: [], createdFiles: [], commands: [], highlightPaths: [], snippets: [], tags: [] });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe('artifact_published');
    expect(entries[0]!.metadata['artifact_id']).toBe(first.value.record.id);
    expect(store.lookup(first.value.record.id)!.timelineEventId).toBe('abcdefabcde1');
    store.materialiseChildReport({ taskId: 'bg_9', canonicalName: 'planner-1', persona: 'planner', status: 'succeeded', summary: 's2', keyFindings: [], editedFiles: [], createdFiles: [], commands: [], highlightPaths: [], snippets: [], tags: [] });
    expect(entries).toHaveLength(1);
  });

  it('REQ-LIBRARY-097: unsuccessful artifacts come first, newest first within each group, ties by ascending id, and the tail is elided with a marker naming artifact_list', () => {
    const store = storeFor();
    clock.advance(1000);
    const okOld = publish(store, { slug: 'ok-old' });
    clock.advance(1000);
    const okNew = publish(store, { slug: 'ok-new' });
    clock.advance(1000);
    const bad = store.materialiseChildReport({ taskId: 'bg_x', canonicalName: 'tester-1', persona: 'tester', status: 'failed', summary: 'broke', keyFindings: [], editedFiles: [], createdFiles: [], commands: [], highlightPaths: [], snippets: [], tags: [] });
    expect(okOld.ok && okNew.ok && bad.ok).toBe(true);
    if (!okOld.ok || !okNew.ok || !bad.ok) return;
    const order = siblingIndexOrder(store.hydrate().records).map((r) => r.slug);
    expect(order).toEqual([bad.value.record.slug, 'ok-new', 'ok-old']);
    const block = siblingIndexBlock(store.hydrate().records);
    expect(block.text.startsWith('PRIOR SIBLING ARTIFACT INDEX\n')).toBe(true);
    expect(block.included).toBe(3);
    expect(block.elided).toBe(0);
    expect(block.text).toContain(`(${bad.value.record.id}) persona=tester status=failed`);
    // A budget too small for everything drops from the TAIL and says how many, naming the tool that reaches them.
    const tight = siblingIndexBlock(store.hydrate().records, 130);
    expect(tight.included).toBeLessThan(3);
    expect(tight.text.length).toBeLessThanOrEqual(130);
    expect(tight.text).toContain('call artifact_list to reach them');
    expect(tight.elided).toBe(3 - tight.included);
    // The order is TOTAL: two readings of the same session produce the same block.
    expect(siblingIndexBlock(store.hydrate().records).text).toBe(block.text);
    expect(SIBLING_INDEX_BUDGET).toBe(10_000);
    // An empty store produces no block at all rather than a heading over nothing.
    expect(siblingIndexBlock([]).text).toBe('');
  });

  it('REQ-LIBRARY-097: a summary is truncated to at most 160 characters on its line', () => {
    const store = storeFor();
    const r = publish(store, { body: `${'y'.repeat(300)}\nmore` });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const line = siblingIndexBlock(store.hydrate().records).text.split('\n')[1]!;
    expect(line.endsWith('y'.repeat(160))).toBe(true);
  });

  it('REQ-LIBRARY-098: the full block carries the bodies inside its budget and reports what it could not resolve or fit', () => {
    const store = storeFor();
    const a = publish(store, { slug: 'a', body: 'AAA' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const record = store.lookup(a.value.id)!;
    const body = store.body(record.id);
    const resolved = [
      { reference: 'a', record, body: body.ok ? body.value.text : null, failure: null },
      { reference: 'ghost', record: null, body: null, failure: 'the reference names no artifact in this session' },
    ];
    const block = fullContextBlock(resolved);
    expect(block.text.startsWith('PRIOR AGENT CONTEXT (FULL)\n')).toBe(true);
    expect(block.included).toBe(1);
    expect(block.unresolved).toEqual(['ghost']);
    expect(block.text).toContain('could not be resolved: ghost');
    const tiny = fullContextBlock(resolved, 60);
    expect(tiny.included).toBe(0);
    expect(tiny.elided).toEqual([record.id]);
    expect(tiny.text).toContain('did not fit the context budget');
  });

  it('an id is `art_` plus eight base62 characters, and two mints differ', () => {
    const a = mintArtifactId();
    expect(a).toMatch(/^art_[0-9A-Za-z]{8}$/);
    expect(a).not.toBe(mintArtifactId());
  });

  it('REQ-LIBRARY-100: the listing entries carry what the tool renders, and the limit is clamped rather than refused', () => {
    const store = storeFor();
    for (let n = 0; n < 5; n += 1) { clock.advance(1000); publish(store, { slug: `s${n}` }); }
    const ops = artifactOps(store, { canonicalName: 'orchestrator', persona: 'orchestrator' });
    expect(ops.list({ kind: null, persona: null, tags: [], limit: 2, includeSuperseded: false })).toHaveLength(2);
    expect(ops.list({ kind: null, persona: null, tags: [], limit: 999, includeSuperseded: false })).toHaveLength(5);
    expect(ops.list({ kind: 'child_report', persona: null, tags: [], limit: 20, includeSuperseded: false })).toEqual([]);
    expect(ops.list({ kind: null, persona: 'planner', tags: [], limit: 20, includeSuperseded: false })).toHaveLength(5);
  });
});
