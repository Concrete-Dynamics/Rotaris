import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { FileToolState, grepTool, readFileTool, writeFileTool } from '@rotaris/agent-tools';
import { NODE_DISCOVERY_PORTS, SKILLS_DEFAULTS, type DiscoveryPorts, type SkillsSection } from '@rotaris/config';
import { millis } from '@rotaris/kernel';
import { SkillHost, type SkillHostDeps } from './skills.js';

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

/*
 * `contextUnits` always runs instruction discovery too, so the catalog cases name a scratch machine-wide base as
 * `contextHost` does: on a Linux host the default is the real `/etc/codex`, and a file there made three exact
 * assertions below fail on what the machine held (the gap the first repair of the `/etc/codex` defect left).
 */
const host = (_root: string, home: string, section: SkillsSection = SKILLS_DEFAULTS, extra: Partial<SkillHostDeps> = {}) =>
  new SkillHost({ home, machineDir: join(home, 'machine'), section: () => section, log: () => undefined, ...extra });

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
const contextHost = (home: string, globalDir: string, overrides: Record<string, 'on' | 'off'> = {}, master = true, extra: Partial<SkillHostDeps> = {}) =>
  new SkillHost({
    home,
    // A scratch machine-wide base, so a Linux host's own `/etc/codex` never reaches a test's merge.
    machineDir: join(home, 'machine'),
    section: () => SKILLS_DEFAULTS,
    instructions: () => ({ section: { overrides }, master, globalDir }),
    log: () => undefined,
    ...extra,
  });

describe('the workspace context unit (REQ-WORKSPACE-041..048, PD-WORKSPACE-002)', () => {
  it('isolation: neither helper here probes the machine’s own `/etc/codex` for an instruction file, whatever the host holds', () => {
    /*
     * An exact assertion over a merge fails only on a host that HOLDS an `/etc/codex/AGENTS.md`, which is how the
     * first repair of that defect missed `host()` on a host that holds none. The probes are recorded instead, so the
     * isolation is decided on any host. The platform is pinned so the machine-wide base is consulted on Windows too.
     * The skill search's own machine-wide root, `/etc/codex/skills`, has no seam yet and is not asked about here
     * (`docs/defects/three-proofs-and-the-catalog-tests-read-the-machines-own-etc-codex.md`).
     */
    const t = tree();
    try {
      const probesOf = (make: (ports: DiscoveryPorts) => SkillHost): string[] => {
        const probed: string[] = [];
        const ports: DiscoveryPorts = { ...NODE_DISCOVERY_PORTS, isFile: (p) => { probed.push(p); return NODE_DISCOVERY_PORTS.isFile(p); } };
        make(ports).contextUnits(t.root, 's1');
        return probed.filter((p) => /^(AGENTS|CLAUDE)(\.override)?\.md$/.test(basename(p)));
      };
      for (const probed of [
        probesOf((ports) => host(t.root, t.home, SKILLS_DEFAULTS, { ports, platform: 'linux' })),
        probesOf((ports) => contextHost(t.home, join(t.home, 'cfg'), {}, true, { ports, platform: 'linux' })),
      ]) {
        // The machine-wide base WAS consulted — at the scratch directory, and nowhere under the real one.
        expect(probed).toContain(join(t.home, 'machine', 'AGENTS.md'));
        expect(probed.filter((p) => p.startsWith(join('/etc', 'codex')))).toEqual([]);
      }
    } finally { t.cleanup(); }
  });

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

  it('PD-WORKSPACE-002: the machine-wide base reaches the agent last, read from the directory the host was given', () => {
    const t = tree();
    try {
      mkdirSync(join(t.home, 'machine'), { recursive: true });
      mkdirSync(join(t.home, '.openhands'), { recursive: true });
      writeFileSync(join(t.home, '.openhands', 'CLAUDE.md'), 'USER OPENHANDS\n');
      writeFileSync(join(t.home, 'machine', 'AGENTS.md'), 'MACHINE AGENTS\n');
      const unit = contextHost(t.home, join(t.home, 'cfg'), {}, true, { platform: 'linux' }).contextUnits(t.root, 's1')[0]!;
      expect(unit.indexOf('USER OPENHANDS')).toBeLessThan(unit.indexOf('MACHINE AGENTS'));
      expect(unit).toContain(`<!-- source: ${join(t.home, 'machine', 'AGENTS.md')} -->`);
      // …and on a platform with no `/etc` hierarchy the base is not consulted at all, wherever it points.
      expect(contextHost(t.home, join(t.home, 'cfg'), {}, true, { platform: 'win32' }).contextUnits(t.root, 's1')[0]).not.toContain('MACHINE AGENTS');
    } finally { t.cleanup(); }
  });

  it('REQ-WORKSPACE-049: the cold path is timed on the clock port in its three parts, and a cache hit is not timed', () => {
    const t = tree();
    try {
      writeFileSync(join(t.root, 'AGENTS.md'), 'STANDING INSTRUCTIONS\n');
      // Four readings: before the policy read, after it, after discovery, after the merge.
      const readings = [100, 101.5, 104, 110];
      let taken = 0;
      const lines: string[] = [];
      const h = contextHost(t.home, join(t.home, 'cfg'), {}, true, {
        monotonic: { now: () => { taken += 1; return millis(readings.shift() ?? 999); } },
        log: (m) => { lines.push(m); },
      });
      const merged = h.workspaceContext(t.root);
      const timed = lines.filter((l) => / merged into /.test(l));
      expect(timed).toEqual([
        `workspace context: the enabled set of 1 instruction file(s) merged into ${Buffer.byteLength(merged, 'utf8')} bytes in 10.00 ms (policy read 1.50 ms, discovery 2.50 ms, merge 6.00 ms) for ${t.root}`,
      ]);
      // The cached answer reads no file and takes no reading.
      const takenCold = taken;
      h.workspaceContext(t.root);
      expect(lines.filter((l) => / merged into /.test(l))).toHaveLength(1);
      expect(taken).toBe(takenCold);
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
