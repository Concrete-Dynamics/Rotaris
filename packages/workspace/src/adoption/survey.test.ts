/**
 * PD-TRACE-002 clauses 2 and 3 (REQ-ADOPT-036 to REQ-ADOPT-040): the survey's loop over a scripted model. Every step here is a literal; no test reaches
 * a model, and the assertion that matters most is what the loop CANNOT do: write, or read outside the workspace.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FAILED_STEPS_MAX, LOOK_BUDGET, REPAIR_ROUNDS, survey, surveyRead, type SurveyDeps, type SurveyMessage } from './survey.js';

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'rotaris-survey-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const FILES: Record<string, string> = {
  'docs/spec/a.md': '# A\n\n- **SYS-AUTH-001** — The system SHALL accept a login.\n- **SYS-AUTH-002** — The system SHALL lock.\n',
  'src/login.ts': '// SYS-AUTH-001\n',
  '.env': 'SECRET=1\n',
  '.git/config': '[core]\n',
};
/** One identifier only: the detection finds no candidate store, so no draft stands behind the model. */
const BARE: Record<string, string> = { 'docs/spec/a.md': '# A\n\nSee SYS-AUTH-001 somewhere.\n', 'src/login.ts': '// SYS-AUTH-001\n' };
const GOOD = { version: 1, stores: [{ dir: 'docs/spec', definition: '^-\\s+\\*\\*(?<id>SYS-[A-Z]+-\\d{3})\\*\\*', criteria: false }], identifier: 'SYS-[A-Z]+-\\d{3}', implRoots: ['src'], testRoots: [], obligations: 'optional', notes: '' };

function scripted(answers: readonly (object | string)[]): SurveyDeps & { seen: SurveyMessage[][] } {
  const seen: SurveyMessage[][] = [];
  let i = 0;
  let n = 0;
  return {
    seen,
    step: async (messages) => { seen.push([...messages]); const a = answers[i]; i += 1; return a === undefined ? { ok: false, reason: 'script ended' } : { ok: true, text: typeof a === 'string' ? a : JSON.stringify(a), model: 'scripted/surveyor' }; },
    elapsed: () => 0,
    token: () => `t${n += 1}`,
  };
}

function snapshot(root: string): string {
  const out: string[] = [];
  const walk = (d: string): void => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.push(`${p}:${statSync(p).size}:${statSync(p).mtimeMs}`); } };
  walk(root);
  return out.sort().join('\n');
}

