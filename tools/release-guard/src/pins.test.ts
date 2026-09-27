import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BROWSER_PACKAGE, BROWSER_PACKAGE_VERSION, SHIPPED_MCP_SERVERS } from '@rotaris/config';
import {
  DEFAULT_CONFIGURATION_LOCATION, defaultLaunches, isCompleteVersion, packageSpecs, pinDisagreements, readSetupManifest,
  SETUP_MANIFEST_LOCATION, splitPackageSpec, type DefaultLaunch, type ManifestReading,
} from './pins.js';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const scratch: string[] = [];
afterEach(() => { for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function manifestRepo(manifest: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'release-guard-'));
  scratch.push(root);
  mkdirSync(dirname(join(root, SETUP_MANIFEST_LOCATION)), { recursive: true });
  writeFileSync(join(root, SETUP_MANIFEST_LOCATION), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
  return root;
}
const pinned = (...pins: [string, string][]) => ({ schemaVersion: 1, toolServerPackages: pins.map(([name, version]) => ({ name, version })) });

const BROWSER: DefaultLaunch = { server: 'browser', runner: 'npx', name: '@playwright/mcp', version: '0.0.80', launch: 'npx -y @playwright/mcp@0.0.80 --headless' };

describe('reading the built-in default configuration', () => {
  it('the shipped defaults launch exactly one package through a runner: the browser entry, switched off or not', () => {
    const { launches, errors } = defaultLaunches(SHIPPED_MCP_SERVERS);
    expect(errors).toEqual([]);
    expect(launches).toEqual([{ ...BROWSER, name: BROWSER_PACKAGE, version: BROWSER_PACKAGE_VERSION }]);
  });

  it('the location every message names is still where the shipped defaults are written', () => {
    expect(readFileSync(join(REPO, DEFAULT_CONFIGURATION_LOCATION), 'utf8')).toContain('export const SHIPPED_MCP_SERVERS');
  });

  it('resolves an entry the way the product does, shorthands included; http and the bundled runtime launch no package', () => {
    const { launches } = defaultLaunches({
      scoped: { type: 'stdio', command: '@scope/server@1.2.3', args: ['--flag'] },
      npm: { type: 'stdio', command: 'npm:plain-server@4.5.6' },
      python: { type: 'stdio', command: 'uvx:py-server==7.8.9', args: ['--stdio'] },
      remote: { type: 'http', url: 'https://example.invalid/mcp' },
      runtime: { type: 'stdio', command: 'builtin:code-intelligence', args: ['start-mcp-server'] },
      node: { type: 'stdio', command: 'node', args: ['server.js'] },
    });
    expect(launches.map((l) => [l.server, l.runner, l.name, l.version])).toEqual([
      ['scoped', 'npx', '@scope/server', '1.2.3'],
      ['npm', 'npx', 'plain-server', '4.5.6'],
      ['python', 'uvx', 'py-server', '7.8.9'],
    ]);
  });

  it('an entry whose package cannot be read from its launch fails rather than being skipped', () => {
    const { launches, errors } = defaultLaunches({ odd: { type: 'stdio', command: 'uvx', args: ['--with-requirements', 'reqs.txt', 'tool'] } });
    expect(launches).toEqual([]);
    expect(errors).toEqual([expect.stringContaining('cannot tell which package the built-in default "odd" launches')]);
    expect(errors[0]).toContain(DEFAULT_CONFIGURATION_LOCATION);
  });
});

describe('the package specifications a launch names', () => {
  it('npx: the first positional after its options, or the --package values', () => {
    expect(packageSpecs('npx', ['-y', '@playwright/mcp@0.0.80', '--headless'])).toEqual({ specs: ['@playwright/mcp@0.0.80'] });
    expect(packageSpecs('npx', ['--yes', '--registry=https://r.invalid', 'server@1.0.0'])).toEqual({ specs: ['server@1.0.0'] });
    expect(packageSpecs('npx', ['-y', '--package', 'a@1.0.0', '-p', 'b@2.0.0', 'a-bin'])).toEqual({ specs: ['a@1.0.0', 'b@2.0.0'] });
    expect(packageSpecs('npx', ['--', 'server@1.0.0', '--x'])).toEqual({ specs: ['server@1.0.0'] });
  });

  it('uvx: the first positional, or --from, plus every --with', () => {
    expect(packageSpecs('uvx', ['mcp-server==1.2.3', '--stdio'])).toEqual({ specs: ['mcp-server==1.2.3'] });
    expect(packageSpecs('uvx', ['--python', '3.12', '--from', 'pkg==1.0.0', 'pkg-cli'])).toEqual({ specs: ['pkg==1.0.0'] });
    expect(packageSpecs('uvx', ['--with', 'a==1.0.0,b==2.0.0', 'tool==3.0.0'])).toEqual({ specs: ['tool==3.0.0', 'a==1.0.0', 'b==2.0.0'] });
  });

  it('refuses an option it does not know, and a launch that names no package', () => {
    expect(packageSpecs('npx', ['--surprise', 'x@1.0.0'])).toEqual({ problem: expect.stringContaining('"--surprise"') });
    expect(packageSpecs('npx', ['-y'])).toEqual({ problem: 'npx is given no package to run' });
    expect(packageSpecs('npx', ['-c', 'echo hi'])).toEqual({ problem: expect.stringContaining('"-c"') });
  });

  it('splits a specification at == or at the last @, keeping the name exactly as written', () => {
    expect(splitPackageSpec('@playwright/mcp@0.0.80')).toEqual({ name: '@playwright/mcp', version: '0.0.80' });
    expect(splitPackageSpec('@scope/unversioned')).toEqual({ name: '@scope/unversioned', version: null });
    expect(splitPackageSpec('Pyright==1.1.403')).toEqual({ name: 'Pyright', version: '1.1.403' });
    expect(splitPackageSpec('tool@latest')).toEqual({ name: 'tool', version: 'latest' });
  });
});

describe('reading the setup manifest — REQ-STARTUP-059\'s discipline', () => {
  it('a complete version string has three numbers and no range, alias or floating tag', () => {
    for (const v of ['0.0.80', '1.1.403', '1.2.3-beta.1', '1.2.3rc1', '1.2.3+local']) expect(isCompleteVersion(v), v).toBe(true);
    for (const v of ['^1.2.3', '~1.2.3', '1.2', '1.x', 'latest', '>=1.0.0', '1.2.3 || 2.0.0', 'npm:x@1.2.3', '', 'v1.2.3']) expect(isCompleteVersion(v), v).toBe(false);
  });

  it('decides a long mistyped qualifier at once rather than backtracking (the stage must exit, not hang)', () => {
    // The first pattern took ~0.4 s at 26 characters and quadrupled every two more; a commit hash is 40.
    const typo = `1.2.3+${'a'.repeat(64)}!`;
    const started = performance.now();
    expect(isCompleteVersion(typo)).toBe(false);
    expect(isCompleteVersion(`1.2.3+${'a'.repeat(64)}`)).toBe(true);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('an unreadable manifest — missing, not JSON, the wrong schema, no list — is reported as unreadable', () => {
    const missing = mkdtempSync(join(tmpdir(), 'release-guard-'));
    scratch.push(missing);
    expect(readSetupManifest(missing)).toEqual({ readable: false, reason: 'no such file' });
    expect(readSetupManifest(manifestRepo('{ nope'))).toMatchObject({ readable: false });
    expect(readSetupManifest(manifestRepo({ schemaVersion: 2, toolServerPackages: [] }))).toEqual({ readable: false, reason: 'its "schemaVersion" is 2, not 1' });
    expect(readSetupManifest(manifestRepo({ schemaVersion: 1 }))).toEqual({ readable: false, reason: 'it has no "toolServerPackages" list' });
  });

  it('a listed version that is not a pin, a malformed entry and a package listed twice each fail', () => {
    const reading = readSetupManifest(manifestRepo({ schemaVersion: 1, toolServerPackages: [
      { name: 'a', version: '^1.0.0' }, { name: 'b' }, { name: 'c', version: '1.0.0' }, { name: 'c', version: '1.0.1' },
    ] }));
    expect(reading.readable).toBe(true);
    const errors = reading.readable ? reading.errors : [];
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain('pins "a" to "^1.0.0", which is not a complete version string');
    expect(errors[1]).toContain('toolServerPackages[1] is not a { "name", "version" } pair');
    expect(errors[2]).toContain('lists "c" 2 times (toolServerPackages[2] = "1.0.0", toolServerPackages[3] = "1.0.1")');
  });
});

describe('the pin half — REQ-STARTUP-059', () => {
  const read = (manifest: unknown): ManifestReading => readSetupManifest(manifestRepo(manifest));

  it('passes when every default package is pinned at the same string', () => {
    expect(pinDisagreements([BROWSER], read(pinned(['@playwright/mcp', '0.0.80'], ['unrelated', '1.0.0'])))).toEqual([]);
  });

  it('an unpinned default names the package, its version, the absence on the manifest side, and both locations', () => {
    const [error, ...rest] = pinDisagreements([BROWSER], read(pinned(['other', '1.0.0'])));
    expect(rest).toEqual([]);
    expect(error).toMatch(/^error: "@playwright\/mcp" is launched by the built-in default configuration and not pinned by the setup manifest/);
    expect(error).toContain(`"0.0.80" — ${DEFAULT_CONFIGURATION_LOCATION}, server "browser" launches \`npx -y @playwright/mcp@0.0.80 --headless\``);
    expect(error).toContain(`no version — ${SETUP_MANIFEST_LOCATION}, toolServerPackages lists no "@playwright/mcp"`);
  });

  it('a disagreeing pair names both strings and both locations, compared with no case folding or range reading', () => {
    for (const version of ['0.0.79', '0.0.80 ', '^0.0.80']) {
      const errors = pinDisagreements([BROWSER], read(pinned(['@playwright/mcp', version])));
      const pair = errors.find((e) => e.includes('disagree'))!;
      expect(pair, version).toContain(`"0.0.80" — ${DEFAULT_CONFIGURATION_LOCATION}`);
      expect(pair, version).toContain(`${JSON.stringify(version)} — ${SETUP_MANIFEST_LOCATION}, toolServerPackages[0]`);
    }
    expect(pinDisagreements([{ ...BROWSER, name: '@Playwright/mcp' }], read(pinned(['@playwright/mcp', '0.0.80'])))).toEqual([expect.stringContaining('not pinned')]);
  });

  it('a default that pins no version disagrees with any manifest pin', () => {
    const errors = pinDisagreements([{ ...BROWSER, version: null, launch: 'npx -y @playwright/mcp' }], read(pinned(['@playwright/mcp', '0.0.80'])));
    expect(errors).toEqual([expect.stringMatching(/disagree[\s\S]*no version — packages\/config[\s\S]*"0\.0\.80" — apps\/desktop/)]);
  });

  it('an unreadable manifest fails the stage, and still names every default package it would have had to pin', () => {
    const missing = mkdtempSync(join(tmpdir(), 'release-guard-'));
    scratch.push(missing);
    const errors = pinDisagreements([BROWSER], readSetupManifest(missing));
    expect(errors).toHaveLength(2);
    expect(errors[0]).toBe(`error: the setup manifest could not be read, so no default package's pin can be checked (REQ-STARTUP-059) — ${SETUP_MANIFEST_LOCATION}: no such file`);
    expect(errors[1]).toContain(`no version — ${SETUP_MANIFEST_LOCATION} could not be read`);
  });
});
