/**
 * The About page's two files and the one licence copy (first-release-plan.md §4.4; REQ-SHELL-140, REQ-STARTUP-015,
 * REQ-STARTUP-141..143). Three things are pinned here, none of which needs a packaging run:
 *
 *  - what `pnpm package` does after the notices step — exit 1 stops it unless the development flag asks otherwise, a
 *    tag build refuses the flag, and a package that goes on without the file has none left to carry;
 *  - the "assets" rule `afterPack` applies to an artifact's resources directory;
 *  - `electron-builder.yml`'s `extraResources` as electron-builder itself reads and copies it: the repository's own yml,
 *    parsed by the parser electron-builder loads it with and copied by electron-builder's own `copyFiles` from a fixture
 *    application directory into a fixture `resources/`. That is the step of a real pack that places these files; what a
 *    real pack adds around it (rebuild, asar, installer) touches none of them. No artifact is produced (IC-3).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — plain ESM beside the scripts that run it.
import { ABOUT_ASSETS, aboutAssetProblems, afterNoticesStep, settleNoticesStep, WITHOUT_NOTICES } from './about-assets.mjs';
import { BUILD_ID_ASSET, THIRD_PARTY_LICENSES_ASSET } from '../../src/main/about.js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = join(APP, '..', '..');
/** electron-builder's own modules, resolved from where electron-builder resolves them. */
const builder = createRequire(createRequire(join(APP, 'package.json')).resolve('app-builder-lib'));
const { copyFiles, getFileMatchers } = builder('./fileMatcher.js') as {
  getFileMatchers: (config: unknown, name: string, destination: string, options: unknown) => unknown[] | null;
  copyFiles: (matchers: unknown[] | null, transformer: null, isUseHardLink: boolean) => Promise<unknown>;
};
const yaml = builder('js-yaml') as { load: (text: string) => Record<string, unknown> };

const PINS = JSON.parse(readFileSync(join(APP, 'scripts', 'code-intelligence', 'pins.json'), 'utf8')) as { distribution: string; version: string; python: string };
/** The tool server's dist-info licence, as `bundle.mjs` records it in the marker, in the two layouts the bundle takes. */
const DIST_INFO = `${PINS.distribution.replace(/-/g, '_')}-${PINS.version}.dist-info`;
const POSIX_LICENSE = `lib/python3.13/site-packages/${DIST_INFO}/licenses/LICENSE`;
const WINDOWS_LICENSE = `Lib/site-packages/${DIST_INFO}/licenses/LICENSE`;
const SERVER_LICENSE = 'MIT License\n\nCopyright (c) 2025 Fixture Tool Server Authors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy.\n';
const OTHER_LICENSE = 'BSD 3-Clause License\n\nCopyright (c) Fixture Other\n\nRedistribution and use in source and binary forms, with or without modification, are permitted.\n';
const ID = `${'0123456789abcdef'.repeat(2)}01234567`;
/** `identifyBuild`'s answer for the tree the fixture stands for. */
const BUILD = { id: ID };
const { buildId: BUILD_ID, notices: NOTICES } = ABOUT_ASSETS as { buildId: string; notices: string };

let work: string;
let app: string;
let packed: string;
/**
 * A write that replaces the file rather than writing through it: under Vitest electron-builder hard-links what it copies
 * (builder-util's `_isUseHardLink` reads `VITEST`), so a write through the packed file would change the source as well.
 */
const put = (dir: string, rel: string, text: string) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  rmSync(join(dir, rel), { force: true });
  writeFileSync(join(dir, rel), text);
};
/** A notices file as the generator renders one: the tool server's text once, CRLF-free, among other entries. */
const notices = (serverTexts = 1) => ['Rotaris 0.1.0 — third-party software notices', '', ...Array.from({ length: serverTexts }, () => SERVER_LICENSE.trim()), '', OTHER_LICENSE.trim(), ''].join('\n');

/** A fixture application directory: the source tree's `resources/` as `pnpm package` leaves it before electron-builder. */
function fixtureApp(layout: string, withNotices: boolean) {
  put(app, `resources/code-intelligence/bundle.json`, JSON.stringify({ distribution: PINS.distribution, version: PINS.version, licenseFile: layout }));
  put(app, `resources/code-intelligence/runtime/${layout}`, SERVER_LICENSE);
  put(app, `resources/code-intelligence/runtime/${layout.replace(DIST_INFO, 'other_dist-1.0.dist-info')}`, OTHER_LICENSE);
  put(app, `resources/code-intelligence/runtime/${layout.replace(`${DIST_INFO}/licenses/LICENSE`, 'serena/__init__.py')}`, '# the tool server\n');
  put(app, `resources/${BUILD_ID}`, `${ID}\n`);
  if (withNotices) put(app, `resources/${NOTICES}`, notices());
}

