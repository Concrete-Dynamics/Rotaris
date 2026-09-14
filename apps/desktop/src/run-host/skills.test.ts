import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileToolState, grepTool, readFileTool, writeFileTool } from '@rotaris/agent-tools';
import { SKILLS_DEFAULTS, type SkillsSection } from '@rotaris/config';
import { SkillHost } from './skills.js';

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
