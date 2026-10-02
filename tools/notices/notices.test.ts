import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import {
  addressProblem, bundledAssetComponents, compareVersions, declaredFontFiles, exceptionFor, generateNotices, licenseTextKind, MAX_EXCEPTION_DAYS,
  NOTICES_FILE, parseChromiumCredits, parseCoreMetadata, PATHS, pythonLicenseOf, reviewedExceptions, runNoticesStep, setupManifest,
  SETUP_MANIFEST_SHAPE, TOOLS_SECTION, versionInRange, woff2Names, WORKSPACE_DIRS,
} from './notices.mjs';
// The manifest's shape is `config`'s; a test may cross where the generator does not (the component view).
import {
  LanguageServerSchema, MachineToolSchema, PinnedPackageSchema, SETUP_MANIFEST_SCHEMA_VERSION, SetupManifestSchema,
} from '../../packages/config/src/setup-manifest.js';

/**
 * The notices generator (REQ-STARTUP-141/142/143; first-release-plan.md §4.3). Almost every case runs the generator
 * over a FIXTURE repository written into a temporary directory — a desktop application, a workspace package, an
 * installed dependency tree, an Electron distribution, a bundled Python runtime, a font, the setup manifest and the
 * three tables — so each of REQ-STARTUP-143's five failure conditions is produced by changing one input. The last
 * block reads the real repository's own tables, which is what `pnpm check` can say without the bundled runtime.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TODAY = '2026-09-27';
/** The fixture runtime's site-packages, in the POSIX layout `pnpm code-intel:bundle` produces on Linux. */
const SITE = `${PATHS.runtime}/lib/python3.13/site-packages`;
/** A fixture address: a literal postal route, no placeholder, no reserved domain. */
const ADDRESS = 'Fixture Maintainers, Postfach 1234, 10115 Fixturestadt';
const MIT = 'MIT License\n\nCopyright (c) Fixture Authors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy.';
/** A stand-in for one licence's full text: more than the one line that only names a licence (OQ-75). */
const body = (title: string): string => `${title}\n\nThe terms of the ${title}, as the fixture carries them.`;
/** A fixture setup manifest: a machine tool's archive, probe and capabilities are there because the schema asks for them. */
const archive = (name: string) => ({
  url: `https://example.org/fixture/${name}.zip`, sha256: 'a'.repeat(64), layout: { format: 'zip', topLevelDirectory: null }, executables: [`${name}.exe`],
});
const FIXTURE_MANIFEST = {
  schemaVersion: 1,
  machineTools: [
    { name: 'git', probe: { command: 'git', versionArguments: ['--version'] }, minimumVersion: null, provisionedVersion: '2.55.0', archives: { 'windows-x64': archive('git') }, source: 'https://github.com/git-for-windows/git', license: 'GPL-2.0-only', capabilities: ['worktrees', 'checkpoints'] },
    { name: 'ripgrep', probe: { command: 'rg', versionArguments: ['--version'] }, minimumVersion: '14.1.0', provisionedVersion: '15.2.0', archives: { 'linux-x86_64': archive('rg') }, source: 'https://github.com/BurntSushi/ripgrep', license: 'Unlicense OR MIT', capabilities: ['search'] },
  ],
  toolServerPackages: [{ name: '@playwright/mcp', version: '0.0.80', source: 'https://registry.npmjs.org/@playwright/mcp', license: 'Apache-2.0' }],
  languageServers: [
    { language: 'typescript', provisioner: 'npm', packages: [{ name: 'typescript', version: '5.9.3', source: 'https://registry.npmjs.org/typescript', license: 'Apache-2.0' }] },
    { language: 'python', provisioner: 'uvx', packages: [{ name: 'pyright', version: '1.1.403', source: 'https://pypi.org/project/pyright/', license: 'MIT' }] },
  ],
};
/** The per-file notice Apache-2.0 asks to be applied with, which sends the reader elsewhere for the licence (OQ-75). */
const APACHE_NOTICE = 'Copyright 2023 Fixture, Inc.\n\nLicensed under the Apache License, Version 2.0 (the "License");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\n    http://www.apache.org/licenses/LICENSE-2.0';
const OFL_BODY = 'This Font Software is licensed under the SIL Open Font License, Version 1.1.\n\nSIL OPEN FONT LICENSE Version 1.1 - 26 February 2007';
const FONT_COPYRIGHT = 'Copyright 2020 The Fixture Sans Project Authors';

/** The smallest WOFF2 the generator must read: one table, `name`, untransformed, with Windows English records. */
function woff2(records: Record<number, string>): Buffer {
  const entries = Object.entries(records).map(([id, text]) => ({ id: Number(id), bytes: Buffer.from(text, 'utf16le').swap16() }));
  const header = Buffer.alloc(6 + entries.length * 12);
  header.writeUInt16BE(0, 0); header.writeUInt16BE(entries.length, 2); header.writeUInt16BE(header.length, 4);
  let offset = 0;
  entries.forEach((e, i) => {
    const r = 6 + i * 12;
    header.writeUInt16BE(3, r); header.writeUInt16BE(1, r + 2); header.writeUInt16BE(0x409, r + 4);
    header.writeUInt16BE(e.id, r + 6); header.writeUInt16BE(e.bytes.length, r + 8); header.writeUInt16BE(offset, r + 10);
    offset += e.bytes.length;
  });
  const name = Buffer.concat([header, ...entries.map((e) => e.bytes)]);
  const compressed = brotliCompressSync(name);
  const base128 = (n: number): Buffer => { const out = [n & 0x7f]; for (let v = n >>> 7; v > 0; v >>>= 7) out.unshift((v & 0x7f) | 0x80); return Buffer.from(out); };
  const directory = Buffer.concat([Buffer.from([5]), base128(name.length)]); // flags 5 = the `name` tag, transform 0
  const head = Buffer.alloc(48);
  head.write('wOF2', 0, 'latin1'); head.writeUInt32BE(0x00010000, 4); head.writeUInt32BE(48 + directory.length + compressed.length, 8);
  head.writeUInt16BE(1, 12); head.writeUInt32BE(12 + 16 + name.length, 16); head.writeUInt32BE(compressed.length, 20);
  return Buffer.concat([head, directory, compressed]);
}

const CREDITS_HTML = [
  '<!-- Generated by licenses.py; do not edit. --><!doctype html><html><body>',
  '<div class="product">',
  '<span class="title">libfixture &amp; friends</span>',
  '<span class="homepage"><a href="https://fixture.invalid/libfixture">homepage</a></span>',
  '<label class="show" tabindex="0"><input type="checkbox" hidden></label>',
  '<div class="license">',
  '<pre>',
  'Copyright &quot;Fixture&quot; &lt;authors&gt;',
  'GNU LESSER GENERAL PUBLIC LICENSE, as it happens.</pre>',
  '</div>',
  '</div>',
  '<div class="product">',
  '<span class="title">zlib-fixture</span>',
  '<span class="homepage"><a href="https://zlib.invalid/">homepage</a></span>',
  '<div class="license">',
  '<pre>zlib license text</pre>',
  '</div>',
  '</div>',
  '</body></html>',
].join('\n');

let root: string;
function put(rel: string, content: string | Buffer): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
function pkg(rel: string, manifest: Record<string, unknown>, license: string | null = MIT, licenseName = 'LICENSE'): void {
  put(`${rel}/package.json`, json(manifest));
  if (license !== null) put(`${rel}/${licenseName}`, license);
}