/** electron-builder's extraResources step, over the repository's own yml, from the fixture into `packed/resources`. */
async function packResources() {
  const config = yaml.load(readFileSync(join(APP, 'electron-builder.yml'), 'utf8'));
  const resources = join(packed, 'resources');
  mkdirSync(resources, { recursive: true });
  const identity = (s: string) => s;
  const matchers = getFileMatchers(config, 'extraResources', resources, { macroExpander: identity, customBuildOptions: config['win'] ?? {}, globalOutDir: join(app, 'release'), defaultSrc: app });
  await copyFiles(matchers, null, false);
  return resources;
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'rotaris-about-assets-'));
  app = join(work, 'app');
  packed = join(work, 'win-unpacked');
});
afterEach(() => { rmSync(work, { recursive: true, force: true }); });

describe('REQ-STARTUP-143 / first-release-plan.md §4.4: what `pnpm package` does after the notices step', () => {
  it('a passing step is carried, with or without the flag', () => {
    expect(afterNoticesStep({ code: 0, env: {} })).toMatchObject({ proceed: true, carried: true });
    expect(afterNoticesStep({ code: 0, env: { [WITHOUT_NOTICES]: '1' } })).toMatchObject({ proceed: true, carried: true });
  });

  it('exit 1 stops the package, and says which flag a development package needs', () => {
    const d = afterNoticesStep({ code: 1, env: {} });
    expect(d.proceed).toBe(false);
    expect(d.line).toContain(`${WITHOUT_NOTICES}=1`);
    expect(d.line).toContain('REQ-STARTUP-143');
  });

  it('the flag passes over exit 1, loudly, and only with the value 1', () => {
    const d = afterNoticesStep({ code: 1, env: { [WITHOUT_NOTICES]: '1' } });
    expect(d).toMatchObject({ proceed: true, carried: false });
    expect(d.line).toMatch(/^DEVELOPMENT PACKAGE: .*not releasable$/);
    expect(afterNoticesStep({ code: 1, env: { [WITHOUT_NOTICES]: 'true' } }).proceed).toBe(false);
    expect(afterNoticesStep({ code: 1, env: { [WITHOUT_NOTICES]: '0' } }).proceed).toBe(false);
  });

  it('a build for a tag refuses the flag: the release path fails on REQ-STARTUP-143', () => {
    expect(afterNoticesStep({ code: 1, env: { [WITHOUT_NOTICES]: '1', GITHUB_REF_TYPE: 'tag' } }).proceed).toBe(false);
    expect(afterNoticesStep({ code: 1, env: { [WITHOUT_NOTICES]: '1', GITHUB_REF: 'refs/tags/v0.1.0' } }).proceed).toBe(false);
    expect(afterNoticesStep({ code: 1, env: { [WITHOUT_NOTICES]: '1', GITHUB_REF_TYPE: 'branch', GITHUB_REF: 'refs/heads/main' } }).proceed).toBe(true);
  });

  it('a usage error or a signal is never passed over; exit 1 cannot be told from a crash, so it is not asked to be', () => {
    expect(afterNoticesStep({ code: 2, env: { [WITHOUT_NOTICES]: '1' } }).proceed).toBe(false);
    expect(afterNoticesStep({ code: null, env: { [WITHOUT_NOTICES]: '1' } }).proceed).toBe(false);
  });

  it('a package that goes on without the file removes any earlier one: an uncaught exception exits 1 and leaves it', () => {
    const source = join(work, 'resources');
    // The state an uncaught exception in the step leaves: exit 1, and the notices file an earlier passing run wrote.
    put(source, NOTICES, notices());
    expect(settleNoticesStep({ code: 1, env: {}, sourceDir: source }).proceed).toBe(false);
    expect(existsSync(join(source, NOTICES))).toBe(true);
    expect(settleNoticesStep({ code: 1, env: { [WITHOUT_NOTICES]: '1' }, sourceDir: source })).toMatchObject({ proceed: true, carried: false });
    expect(existsSync(join(source, NOTICES))).toBe(false);
    // A passing step's file is the one carried, flag or not.
    put(source, NOTICES, notices());
    expect(settleNoticesStep({ code: 0, env: { [WITHOUT_NOTICES]: '1' }, sourceDir: source })).toMatchObject({ proceed: true, carried: true });
    expect(existsSync(join(source, NOTICES))).toBe(true);
  });
});

