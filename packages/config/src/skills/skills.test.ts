import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mergeLayers } from '../merge.js';
import { readSkillsSection } from '../sections/skills.js';
import type { ProblemSink } from '../sections/field.js';
import { collapseWhitespace, normalizeSkillName } from './names.js';
import { hasEtcHierarchy, installedManifestPath, MACHINE_CODEX_DIR, machineCodexDir, projectDirectories, skillRoots } from './roots.js';
import { isDisabled, readInstalledManifest } from './manifest.js';
import {
  parseSkill, readInvocation, readTrigger,
  SKILL_EMPTY_NAME, SKILL_NO_FRONTMATTER, SKILL_NOT_A_MAPPING, SKILL_UNCLOSED_FRONTMATTER,
} from './parse.js';
import { discoverSkills, NODE_DISCOVERY_PORTS, skillReadRoots, type DiscoveredSkill, type DiscoveryPorts } from './discover.js';
import { resolveSkills } from './policy.js';
import { skillActivationStatement, skillCatalogBlock, skillCatalogLine } from './blocks.js';
import { expandHome, loadManualSkill, skillNotFound, skillPathNotAcceptable } from './manual.js';

const sink = (): ProblemSink => ({ errors: [], warnings: [] });

/**
 * A filesystem as a plain map of path → contents; a directory is any path that is a prefix of a file's.
 * The leading drive letter is stripped because `manual.ts` resolves through `node:path`, which on Windows
 * turns a POSIX-absolute fixture path into `D:\…` — a property of the harness, not of the rules under test.
 */
function ports(files: Readonly<Record<string, string>>): DiscoveryPorts {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/\/+$/, '');
  const paths = Object.keys(files).map(norm);
  const dirs = new Set<string>();
  for (const p of paths) { const parts = p.split('/'); for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/')); }
  return {
    readDir: (dir) => {
      const d = norm(dir);
      const children = new Set<string>();
      for (const p of [...paths, ...dirs]) if (p.startsWith(`${d}/`)) children.add(p.slice(d.length + 1).split('/')[0]!);
      return [...children];
    },
    readFile: (p) => { const v = files[norm(p)] ?? files[p]; if (v === undefined) throw new Error(`ENOENT ${p}`); return v; },
    isDirectory: (p) => dirs.has(norm(p)),
    isFile: (p) => paths.includes(norm(p)),
  };
}

const skillFile = (name: string, extra = ''): string => `---\nname: ${name}\ndescription: Does ${name} things.\n${extra}---\nThe ${name} body.\n`;

describe('REQ-WORKSPACE-054 — the skill name normal form', () => {
  it('lower-cases, collapses every run outside [a-z0-9] to one hyphen, and strips the ends', () => {
    expect(normalizeSkillName('PDF Render')).toBe('pdf-render');
    expect(normalizeSkillName('__build  UI__')).toBe('build-ui');
    expect(normalizeSkillName('c++/build')).toBe('c-build');
    expect(normalizeSkillName('a1b2')).toBe('a1b2');
  });
  it('yields the empty string for a name made only of separators, which is what makes it invalid', () => {
    expect(normalizeSkillName('---')).toBe('');
    expect(normalizeSkillName('   ')).toBe('');
  });
  it('REQ-WORKSPACE-055: a description written over several lines collapses to one', () => {
    expect(collapseWhitespace('a\n  b\t\tc  ')).toBe('a b c');
  });
});