/** A whole repository whose notices validate: every later case breaks exactly one thing. */
function writeFixture(): void {
  put('package.json', json({ name: 'rotaris-crw', private: true }));
  pkg('apps/desktop', {
    name: '@rotaris/desktop', version: '0.1.0',
    dependencies: { alpha: '1.0.0', '@phosphor-icons/web': '2.1.1' },
    devDependencies: { '@rotaris/kernel': 'workspace:*', electron: '44.1.1', devtool: '1.0.0' },
  }, null);
  pkg('packages/kernel', { name: '@rotaris/kernel', version: '0.0.0', dependencies: { beta: '^2.0.0', '@rotaris/platform': 'workspace:*' }, devDependencies: { devonly: '1.0.0' } }, null);
  pkg('packages/platform', { name: '@rotaris/platform', version: '0.0.0', dependencies: { gamma: '^1.0.0' } }, null);
  pkg('packages/unused', { name: '@rotaris/unused', version: '0.0.0', dependencies: { unshipped: '1.0.0' } }, null);
  pkg('tools/release-naming', { name: '@rotaris/release-naming', version: '0.0.0' }, null);
  // The installed tree: hoisted, with one version conflict nested under its dependent.
  pkg('node_modules/alpha', { name: 'alpha', version: '1.0.0', license: 'MIT', dependencies: { gamma: '^1.0.0' }, optionalDependencies: { 'not-installed': '1.0.0' } });
  pkg('node_modules/beta', { name: 'beta', version: '2.0.0', license: '(MIT OR Apache-2.0)', dependencies: { gamma: '^2.0.0' } }, body('MIT licence of beta'), 'LICENSE-MIT');
  put('node_modules/beta/LICENSE-APACHE', body('Apache licence of beta'));
  pkg('node_modules/beta/node_modules/gamma', { name: 'gamma', version: '2.0.0', license: 'ISC' }, body('ISC licence of gamma 2'));
  pkg('node_modules/gamma', { name: 'gamma', version: '1.2.0', license: 'ISC' }, body('ISC licence of gamma 1'));
  pkg('node_modules/@phosphor-icons/web', { name: '@phosphor-icons/web', version: '2.1.1', license: 'MIT' }, 'MIT License\n\nCopyright (c) 2020-2021 Phosphor Icons');
  put('node_modules/@phosphor-icons/web/src/regular/Phosphor.woff2', woff2({ 0: 'Phosphor Icons', 5: 'Version 2.1', 13: 'MIT' }));
  pkg('node_modules/devtool', { name: 'devtool', version: '1.0.0', license: 'MIT' });
  pkg('node_modules/devonly', { name: 'devonly', version: '1.0.0', license: 'MIT' });
  pkg('node_modules/unshipped', { name: 'unshipped', version: '1.0.0', license: 'MIT' });
  pkg('node_modules/electron', { name: 'electron', version: '44.1.1', license: 'MIT', dependencies: { '@electron/get': '^2.0.0' } }, null);
  pkg('node_modules/@electron/get', { name: '@electron/get', version: '2.0.3', license: 'MIT' });
  put('node_modules/electron/dist/version', '44.1.1');
  put('node_modules/electron/dist/LICENSE', 'Copyright (c) Electron contributors\n\nPermission is hereby granted.');
  put('node_modules/electron/dist/LICENSES.chromium.html', CREDITS_HTML);
  // The bundled code-intelligence runtime, in the POSIX layout pnpm code-intel:bundle produces on Linux.
  put('apps/desktop/resources/code-intelligence/bundle.json', json({ answers: { python: '3.13.15', distribution: '1.7.0' } }));
  put('apps/desktop/resources/code-intelligence/runtime/lib/python3.13/LICENSE.txt', 'A. HISTORY OF THE SOFTWARE\n\nPYTHON SOFTWARE FOUNDATION LICENSE VERSION 2\n--------------------------------------------');
  put(`${SITE}/serena_agent-1.7.0.dist-info/METADATA`, 'Metadata-Version: 2.4\nName: serena-agent\nVersion: 1.7.0\nLicense: MIT\nLicense-File: LICENSE\n\nlong description\nLicense: not a header');
  put(`${SITE}/serena_agent-1.7.0.dist-info/licenses/LICENSE`, MIT);
  put(`${SITE}/pystray-0.19.5.dist-info/METADATA`, 'Metadata-Version: 2.1\nName: pystray\nVersion: 0.19.5\nLicense: LGPLv3\nClassifier: License :: OSI Approved :: GNU Lesser General Public License v3 (LGPLv3)\n');
  put(`${SITE}/pystray-0.19.5.dist-info/COPYING.LGPL`, body('GNU LESSER GENERAL PUBLIC LICENSE Version 3'));
  // The setup manifest in the shape the build ships (REQ-STARTUP-058; `SetupManifestSchema` accepts it): two machine
  // tools, one tool-server package, two language servers. The runtime's name is the code-intelligence pins'.
  put(PATHS.setupManifest, json(FIXTURE_MANIFEST));
  put(PATHS.codeIntelligencePins, json({ python: '3.13.15', distribution: 'serena-agent', version: '1.7.0', languageServers: FIXTURE_MANIFEST.languageServers }));
  put(PATHS.fontFaces, "@font-face { font-family: 'Fixture Sans'; src: url('@design-assets/aa11.woff2') format('woff2-variations'); }\n");
  put(`${PATHS.designAssets}/aa11.woff2`, woff2({ 0: FONT_COPYRIGHT, 5: 'Version 1.001; ttfautohint', 13: 'SIL Open Font License, Version 1.1' }));
  put('tools/notices/licenses/FixtureSans-OFL.txt', `${FONT_COPYRIGHT}\n\n${OFL_BODY}`);
  put('tools/notices/licenses/Absent-OFL.txt', `Copyright 2018 The Absent Project Authors\n\n${OFL_BODY}`);
  put(PATHS.assets, json({ assets: [
    { component: 'Fixture Sans', license: 'OFL-1.1', licenseFile: 'tools/notices/licenses/FixtureSans-OFL.txt', files: [`${PATHS.designAssets}/aa11.woff2`] },
    { component: 'Absent Face', license: 'OFL-1.1', licenseFile: 'tools/notices/licenses/Absent-OFL.txt', files: [] },
    { component: 'Phosphor Icons', license: 'MIT', package: '@phosphor-icons/web', licenseFile: 'node_modules/@phosphor-icons/web/LICENSE', files: ['node_modules/@phosphor-icons/web/src/regular/Phosphor.woff2'] },
  ] }));
  put(PATHS.exceptions, json({ exceptions: [] }));
  put(PATHS.releaseInputs, json({ lgplCorrespondingSourcesAddress: ADDRESS }));
}

const generate = (platform = 'linux', today = TODAY) => generateNotices({ root, platform, today });
const names = (list: readonly { name: string; version: string | null }[]): string[] => list.map((c) => `${c.name}@${c.version}`);
/** The generator wraps its own prose; a sentence is asserted with its line breaks folded. */
const flat = (text: string): string => text.replace(/\s+/g, ' ');
/** One numbered section of the file, by its heading — the contents list names the same titles, indented. */
const section = (text: string, n: number): string => {
  const start = text.indexOf(`\n${n}. `);
  const next = text.indexOf(`\n${n + 1}. `, start + 1);
  return text.slice(start, next === -1 ? undefined : next);
};

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-notices-')); writeFixture(); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('REQ-STARTUP-141: the file and the section keep the names the requirement fixes', () => {
  it('writes THIRD-PARTY-LICENSES.txt, under the resources the About page and the packager read', () => {
    expect(NOTICES_FILE).toBe('THIRD-PARTY-LICENSES.txt');
    expect(PATHS.output).toBe('apps/desktop/resources/THIRD-PARTY-LICENSES.txt');
    expect(TOOLS_SECTION).toBe('Tools provisioned after installation');
  });
});

