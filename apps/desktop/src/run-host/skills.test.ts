import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileToolState, grepTool, readFileTool, writeFileTool } from '@rotaris/agent-tools';
import { SKILLS_DEFAULTS, type SkillsSection } from '@rotaris/config';
import { parseSkillListing } from '@rotaris/contracts';
import { readTrajectory, Sessions } from '@rotaris/engine';
import { asSessionId, FakeClock, mintMachineId, type MachineId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { SkillHost, writeSkillListing } from './skills.js';

/**
 * ADR-0063's catalog, and the fence defect its first execution found. Everything here runs against a real
 * directory tree, because the rules under test are about caching and lifetimes rather than about parsing —
 * the parsing rules are `packages/config/src/skills/skills.test.ts`'s and are pure.
 */
function tree(): { root: string; home: string; cleanup: () => void } {
  const base = mkdtempSync(join(tmpdir(), 'rotaris-skills-'));
  const root = join(base, 'ws');
  const home = join(base, 'home');
  mkdirSync(join(root, '.agents', 'skills', 'alpha'), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(join(root, '.agents', 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: Alpha does things.\n---\nALPHA BODY\n');
  // The workspace root itself ends the project walk: no `.git` above it in a temp tree.
  return { root, home, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

const host = (_root: string, home: string, section: SkillsSection = SKILLS_DEFAULTS) =>
  new SkillHost({ home, section: () => section, log: () => undefined });

describe('the skill catalog (REQ-WORKSPACE-058, 069, 073, 057)', () => {
  it('discovers on a cold cache and caches the answer until something clears it', () => {
    const t = tree();
    try {
      const h = host(t.root, t.home);
      expect(h.state(t.root).skills.map((s) => s.name)).toEqual(['alpha']);
      // A second skill on disk is NOT seen: REQ-WORKSPACE-058 caches per resolved workspace root.
      mkdirSync(join(t.root, '.agents', 'skills', 'beta'));
      writeFileSync(join(t.root, '.agents', 'skills', 'beta', 'SKILL.md'), '---\nname: beta\ndescription: Beta.\n---\nb\n');
      expect(h.state(t.root).skills.map((s) => s.name)).toEqual(['alpha']);
      // REQ-WORKSPACE-069: the rescan re-reads from disk. Without it a SKILL.md added mid-session is unreachable.
      h.rescan(t.root);
      expect(h.state(t.root).skills.map((s) => s.name)).toEqual(['alpha', 'beta']);
    } finally { t.cleanup(); }
  });

  it('REQ-WORKSPACE-058: session creation clears the cache, so each new session re-reads from disk', () => {
    const t = tree();
    try {
      const h = host(t.root, t.home);
      h.state(t.root);
      mkdirSync(join(t.root, '.agents', 'skills', 'beta'));
      writeFileSync(join(t.root, '.agents', 'skills', 'beta', 'SKILL.md'), '---\nname: beta\ndescription: Beta.\n---\nb\n');
      h.onSessionCreated(t.root, 's1');
      expect(h.state(t.root, 's1').skills.map((s) => s.name)).toEqual(['alpha', 'beta']);
    } finally { t.cleanup(); }
  });

  it('REQ-WORKSPACE-073: a force-load reaches the agent, persists nothing, and leaves the row showing the saved policy', () => {
    const t = tree();
    try {
      const h = host(t.root, t.home);
      expect(h.forceLoad(t.root, 's1', 'alpha')).toEqual({ ok: true, name: 'alpha' });
      const units = h.contextUnits(t.root, 's1');
      expect(units.some((u) => u.includes('ALPHA BODY'))).toBe(true);
      const row = h.state(t.root, 's1').skills[0]!;
      // The Load selector keeps showing the PERSISTED policy — a typed command never claims a workspace was reconfigured.
      expect(row.loadMode).toBe('name-only');
      expect(row.forcedThisSession).toBe(true);
      // And another session is untouched by it.
      expect(h.contextUnits(t.root, 's2').some((u) => u.includes('ALPHA BODY'))).toBe(false);
    } finally { t.cleanup(); }
  });

  it('REQ-WORKSPACE-064: with the switch off there is no catalog, no body and nothing invocable', () => {
    const t = tree();
    try {
      const h = host(t.root, t.home, { ...SKILLS_DEFAULTS, enabled: false });
      expect(h.contextUnits(t.root, 's1')).toEqual([]);
      expect(h.state(t.root, 's1').skills[0]!.userInvocable).toBe(false);
      expect(h.forceLoad(t.root, 's1', 'alpha')).toEqual({ ok: false, reason: 'disabled' });
    } finally { t.cleanup(); }
  });

  it('OQ-58: a gesture made with no session lands in the pending bucket and the next session adopts it', () => {
    const t = tree();
    try {
      const h = host(t.root, t.home);
      h.forceLoad(t.root, undefined, 'alpha');
      expect(h.contextUnits(t.root, 's1').some((u) => u.includes('ALPHA BODY'))).toBe(false);
      h.onSessionCreated(t.root, 's1');
      expect(h.contextUnits(t.root, 's1').some((u) => u.includes('ALPHA BODY'))).toBe(true);
    } finally { t.cleanup(); }
  });

  it('REQ-WORKSPACE-060/061: the catalog unit comes first and a force-loaded body follows it', () => {
    const t = tree();
    try {
      mkdirSync(join(t.root, '.agents', 'skills', 'beta'), { recursive: true });
      writeFileSync(join(t.root, '.agents', 'skills', 'beta', 'SKILL.md'), '---\nname: beta\ndescription: Beta.\n---\nBETA BODY\n');
      const h = host(t.root, t.home);
      h.forceLoad(t.root, 's1', 'beta');
      const units = h.contextUnits(t.root, 's1');
      expect(units).toHaveLength(2);
      expect(units[0]).toContain('- alpha: Alpha does things.');
      // REQ-WORKSPACE-062: a force-loaded skill leaves the catalog; its body stands in the entry's place.
      expect(units[0]).not.toContain('- beta:');
      expect(units[1]).toContain('BETA BODY');
      expect(units[1]).not.toContain('description:');
    } finally { t.cleanup(); }
  });

  it('REQ-WORKSPACE-062: an unreadable body adds no block, leaves the rest of the context alone, and does not throw', () => {
    const t = tree();
    try {
      const h = host(t.root, t.home);
      h.forceLoad(t.root, 's1', 'alpha');
      rmSync(join(t.root, '.agents', 'skills', 'alpha', 'SKILL.md'));
      expect(h.contextUnits(t.root, 's1')).toEqual([]);
    } finally { t.cleanup(); }
  });

  it('REQ-WORKSPACE-057: a skill loaded by hand overrides a discovered one and is labelled `manual`', () => {
    const t = tree();
    try {
      const other = join(t.home, 'hand');
      mkdirSync(other, { recursive: true });
      writeFileSync(join(other, 'SKILL.md'), '---\nname: alpha\ndescription: The hand-loaded one.\n---\nHAND BODY\n');
      const h = host(t.root, t.home);
      expect(h.loadFile(t.root, 's1', other)).toEqual({ ok: true, name: 'alpha' });
      const row = h.state(t.root, 's1').skills[0]!;
      expect(row.scope).toBe('manual');
      expect(row.description).toBe('The hand-loaded one.');
      // Session-scoped: another session still sees the discovered one.
      expect(h.state(t.root, 's2').skills[0]!.scope).toBe('project');
    } finally { t.cleanup(); }
  });

  it('REQ-WORKSPACE-059: the read roots are the cataloged directories, including a hand-loaded one', () => {
    const t = tree();
    try {
      const other = join(t.home, 'hand');
      mkdirSync(other, { recursive: true });
      writeFileSync(join(other, 'SKILL.md'), '---\nname: hand\ndescription: d.\n---\nb\n');
      const h = host(t.root, t.home);
      h.loadFile(t.root, 's1', other);
      const roots = h.readRoots(t.root, 's1');
      expect(roots).toContain(join(t.root, '.agents', 'skills', 'alpha'));
      expect(roots).toContain(other);
    } finally { t.cleanup(); }
  });
});

/**
 * ADR-0063's first execution, as a regression test. The repair is that a tool port's fence travels with the
 * tool instead of being read off the `FileToolState` cached per workspace root, which kept the first fence it
 * ever saw.
 */
describe('the per-port fence (REQ-CONFIG-468, REQ-WORKSPACE-059 — ADR-0063 first execution)', () => {
  it('a second port’s file tools honour the SECOND port’s read roots, not the first’s', async () => {
    const base = mkdtempSync(join(tmpdir(), 'rotaris-fence-'));
    try {
      const root = join(base, 'ws');
      const outside = join(base, 'outside');
      mkdirSync(root, { recursive: true });
      mkdirSync(outside, { recursive: true });
      writeFileSync(join(outside, 'SKILL.md'), '---\nname: x\ndescription: d.\n---\nOUTSIDE BODY\n');

      // The shared state, as `executorsFor` caches it per workspace root across runs (REQ-TOOLS-137).
      const state = new FileToolState();
      const first = { workspaceRoot: root, allowOutsideWorkspace: false, additionalReadOnlyRoots: [] };
      const second = { workspaceRoot: root, allowOutsideWorkspace: false, additionalReadOnlyRoots: [outside] };
      const ctx = () => ({ workspaceRoot: root, sessionId: 's', agentName: 'a', persona: 'p', monotonic: { now: () => 0 }, wall: { instant: () => 0 }, signal: new AbortController().signal, warn: () => undefined });

      // Before the second port exists the path is outside the fence, which is correct.
      const refused = await readFileTool(state, first).execute({ path: join(outside, 'SKILL.md'), offset: 1, limit: 2000, grep_context: 3 }, ctx() as never);
      expect(refused.isError).toBe(true);
      // The second port widens the fence. Before the repair this read the FIRST port's fence and refused,
      // while `grep` on the same bundle honoured the second — two tools disagreeing about the boundary.
      const allowed = await readFileTool(state, second).execute({ path: join(outside, 'SKILL.md'), offset: 1, limit: 2000, grep_context: 3 }, ctx() as never);
      expect(allowed.isError ?? false).toBe(false);
      expect(allowed.text).toContain('OUTSIDE BODY');
      // `grep` always took the per-port fence; the two now agree, which is the point of the repair.
      const grepped = await grepTool(second).execute({ pattern: 'OUTSIDE BODY', path: outside, glob: '*', max_results: 10 } as never, ctx() as never);
      expect(grepped.isError ?? false).toBe(false);
      // REQ-TOOLS-132: a widened READ root never widens writes.
      const write = await writeFileTool(state, second).execute({ path: join(outside, 'new.txt'), content: 'x' } as never, ctx() as never);
      expect(write.isError).toBe(true);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
});

/**
 * PD-WORKSPACE-002 / REQ-WORKSPACE-041..048 — the workspace context unit: what the per-file switches
 * actually reach. The discovery and the merge are pure and are tested in `packages/config`; what is
 * here is the run host's half — the order in the unit list, the cache lifetime, and the two switches.
 */
const contextHost = (home: string, globalDir: string, overrides: Record<string, 'on' | 'off'> = {}, master = true) =>
  new SkillHost({
    home,
    section: () => SKILLS_DEFAULTS,
    instructions: () => ({ section: { overrides }, master, globalDir }),
    log: () => undefined,
  });

describe('the workspace context unit (REQ-WORKSPACE-041..048, PD-WORKSPACE-002)', () => {
  it('REQ-WORKSPACE-047: the context leads the unit list, ahead of the skill catalog', () => {
    const t = tree();
    try {
      writeFileSync(join(t.root, 'AGENTS.md'), 'STANDING INSTRUCTIONS\n');
      const units = contextHost(t.home, join(t.home, 'cfg')).contextUnits(t.root, 's1');
      expect(units).toHaveLength(2);
      expect(units[0]).toContain('STANDING INSTRUCTIONS');
      expect(units[0]).toContain(`<!-- source: ${join(t.root, 'AGENTS.md')} -->`);
      expect(units[1]).toContain('- alpha: Alpha does things.');
    } finally { t.cleanup(); }
  });

  it('PD-WORKSPACE-002: the global and user bases reach the agent, in discovery order', () => {
    const t = tree();
    try {
      const globalDir = join(t.home, 'cfg');
      mkdirSync(globalDir, { recursive: true });
      mkdirSync(join(t.home, '.agents'), { recursive: true });
      writeFileSync(join(t.root, 'CLAUDE.md'), 'PROJECT CLAUDE\n');
      writeFileSync(join(globalDir, 'AGENTS.md'), 'GLOBAL AGENTS\n');
      writeFileSync(join(t.home, '.agents', 'AGENTS.md'), 'USER AGENTS\n');
      const unit = contextHost(t.home, globalDir).contextUnits(t.root, 's1')[0]!;
      expect(unit.indexOf('PROJECT CLAUDE')).toBeLessThan(unit.indexOf('GLOBAL AGENTS'));
      expect(unit.indexOf('GLOBAL AGENTS')).toBeLessThan(unit.indexOf('USER AGENTS'));
    } finally { t.cleanup(); }
  });

  it('PD-WORKSPACE-002: a file switched off contributes nothing, not even its source comment', () => {
    const t = tree();
    try {
      const globalDir = join(t.home, 'cfg');
      mkdirSync(globalDir, { recursive: true });
      writeFileSync(join(t.root, 'AGENTS.md'), 'STANDING INSTRUCTIONS\n');
      writeFileSync(join(globalDir, 'AGENTS.md'), 'GLOBAL AGENTS\n');
      const unit = contextHost(t.home, globalDir, { 'global:AGENTS.md': 'off' }).contextUnits(t.root, 's1')[0]!;
      expect(unit).toContain('STANDING INSTRUCTIONS');
      expect(unit).not.toContain('GLOBAL AGENTS');
      expect(unit).not.toContain(join(globalDir, 'AGENTS.md'));
    } finally { t.cleanup(); }
  });

  it('REQ-WORKSPACE-048: with the master switch false no context file is read at all', () => {
    const t = tree();
    try {
      writeFileSync(join(t.root, 'AGENTS.md'), 'STANDING INSTRUCTIONS\n');
      const units = contextHost(t.home, join(t.home, 'cfg'), { 'workspace:AGENTS.md': 'on' }, false).contextUnits(t.root, 's1');
      expect(units.some((u) => u.includes('STANDING INSTRUCTIONS'))).toBe(false);
    } finally { t.cleanup(); }
  });

  it('REQ-WORKSPACE-050: a run executing in an isolated worktree reads its context files from the execution root', () => {
    const t = tree();
    try {
      const worktree = join(t.root, '..', 'wt');
      mkdirSync(worktree, { recursive: true });
      writeFileSync(join(t.root, 'AGENTS.md'), 'BASE INSTRUCTIONS\n');
      writeFileSync(join(worktree, 'AGENTS.md'), 'WORKTREE INSTRUCTIONS\n');
      const h = contextHost(t.home, join(t.home, 'cfg'));
      const unit = h.contextUnits(t.root, 's1', worktree)[0]!;
      expect(unit).toContain('WORKTREE INSTRUCTIONS');
      expect(unit).not.toContain('BASE INSTRUCTIONS');
      // The skill catalog stays with the BASE workspace, which is the other half of the same sentence.
      expect(h.contextUnits(t.root, 's1', worktree)[1]).toContain('- alpha: Alpha does things.');
      // A session on the base workspace itself is unaffected, and the two are cached apart.
      expect(h.contextUnits(t.root, 's2')[0]).toContain('BASE INSTRUCTIONS');
    } finally { t.cleanup(); }
  });

  it('REQ-WORKSPACE-046: the merge is cached per root until a session is created or a rescan clears it', () => {
    const t = tree();
    try {
      writeFileSync(join(t.root, 'AGENTS.md'), 'FIRST\n');
      const h = contextHost(t.home, join(t.home, 'cfg'));
      expect(h.contextUnits(t.root, 's1')[0]).toContain('FIRST');
      writeFileSync(join(t.root, 'AGENTS.md'), 'SECOND\n');
      expect(h.contextUnits(t.root, 's1')[0]).toContain('FIRST');
      h.onSessionCreated(t.root, 's2');
      expect(h.contextUnits(t.root, 's2')[0]).toContain('SECOND');
      writeFileSync(join(t.root, 'AGENTS.md'), 'THIRD\n');
      h.rescan(t.root);
      expect(h.contextUnits(t.root, 's2')[0]).toContain('THIRD');
    } finally { t.cleanup(); }
  });
});

/**
 * REQ-CHAT-162 — `/skills`, against a real store. What the requirement and the plan ask of the row is what the
 * session's own writer guarantees, so this drives that writer rather than a stand-in: a loaded idle session, the
 * listing written through it, then a SECOND process's resume of the same session reading it back, and the
 * trajectory export (REQ-SESSION-189) carrying it as the `transcript.row` event the append recorded.
 */
describe('the /skills listing is one saved system row (REQ-CHAT-162)', () => {
  const HOST = mintMachineId('0000000000000000000000000000000c') as MachineId;
  const sessionsFor = (dir: string, pid: number, isProcessAlive: (pid: number) => boolean = () => true) => new Sessions({
    clocks: new FakeClock(), publisher: { increment: () => undefined, snapshot: () => undefined }, pid, host: HOST,
    retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-listing', model: null,
    sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid), isProcessAlive,
  });

  it('is written through the loaded session\'s writer, survives a reopen, and is exported with the session', () => {
    const t = tree();
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-listing-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    const dal = new StoreDal(db);
    try {
      writeFileSync(join(t.root, '.agents', 'skills', 'alpha', 'SKILL.md'), `---\nname: alpha\ndescription: ${'Alpha does things. '.repeat(10)}\ntrigger:\n  type: keyword\n  keywords: [render, "/pdf"]\n---\nALPHA BODY\n`);
      const sid = asSessionId('S-listing');
      dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: t.root, created_at: '2026-09-27T00:00:00.000Z', updated_at: '2026-09-27T00:00:00.000Z' });
      const first = sessionsFor(dir, 77);
      expect(first.resume(dal, t.root, sid).ok).toBe(true);
      const skills = host(t.root, t.home);

      const r = writeSkillListing(first.writer(sid), skills.state(t.root, sid));
      expect(r).toEqual({ ok: true, count: 1, index: 0 });
      const stored = dal.residentRows(sid);
      expect(stored.map((row) => [row.kind, row.settled])).toEqual([['system', 1]]);
      const listing = parseSkillListing(stored[0]!.body);
      expect(listing?.count).toBe(1);
      expect(listing?.skills.map((s) => [s.name.text, s.scope.text, s.triggers?.text, s.path.text])).toEqual([['alpha', 'project', 'render, /pdf', join(t.root, '.agents', 'skills', 'alpha', 'SKILL.md')]]);
      // REQ-CHAT-162's clip: at most 120 characters, the last the ellipsis where the long description was cut.
      expect(Array.from(listing!.skills[0]!.description.text)).toHaveLength(120);
      expect(listing!.skills[0]!.description.text.endsWith('…')).toBe(true);

      // Reopened by another process: the row is read back from the store, as every row of the session is.
      const again = sessionsFor(dir, 88, () => false);
      expect(again.resume(dal, t.root, sid).ok).toBe(true);
      expect(dal.residentRows(sid).map((row) => row.body)).toEqual([stored[0]!.body]);

      // Exported with the session: the trajectory document carries the append's `transcript.row` event.
      const events = (readTrajectory(dal, sid)!.document as { events: { event: string; row?: { kind: string; body: string } }[] }).events;
      const rows = events.filter((e) => e.event === 'transcript.row').map((e) => e.row);
      expect(rows).toEqual([expect.objectContaining({ kind: 'system', body: stored[0]!.body })]);
    } finally {
      db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); t.cleanup();
    }
  });

  it('refuses rather than writing around a session that is not loaded — no row lands under the store alone', () => {
    const t = tree();
    try {
      const r = writeSkillListing(undefined, host(t.root, t.home).state(t.root));
      expect(r).toMatchObject({ ok: false, code: 'session.not-loaded' });
    } finally { t.cleanup(); }
  });

  it('lists every discovered skill whatever its policy, a hand-loaded one for this session, and nothing of another session\'s', () => {
    const t = tree();
    try {
      mkdirSync(join(t.root, 'elsewhere', 'by-hand'), { recursive: true });
      writeFileSync(join(t.root, 'elsewhere', 'by-hand', 'SKILL.md'), '---\nname: by-hand\ndescription: Loaded by hand.\n---\nb\n');
      const h = host(t.root, t.home, { ...SKILLS_DEFAULTS, enabled: false, overrides: { alpha: 'off' } });
      expect(h.loadFile(t.root, 's1', join(t.root, 'elsewhere', 'by-hand')).ok).toBe(true);
      const bodies: string[] = [];
      const writer = { appendRow: (_kind: string, body: string) => { bodies.push(body); return { ok: true as const, value: { index: bodies.length - 1, kind: 'system', settled: true, body, at: '', ts: '' } }; } };
      expect(writeSkillListing(writer, h.state(t.root, 's1'))).toEqual({ ok: true, count: 2, index: 0 });
      expect(parseSkillListing(bodies[0]!)?.skills.map((s) => `${s.name.text}:${s.scope.text}`)).toEqual(['alpha:project', 'by-hand:manual']);
      expect(writeSkillListing(writer, h.state(t.root, 's2'))).toEqual({ ok: true, count: 1, index: 1 });
    } finally { t.cleanup(); }
  });
});
