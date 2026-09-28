import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BROWSER_PACKAGE, BROWSER_PACKAGE_VERSION } from './mcp/defaults.js';
import { CODE_INTELLIGENCE_LANGUAGE_SERVERS } from './mcp/code-intelligence.js';
import {
  COMPLETE_VERSION_PATTERN, parseSetupManifest, PLATFORM_KEYS, readSetupManifest, SETUP_MANIFEST_FILE, SETUP_MANIFEST_SCHEMA_VERSION,
  type SetupManifest,
} from './setup-manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
/** The one shipped manifest, where the pre-build guard and `electron-builder.yml` read it (first-release-plan.md §4.1). */
const SHIPPED = join(repo, 'apps', 'desktop', 'resources', SETUP_MANIFEST_FILE);
const shippedText = readFileSync(SHIPPED, 'utf8');
/** IC-7's manifest: the runtime's pins, which the bundle step checks against the runtime's own defaults. */
const pins = JSON.parse(readFileSync(join(repo, 'apps', 'desktop', 'scripts', 'code-intelligence', 'pins.json'), 'utf8')) as { languageServers: unknown };

function shipped(): SetupManifest {
  const reading = readSetupManifest(shippedText);
  if (!reading.ok) throw new Error(reading.problems.join('\n'));
  return reading.manifest;
}
/** The shipped manifest with one edit applied, as a parsed value. */
function edited(edit: (m: Record<string, unknown>) => void): unknown {
  const copy = JSON.parse(shippedText) as Record<string, unknown>;
  edit(copy);
  return copy;
}
const problemsOf = (value: unknown): readonly string[] => {
  const reading = parseSetupManifest(value);
  return reading.ok ? [] : reading.problems;
};