describe('REQ-STARTUP-142: the shipped closure, and nothing else', () => {
  it('validates the whole fixture with no problem', () => {
    expect(generate().problems).toEqual([]);
  });

  it('lists every production dependency of the application and of the workspace packages it builds from, each version separately', () => {
    const { model } = generate();
    expect(names(model.application)).toEqual(['@phosphor-icons/web@2.1.1', 'alpha@1.0.0', 'beta@2.0.0', 'electron@44.1.1', 'gamma@1.2.0', 'gamma@2.0.0']);
  });

  it('lists no development-only dependency, no product package, nothing a package the application never builds from needs, and not Electron\'s downloader', () => {
    const { text } = generate();
    for (const absent of ['devtool', 'devonly', 'unshipped', '@electron/get', '@rotaris/kernel', '@rotaris/platform', '@rotaris/unused', '@rotaris/desktop', 'rotaris-crw']) {
      expect(text).not.toContain(`Component: ${absent}\n`);
    }
  });

  it('names the component, its version, its license identifier and its full license text, every file of it', () => {
    const { text } = generate();
    expect(text).toContain('Component: beta\nVersion:   2.0.0\nLicense:   (MIT OR Apache-2.0)\n');
    expect(text).toContain(`----- LICENSE-APACHE -----\n\n${body('Apache licence of beta')}\n`);
    expect(text).toContain(`----- LICENSE-MIT -----\n\n${body('MIT licence of beta')}\n`);
    expect(text).toContain('Component: gamma\nVersion:   2.0.0\nLicense:   ISC\n');
  });

  it('lists the interpreter and every distribution of the bundled code-intelligence runtime, reading what each declares', () => {
    const { model, text } = generate();
    expect(names(model.interpreter)).toEqual(['CPython@3.13.15']);
    expect(model.interpreter[0]?.license).toBe('PSF-2.0');
    expect(names(model.distributions)).toEqual(['pystray@0.19.5', 'serena-agent@1.7.0']);
    expect(text).toContain('Component: pystray\nVersion:   0.19.5\nLicense:   LGPLv3\n');
    // OQ-72's one unlisted part is said where a reader would look for it, not left for the reader to find missing.
    expect(flat(section(text, 2))).toContain('The libraries linked into the interpreter by its distributor are not listed separately.');
  });

  it('carries the bundled fonts and the icon set: version and copyright from the font itself, a named font the build lacks stated as such', () => {
    const { model, text } = generate();
    expect(model.assets.map((a) => `${a.name}@${a.version}`)).toEqual(['Fixture Sans@1.001', 'Absent Face@not contained in this build', 'Phosphor Icons@2.1.1']);
    expect(text).toContain(`Component: Fixture Sans\nVersion:   1.001\nLicense:   OFL-1.1\n${'-'.repeat(80)}\n\n${FONT_COPYRIGHT}\n`);
    expect(text).toContain('Component: Absent Face\nVersion:   not contained in this build\n');
  });

  it('reproduces Electron\'s own credits beneath it, entities decoded (OQ-72)', () => {
    const { model, text } = generate();
    expect(model.electron?.credits.map((c) => c.title)).toEqual(['libfixture & friends', 'zlib-fixture']);
    expect(text).toContain('See:       section 5, the 2 components compiled into Electron');
    expect(text).toContain('5. Components compiled into Electron 44.1.1\n');
    expect(text).toContain('Component: libfixture & friends\nVersion:   as compiled into Electron 44.1.1\nHomepage:  https://fixture.invalid/libfixture\n');
    expect(text).toContain('Copyright "Fixture" <authors>\n');
  });

  it('states the LGPL right to modify and relink, names the LGPL components, and gives the address as a literal', () => {
    const { text } = generate();
    const header = text.slice(0, text.indexOf('Contents'));
    expect(flat(header)).toContain('You have the right to modify each of them and to relink Rotaris with your modified version');
    expect(flat(header)).toContain('The components whose declared license names the LGPL are: pystray 0.19.5.');
    expect(header).toContain(`\n    ${ADDRESS}\n`);
    // The credits carry no identifier, so the sentence about them stands only while one of their texts is the LGPL's.
    const sentence = 'Components compiled into Electron whose license is the LGPL are reproduced in section 5.';
    expect(flat(header)).toContain(sentence);
    put('node_modules/electron/dist/LICENSES.chromium.html', CREDITS_HTML.replace('GNU LESSER GENERAL PUBLIC LICENSE, as it happens.', 'A permissive licence.'));
    const without = generate().text;
    expect(flat(without.slice(0, without.indexOf('Contents')))).not.toContain(sentence);
  });

  /** The sentence OQ-73's reading writes: pinned, not contained, and not yet downloaded by anything in this build. */
  const PINNED_NOT_DOWNLOADED = 'The setup manifest of this build pins the tools below. None of them is contained in this artifact: they are to be downloaded after installation by machine setup, which this build does not yet carry, so this build downloads none of them.';

  it('writes the tools section from the setup manifest: Git and ripgrep with their four fields, then every language server, then every tool-server package (REQ-STARTUP-142, REQ-STARTUP-152, IC-7)', () => {
    const { text, problems } = generate();
    expect(problems).toEqual([]);
    const tools = section(text, 4);
    expect(tools.startsWith(`\n4. ${TOOLS_SECTION}\n`)).toBe(true);
    expect(flat(tools)).toContain(PINNED_NOT_DOWNLOADED);
    expect(tools).not.toContain('pins no machine tools');
    expect(tools).toContain('  git\n    Version:  2.55.0\n    Source:   https://github.com/git-for-windows/git\n    License:  GPL-2.0-only\n');
    expect(tools).toContain('  ripgrep\n    Version:  15.2.0\n    Source:   https://github.com/BurntSushi/ripgrep\n    License:  Unlicense OR MIT\n');
    expect(tools).toContain('Language servers provisioned by the bundled code-intelligence runtime (serena-agent 1.7.0)\n');
    expect(flat(tools)).toContain('downloads each package below at the first use of that language. None of them is contained in this artifact.');
    expect(tools).toContain('  typescript\n    Language: typescript\n    Version:  5.9.3\n    Source:   https://registry.npmjs.org/typescript\n    License:  Apache-2.0\n');
    expect(tools).toContain('  pyright\n    Language: python\n    Version:  1.1.403\n    Source:   https://pypi.org/project/pyright/\n    License:  MIT\n');
    expect(flat(tools)).toContain('A further language the runtime supports obtains its language server by the same route, at the first use of that language, and is not declared here.');
    expect(tools).toContain('Tool-server packages\n');
    expect(flat(tools)).toContain('which downloads the package when that tool server is first started. None of them is contained in this artifact.');
    expect(tools).toContain('  @playwright/mcp\n    Version:  0.0.80\n    Source:   https://registry.npmjs.org/@playwright/mcp\n    License:  Apache-2.0\n');
    // The order REQ-STARTUP-142 fixes — machine tools, then the runtime's sub-heading — with the packages after both (OQ-92).
    expect(tools.indexOf('  ripgrep\n')).toBeLessThan(tools.indexOf('Language servers provisioned'));
    expect(tools.indexOf('Language servers provisioned')).toBeLessThan(tools.indexOf('Tool-server packages'));
  });

  it('says the manifest pins no machine tools only for a manifest that pins none, and drops the tool-server sub-heading when it pins no package', () => {
    put(PATHS.setupManifest, json({ ...FIXTURE_MANIFEST, machineTools: [], toolServerPackages: [] }));
    const { text, problems } = generate();
    expect(problems).toEqual([]);
    const tools = section(text, 4);
    expect(flat(tools)).toContain('The setup manifest of this build pins no machine tools, so this build downloads neither Git nor ripgrep.');
    expect(flat(tools)).not.toContain(PINNED_NOT_DOWNLOADED);
    expect(tools).not.toContain('Tool-server packages');
    expect(tools).toContain('  pyright\n');
  });

  it('renders the shipped manifest itself: Git 2.55.0 and ripgrep 15.2.0 as it pins them, and @playwright/mcp at the pinned version (REQ-STARTUP-152)', () => {
    put(PATHS.setupManifest, readFileSync(join(REPO, PATHS.setupManifest), 'utf8'));
    put(PATHS.codeIntelligencePins, readFileSync(join(REPO, PATHS.codeIntelligencePins), 'utf8'));
    const { text, problems } = generate();
    expect(problems).toEqual([]);
    const tools = section(text, 4);
    expect(flat(tools)).toContain(PINNED_NOT_DOWNLOADED);
    expect(tools).toContain('  git\n    Version:  2.55.0\n    Source:   https://github.com/git-for-windows/git\n    License:  GPL-2.0-only\n');
    expect(tools).toContain('  ripgrep\n    Version:  15.2.0\n    Source:   https://github.com/BurntSushi/ripgrep\n    License:  Unlicense OR MIT\n');
    expect(tools).toContain('  @playwright/mcp\n    Version:  0.0.80\n    Source:   https://registry.npmjs.org/@playwright/mcp\n    License:  Apache-2.0\n');
    expect(tools).toContain('  typescript-language-server\n    Language: typescript\n    Version:  5.1.3\n');
  });

  it('is deterministic: the same inputs render the same bytes, and nothing of the machine or the day is in them', () => {
    const a = generate('linux', '2026-09-27').text;
    const b = generate('linux', '2027-01-01').text;
    expect(a).toBe(b);
    expect(a).not.toContain(root);
    expect(a).not.toContain('2026-09-27');
  });

  it('adds what this build compiles into its native modules, winpty only where it is built (win32)', () => {
    pkg('node_modules/better-sqlite3', { name: 'better-sqlite3', version: '13.0.3', license: 'MIT' });
    put('node_modules/better-sqlite3/deps/sqlite3/sqlite3.c', '/*\n** 2001 September 15\n**\n** The author disclaims copyright to this source code.  In place of\n** a legal notice, here is a blessing:\n**\n**    May you do good and not evil.\n**    May you share freely, never taking more than you give.\n**\n*/\n#define SQLITE_VERSION        "3.53.4"\n');
    pkg('node_modules/node-pty', { name: 'node-pty', version: '1.1.0', license: 'MIT' });
    put('node_modules/node-pty/deps/winpty/VERSION.txt', '0.4.4-dev\n');
    put('node_modules/node-pty/deps/winpty/LICENSE', 'The MIT License (MIT)\n\nCopyright (c) 2011-2016 Ryan Prichard');
    const desktop = JSON.parse(readFileSync(join(root, PATHS.desktop), 'utf8'));
    desktop.dependencies['better-sqlite3'] = '13.0.3';
    desktop.dependencies['node-pty'] = '1.1.0';
    put(PATHS.desktop, json(desktop));
    const linux = generate('linux');
    expect(linux.problems).toEqual([]);
    expect(names(linux.model.application)).toContain('SQLite@3.53.4');
    expect(names(linux.model.application)).not.toContain('winpty@0.4.4-dev');
    expect(linux.text).toContain('Component: SQLite\nVersion:   3.53.4\nLicense:   blessing\nContained in: better-sqlite3 13.0.3 (compiled into its native module)\n');
    expect(linux.text).toContain('The author disclaims copyright to this source code.  In place of\na legal notice, here is a blessing:\n\n   May you do good and not evil.\n');
    const win = generate('win32');
    expect(win.problems).toEqual([]);
    expect(win.text).toContain('Component: winpty\nVersion:   0.4.4-dev\nLicense:   MIT\nContained in: node-pty 1.1.0 (compiled into its native module)\n');
  });

  it('reads the bundled runtime in the Windows layout the first release ships: Lib/site-packages, the interpreter\'s licence at the root or in Lib', () => {
    rmSync(join(root, PATHS.runtime), { recursive: true });
    const psf = 'A. HISTORY OF THE SOFTWARE\n\nPYTHON SOFTWARE FOUNDATION LICENSE VERSION 2';
    put(`${PATHS.runtime}/LICENSE.txt`, psf);
    put(`${PATHS.runtime}/Lib/site-packages/serena_agent-1.7.0.dist-info/METADATA`, 'Metadata-Version: 2.4\nName: serena-agent\nVersion: 1.7.0\nLicense: MIT\n');
    put(`${PATHS.runtime}/Lib/site-packages/serena_agent-1.7.0.dist-info/licenses/LICENSE`, MIT);
    const atRoot = generate('win32');
    expect(atRoot.problems).toEqual([]);
    expect(names(atRoot.model.interpreter)).toEqual(['CPython@3.13.15']);
    expect(atRoot.model.interpreter[0]?.texts.map((t) => t.file)).toEqual(['LICENSE.txt']);
    expect(names(atRoot.model.distributions)).toEqual(['serena-agent@1.7.0']);
    rmSync(join(root, PATHS.runtime, 'LICENSE.txt'));
    put(`${PATHS.runtime}/Lib/LICENSE.txt`, psf);
    const inLib = generate('win32');
    expect(inLib.problems).toEqual([]);
    expect(inLib.model.interpreter[0]?.texts.map((t) => t.file)).toEqual(['Lib/LICENSE.txt']);
    rmSync(join(root, PATHS.runtime, 'Lib', 'LICENSE.txt'));
    // The interpreter states its licence by name inside its text, so without the text it declares none either.
    expect(generate('win32').problems).toEqual([
      `CPython 3.13.15: license file LICENSE.txt is missing from ${PATHS.runtime}`,
      'CPython 3.13.15 (code-intelligence runtime): declares no license identifier',
    ]);
  });
});