describe('electron-builder.yml, copied by electron-builder: the two files at the root of resources/, one licence copy', () => {
  it('carries build-id.txt and THIRD-PARTY-LICENSES.txt at the root, and the tool server\'s licence only in the notices file (Linux layout)', async () => {
    fixtureApp(POSIX_LICENSE, true);
    const resources = await packResources();
    expect(readFileSync(join(resources, BUILD_ID), 'utf8')).toBe(`${ID}\n`);
    expect(readFileSync(join(resources, NOTICES), 'utf8')).toBe(notices());
    // REQ-STARTUP-015: the dist-info copy is left out; every other file of the runtime is carried.
    expect(existsSync(join(resources, 'code-intelligence/runtime', POSIX_LICENSE))).toBe(false);
    expect(existsSync(join(resources, 'code-intelligence/runtime', POSIX_LICENSE.replace(DIST_INFO, 'other_dist-1.0.dist-info')))).toBe(true);
    expect(existsSync(join(resources, 'code-intelligence/runtime/lib/python3.13/site-packages/serena/__init__.py'))).toBe(true);
    expect(existsSync(join(resources, 'code-intelligence/bundle.json'))).toBe(true);
    expect(aboutAssetProblems({ resourcesDir: resources, sourceDir: join(app, 'resources'), env: {}, toolServerLicense: POSIX_LICENSE, build: BUILD })).toEqual([]);
  });

  it('leaves the dist-info copy out of the Windows layout too, which is the one the first release ships', async () => {
    fixtureApp(WINDOWS_LICENSE, true);
    const resources = await packResources();
    expect(existsSync(join(resources, 'code-intelligence/runtime', WINDOWS_LICENSE))).toBe(false);
    expect(existsSync(join(resources, 'code-intelligence/runtime/Lib/site-packages/serena/__init__.py'))).toBe(true);
    expect(aboutAssetProblems({ resourcesDir: resources, sourceDir: join(app, 'resources'), env: {}, toolServerLicense: WINDOWS_LICENSE, build: BUILD })).toEqual([]);
  });

  it('with no notices file the copier skips it, and the rule allows that only for the development flag, never for a tag', async () => {
    fixtureApp(WINDOWS_LICENSE, false);
    const resources = await packResources();
    expect(existsSync(join(resources, NOTICES))).toBe(false);
    expect(readFileSync(join(resources, BUILD_ID), 'utf8')).toBe(`${ID}\n`);
    const source = join(app, 'resources');
    const problems = (env: Record<string, string>) => aboutAssetProblems({ resourcesDir: resources, sourceDir: source, env, toolServerLicense: WINDOWS_LICENSE, build: BUILD });
    expect(problems({ [WITHOUT_NOTICES]: '1' })).toEqual([]);
    expect(problems({})).toEqual([
      `REQ-STARTUP-141: the artifact carries no ${NOTICES}, and ${WITHOUT_NOTICES}=1 did not ask for a development package without one`,
    ]);
    // `electron-builder` called directly, on a tag, with the flag: the same refusal `pnpm package` makes.
    const onTag = [`REQ-STARTUP-141: the artifact carries no ${NOTICES}, and this is a build for a tag, where ${WITHOUT_NOTICES} has no standing (REQ-STARTUP-143)`];
    expect(problems({ [WITHOUT_NOTICES]: '1', GITHUB_REF_TYPE: 'tag' })).toEqual(onTag);
    expect(problems({ [WITHOUT_NOTICES]: '1', GITHUB_REF: 'refs/tags/v0.1.0' })).toEqual(onTag);
  });
});