describe('REQ-WORKSPACE-051 — the search order', () => {
  const exists = (paths: readonly string[]) => (p: string) => paths.includes(p.replace(/\\/g, '/'));

  it('walks from the workspace root up to and including the nearest ancestor holding a .git ENTRY, nearest first', () => {
    const dirs = projectDirectories({ workspaceRoot: join('/repo', 'pkg', 'app'), exists: exists(['/repo/.git']) }).map((d) => d.replace(/\\/g, '/'));
    expect(dirs).toEqual(['/repo/pkg/app', '/repo/pkg', '/repo']);
  });
  it('stops at a .git FILE too, so a linked worktree root ends the walk (this repository runs its proofs in one)', () => {
    const dirs = projectDirectories({ workspaceRoot: join('/wt', 'sub'), exists: exists(['/wt/.git']) }).map((d) => d.replace(/\\/g, '/'));
    expect(dirs).toEqual(['/wt/sub', '/wt']);
  });
  it('is the workspace root ALONE when no ancestor holds one — never the filesystem root', () => {
    const dirs = projectDirectories({ workspaceRoot: join('/a', 'b', 'c'), exists: () => false }).map((d) => d.replace(/\\/g, '/'));
    expect(dirs).toEqual(['/a/b/c']);
  });
  it('searches .agents/skills before .opencode/skills in each directory, and every project root before every user root', () => {
    const roots = skillRoots({ workspaceRoot: '/repo', home: '/home/u', platform: 'linux', exists: exists(['/repo/.git']) }).map((r) => `${r.scope}:${r.dir.replace(/\\/g, '/')}`);
    expect(roots).toEqual([
      'project:/repo/.agents/skills', 'project:/repo/.opencode/skills',
      'user:/home/u/.agents/skills', 'user:/home/u/.config/opencode/skills', 'user:/home/u/.openhands/skills/installed', 'user:/etc/codex/skills',
    ]);
  });
  it('ends user scope at the three home-relative roots where there is no /etc, substituting nothing', () => {
    const roots = skillRoots({ workspaceRoot: 'C:/ws', home: 'C:/Users/u', platform: 'win32', exists: () => false });
    expect(hasEtcHierarchy('win32')).toBe(false);
    expect(roots.filter((r) => r.scope === 'user')).toHaveLength(3);
    expect(roots.some((r) => r.dir.includes('etc'))).toBe(false);
  });
  it('`machineDir` moves the fourth user-scope root to `<machineDir>/skills` and nothing else — the seam the proofs and the catalog tests isolate through', () => {
    const roots = skillRoots({ workspaceRoot: '/repo', home: '/home/u', platform: 'linux', machineDir: '/scratch/machine-codex', exists: () => false }).map((r) => `${r.scope}:${r.dir.replace(/\\/g, '/')}`);
    // Same scope, same rank — last of the user roots — and nowhere under the real `/etc/codex`.
    expect(roots.at(-1)).toBe(`user:${resolve('/scratch/machine-codex').replace(/\\/g, '/')}/skills`);
    expect(roots.filter((r) => r.includes('/etc/codex'))).toEqual([]);
    expect(roots).toHaveLength(6);
    // Absent or blank, the real directory — the one `PD-WORKSPACE-002`'s instruction base reads too.
    expect(machineCodexDir(undefined)).toBe(MACHINE_CODEX_DIR);
    expect(machineCodexDir('  ')).toBe(MACHINE_CODEX_DIR);
    expect(MACHINE_CODEX_DIR.replace(/\\/g, '/')).toBe('/etc/codex');
    // On a platform with no `/etc` hierarchy the seam changes nothing: still no fourth root, wherever it points.
    const win = skillRoots({ workspaceRoot: 'C:/ws', home: 'C:/Users/u', platform: 'win32', machineDir: 'C:/scratch/machine-codex', exists: () => false });
    expect(win.filter((r) => r.scope === 'user')).toHaveLength(3);
    expect(win.some((r) => r.dir.includes('machine-codex'))).toBe(false);
  });
});