describe('REQ-STARTUP-143: validation fails naming the component or path, one condition at a time', () => {
  it('a bundled asset\'s license file is missing, empty, or only refers to the text (OQ-75)', () => {
    rmSync(join(root, 'tools/notices/licenses/FixtureSans-OFL.txt'));
    expect(generate().problems).toEqual(['bundled asset Fixture Sans: license file tools/notices/licenses/FixtureSans-OFL.txt is missing']);
    put('tools/notices/licenses/FixtureSans-OFL.txt', '\n');
    expect(generate().problems).toEqual(['bundled asset Fixture Sans: license file tools/notices/licenses/FixtureSans-OFL.txt is empty']);
    put('tools/notices/licenses/FixtureSans-OFL.txt', `${FONT_COPYRIGHT}\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\nSee the LICENSE file in the font's repository.`);
    expect(generate().problems).toEqual(['bundled asset Fixture Sans: license file tools/notices/licenses/FixtureSans-OFL.txt only names its license or points elsewhere for it, not the license text']);
  });

  it('a font the build bundles with no row in the table, and a license file that does not carry the font\'s own notice', () => {
    put(PATHS.fontFaces, `${readFileSync(join(root, PATHS.fontFaces), 'utf8')}@font-face { src: url('@design-assets/bb22.woff2'); }\n`);
    expect(generate().problems).toEqual([`bundled asset ${PATHS.designAssets}/bb22.woff2 (declared by ${PATHS.fontFaces}) has no row in ${PATHS.assets}, so its license file is missing`]);
    put(PATHS.fontFaces, "@font-face { src: url('@design-assets/aa11.woff2'); }\n");
    put('tools/notices/licenses/FixtureSans-OFL.txt', `Copyright 2019 Somebody Else\n\n${OFL_BODY}`);
    expect(generate().problems).toEqual([`bundled asset Fixture Sans: license file tools/notices/licenses/FixtureSans-OFL.txt does not carry the font's own copyright notice "${FONT_COPYRIGHT}"`]);
  });

  it('Electron\'s own license files are required, and one that only points elsewhere is not its text', () => {
    rmSync(join(root, 'node_modules/electron/dist/LICENSES.chromium.html'));
    expect(generate().problems).toEqual(['electron 44.1.1: license file node_modules/electron/dist/LICENSES.chromium.html is missing']);
    put('node_modules/electron/dist/LICENSES.chromium.html', CREDITS_HTML);
    put('node_modules/electron/dist/LICENSE', 'MIT\n\nSee the LICENSE file in the Electron repository.');
    expect(generate().problems).toEqual(['electron 44.1.1 (npm): carries no license text — LICENSE only names its license or points elsewhere for it']);
  });

  it('a dependency in the shipped closure declares no license identifier — and an exception does not excuse it (OQ-74)', () => {
    pkg('node_modules/gamma', { name: 'gamma', version: '1.2.0', license: 'SEE LICENSE IN LICENSE' }, body('A licence of gamma'));
    put(`${SITE}/dotenv-0.9.9.dist-info/METADATA`, 'Metadata-Version: 2.1\nName: dotenv\nVersion: 0.9.9\nLicense: UNKNOWN\n');
    put(`${SITE}/dotenv-0.9.9.dist-info/LICENSE`, MIT);
    put(PATHS.exceptions, json({ exceptions: [{ component: 'dotenv', versions: '0.9.9', license: 'MIT', whyNoText: 'n/a', reviewer: 'A Maintainer', reviewedOn: '2026-09-01', expires: '2027-08-31' }] }));
    expect(generate().problems).toEqual([
      'gamma 1.2.0 (npm): declares no license identifier',
      'dotenv 0.9.9 (code-intelligence runtime): declares no license identifier',
    ]);
  });

  it('a dependency carries no license text: fails unless a live, in-range reviewed exception covers it, which the file then states', () => {
    rmSync(join(root, 'node_modules/gamma/LICENSE'));
    put('node_modules/gamma/NOTICE', '   \n');
    const failed = 'gamma 1.2.0 (npm): carries no license text and no reviewed exception covers it (tools/notices/reviewed-exceptions.json)';
    expect(generate().problems).toEqual([failed]);
    const entry = { component: 'gamma', versions: '>=1.0.0 <2.0.0', license: 'ISC', whyNoText: 'The package is published without a license file.', reviewer: 'A Maintainer', reviewedOn: '2026-09-01', expires: '2027-08-31' };
    put(PATHS.exceptions, json({ exceptions: [entry] }));
    const covered = generate();
    expect(covered.problems).toEqual([]);
    expect(covered.text).toContain('Component: gamma\nVersion:   1.2.0\nLicense:   ISC (a maintainer-reviewed exception, reviewed 2026-09-01, expires 2027-08-31)\n');
    expect(flat(covered.text)).toContain('No license text is distributed with this component. The package is published without a license file.');
    // The expiry day itself still covers; the day after does not.
    expect(generate('linux', '2027-08-31').problems).toEqual([]);
    expect(generate('linux', '2027-09-01').problems).toEqual(['gamma 1.2.0 (npm): carries no license text and its reviewed exception expired on 2027-08-31 (tools/notices/reviewed-exceptions.json)']);
    put(PATHS.exceptions, json({ exceptions: [{ ...entry, versions: '>=1.3.0' }] }));
    expect(generate().problems).toEqual(['gamma 1.2.0 (npm): carries no license text and its reviewed exception covers >=1.3.0, not 1.2.0 (tools/notices/reviewed-exceptions.json)']);
  });

  it('a licence file that only points elsewhere, or only carries a licence\'s per-file notice, is no license text (OQ-75)', () => {
    // @workflow/serde 4.1.0's whole LICENSE.md, then the shape of ai 7.0.92's LICENSE: each refers to a text not shipped.
    rmSync(join(root, 'node_modules/gamma/LICENSE'));
    put('node_modules/gamma/LICENSE.md', 'Apache License 2.0\n\nSee the LICENSE file in the root of this repository.');
    const pointer = 'gamma 1.2.0 (npm): carries no license text — LICENSE.md only names its license or points elsewhere for it — and no reviewed exception covers it (tools/notices/reviewed-exceptions.json)';
    expect(generate().problems).toEqual([pointer]);
    rmSync(join(root, 'node_modules/gamma/LICENSE.md'));
    put('node_modules/gamma/LICENSE', APACHE_NOTICE);
    expect(generate().problems).toEqual([pointer.replace('LICENSE.md', 'LICENSE')]);
    // A reviewed exception covers it like a component with no file, and the notice is still reproduced for its copyright.
    const whyNoText = 'The package ships the Apache-2.0 notice and not the licence text.';
    put(PATHS.exceptions, json({ exceptions: [{ component: 'gamma', versions: '1.2.0', license: 'Apache-2.0', whyNoText, reviewer: 'A Maintainer', reviewedOn: '2026-09-01', expires: '2027-08-31' }] }));
    const covered = generate();
    expect(covered.problems).toEqual([]);
    expect(flat(covered.text)).toContain(`No license text is distributed with this component. ${whyNoText} ${flat(APACHE_NOTICE)}`);
  });

  it('a NOTICE or an authors list alone is no license text; beside the licence it is reproduced with it (OQ-75)', () => {
    rmSync(join(root, 'node_modules/gamma/LICENSE'));
    put('node_modules/gamma/NOTICE', 'Fixture gamma\nCopyright 2024 The Gamma Authors');
    expect(generate().problems).toEqual(['gamma 1.2.0 (npm): carries no license text — NOTICE only attributes — and no reviewed exception covers it (tools/notices/reviewed-exceptions.json)']);
    put('node_modules/gamma/LICENSE', body('ISC licence of gamma 1'));
    const { problems, text } = generate();
    expect(problems).toEqual([]);
    expect(text).toContain(`----- LICENSE -----\n\n${body('ISC licence of gamma 1')}\n\n----- NOTICE -----\n\nFixture gamma\nCopyright 2024 The Gamma Authors\n`);
  });

  it('a runtime distribution whose licence files are an authors list and a per-file notice carries no license text (mslex 1.3.0\'s shape)', () => {
    put(`${SITE}/mslex-1.3.0.dist-info/METADATA`, 'Metadata-Version: 2.1\nName: mslex\nVersion: 1.3.0\nLicense: Apache Software License 2.0\nLicense-File: LICENSE\nLicense-File: AUTHORS.rst\n');
    put(`${SITE}/mslex-1.3.0.dist-info/LICENSE`, APACHE_NOTICE);
    put(`${SITE}/mslex-1.3.0.dist-info/AUTHORS.rst`, 'Authors\n=======\n\n* A. Fixture');
    expect(generate().problems).toEqual(['mslex 1.3.0 (code-intelligence runtime): carries no license text — AUTHORS.rst only attributes; LICENSE only names its license or points elsewhere for it — and no reviewed exception covers it (tools/notices/reviewed-exceptions.json)']);
  });

  it('the reviewed-exceptions table itself: every field, real dates, and an expiry at most 365 days after the review', () => {
    const entry = { component: 'gamma', versions: '1.2.0', license: 'ISC', whyNoText: 'why', reviewer: 'A Maintainer', reviewedOn: '2026-01-01', expires: '2027-01-01' };
    expect(MAX_EXCEPTION_DAYS).toBe(365);
    const problems: string[] = [];
    put(PATHS.exceptions, json({ exceptions: [entry, { ...entry, expires: '2027-01-02' }, { ...entry, reviewer: '' }, { ...entry, reviewedOn: '2026-02-30' }] }));
    expect(reviewedExceptions(root, problems)).toEqual([entry]);
    expect(problems).toEqual([
      `${PATHS.exceptions} entry 2 (gamma): expires 2027-01-02 is not within 365 days after the review on 2026-01-01`,
      `${PATHS.exceptions} entry 3 (gamma) has no reviewer`,
      `${PATHS.exceptions} entry 4 (gamma): reviewedOn and expires must be YYYY-MM-DD dates`,
    ]);
    // A review dated ahead of today would otherwise stand from now until a year past its own date.
    const ahead: string[] = [];
    put(PATHS.exceptions, json({ exceptions: [{ ...entry, reviewedOn: '2030-01-01', expires: '2030-12-31' }] }));
    expect(reviewedExceptions(root, ahead, TODAY)).toEqual([]);
    expect(ahead).toEqual([`${PATHS.exceptions} entry 1 (gamma): reviewedOn 2030-01-01 is after today, ${TODAY}`]);
  });

  it('the setup manifest cannot be read, cannot be parsed, or declares a package without one of its four fields', () => {
    rmSync(join(root, PATHS.setupManifest));
    expect(generate().problems).toEqual([`the setup manifest ${PATHS.setupManifest} cannot be read: ENOENT`]);
    put(PATHS.setupManifest, '{ "languageServers": [');
    expect(generate().problems[0]).toMatch(new RegExp(`^the setup manifest ${PATHS.setupManifest} cannot be parsed: `));
    const pyright = { name: 'pyright', version: '1.1.403', source: 'https://pypi.org/project/pyright/', license: 'MIT' };
    const withLs = (pkg: object) => json({ ...FIXTURE_MANIFEST, languageServers: [{ language: 'python', provisioner: 'uvx', packages: [pkg] }] });
    put(PATHS.setupManifest, withLs({ ...pyright, license: undefined }));
    expect(generate().problems).toEqual([`the setup manifest ${PATHS.setupManifest} cannot be parsed: language server package pyright (python) has no license`]);
    // A field that is only whitespace is no field: it would render an empty `License:` line (gate round 2).
    put(PATHS.setupManifest, withLs({ ...pyright, version: ' ' }));
    expect(generate().problems).toEqual([`the setup manifest ${PATHS.setupManifest} cannot be parsed: language server package pyright (python) has no version`]);
  });

  it('the setup manifest is read in the shape it ships: schema version 1, the three lists, a machine tool\'s provisionedVersion, a tool-server package\'s four fields', () => {
    const cannot = (m: string) => [`the setup manifest ${PATHS.setupManifest} cannot be parsed: ${m}`];
    put(PATHS.setupManifest, json({ ...FIXTURE_MANIFEST, schemaVersion: 2 }));
    expect(generate().problems).toEqual(cannot('schemaVersion is 2, not 1'));
    put(PATHS.setupManifest, json({ ...FIXTURE_MANIFEST, schemaVersion: undefined }));
    expect(generate().problems).toEqual(cannot('schemaVersion is null, not 1'));
    for (const list of ['machineTools', 'toolServerPackages', 'languageServers'] as const) {
      put(PATHS.setupManifest, json({ ...FIXTURE_MANIFEST, [list]: undefined }));
      expect(generate().problems, list).toEqual(cannot(`${list} is not a list`));
    }
    // The generator's own earlier assumption — `version` on a machine tool — is not the manifest's shape.
    const [git, ripgrep] = FIXTURE_MANIFEST.machineTools;
    const assumed: Record<string, unknown> = { ...ripgrep, version: '15.2.0' };
    delete assumed.provisionedVersion;
    put(PATHS.setupManifest, json({ ...FIXTURE_MANIFEST, machineTools: [git, assumed] }));
    expect(generate().problems).toEqual(cannot('machine tool ripgrep has no provisionedVersion'));
    put(PATHS.setupManifest, json({ ...FIXTURE_MANIFEST, machineTools: [{ ...git, source: '' }] }));
    expect(generate().problems).toEqual(cannot('machine tool git has no source'));
    put(PATHS.setupManifest, json({ ...FIXTURE_MANIFEST, toolServerPackages: [{ ...FIXTURE_MANIFEST.toolServerPackages[0], license: ' ' }] }));
    expect(generate().problems).toEqual(cannot('tool-server package @playwright/mcp has no license'));
  });

  it('the code-intelligence pins, which name the runtime of the language-server sub-heading, cannot be read or name no runtime', () => {
    rmSync(join(root, PATHS.codeIntelligencePins));
    expect(generate().problems).toEqual([`the code-intelligence pins ${PATHS.codeIntelligencePins} cannot be read: ENOENT`]);
    put(PATHS.codeIntelligencePins, json({ python: '3.13.15' }));
    expect(generate().problems).toEqual([`the code-intelligence pins ${PATHS.codeIntelligencePins} cannot be parsed: they name no runtime distribution and version`]);
  });

  it('an input that parses to no object — null, false, 0, "" or a list — cannot be parsed as that input (gate round 2)', () => {
    // Each once read as "nothing to report": the header then carried "(no address)", the fonts section or the
    // language servers went missing, and the step exited 0.
    const inputs = [
      [PATHS.releaseInputs, 'the release inputs'],
      [PATHS.assets, 'the bundled-assets table'],
      [PATHS.setupManifest, 'the setup manifest'],
      [PATHS.codeIntelligencePins, 'the code-intelligence pins'],
      [PATHS.bundleMarker, 'the bundle marker'],
      [PATHS.exceptions, 'the reviewed-exceptions table'],
    ] as const;
    for (const [rel, what] of inputs) {
      const original = readFileSync(join(root, rel), 'utf8');
      for (const value of ['null', 'false', '0', '""', '[]']) {
        put(rel, value);
        expect(generate().problems, `${rel} = ${value}`).toEqual([`${what} ${rel} cannot be parsed: it is not a JSON object`]);
      }
      put(rel, original);
    }
    put(PATHS.releaseInputs, 'null');
    expect(runNoticesStep({ root, platform: 'linux', today: TODAY }).code).toBe(1);
    expect(existsSync(join(root, PATHS.output))).toBe(false);
  });

  it('the notices header carries no LGPL corresponding-sources address — O-3 still owed', () => {
    put(PATHS.releaseInputs, json({ lgplCorrespondingSourcesAddress: '' }));
    expect(generate().problems).toEqual([`the LGPL corresponding-sources address (lgplCorrespondingSourcesAddress in ${PATHS.releaseInputs}) is empty — it is the owner's to give (first-release-plan.md §6, O-3; REQ-STARTUP-142)`]);
    put(PATHS.releaseInputs, json({ lgplCorrespondingSourcesAddress: 'sources@example.com' }));
    expect(generate().problems).toEqual([`the LGPL corresponding-sources address (lgplCorrespondingSourcesAddress in ${PATHS.releaseInputs}) uses a domain reserved for examples and tests — it is the owner's to give (first-release-plan.md §6, O-3; REQ-STARTUP-142)`]);
    put(PATHS.releaseInputs, json({ lgplCorrespondingSourcesAddress: 'N/A' }));
    expect(generate().problems).toEqual([`the LGPL corresponding-sources address (lgplCorrespondingSourcesAddress in ${PATHS.releaseInputs}) is a placeholder — it is the owner's to give (first-release-plan.md §6, O-3; REQ-STARTUP-142)`]);
    rmSync(join(root, PATHS.releaseInputs));
    expect(generate().problems).toEqual([`the release inputs ${PATHS.releaseInputs} cannot be read: ENOENT`]);
    // Windows PowerShell 5.1 writes a byte-order mark; the owner's edit is not refused for it.
    put(PATHS.releaseInputs, `\uFEFF${json({ lgplCorrespondingSourcesAddress: ADDRESS })}`);
    expect(generate().problems).toEqual([]);
  });

  it('the bundled runtime is part of the closure, so its absence is a failure rather than a shorter file', () => {
    rmSync(join(root, 'apps/desktop/resources/code-intelligence'), { recursive: true });
    expect(generate().problems).toEqual([`the bundled code-intelligence runtime is absent at ${PATHS.runtime} — its distributions are part of the shipped closure; run pnpm code-intel:bundle first`]);
  });

  it('a required dependency the installed tree lacks is named; a missing optional one is not', () => {
    rmSync(join(root, 'node_modules/beta'), { recursive: true });
    expect(generate().problems).toEqual(['beta, a dependency of @rotaris/kernel, is not installed — the closure is read from the installed workspace (pnpm install)']);
  });
});

