import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { FileToolState, grepTool, readFileTool, writeFileTool } from '@rotaris/agent-tools';
import { MCP_SECTION_HEADING, NODE_DISCOVERY_PORTS, renderMcpSection, SKILLS_DEFAULTS, type DiscoveryPorts, type SkillsSection } from '@rotaris/config';
import { parseSkillListing } from '@rotaris/contracts';
import { readTrajectory, Sessions, withContextUnits, withMcpSection } from '@rotaris/engine';
import { asSessionId, FakeClock, millis, mintMachineId, type MachineId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { SkillHost, writeSkillListing, type SkillHostDeps } from './skills.js';

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
 * Both discoveries read under one machine-wide directory — `PD-WORKSPACE-002`'s instruction base is `/etc/codex` and
 * REQ-WORKSPACE-051's fourth skill root is `/etc/codex/skills` — so the catalog cases name a scratch one as
 * `contextHost` does: on a Linux host the default is the real directory, and a file there made three exact assertions
 * below fail on what the machine held (an `AGENTS.md`, the gap the first repair of the `/etc/codex` defect left; then a
 * `skills/zeta/SKILL.md`, the gap this seam closes). With it, every case here is decidable on any host.
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

  it('REQ-WORKSPACE-051: a skill in the machine-wide root is found through the directory the host was given — user scope, outranked by every other root, on any host', () => {
    /*
     * The note that found the gap staged `/etc/codex/skills/zeta/SKILL.md` in a private `/etc` (`unshare -m`) and
     * watched three cases here fail. The same skill now sits under the scratch machine directory, where the seam
     * puts the fourth user-scope root, so the same fact is decided without a mount namespace and on every host.
     */
    const t = tree();
    try {
      mkdirSync(join(t.home, 'machine', 'skills', 'zeta'), { recursive: true });
      writeFileSync(join(t.home, 'machine', 'skills', 'zeta', 'SKILL.md'), '---\nname: zeta\ndescription: Machine-wide.\n---\nZETA BODY\n');
      // The machine root is the last user-scope root: a same-named skill anywhere else wins and shadows it.
      mkdirSync(join(t.home, '.agents', 'skills', 'alpha'), { recursive: true });
      writeFileSync(join(t.home, '.agents', 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: The home copy.\n---\na\n');
      mkdirSync(join(t.home, 'machine', 'skills', 'alpha'), { recursive: true });
      writeFileSync(join(t.home, 'machine', 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: The machine copy.\n---\na\n');
      const linux = host(t.root, t.home, SKILLS_DEFAULTS, { platform: 'linux' }).state(t.root);
      expect(linux.skills.map((s) => [s.name, s.scope, s.path])).toEqual([
        ['alpha', 'project', join(t.root, '.agents', 'skills', 'alpha', 'SKILL.md')],
        ['zeta', 'user', join(t.home, 'machine', 'skills', 'zeta', 'SKILL.md')],
      ]);
      expect(linux.skills[0]!.shadowed).toEqual([join(t.home, '.agents', 'skills', 'alpha', 'SKILL.md'), join(t.home, 'machine', 'skills', 'alpha', 'SKILL.md')]);
      // On a platform with no `/etc` hierarchy the root is not searched at all, wherever the seam points.
      expect(host(t.root, t.home, SKILLS_DEFAULTS, { platform: 'win32' }).state(t.root).skills.map((s) => s.name)).toEqual(['alpha']);
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
  it('isolation: neither helper here probes the machine’s own `/etc/codex` — for an instruction file or for a skill — whatever the host holds', () => {
    /*
     * An exact assertion over a merge fails only on a host that HOLDS an `/etc/codex/AGENTS.md`, which is how the
     * first repair of that defect missed `host()` on a host that holds none. The probes are recorded instead, so the
     * isolation is decided on any host. The platform is pinned so the machine-wide base is consulted on Windows too.
     * The skill search's own machine-wide root, `/etc/codex/skills`, is asked about the same way: its listing is a
     * `readDir`, so those are recorded too, and it must land under the scratch directory and nowhere under the real one
     * (`docs/defects/fixed/three-proofs-and-the-catalog-tests-read-the-machines-own-etc-codex.md`).
     */
    const t = tree();
    try {
      const probesOf = (make: (ports: DiscoveryPorts) => SkillHost): { files: string[]; dirs: string[] } => {
        const files: string[] = [];
        const dirs: string[] = [];
        const ports: DiscoveryPorts = {
          ...NODE_DISCOVERY_PORTS,
          isFile: (p) => { files.push(p); return NODE_DISCOVERY_PORTS.isFile(p); },
          readDir: (p) => { dirs.push(p); return NODE_DISCOVERY_PORTS.readDir(p); },
        };
        make(ports).contextUnits(t.root, 's1');
        return { files: files.filter((p) => /^(AGENTS|CLAUDE)(\.override)?\.md$/.test(basename(p))), dirs };
      };
      for (const probed of [
        probesOf((ports) => host(t.root, t.home, SKILLS_DEFAULTS, { ports, platform: 'linux' })),
        probesOf((ports) => contextHost(t.home, join(t.home, 'cfg'), {}, true, { ports, platform: 'linux' })),
      ]) {
        // The machine-wide base WAS consulted — at the scratch directory, and nowhere under the real one.
        expect(probed.files).toContain(join(t.home, 'machine', 'AGENTS.md'));
        expect(probed.files.filter((p) => p.startsWith(join('/etc', 'codex')))).toEqual([]);
        // And so was the machine-wide skill root — the scratch directory's `skills` child, never `/etc/codex/skills`.
        expect(probed.dirs).toContain(join(t.home, 'machine', 'skills'));
        expect(probed.dirs.filter((p) => p.startsWith(join('/etc', 'codex')))).toEqual([]);
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

  /*
   * Finding H4 of the final duress live run at 27a5127: the prompt read `<!-- source: …/AGENTS.md -->`, the file's 13
   * lines, a blank line and `## MCP servers` — nothing said where the file ended, and two of eight agents read the MCP
   * section as the file's own. The prompt is assembled here with the product's own three steps (the unit list, the
   * role's prompt with its units, the MCP section after them), so what is asserted is the text an agent receives
   * (`docs/defects/fixed/nothing-marks-where-the-last-instruction-file-ends-so-agents-read-the-mcp-section-as-part-of-it.md`).
   */
  it('REQ-WORKSPACE-043 with REQ-MCP-101: the instruction files are closed before the MCP section, so its heading is not read as the last file\'s', () => {
    const base = mkdtempSync(join(tmpdir(), 'rotaris-skills-'));
    const root = join(base, 'ws');
    const home = join(base, 'home');
    try {
      mkdirSync(root, { recursive: true });
      mkdirSync(home, { recursive: true });
      // No skill anywhere: the live run's case, where the MCP section follows the last file directly.
      writeFileSync(join(root, 'AGENTS.md'), '# Working in this repository\n\nKeep changes minimal.\n');
      const units = contextHost(home, join(home, 'cfg')).contextUnits(root, 's1');
      expect(units).toHaveLength(1);
      const section = renderMcpSection({ persona: 'docs', dropped: [], active: [{ name: 'alpha', entry: { type: 'stdio', command: 'x', args: [] } as never, origin: 'yaml', discoveryFailed: false, tools: [{ callable: 'echo', reported: 'echo', description: 'Echo the text back.', inputSchema: {} }] }] });
      const prompt = withMcpSection(withContextUnits('You write documentation.', units), section);
      const fileAt = prompt.indexOf(`<!-- source: ${join(root, 'AGENTS.md')} -->`);
      const fileEnd = prompt.indexOf('Keep changes minimal.', fileAt) + 'Keep changes minimal.'.length;
      const headingAt = prompt.indexOf(MCP_SECTION_HEADING, fileEnd);
      expect(fileAt).toBeGreaterThan(0);
      expect(headingAt).toBeGreaterThan(fileEnd);
      // Between the file's last line and the MCP heading: exactly the closing comment, one blank line either side.
      expect(prompt.slice(fileEnd, headingAt)).toBe('\n\n<!-- end of instruction files: nothing below this line is part of them -->\n\n');
      // With a skill catalog after the files, the close sits between the files and the catalog instead.
      mkdirSync(join(root, '.agents', 'skills', 'alpha'), { recursive: true });
      writeFileSync(join(root, '.agents', 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: Alpha does things.\n---\nALPHA BODY\n');
      const withCatalog = contextHost(home, join(home, 'cfg')).contextUnits(root, 's2');
      expect(withCatalog).toHaveLength(2);
      expect(withCatalog[0]!.endsWith('Keep changes minimal.\n\n<!-- end of instruction files: nothing below this line is part of them -->')).toBe(true);
      expect(withCatalog[1]).not.toContain('end of instruction files');
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  it('REQ-WORKSPACE-047: with no instruction file there is no unit, and so no closing comment either', () => {
    const base = mkdtempSync(join(tmpdir(), 'rotaris-skills-'));
    try {
      mkdirSync(join(base, 'ws'), { recursive: true });
      mkdirSync(join(base, 'home'), { recursive: true });
      expect(contextHost(join(base, 'home'), join(base, 'home', 'cfg')).contextUnits(join(base, 'ws'), 's1')).toEqual([]);
    } finally { rmSync(base, { recursive: true, force: true }); }
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