describe('REQ-WORKSPACE-052 — the disable manifest, in its three shapes', () => {
  const path = installedManifestPath('/home/u');

  it('shape 1: a map with a disabled list', () => {
    const d = readInstalledManifest('{"disabled":["pdf-render","SEPA Formats"]}', path);
    expect(isDisabled(d, 'pdf-render')).toBe(true);
    // "(or normalized name)": the manifest's spelling and the directory's need not match.
    expect(isDisabled(d, 'sepa-formats')).toBe(true);
    expect(isDisabled(d, 'kept')).toBe(false);
  });
  it('shape 2: a map whose values carry disabled:true, identified by key, name or path', () => {
    const d = readInstalledManifest('{"by-key":{"disabled":true},"x":{"disabled":true,"name":"by-name"},"y":{"disabled":true,"path":"/opt/skills/by-path/"},"z":{"disabled":false}}', path);
    expect(isDisabled(d, 'by-key')).toBe(true);
    expect(isDisabled(d, 'by-name')).toBe(true);
    expect(isDisabled(d, 'by-path')).toBe(true);
    expect(isDisabled(d, 'z')).toBe(false);
  });
  it('shape 3: a list of entries', () => {
    const d = readInstalledManifest('[{"disabled":true,"name":"gone"},{"disabled":false,"name":"kept"}]', path);
    expect(isDisabled(d, 'gone')).toBe(true);
    expect(isDisabled(d, 'kept')).toBe(false);
  });
  it('an unreadable manifest warns and disables NOTHING — a file this product did not write cannot take a skill away silently', () => {
    const d = readInstalledManifest('{not json', path);
    expect(d.warning).toContain(path);
    expect(d.names.size).toBe(0);
  });
  it('an absent manifest is the ordinary case and is not a warning', () => {
    expect(readInstalledManifest(null, path)).toEqual({ names: new Set(), warning: null });
  });
});

describe('REQ-WORKSPACE-053/055/056 — the SKILL.md document', () => {
  it('reads name, description and the body below the fence', () => {
    const r = parseSkill('---\nname: PDF Render\ndescription: Renders  PDFs.\n---\nbody line\n');
    expect(r.ok && r.skill.name).toBe('pdf-render');
    expect(r.ok && r.skill.declaredName).toBe('PDF Render');
    expect(r.ok && r.skill.description).toBe('Renders PDFs.');
    expect(r.ok && r.skill.body.trim()).toBe('body line');
  });
  it('preserves unknown frontmatter fields as raw metadata', () => {
    const r = parseSkill('---\nname: a\ndescription: d\nlicense: MIT\nversion: 3\n---\n');
    expect(r.ok && r.skill.raw['license']).toBe('MIT');
    expect(r.ok && r.skill.raw['version']).toBe(3);
  });
  it.each([
    ['no frontmatter at all', 'just a body\n', SKILL_NO_FRONTMATTER],
    ['an opening fence never closed', '---\nname: a\n', SKILL_UNCLOSED_FRONTMATTER],
    ['frontmatter that is not a mapping', '---\n- a\n- b\n---\n', SKILL_NOT_A_MAPPING],
    ['an empty fence', '---\n---\nbody', SKILL_NOT_A_MAPPING],
    ['a name that normalises to nothing', '---\nname: "***"\ndescription: d\n---\n', SKILL_EMPTY_NAME],
  ])('skips %s with its own reason', (_label, text, reason) => {
    const r = parseSkill(text);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe(reason);
  });
  it('names the missing required field, and malformed YAML as malformed YAML', () => {
    expect(parseSkill('---\ndescription: d\n---\n')).toMatchObject({ ok: false, reason: "missing required field 'name'" });
    expect(parseSkill('---\nname: a\n---\n')).toMatchObject({ ok: false, reason: "missing required field 'description'" });
    const bad = parseSkill('---\nname: [unclosed\n---\n');
    expect(!bad.ok && bad.reason.startsWith('malformed YAML:')).toBe(true);
  });

  it('accepts the canonical trigger and the legacy aliases alike, stripping and de-duplicating in order', () => {
    const canonical = readTrigger({ trigger: { type: 'keyword', keywords: [' a ', 'b', 'a'] } });
    expect(canonical).toEqual({ ok: true, trigger: { type: 'keyword', keywords: ['a', 'b'] } });
    const legacy = readTrigger({ type: 'keyword', triggers: ['x', ' y'] });
    expect(legacy).toEqual({ ok: true, trigger: { type: 'keyword', keywords: ['x', 'y'] } });
  });
  it('refuses a trigger it cannot honour rather than ignoring it, so an author is never left believing it is in force', () => {
    expect(readTrigger({ trigger: { type: 'semantic', keywords: ['a'] } })).toMatchObject({ ok: false });
    expect(readTrigger({ trigger: { type: 'keyword', keywords: ['a', 3] } })).toMatchObject({ ok: false });
    expect(readTrigger({ trigger: 'keyword' })).toMatchObject({ ok: false });
  });
  it('treats no trigger as ordinary rather than a fault', () => {
    expect(readTrigger({ name: 'a' })).toEqual({ ok: true, trigger: null });
  });

  it('REQ-WORKSPACE-056: derives the invocation mode from the frontmatter', () => {
    expect(readInvocation({})).toBe('default');
    expect(readInvocation({ 'user-invocable': false })).toBe('auto-only');
    expect(readInvocation({ 'disable-model-invocation': true })).toBe('manual-only');
    // Both stated: the requirement lists user-invocable first and states no combination rule; the narrower wins.
    expect(readInvocation({ 'user-invocable': false, 'disable-model-invocation': true })).toBe('auto-only');
  });
});