describe('REQ-STARTUP-149: the step exits 0 having written the file, or 1 having written nothing', () => {
  it('writes exactly the rendered text on a pass', () => {
    const r = runNoticesStep({ root, platform: 'linux', today: TODAY });
    expect(r.code).toBe(0);
    expect(r.stderr).toEqual([]);
    expect(readFileSync(join(root, PATHS.output), 'utf8')).toBe(generate().text);
  });

  it('prints one `error:` line per problem and removes a file an earlier run left behind', () => {
    put(PATHS.output, 'a stale file from an earlier, valid run');
    put(PATHS.releaseInputs, json({ lgplCorrespondingSourcesAddress: '' }));
    rmSync(join(root, 'node_modules/gamma/LICENSE'));
    const r = runNoticesStep({ root, platform: 'linux', today: TODAY });
    expect(r.code).toBe(1);
    expect(r.stderr).toHaveLength(3);
    expect(r.stderr.every((l) => l.startsWith('error: '))).toBe(true);
    expect(r.stderr[0]).toBe(`error: notices validation failed (REQ-STARTUP-143): 2 problems; ${PATHS.output} was not written`);
    expect(existsSync(join(root, PATHS.output))).toBe(false);
  });

  it('a package.json the closure cannot parse fails the step as a handled error naming its path', () => {
    put('node_modules/gamma/package.json', '{ name: gamma }');
    const r = runNoticesStep({ root, platform: 'linux', today: TODAY });
    expect(r.code).toBe(1);
    expect(r.stderr).toHaveLength(1);
    expect(r.stderr[0]).toMatch(/^error: the notices generator failed: node_modules\/gamma\/package\.json cannot be parsed: /);
  });

  it('Electron\'s package.json is read like every other: absent is "not installed", malformed is named as unparsable (gate round 2)', () => {
    rmSync(join(root, 'node_modules/electron/package.json'));
    expect(generate().problems).toEqual([`electron is not installed at ${PATHS.electron}`]);
    put('node_modules/electron/package.json', '{ version: 44 }');
    const r = runNoticesStep({ root, platform: 'linux', today: TODAY });
    expect(r.code).toBe(1);
    expect(r.stderr).toHaveLength(1);
    expect(r.stderr[0]).toMatch(/^error: the notices generator failed: node_modules\/electron\/package\.json cannot be parsed: /);
  });

  it('a directory standing where the file goes is a handled error, on a pass and on a failure alike (gate round 2)', () => {
    mkdirSync(join(root, PATHS.output), { recursive: true });
    const unwritable = runNoticesStep({ root, platform: 'linux', today: TODAY });
    expect(unwritable.code).toBe(1);
    expect(unwritable.stderr[0]).toMatch(/^error: the notices generator failed: EISDIR/);
    expect(unwritable.stderr[1]).toBe(`error: ${PATHS.output} cannot be removed: ERR_FS_EISDIR`);
    put(PATHS.releaseInputs, json({ lgplCorrespondingSourcesAddress: '' }));
    const invalid = runNoticesStep({ root, platform: 'linux', today: TODAY });
    expect(invalid.code).toBe(1);
    expect(invalid.stderr.every((l) => l.startsWith('error: '))).toBe(true);
    expect(invalid.stderr.at(-1)).toBe(`error: ${PATHS.output} cannot be removed: ERR_FS_EISDIR`);
  });

  it('refuses an argument as a usage error (2)', () => {
    const r = spawnSync(process.execPath, [join(REPO, 'tools/notices/generate.mjs'), '--check'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toBe('error: pnpm notices takes no arguments (got --check)\n');
  });
});

describe('the readers, on their own', () => {
  it('an address stands only as a literal, reachable route (REQ-STARTUP-142)', () => {
    expect(addressProblem(ADDRESS)).toBeNull();
    expect(addressProblem('Rotaris Maintainers <corresponding-sources@rotaris-maintainers.org>')).toBeNull();
    expect(addressProblem(undefined)).toBe('is empty');
    expect(addressProblem('  ')).toBe('is empty');
    expect(addressProblem('https://github.com/theUpsider/Rotaris-crw')).toBe('is a web page reference, not an address');
    expect(addressProblem('<address>')).toBe('is a template placeholder');
    expect(addressProblem('TODO')).toBe('is a placeholder');
    expect(addressProblem('your email here')).toBe('is a placeholder');
    for (const reserved of ['a@example.org', 'a@sources.example', 'a@x.invalid', 'a@rotaris.test', 'a@localhost']) expect(addressProblem(reserved)).toBe('uses a domain reserved for examples and tests');
    // REQ-STARTUP-142: "an address that is only a placeholder SHALL fail". Each of these once stood (gate round 1).
    for (const word of ['N/A', 'n/a', 'none', 'TBA', 'to be announced', 'REPLACE_ME', 'insert address here', 'sources@yourdomain.com']) expect(addressProblem(word)).toBe('is a placeholder');
    for (const template of ['name@domain.com', 'user@email.com']) expect(addressProblem(template)).toBe('uses a placeholder domain');
    for (const shapeless of ['-', '?', '...', '0', 'x@y', 'x@y.z', 'mailto:', '1, 2']) expect(addressProblem(shapeless)).toBe('is neither an e-mail address nor a postal address');
    // What stands has an address's shape: an e-mail address, or a postal address in more than one part.
    for (const real of ['corresponding-sources@rotaris.dev', 'Rotaris Maintainers\nPostfach 1234\n10115 Berlin\nGermany', 'Jane Maintainer, 12 High Street, Leeds LS1 1AA, United Kingdom']) expect(addressProblem(real)).toBeNull();
  });

  it('an address that is only a placeholder is refused in every shape a template writes one (REQ-STARTUP-142, gate round 2)', () => {
    // Each of these stood after round 1 — the first is the example first-release-plan.md §4.3 once gave the owner.
    for (const template of ['Name <sources@domain.tld>', 'Name <sources@rotaris.dev>', 'address', 'Street 1, 12345 City, Country']) expect(addressProblem(template), template).toBe('is a template placeholder');
    for (const [value, tld] of [['sources@domain.tld', 'tld'], ['user@host.tld', 'tld'], ['sources@your.domain', 'domain'], ['sources@rotaris.local', 'local'], ['sources@rotaris.internal', 'internal'], ['sources@corp.lan', 'lan']]) {
      expect(addressProblem(value), value).toBe(`uses a top-level domain no mail reaches (.${tld})`);
    }
    for (const domain of ['email@address.com', 'test@test.com', 'user@host.com', 'sources@mydomain.net', 'sources@test.rotaris.dev']) expect(addressProblem(domain), domain).toBe('uses a placeholder domain');
    const stock = [
      'foo@bar.com', 'admin@admin.com', 'abc@abc.com', 'someone@somewhere.com', 'test@rotaris.dev', 'john.doe@rotaris.dev', 'user1@rotaris.dev',
      '123 Main Street, Anytown', '123 Main Street, Anytown, USA', 'PO Box 0, Nowhere 00000', '123 Fake Street, Springfield',
      'Address line 1, Address line 2', 'Address line 1, Address line 2, 00000', 'Musterstraße 1, 12345 Musterstadt',
    ];
    for (const value of stock) expect(addressProblem(value), value).toBe('is a placeholder');
    // REQ-STARTUP-142: "a single address … monitored by the maintainers".
    for (const unread of ['noreply@rotaris.dev', 'no-reply@rotaris.dev', 'do-not-reply@rotaris.dev']) expect(addressProblem(unread), unread).toBe('is a no-reply address, which the maintainers do not monitor');
    expect(addressProblem('legal@rotaris.dev, legal2@rotaris.dev')).toBe('names more than one e-mail address, not a single address');
    // The plan's example now names a domain reserved for examples, so copying it fails closed.
    expect(addressProblem('Rotaris Maintainers <sources@example.org>')).toBe('uses a domain reserved for examples and tests');
    // A real route still stands: an internationalised domain in either form, a role at its own domain, a PO box.
    for (const real of ['sources@münchen.de', 'sources@xn--mnchen-3ya.de', 'rotaris@rotaris.dev', 'info@rotaris.dev', 'legal@rotaris.co.uk', 'PO Box 1234, 10115 Berlin']) expect(addressProblem(real), real).toBeNull();
  });

  it('a licence file carries its licence, only refers to one, or only attributes (OQ-75)', () => {
    expect(licenseTextKind('LICENSE.md', 'Apache License 2.0\n\nSee the LICENSE file in the root of this repository.')).toBe('reference');
    expect(licenseTextKind('LICENSE', APACHE_NOTICE)).toBe('reference');
    const mplExhibitA = 'This Source Code Form is subject to the terms of the Mozilla Public License,\nv. 2.0. If a copy of the MPL was not distributed with this file, You can obtain\none at http://mozilla.org/MPL/2.0/.';
    expect(licenseTextKind('LICENSE', `This package contains a modified version of a bundle.\n\n${mplExhibitA}`)).toBe('reference');
    expect(licenseTextKind('LICENSE', 'This software is made available under the terms of *either* of the licenses\nfound in LICENSE.APACHE or LICENSE.BSD.')).toBe('reference');
    expect(licenseTextKind('LICENSE', 'MIT')).toBe('reference');
    // A one-line pointer longer than the one-line bound, through a markdown link (gate round 2).
    expect(licenseTextKind('LICENSE.md', 'This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details')).toBe('reference');
    expect(licenseTextKind('LICENSE', MIT)).toBe('text');
    // tqdm 4.67.1's shape: the MIT text in full beside MPL-2.0's Exhibit A still carries a licence.
    expect(licenseTextKind('LICENCE', `${mplExhibitA}\n\n${MIT}`)).toBe('text');
    // A full text that quotes its own notice in an appendix runs long, and stays text.
    expect(licenseTextKind('LICENSE', `${'TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION\n'.repeat(40)}\n${APACHE_NOTICE}`)).toBe('text');
    for (const file of ['NOTICE', 'NOTICE.txt', 'AUTHORS.rst', 'licenses/AUTHORS', 'CONTRIBUTORS.md']) expect(licenseTextKind(file, MIT)).toBe('attribution');
  });

  it('versions compare segment by segment, and a range is an exact version or comparators', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('6.0.12.20250516', '6.0.12')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(versionInRange('1.2.0', '1.2.0')).toBe(true);
    expect(versionInRange('1.2.0', '=1.2.1')).toBe(false);
    expect(versionInRange('1.2.0', '>=1.0.0 <2.0.0')).toBe(true);
    expect(versionInRange('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
    expect(versionInRange('1.2.0', '')).toBe(false);
  });

  it('an exception names its component exactly and covers only its range', () => {
    const e = { component: 'gamma', versions: '1.2.0', license: 'ISC', whyNoText: 'w', reviewer: 'r', reviewedOn: '2026-01-01', expires: '2026-12-31' };
    expect(exceptionFor({ name: 'gamma', version: '1.2.0' }, [e], '2026-06-01').entry).toBe(e);
    expect(exceptionFor({ name: 'Gamma', version: '1.2.0' }, [e], '2026-06-01').reason).toBe('no reviewed exception covers it');
  });

  it('a Python distribution\'s declared identifier, most specific first; UNKNOWN declares nothing', () => {
    const of = (text: string) => pythonLicenseOf(parseCoreMetadata(text));
    expect(of('Name: a\nLicense-Expression: Apache-2.0 OR BSD-3-Clause\nLicense: MIT\n')).toBe('Apache-2.0 OR BSD-3-Clause');
    expect(of('Name: a\nLicense: BSD-3-Clause\nClassifier: License :: OSI Approved :: BSD License\n')).toBe('BSD-3-Clause');
    expect(of('Name: a\nClassifier: License :: OSI Approved :: MIT License\nClassifier: Programming Language :: Python\n')).toBe('MIT License');
    expect(of('Name: a\nLicense: MIT License\n        \n        Copyright (c) 2022 OpenAI\n')).toBe('MIT License');
    expect(of('Name: a\nLicense: UNKNOWN\n')).toBeNull();
    expect(of('Name: a\n')).toBeNull();
    expect(parseCoreMetadata('Name: a\nLicense: first\n  second\n\nBody: ignored').get('license')).toEqual(['first\nsecond']);
    expect(parseCoreMetadata('Name: a\n\nBody: ignored').has('body')).toBe(false);
  });

  it('Electron\'s credits read as entries, and a WOFF2 font\'s naming table as its records', () => {
    expect(parseChromiumCredits(CREDITS_HTML)).toEqual([
      { title: 'libfixture & friends', homepage: 'https://fixture.invalid/libfixture', text: 'Copyright "Fixture" <authors>\nGNU LESSER GENERAL PUBLIC LICENSE, as it happens.' },
      { title: 'zlib-fixture', homepage: 'https://zlib.invalid/', text: 'zlib license text' },
    ]);
    expect(woff2Names(woff2({ 0: 'Copyright X', 5: 'Version 3.2' }))).toEqual({ 0: 'Copyright X', 5: 'Version 3.2' });
    expect(() => woff2Names(Buffer.from('OTTO0000'))).toThrow('not a WOFF2 font');
    expect(declaredFontFiles("src: url('@design-assets/b.woff2'); src: url(@design-assets/a.woff2)")).toEqual([`${PATHS.designAssets}/a.woff2`, `${PATHS.designAssets}/b.woff2`]);
  });
});

describe('the real repository: what `pnpm check` can say without the bundled runtime', () => {
  it('the product\'s own packages are the ones under pnpm-workspace.yaml\'s globs, of which the generator holds a copy', () => {
    const yaml = readFileSync(join(REPO, 'pnpm-workspace.yaml'), 'utf8');
    const block = /^packages:\n((?:[ \t]+-[^\n]*\n)+)/m.exec(yaml)?.[1] ?? '';
    const globs = [...block.matchAll(/-\s*['"]?([^'"\n]+?)['"]?\s*$/gm)].map((m) => m[1]);
    expect(globs).toEqual(WORKSPACE_DIRS.map((d) => `${d}/*`));
  });

  it('every font the renderer bundles has a license file that carries the font\'s own copyright notice; the three REQ-STARTUP-142 names and Phosphor are present', () => {
    const problems: string[] = [];
    const assets = bundledAssetComponents(REPO, problems);
    expect(problems).toEqual([]);
    expect(assets.map((a) => `${a.name} ${a.license}`)).toEqual(['JetBrains Mono OFL-1.1', 'Manrope OFL-1.1', 'Space Grotesk OFL-1.1', 'Phosphor Icons MIT']);
    expect(assets.find((a) => a.name === 'JetBrains Mono')?.version).toBe('2.305');
    expect(assets.find((a) => a.name === 'Space Grotesk')?.version).toBe('2.000');
  });

  it('reads the setup manifest the build ships, not the code-intelligence pins (REQ-STARTUP-142: "generated from the setup manifest of that same build")', () => {
    expect(PATHS.setupManifest).toBe('apps/desktop/resources/setup-manifest.json');
  });

  it('the shipped setup manifest pins Git and ripgrep, the tool-server package and the language servers IC-7 names, each with its four fields (REQ-STARTUP-058, REQ-STARTUP-152)', () => {
    const problems: string[] = [];
    const manifest = setupManifest(REPO, problems);
    expect(problems).toEqual([]);
    expect(manifest?.runtime).toBe('serena-agent 1.7.0');
    expect(manifest?.machineTools).toEqual([
      { name: 'git', version: '2.55.0', source: 'https://github.com/git-for-windows/git', license: 'GPL-2.0-only' },
      { name: 'ripgrep', version: '15.2.0', source: 'https://github.com/BurntSushi/ripgrep', license: 'Unlicense OR MIT' },
    ]);
    expect(manifest?.toolServerPackages).toEqual([{ name: '@playwright/mcp', version: '0.0.80', source: 'https://registry.npmjs.org/@playwright/mcp', license: 'Apache-2.0' }]);
    expect(manifest?.languageServers.map((s) => `${s.name} ${s.version} ${s.license}`)).toEqual(['typescript 5.9.3 Apache-2.0', 'typescript-language-server 5.1.3 MIT', 'pyright 1.1.403 MIT']);
  });

  it('the field names the generator reads are keys the setup-manifest schema declares, and the fixture and the shipped file are manifests that schema accepts', () => {
    expect(SETUP_MANIFEST_SHAPE.schemaVersion).toBe(SETUP_MANIFEST_SCHEMA_VERSION);
    for (const k of SETUP_MANIFEST_SHAPE.machineTool) expect(Object.keys(MachineToolSchema.shape), k).toContain(k);
    for (const k of SETUP_MANIFEST_SHAPE.toolServerPackage) expect(Object.keys(PinnedPackageSchema.shape), k).toContain(k);
    for (const k of SETUP_MANIFEST_SHAPE.languageServerPackage) expect(Object.keys(PinnedPackageSchema.shape), k).toContain(k);
    expect(Object.keys(LanguageServerSchema.shape)).toEqual(expect.arrayContaining(['language', 'packages']));
    expect(SetupManifestSchema.safeParse(FIXTURE_MANIFEST).success).toBe(true);
    expect(SetupManifestSchema.safeParse(JSON.parse(readFileSync(join(REPO, PATHS.setupManifest), 'utf8'))).success).toBe(true);
  });

  it('the reviewed-exceptions table and the release inputs are readable, and every exception in the table is well-formed', () => {
    const problems: string[] = [];
    reviewedExceptions(REPO, problems);
    expect(problems).toEqual([]);
    const inputs = JSON.parse(readFileSync(join(REPO, PATHS.releaseInputs), 'utf8'));
    expect(Object.keys(inputs)).toContain('lgplCorrespondingSourcesAddress');
  });
});