describe('the "assets" rule afterPack applies, one condition at a time', () => {
  let resources: string;
  let source: string;
  beforeEach(async () => {
    fixtureApp(WINDOWS_LICENSE, true);
    resources = await packResources();
    source = join(app, 'resources');
  });
  const problems = (env: Record<string, string> = {}, license: string | null = WINDOWS_LICENSE, build: { id: string } | { problem: string } = BUILD) =>
    aboutAssetProblems({ resourcesDir: resources, sourceDir: source, env, toolServerLicense: license, build });

  it('REQ-SHELL-140: a missing identifier, an empty one, two lines, or one that differs from the step\'s', () => {
    rmSync(join(resources, BUILD_ID));
    expect(problems()).toEqual([`REQ-SHELL-140: the artifact carries no ${BUILD_ID} at the root of its resources (${resources})`]);
    put(resources, BUILD_ID, '\n');
    expect(problems()[0]).toMatch(/^REQ-SHELL-140: build-id\.txt in the artifact is not one non-empty line/);
    put(resources, BUILD_ID, `${ID}\nsecond\n`);
    expect(problems()[0]).toMatch(/is not one non-empty line/);
    put(resources, BUILD_ID, `${ID}\n`);
    put(source, BUILD_ID, `${ID.replace('0', 'f')}\n`);
    expect(problems()).toEqual([`REQ-SHELL-140: ${BUILD_ID} in the artifact differs from the one pnpm build-id wrote in ${source}`]);
  });

  it('REQ-SHELL-140: an identifier an earlier build left, carried by an electron-builder called directly, is refused', () => {
    // Both copies agree, and both name a commit the tree being packed is not at.
    expect(problems({}, WINDOWS_LICENSE, { id: `${ID.replace('0', 'f')}` })).toEqual([
      `REQ-SHELL-140: ${BUILD_ID} in the artifact says "${ID}", and the tree being packed is ${ID.replace('0', 'f')}: a file an earlier build left, which pnpm build-id replaces`,
    ]);
    // The same commit, since changed: the file says clean, the tree is not.
    expect(problems({}, WINDOWS_LICENSE, { id: `${ID}-dirty` })).toHaveLength(1);
    expect(problems({}, WINDOWS_LICENSE, { problem: 'no repository' })).toEqual([
      `REQ-SHELL-140: the tree being packed cannot be identified, so ${BUILD_ID} cannot be checked against it: no repository`,
    ]);
  });

  it('REQ-STARTUP-141: the notices file must be the one validation passed, and a stray one is refused', () => {
    put(resources, NOTICES, `${notices()}tampered\n`);
    expect(problems()).toEqual([`REQ-STARTUP-141: ${NOTICES} in the artifact differs from the one notices validation passed in ${source}`]);
    rmSync(join(source, NOTICES));
    expect(problems({ [WITHOUT_NOTICES]: '1' })).toEqual([`REQ-STARTUP-141: the artifact carries a ${NOTICES} that no passing notices step wrote in ${source}`]);
  });

  it('REQ-STARTUP-015: a second copy under the dist-info, or a notices file carrying the text twice or not at all', () => {
    put(resources, `code-intelligence/runtime/${WINDOWS_LICENSE}`, SERVER_LICENSE);
    expect(problems()[0]).toMatch(/^REQ-STARTUP-015: the tool server's licence text is carried under its dist-info .* as well as in THIRD-PARTY-LICENSES\.txt/);
    rmSync(join(resources, `code-intelligence/runtime/${WINDOWS_LICENSE}`));
    put(source, NOTICES, notices(2));
    put(resources, NOTICES, notices(2));
    expect(problems()).toEqual([`REQ-STARTUP-015: ${NOTICES} carries the tool server's licence text 2 times, not once`]);
    put(source, NOTICES, notices(0));
    put(resources, NOTICES, notices(0));
    expect(problems()).toEqual([`REQ-STARTUP-015: ${NOTICES} carries the tool server's licence text 0 times, not once`]);
  });

  it('REQ-STARTUP-015: counts the text as the generator reproduces it, whatever line endings the file has', () => {
    put(source, `code-intelligence/runtime/${WINDOWS_LICENSE}`, `\uFEFF${SERVER_LICENSE.replace(/\n/g, '\r\n')}`);
    expect(problems()).toEqual([]);
  });

  it('REQ-STARTUP-015: a marker naming no licence file cannot be counted', () => {
    expect(problems({}, null)).toEqual(['REQ-STARTUP-015: the bundle marker names no licence file for the tool server, so its copies cannot be counted']);
  });
});

describe('the real tree', () => {
  it('the helper names the files the About page reads', () => {
    expect(ABOUT_ASSETS).toEqual({ buildId: BUILD_ID_ASSET, notices: THIRD_PARTY_LICENSES_ASSET });
  });

  it('package.mjs runs both steps before electron-builder, notices first', () => {
    const script = readFileSync(join(APP, 'scripts', 'package.mjs'), 'utf8');
    const noticesStep = script.indexOf("exitOf('tools/notices/generate.mjs')");
    const idStep = script.indexOf("exitOf('tools/build-id/write.mjs')");
    const builderStep = script.indexOf('step(`${STEPS.builder} --win');
    expect(noticesStep).toBeGreaterThan(0);
    expect(idStep).toBeGreaterThan(noticesStep);
    expect(builderStep).toBeGreaterThan(idStep);
    expect(existsSync(join(REPO, 'tools/notices/generate.mjs'))).toBe(true);
    expect(existsSync(join(REPO, 'tools/build-id/write.mjs'))).toBe(true);
  });
});