describe('the shipped setup manifest (REQ-STARTUP-058) — apps/desktop/resources/setup-manifest.json', () => {
  it('validates against the schema, at schema version 1, and is LF-terminated JSON with no comment key', () => {
    const manifest = shipped();
    expect(manifest.schemaVersion).toBe(SETUP_MANIFEST_SCHEMA_VERSION);
    expect(shippedText).not.toContain('\r');
    expect(shippedText.endsWith('\n')).toBe(true);
    expect(Object.keys(JSON.parse(shippedText) as object)).toEqual(['schemaVersion', 'machineTools', 'toolServerPackages', 'languageServers']);
  });

  it('pins Git as REQ-STARTUP-058 states: no minimum, 2.55.0, one Windows-x64 archive from the Git-for-Windows release line, GPL-2.0-only, worktrees and checkpoints', () => {
    const git = shipped().machineTools.find((t) => t.name === 'git');
    expect(git).toBeDefined();
    expect(git!.minimumVersion).toBeNull();
    expect(git!.provisionedVersion).toBe('2.55.0');
    expect(git!.license).toBe('GPL-2.0-only');
    expect(git!.capabilities).toEqual(['worktrees', 'checkpoints']);
    expect(git!.probe).toEqual({ command: 'git', versionArguments: ['--version'] });
    expect(Object.keys(git!.archives)).toEqual(['windows-x64']);
    const archive = git!.archives['windows-x64']!;
    expect(archive.url).toMatch(/^https:\/\/github\.com\/git-for-windows\/git\/releases\/download\/v2\.55\.0\.windows\.\d+\/MinGit-2\.55\.0-64-bit\.zip$/);
    expect(archive.layout).toEqual({ format: 'zip', topLevelDirectory: null });
    expect(archive.executables).toContain('cmd/git.exe');
  });

  it('pins ripgrep as REQ-STARTUP-058 states: minimum 14.1.0, 15.2.0, an archive per platform key from the upstream releases, Unlicense OR MIT, search', () => {
    const rg = shipped().machineTools.find((t) => t.name === 'ripgrep');
    expect(rg).toBeDefined();
    expect(rg!.minimumVersion).toBe('14.1.0');
    expect(rg!.provisionedVersion).toBe('15.2.0');
    expect(rg!.license).toBe('Unlicense OR MIT');
    expect(rg!.capabilities).toEqual(['search']);
    expect(rg!.probe).toEqual({ command: 'rg', versionArguments: ['--version'] });
    expect(Object.keys(rg!.archives).sort()).toEqual([...PLATFORM_KEYS].sort());
    for (const [key, archive] of Object.entries(rg!.archives)) {
      expect(archive.url, key).toMatch(/^https:\/\/github\.com\/BurntSushi\/ripgrep\/releases\/download\/15\.2\.0\/ripgrep-15\.2\.0-[a-z0-9_-]+\.(zip|tar\.gz)$/);
      expect(archive.layout.topLevelDirectory, key).toMatch(/^ripgrep-15\.2\.0-/);
      expect(archive.executables, key).toEqual([key === 'windows-x64' ? 'rg.exe' : 'rg']);
    }
    expect(rg!.archives['windows-x64']!.layout.format).toBe('zip');
    expect(rg!.archives['macos-arm64']!.layout.format).toBe('tar.gz');
    expect(rg!.archives['linux-x86_64']!.layout.format).toBe('tar.gz');
  });

  it('lists exactly the two machine tools, every archive over HTTPS with a distinct 64-hex digest', () => {
    const manifest = shipped();
    expect(manifest.machineTools.map((t) => t.name)).toEqual(['git', 'ripgrep']);
    const digests = manifest.machineTools.flatMap((t) => Object.values(t.archives).map((a) => a.sha256));
    expect(digests).toHaveLength(4);
    expect(new Set(digests).size).toBe(4);
    for (const d of digests) expect(d).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pins the one package the built-in default configuration launches through npx, at the same string (REQ-STARTUP-059, REQ-MCP-095; OQ-69\'s built reading counts the switched-off browser default)', () => {
    const pinned = shipped().toolServerPackages.find((p) => p.name === BROWSER_PACKAGE);
    expect(pinned).toBeDefined();
    expect(pinned!.version).toBe(BROWSER_PACKAGE_VERSION);
    expect(pinned!.license).toBe('Apache-2.0');
  });

  it('declares the language servers character for character as pins.json and the generated binding manifest do (REQ-STARTUP-058 second list, ESC-32, IC-7)', () => {
    const manifest = shipped();
    expect(manifest.languageServers).toEqual(pins.languageServers);
    expect(manifest.languageServers).toEqual(CODE_INTELLIGENCE_LANGUAGE_SERVERS);
    expect(manifest.languageServers.map((l) => [l.language, l.provisioner])).toEqual([['typescript', 'npm'], ['python', 'uvx']]);
    expect(manifest.languageServers.flatMap((l) => l.packages.map((p) => `${p.name} ${p.version}`))).toEqual(['typescript 5.9.3', 'typescript-language-server 5.1.3', 'pyright 1.1.403']);
  });
});

describe('the schema refuses each malformed shape, naming the path', () => {
  it('text that is not JSON, a non-object, and a schema version other than 1', () => {
    expect(readSetupManifest('{ nope')).toMatchObject({ ok: false, problems: [expect.stringMatching(/^the setup manifest is not JSON/)] });
    expect(problemsOf([])).toHaveLength(1);
    expect(problemsOf(null)).toHaveLength(1);
    expect(problemsOf(edited((m) => { m['schemaVersion'] = 2; }))).toEqual([expect.stringMatching(/^schemaVersion: /)]);
    expect(problemsOf(edited((m) => { m['schemaVersion'] = '1'; }))).toEqual([expect.stringMatching(/^schemaVersion: /)]);
  });

  it('a missing list, and a key the schema does not name at any level (nothing rides in the fingerprint of REQ-STARTUP-061 unnamed)', () => {
    for (const list of ['machineTools', 'toolServerPackages', 'languageServers']) {
      expect(problemsOf(edited((m) => { delete m[list]; })), list).toEqual([expect.stringMatching(new RegExp(`^${list}: `))]);
    }
    expect(problemsOf(edited((m) => { m['$comment'] = 'x'; }))).toEqual([expect.stringMatching(/Unrecognized key/)]);
    expect(problemsOf(edited((m) => { (m['machineTools'] as Record<string, unknown>[])[0]!['displayName'] = 'Git'; }))).toEqual([expect.stringMatching(/^machineTools\[0\]: .*Unrecognized key/)]);
    expect(problemsOf(edited((m) => { ((m['machineTools'] as Record<string, unknown>[])[0]!['archives'] as Record<string, Record<string, unknown>>)['windows-x64']!['size'] = 1; }))).toEqual([expect.stringMatching(/^machineTools\[0\]\.archives\.windows-x64: .*Unrecognized key/)]);
  });

  it('a version that is not a pin — a range, a partial, a floating tag, a prefix — on a tool, a tool-server package or a language server', () => {
    for (const bad of ['^2.55.0', '2.55', 'latest', 'v2.55.0', '>=2.55.0', '']) {
      expect(problemsOf(edited((m) => { (m['machineTools'] as Record<string, unknown>[])[0]!['provisionedVersion'] = bad; })), bad).toEqual([expect.stringMatching(/^machineTools\[0\]\.provisionedVersion: /)]);
    }
    expect(problemsOf(edited((m) => { (m['machineTools'] as Record<string, unknown>[])[1]!['minimumVersion'] = '14.x'; }))).toEqual([expect.stringMatching(/^machineTools\[1\]\.minimumVersion: /)]);
    expect(problemsOf(edited((m) => { (m['toolServerPackages'] as Record<string, unknown>[])[0]!['version'] = '^0.0.80'; }))).toEqual([expect.stringMatching(/^toolServerPackages\[0\]\.version: /)]);
    expect(problemsOf(edited((m) => { ((m['languageServers'] as Record<string, unknown>[])[0]!['packages'] as Record<string, unknown>[])[0]!['version'] = '5.9'; }))).toEqual([expect.stringMatching(/^languageServers\[0\]\.packages\[0\]\.version: /)]);
    // The qualifier forms REQ-STARTUP-059 admits are pins; the pattern decides a long mistyped one at once.
    for (const good of ['1.2.3', '1.1.403', '1.2.3-beta.1', '1.2.3rc1', '1.2.3+local']) expect(COMPLETE_VERSION_PATTERN.test(good), good).toBe(true);
    const started = performance.now();
    expect(COMPLETE_VERSION_PATTERN.test(`1.2.3+${'a'.repeat(64)}!`)).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('a digest that is not 64 lower-case hex characters, and a URL that is not HTTPS (REQ-STARTUP-082)', () => {
    const archive = (m: Record<string, unknown>) => ((m['machineTools'] as Record<string, unknown>[])[0]!['archives'] as Record<string, Record<string, unknown>>)['windows-x64']!;
    for (const bad of ['31497e79', '31497E7968196332263459EE319D2524E3EBC5786AB895E2ABAD34FFDD4F4EBF', `${'0'.repeat(63)}g`, `${'0'.repeat(65)}`]) {
      expect(problemsOf(edited((m) => { archive(m)['sha256'] = bad; })), bad).toEqual([expect.stringMatching(/^machineTools\[0\]\.archives\.windows-x64\.sha256: /)]);
    }
    for (const bad of ['http://github.com/x.zip', 'ftp://github.com/x.zip', 'github.com/x.zip', '']) {
      expect(problemsOf(edited((m) => { archive(m)['url'] = bad; })), bad).toEqual([expect.stringMatching(/^machineTools\[0\]\.archives\.windows-x64\.url: /)]);
    }
    expect(problemsOf(edited((m) => { (m['machineTools'] as Record<string, unknown>[])[0]!['source'] = 'http://github.com/git-for-windows/git'; }))).toEqual([expect.stringMatching(/^machineTools\[0\]\.source: /)]);
    expect(problemsOf(edited((m) => { (m['toolServerPackages'] as Record<string, unknown>[])[0]!['source'] = 'http://registry.npmjs.org/x'; }))).toEqual([expect.stringMatching(/^toolServerPackages\[0\]\.source: /)]);
  });

  it('an archive layout outside REQ-STARTUP-085\'s three formats, a top-level directory that is a path, an executable that escapes (REQ-STARTUP-085), no executable, no platform key, an unknown platform key', () => {
    const archive = (m: Record<string, unknown>) => ((m['machineTools'] as Record<string, unknown>[])[0]!['archives'] as Record<string, Record<string, unknown>>)['windows-x64']!;
    expect(problemsOf(edited((m) => { (archive(m)['layout'] as Record<string, unknown>)['format'] = '7z'; }))).toEqual([expect.stringMatching(/^machineTools\[0\]\.archives\.windows-x64\.layout\.format: /)]);
    expect(problemsOf(edited((m) => { (archive(m)['layout'] as Record<string, unknown>)['topLevelDirectory'] = 'a/b'; }))).toEqual([expect.stringMatching(/^machineTools\[0\]\.archives\.windows-x64\.layout\.topLevelDirectory: /)]);
    for (const bad of ['/cmd/git.exe', '../git.exe', 'cmd/../../git.exe', 'cmd\\git.exe', '']) {
      expect(problemsOf(edited((m) => { archive(m)['executables'] = [bad]; })), bad).toEqual([expect.stringMatching(/^machineTools\[0\]\.archives\.windows-x64\.executables\[0\]: /)]);
    }
    expect(problemsOf(edited((m) => { archive(m)['executables'] = []; }))).toEqual([expect.stringMatching(/^machineTools\[0\]\.archives\.windows-x64\.executables: /)]);
    expect(problemsOf(edited((m) => { (m['machineTools'] as Record<string, unknown>[])[0]!['archives'] = {}; }))).toEqual([expect.stringMatching(/^machineTools\[0\]\.archives: at least one platform key/)]);
    expect(problemsOf(edited((m) => { const a = (m['machineTools'] as Record<string, unknown>[])[0]!['archives'] as Record<string, unknown>; a['windows-arm64'] = a['windows-x64']; }))).toEqual([expect.stringMatching(/^machineTools\[0\]\.archives: /)]);
  });

  it('a provisioner outside npm and uvx, an empty capability list, an empty probe command', () => {
    expect(problemsOf(edited((m) => { (m['languageServers'] as Record<string, unknown>[])[0]!['provisioner'] = 'pip'; }))).toEqual([expect.stringMatching(/^languageServers\[0\]\.provisioner: /)]);
    expect(problemsOf(edited((m) => { (m['machineTools'] as Record<string, unknown>[])[0]!['capabilities'] = []; }))).toEqual([expect.stringMatching(/^machineTools\[0\]\.capabilities: /)]);
    expect(problemsOf(edited((m) => { ((m['machineTools'] as Record<string, unknown>[])[0]!['probe'] as Record<string, unknown>)['command'] = ''; }))).toEqual([expect.stringMatching(/^machineTools\[0\]\.probe\.command: /)]);
  });

  it('a name listed twice in any of the lists (exactly one version per package, REQ-STARTUP-059)', () => {
    const twice = (list: string) => edited((m) => { const items = m[list] as unknown[]; items.push(items[0]); });
    expect(problemsOf(twice('machineTools'))).toEqual([expect.stringMatching(/^machineTools\[2\]: machine tool "git" is listed twice \(first at machineTools\[0\]\)/)]);
    expect(problemsOf(twice('toolServerPackages'))).toEqual([expect.stringMatching(/^toolServerPackages\[1\]: tool-server package "@playwright\/mcp" is listed twice/)]);
    expect(problemsOf(twice('languageServers'))).toEqual([expect.stringMatching(/^languageServers\[2\]: language "typescript" is listed twice/)]);
    expect(problemsOf(edited((m) => { const p = (m['languageServers'] as Record<string, unknown>[])[0]!['packages'] as unknown[]; p.push(p[0]); }))).toEqual([expect.stringMatching(/^languageServers\[0\]\.packages\[2\]: language-server package "typescript" is listed twice/)]);
  });

  it('reports every problem of a file at once, each with its path', () => {
    const problems = problemsOf(edited((m) => {
      m['schemaVersion'] = 0;
      (m['machineTools'] as Record<string, unknown>[])[1]!['provisionedVersion'] = 'latest';
      (m['toolServerPackages'] as Record<string, unknown>[])[0]!['license'] = '';
    }));
    expect(problems).toHaveLength(3);
    expect(problems.map((p) => p.split(':')[0])).toEqual(['schemaVersion', 'machineTools[1].provisionedVersion', 'toolServerPackages[0].license']);
  });
});