describe('the survey proposes, is measured, and ends in a preview that records nothing', () => {
  it('reads, proposes, finishes — and writes no file', async () => {
    const root = project(FILES);
    const before = snapshot(root);
    const deps = scripted([{ action: 'list', path: 'docs/spec' }, { action: 'read', path: 'docs/spec/a.md' }, { action: 'propose', shape: GOOD }, { action: 'finish' }]);
    const r = await survey(root, deps);
    expect(r).toMatchObject({ ok: true, preview: { token: 't1', count: 2, rounds: 0, model: 'scripted/surveyor', stores: [{ dir: 'docs/spec', documents: 1, requirements: 2 }] } });
    if (!r.ok) return;
    expect(r.preview.samples[0]).toMatchObject({ id: 'SYS-AUTH-001', document: 'docs/spec/a.md', line: 3 });
    expect(deps.seen[1]!.at(-1)!.text).toContain('a.md (');
    expect(deps.seen[2]!.at(-1)!.text).toContain('3: - **SYS-AUTH-001**');
    expect(deps.seen[3]!.at(-1)!.text).toContain('"requirements":2');
    expect(snapshot(root)).toBe(before);
  });

  it('hands a refused proposal back by field and takes the repair', async () => {
    const root = project(FILES);
    const deps = scripted([{ action: 'propose', shape: { ...GOOD, write_to: '/etc/passwd' } }, { action: 'propose', shape: { ...GOOD, stores: [{ ...GOOD.stores[0]!, definition: '^nothing(?<id>X-\\d+)' }], identifier: 'X-\\d+' } }, { action: 'propose', shape: GOOD }, { action: 'finish' }]);
    const r = await survey(root, deps);
    expect(r).toMatchObject({ ok: true, preview: { count: 2, rounds: 2 } });
    expect(deps.seen[1]!.at(-1)!.text).toMatch(/refused before anything ran\. Field write_to/);
    expect(deps.seen[2]!.at(-1)!.text).toContain('"requirements":0');
  });

  it('stops at the repair bound and refuses when no proposal was valid and no draft stands', async () => {
    const root = project(BARE);
    const bad = { action: 'propose', shape: { ...GOOD, version: 9 } };
    const deps = scripted(Array.from({ length: 10 }, () => bad));
    const r = await survey(root, deps);
    expect(r).toMatchObject({ ok: false, field: 'version' });
    expect(deps.seen).toHaveLength(REPAIR_ROUNDS + 1);
  });

  it('previews the last valid proposal when the bound is reached without finish', async () => {
    const root = project(FILES);
    const r = await survey(root, scripted(Array.from({ length: 10 }, () => ({ action: 'propose', shape: GOOD }))));
    expect(r).toMatchObject({ ok: true, preview: { count: 2, rounds: REPAIR_ROUNDS } });
  });

  it('stops carrying out reading actions past the budget and asks for the proposal', async () => {
    const root = project(FILES);
    const deps = scripted([...Array.from({ length: LOOK_BUDGET + 2 }, () => ({ action: 'list', path: 'docs' })), { action: 'propose', shape: GOOD }, { action: 'finish' }]);
    const r = await survey(root, deps);
    expect(r).toMatchObject({ ok: true, preview: { count: 2 } });
    expect(deps.seen[LOOK_BUDGET]!.at(-1)!.text).toMatch(/That was your last reading action: propose now\./);
    expect(deps.seen[LOOK_BUDGET + 1]!.at(-1)!.text).toMatch(/this one was not carried out/);
  });

  it('asks again after an answer that did not arrive, and gives up after a bounded number in a row', async () => {
    const root = project(FILES);
    let n = 0;
    const flaky = scripted([{ action: 'propose', shape: GOOD }, { action: 'finish' }]);
    const step = flaky.step;
    const r = await survey(root, { ...flaky, step: async (m) => { n += 1; return n <= FAILED_STEPS_MAX - 1 ? { ok: false, reason: 'no content' } : step(m); } });
    expect(r).toMatchObject({ ok: true, preview: { count: 2 } });
    expect(await survey(project(BARE), { ...scripted([]), step: async () => ({ ok: false, reason: 'no content' }) })).toMatchObject({ ok: false, field: 'answer', reason: expect.stringMatching(/3 times in a row/) });
  });

  it('previews the scripted draft, and says so, where the model gives nothing better (clause 3)', async () => {
    const root = project(FILES);
    const silent = await survey(root, { ...scripted([]), step: async () => ({ ok: false, reason: 'no model is configured' }) });
    expect(silent).toMatchObject({ ok: true, preview: { count: 2, model: 'scripted draft', rounds: 0 } });
    if (silent.ok) expect(silent.preview.unread[0]).toMatch(/^This is the scripted draft: the model gave no answer 3 times in a row \(no model is configured\)/);
    const refused = await survey(root, scripted(Array.from({ length: 10 }, () => ({ action: 'propose', shape: { ...GOOD, version: 9 } }))));
    expect(refused).toMatchObject({ ok: true, preview: { model: 'scripted draft' } });
    if (refused.ok) expect(refused.preview.unread[0]).toMatch(/the model's proposals were refused \(version/);
    // A proposal of the model's that extracts something replaces the draft, and the preview is then the model's.
    expect(await survey(root, scripted([{ action: 'propose', shape: GOOD }, { action: 'finish' }]))).toMatchObject({ ok: true, preview: { model: 'scripted/surveyor' } });
  });

  it('opens the agent on the draft and its measurement, not on the whole detection', async () => {
    const root = project(FILES);
    const deps = scripted([{ action: 'finish' }]);
    const r = await survey(root, deps);
    expect(r).toMatchObject({ ok: true, preview: { model: 'scripted draft' } });
    const opening = deps.seen[0]![0]!.text;
    expect(opening).toContain('<draft>');
    expect(opening).toContain('"requirements":2');
    expect(opening.length).toBeLessThan(6_000);
  });

  it('refuses prose, an unknown action and a failed request without raising', async () => {
    const root = project(BARE);
    expect(await survey(root, scripted(['The store is docs/spec.', { action: 'delete', path: 'docs' }]))).toMatchObject({ ok: false });
    expect(await survey(root, scripted([]))).toMatchObject({ ok: false, field: 'answer' });
  });

  it('continues from the user\'s answer in words (clause 2)', async () => {
    const root = project({ ...FILES, 'docs/stories/s.md': '### US-1 Login\n\n### US-2 Logout\n' });
    const first = await survey(root, scripted([{ action: 'propose', shape: GOOD }, { action: 'finish' }]));
    if (!first.ok) throw new Error(first.reason);
    const both = { ...GOOD, stores: [...GOOD.stores, { dir: 'docs/stories', definition: '^###\\s+(?<id>US-\\d+)\\s+(?<title>.+)$', criteria: false }], identifier: 'SYS-[A-Z]+-\\d{3}|US-\\d+' };
    const deps = scripted([{ action: 'propose', shape: both }, { action: 'finish' }]);
    const second = await survey(root, deps, { session: first.session, answer: 'you missed the user stories in docs/stories' });
    expect(second).toMatchObject({ ok: true, preview: { count: 4, token: 't1' } });
    expect(deps.seen[0]!.at(-1)!.text).toContain('<answer>\nyou missed the user stories in docs/stories\n</answer>');
    expect(await survey(root, scripted([]), { session: first.session, answer: '   ' })).toMatchObject({ ok: false });
  });
});

describe('the reading actions read inside the workspace and nowhere else (REQ-ADOPT-005, REQ-ADOPT-014)', () => {
  it.each([
    [{ action: 'read', path: '../outside.txt' }],
    [{ action: 'read', path: '/etc/passwd' }],
    [{ action: 'read', path: '.env' }],
    [{ action: 'list', path: '.git' }],
    [{ action: 'read', path: 'linked/x.md' }],
    [{ action: 'write', path: 'docs/spec/a.md', text: 'x' }],
  ])('refuses %j', (action) => {
    const root = project(FILES);
    const outside = project({ 'x.md': 'secret\n' });
    symlinkSync(outside, join(root, 'linked'));
    expect(surveyRead(root, action)).toMatch(/^refused: /);
  });

  it('lists without hidden entries, and searches with a bound', () => {
    const root = project(FILES);
    expect(surveyRead(root, { action: 'list' })).toBe('docs/\nsrc/');
    expect(surveyRead(root, { action: 'grep', pattern: 'SYS-AUTH-\\d+', path: 'docs' })).toContain('docs/spec/a.md:3: - **SYS-AUTH-001**');
    expect(surveyRead(root, { action: 'grep', pattern: 'SECRET' })).toMatch(/^no line matches/);
    expect(surveyRead(root, { action: 'grep', pattern: '(' })).toMatch(/^refused: the pattern does not compile/);
  });
});