describe('REQ-WORKSPACE-053 — a SKILL.md that is not UTF-8, through the real port (OQ-76)', () => {
  /*
   * REQ-WORKSPACE-045 names a decoding error as one way an instruction file is unreadable; REQ-WORKSPACE-053 lists
   * "unreadable file" among the reasons a SKILL.md is skipped without saying whether a decoding error is one. The
   * build reads it as one (OQ-76): the same port serves both walks, and a file parsed with U+FFFD standing in for what
   * its author wrote is not the file the author wrote. The bytes are the defect note's: `68 69 0a ff fe c3 28 0a`.
   */
  const NOT_UTF8 = Buffer.from([0x68, 0x69, 0x0a, 0xff, 0xfe, 0xc3, 0x28, 0x0a]);

  it('is skipped with a reason naming the path and the decoding error, and the walk goes on to the next skill', () => {
    const base = mkdtempSync(join(tmpdir(), 'rotaris-skill-decode-'));
    try {
      const root = join(base, 'ws');
      mkdirSync(join(root, '.agents', 'skills', 'bad'), { recursive: true });
      mkdirSync(join(root, '.agents', 'skills', 'good'), { recursive: true });
      writeFileSync(join(root, '.agents', 'skills', 'bad', 'SKILL.md'), NOT_UTF8);
      writeFileSync(join(root, '.agents', 'skills', 'good', 'SKILL.md'), skillFile('good'));
      // The home and the machine directory are scratch too, so this decides the same thing on every host.
      const d = discoverSkills({ workspaceRoot: root, home: join(base, 'home'), platform: 'linux', machineDir: join(base, 'machine'), exists: (p) => NODE_DISCOVERY_PORTS.isDirectory(p) || NODE_DISCOVERY_PORTS.isFile(p) }, NODE_DISCOVERY_PORTS);
      expect(d.skills.map((s) => s.name)).toEqual(['good']);
      expect(d.skipped).toHaveLength(1);
      expect(d.skipped[0]!.path).toBe(join(root, '.agents', 'skills', 'bad', 'SKILL.md'));
      expect(d.skipped[0]!.reason).toMatch(/^unreadable file: /);
      // The error is the decoder's, not a replacement character quietly parsed: nothing of the file reached a skill.
      expect(d.skipped[0]!.reason).not.toContain('\uFFFD');
      expect(d.skills[0]!.body).not.toContain('\uFFFD');
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  it('the real port keeps reading a UTF-8 file exactly as before — non-ASCII text intact, a BOM left where it was', () => {
    const base = mkdtempSync(join(tmpdir(), 'rotaris-skill-decode-'));
    try {
      const plain = join(base, 'plain.md');
      const bom = join(base, 'bom.md');
      writeFileSync(plain, 'héllo — 日本\n');
      writeFileSync(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('x\n')]));
      expect(NODE_DISCOVERY_PORTS.readFile(plain)).toBe('héllo — 日本\n');
      expect(NODE_DISCOVERY_PORTS.readFile(bom)).toBe('\uFEFFx\n');
      expect(() => NODE_DISCOVERY_PORTS.readFile(join(base, 'absent.md'))).toThrow(/ENOENT/);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
});

describe('REQ-WORKSPACE-051/054 — discovery, precedence and shadowing', () => {
  const env = { workspaceRoot: '/repo/ws', home: '/home/u', platform: 'linux' as NodeJS.Platform };
  const tree = {
    '/repo/.git': '',
    '/repo/.agents/skills/repo-skill/SKILL.md': skillFile('repo-skill'),
    '/repo/ws/.agents/skills/shared/SKILL.md': skillFile('shared'),
    '/repo/ws/.opencode/skills/shared/SKILL.md': skillFile('shared'),
    '/repo/ws/.agents/skills/zebra/SKILL.md': skillFile('zebra'),
    '/repo/ws/.agents/skills/alpha/SKILL.md': skillFile('alpha'),
    '/repo/ws/.agents/skills/broken/SKILL.md': 'no frontmatter here\n',
    '/repo/ws/.agents/skills/not-a-skill/README.md': 'ignored',
    '/home/u/.agents/skills/shared/SKILL.md': skillFile('shared'),
    '/home/u/.agents/skills/home-only/SKILL.md': skillFile('home-only'),
  };
  const run = (extra: Record<string, string> = {}) => {
    const p = ports({ ...tree, ...extra });
    return discoverSkills({ ...env, exists: (path) => p.isDirectory(path) || p.isFile(path) }, p);
  };

  it('finds project and user scope, orders by normalized name, and labels each with its scope', () => {
    const d = run();
    expect(d.skills.map((s) => s.name)).toEqual(['alpha', 'home-only', 'repo-skill', 'shared', 'zebra']);
    expect(d.skills.find((s) => s.name === 'repo-skill')!.scope).toBe('project');
    expect(d.skills.find((s) => s.name === 'home-only')!.scope).toBe('user');
  });
  it('gives the first location to yield a name outright victory, and RECORDS the ones it beat', () => {
    const shared = run().skills.find((s) => s.name === 'shared')!;
    // The workspace's .agents beats its own .opencode, which beats the home root.
    expect(shared.path.replace(/\\/g, '/')).toBe('/repo/ws/.agents/skills/shared/SKILL.md');
    expect(shared.shadowed.map((p) => p.replace(/\\/g, '/'))).toEqual(['/repo/ws/.opencode/skills/shared/SKILL.md', '/home/u/.agents/skills/shared/SKILL.md']);
  });
  it('counts only immediate children that hold a SKILL.md, and skips an invalid one with its reason', () => {
    const d = run();
    expect(d.skills.some((s) => s.name === 'not-a-skill')).toBe(false);
    expect(d.skipped).toHaveLength(1);
    expect(d.skipped[0]!.path.replace(/\\/g, '/')).toBe('/repo/ws/.agents/skills/broken/SKILL.md');
    expect(d.skipped[0]!.reason).toBe(SKILL_NO_FRONTMATTER);
  });
  it('REQ-WORKSPACE-052: skips a directory the manifest disables, without opening it', () => {
    const d = run({
      '/home/u/.openhands/skills/installed/kept/SKILL.md': skillFile('kept'),
      '/home/u/.openhands/skills/installed/dropped/SKILL.md': skillFile('dropped'),
      '/home/u/.openhands/skills/.installed.json': '{"disabled":["dropped"]}',
    });
    expect(d.skills.some((s) => s.name === 'kept')).toBe(true);
    expect(d.skills.some((s) => s.name === 'dropped')).toBe(false);
    expect(d.skipped.some((s) => s.path.includes('dropped'))).toBe(false);
  });
  it('REQ-WORKSPACE-059: the read roots are the resolved directories, sorted and de-duplicated', () => {
    const roots = skillReadRoots(run().skills).map((r) => r.replace(/\\/g, '/'));
    expect(roots).toEqual([...roots].sort());
    expect(new Set(roots).size).toBe(roots.length);
    expect(roots).toContain('/repo/ws/.agents/skills/alpha');
  });
});

describe('this repository is its own fixture (AGENTS.md, REQ-WORKSPACE-051)', () => {
  it('discovers its own three portable skills from .agents/skills, against the real filesystem', () => {
    // `AGENTS.md` has claimed since 2026-09-12 that "three portable workflows live under `.agents/skills/`,
    // where REQ-WORKSPACE-051 makes them discoverable from this repository". Until this feature existed
    // nothing could observe that. The walk starts inside `packages/config`, so it exercises the ancestor climb
    // and the `.git` **file** that ends it in a worktree — this repository's own working shape.
    const d = discoverSkills({
      workspaceRoot: resolve(import.meta.dirname, '..', '..'),
      // A home that does not exist, so user scope contributes nothing and this asserts about the repository alone.
      home: resolve('/nonexistent-home-for-this-check'),
      platform: process.platform,
      exists: (p) => existsSync(p),
    });
    const project = d.skills.filter((s) => s.scope === 'project').map((s) => s.name);
    expect(project).toEqual(expect.arrayContaining(['build-ui', 'debug-ui', 'review-ui']));
  });
});

describe('REQ-CONFIG-166..169 — the skills: section', () => {
  it('reads the switch and both maps, and defaults the lot', () => {
    const s = sink();
    expect(readSkillsSection(undefined, s)).toEqual({ enabled: true, overrides: {}, invocation_overrides: {} });
    expect(s.errors).toHaveLength(0);
  });
  it('accepts exactly the two closed vocabularies and names the skill a bad value was stated for', () => {
    const s = sink();
    const read = readSkillsSection({ overrides: { good: 'on', bad: 'sometimes' }, invocation_overrides: { g: 'auto-only', b: 'whenever' } }, s);
    expect(read.overrides).toEqual({ good: 'on' });
    expect(read.invocation_overrides).toEqual({ g: 'auto-only' });
    expect(s.errors.map((e) => e.path)).toEqual(['skills.overrides.bad', 'skills.invocation_overrides.b']);
    expect(s.errors[0]!.message).toContain('off, name-only, user-invocable-only, on');
  });
  it('REQ-CONFIG-042/048: a workspace naming ONE skill leaves every other skill\u2019s global policy standing', () => {
    // The overlay is the merge's, not the reader's; this is the property REQ-CONFIG-169 turns on and
    // nothing else in the reader would catch its loss.
    const merged = mergeLayers([
      { source: 'global', value: { skills: { enabled: false, overrides: { a: 'on', b: 'off' } } } },
      { source: 'workspace', value: { skills: { overrides: { b: 'name-only' } } } },
    ]);
    expect(readSkillsSection(merged.value['skills'], sink())).toEqual({
      enabled: false, // stating one skill left the switch inherited
      overrides: { a: 'on', b: 'name-only' }, // a survived; b was overlaid
      invocation_overrides: {},
    });
  });
});

describe('REQ-WORKSPACE-062/063/064 — what a policy resolves to', () => {
  const skill = (name: string, invocation: DiscoveredSkill['invocation'] = 'default'): DiscoveredSkill => ({
    declaredName: name, name, description: `${name} does things`, trigger: null, invocation, raw: {}, body: 'b',
    scope: 'project', path: `/ws/.agents/skills/${name}/SKILL.md`, directory: `/ws/.agents/skills/${name}`, shadowed: [],
  });
  const section = { enabled: true, overrides: {}, invocation_overrides: {} };

  it('defaults to on-demand: in the catalog, not force-loaded, user-invocable', () => {
    const [r] = resolveSkills([skill('a')], section);
    expect(r).toMatchObject({ load: 'name-only', inCatalog: true, forceLoaded: false, userInvocable: true });
  });
  it('"always" REPLACES the catalog entry with the body rather than adding to it', () => {
    const [r] = resolveSkills([skill('a')], { ...section, overrides: { a: 'on' } });
    expect(r).toMatchObject({ inCatalog: false, forceLoaded: true, userInvocable: true });
  });
  it('"manual only" leaves it invocable and out of the catalog; "hidden" removes it everywhere', () => {
    expect(resolveSkills([skill('a')], { ...section, overrides: { a: 'user-invocable-only' } })[0]!).toMatchObject({ inCatalog: false, forceLoaded: false, userInvocable: true });
    expect(resolveSkills([skill('a')], { ...section, overrides: { a: 'off' } })[0]!).toMatchObject({ inCatalog: false, forceLoaded: false, userInvocable: false });
  });
  it('REQ-WORKSPACE-063: a workspace invocation override beats the frontmatter, and each mode removes one reach', () => {
    expect(resolveSkills([skill('a', 'auto-only')], section)[0]!).toMatchObject({ userInvocable: false, inCatalog: true });
    expect(resolveSkills([skill('a', 'manual-only')], section)[0]!).toMatchObject({ userInvocable: true, inCatalog: false });
    expect(resolveSkills([skill('a', 'auto-only')], { ...section, invocation_overrides: { a: 'default' } })[0]!).toMatchObject({ userInvocable: true, inCatalog: true });
  });
  it('REQ-WORKSPACE-064: the master switch off means no catalog, no body and nothing invocable', () => {
    const r = resolveSkills([skill('a'), skill('b')], { enabled: false, overrides: { b: 'on' }, invocation_overrides: {} });
    expect(r.every((x) => !x.inCatalog && !x.forceLoaded && !x.userInvocable)).toBe(true);
  });
  it('REQ-WORKSPACE-073: a session force shows as `on` to the agent and leaves the PERSISTED policy on the row', () => {
    const [r] = resolveSkills([skill('a')], section, { forced: new Set(['a']), manual: new Map() });
    expect(r).toMatchObject({ load: 'on', persistedLoad: 'name-only', forceLoaded: true });
  });
  it('REQ-WORKSPACE-057: a manual skill overrides a discovered one of the same name and carries the manual label', () => {
    const manual = { ...skill('a'), scope: 'manual' as const, path: '/elsewhere/SKILL.md' };
    const [r] = resolveSkills([skill('a')], section, { forced: new Set(), manual: new Map([['a', manual]]) });
    expect(r!.skill.scope).toBe('manual');
    expect(r!.skill.path).toBe('/elsewhere/SKILL.md');
  });
});

describe('REQ-WORKSPACE-061/062 — the two blocks', () => {
  const resolved = (overrides: Record<string, 'on' | 'name-only'> = {}) => resolveSkills(
    [
      { declaredName: 'b', name: 'b', description: 'B does things', trigger: null, invocation: 'default', raw: {}, body: 'B body', scope: 'project', path: '/ws/b/SKILL.md', directory: '/ws/b', shadowed: [] },
      { declaredName: 'a', name: 'a', description: 'A does things', trigger: null, invocation: 'default', raw: {}, body: 'A body', scope: 'project', path: '/ws/a/SKILL.md', directory: '/ws/a', shadowed: [] },
    ],
    { enabled: true, overrides, invocation_overrides: {} },
  );

  it('carries the three facts, one line per skill, in ascending name order, and NO body text', () => {
    const block = skillCatalogBlock(resolved())!;
    const lines = block.split('\n');
    expect(lines.slice(-2)).toEqual([skillCatalogLine('a', 'A does things', '/ws/a/SKILL.md'), skillCatalogLine('b', 'B does things', '/ws/b/SKILL.md')]);
    expect(block).toContain('exists on disk');
    expect(block).toContain('have NOT been supplied');
    expect(block.toLowerCase()).toContain('only when the task in hand calls for');
    expect(block).not.toContain('A body');
  });
  it('is null when nothing is catalogued, so no empty unit is constructed', () => {
    expect(skillCatalogBlock([])).toBeNull();
    expect(skillCatalogBlock(resolved({ a: 'on', b: 'on' }))).toBeNull();
  });
  it('a force-loaded skill leaves the catalog, so the model is never told to fetch what it already has', () => {
    const block = skillCatalogBlock(resolved({ a: 'on' }))!;
    expect(block).toContain('- b:');
    expect(block).not.toContain('- a:');
  });
  it('the activation statement names the skill and its path and forbids waiting for a trigger (REQ-CHAT-162\u2019s three facts)', () => {
    const s = skillActivationStatement('pdf-render', '/ws/pdf-render/SKILL.md');
    expect(s).toContain('skill document');
    expect(s).toContain('pdf-render');
    expect(s).toContain('/ws/pdf-render/SKILL.md');
    expect(s).toContain('do not wait for a trigger phrase');
  });
});

describe('REQ-WORKSPACE-057 — loading a SKILL.md by hand', () => {
  const tree = {
    '/ws/local/SKILL.md': skillFile('local'),
    '/home/u/kept/SKILL.md': skillFile('kept'),
    '/ws/notes.md': '# not a skill',
    '/ws/empty-dir/other.txt': 'x',
  };
  const p = ports(tree);
  const env = { workspaceRoot: '/ws', home: '/home/u' };

  it('accepts a SKILL.md file and a directory holding one, and labels both `manual`', () => {
    expect(loadManualSkill('/ws/local/SKILL.md', env, p)).toMatchObject({ ok: true, skill: { name: 'local', scope: 'manual' } });
    expect(loadManualSkill('/ws/local', env, p)).toMatchObject({ ok: true, skill: { name: 'local' } });
  });
  it('expands ~ and resolves a relative path against the workspace root', () => {
    expect(expandHome('~/kept', '/home/u').replace(/\\/g, '/')).toBe('/home/u/kept');
    expect(loadManualSkill('~/kept', env, p)).toMatchObject({ ok: true, skill: { name: 'kept' } });
    expect(loadManualSkill('local/SKILL.md', env, p)).toMatchObject({ ok: true, skill: { name: 'local' } });
  });
  it('gives the requirement\u2019s two sentences, verbatim, and tells them apart', () => {
    // A path that names nowhere, and a directory with no SKILL.md, are both "not found".
    expect(loadManualSkill('/ws/nope', env, p)).toEqual({ ok: false, reason: skillNotFound('/ws/nope') });
    expect(loadManualSkill('/ws/empty-dir', env, p)).toEqual({ ok: false, reason: skillNotFound('/ws/empty-dir') });
    // A file that exists but is not a SKILL.md is the OTHER sentence.
    expect(loadManualSkill('/ws/notes.md', env, p)).toEqual({ ok: false, reason: skillPathNotAcceptable('/ws/notes.md') });
  });
  it('reports the parser\u2019s own reason for a file that exists and does not parse — neither path sentence would be true', () => {
    const broken = ports({ ...tree, '/ws/bad/SKILL.md': 'nope\n' });
    const r = loadManualSkill('/ws/bad', env, broken);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain(SKILL_NO_FRONTMATTER);
  });
});
