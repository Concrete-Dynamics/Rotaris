import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SHIPPED_MCP_SERVERS } from '@rotaris/config';
import { guardCommandLine, runGuard, USAGE } from './guard.js';
import { SETUP_MANIFEST_LOCATION } from './pins.js';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const CLI = join(REPO, 'tools', 'release-guard', 'cli.mjs');
const scratch: string[] = [];
afterEach(() => { for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }); });

/** A repository declaring `version` and shipping `manifest` (none when null). */
function repo(version: string, manifest: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'release-guard-'));
  scratch.push(root);
  const files: Record<string, string> = { 'apps/desktop/package.json': JSON.stringify({ name: '@rotaris/desktop', version }) };
  if (manifest !== null) files[SETUP_MANIFEST_LOCATION] = JSON.stringify(manifest);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}
const AGREEING = { schemaVersion: 1, toolServerPackages: [{ name: '@playwright/mcp', version: '0.0.80' }] };

describe('the pre-build guard stage — REQ-STARTUP-028 over the shipped defaults', () => {
  it('passes a tag whose version the build declares, with every default package pinned', () => {
    const outcome = runGuard({ tag: 'v0.1.0', repoRoot: repo('0.1.0', AGREEING), servers: SHIPPED_MCP_SERVERS });
    expect(outcome).toMatchObject({ code: 0, errors: [] });
    expect(outcome.summary).toEqual([
      'version: tag v0.1.0 is stable version 0.1.0, which apps/desktop/package.json ("version") declares',
      `package pins: @playwright/mcp 0.0.80 (server "browser") — ${SETUP_MANIFEST_LOCATION} agrees`,
    ]);
    expect(runGuard({ tag: 'v0.1.0rc1', repoRoot: repo('0.1.0rc1', AGREEING), servers: SHIPPED_MCP_SERVERS }).code).toBe(0);
  });

  it('a version mismatch fails with exit code 1, whatever the pins say', () => {
    const outcome = runGuard({ tag: 'v0.2.0', repoRoot: repo('0.1.0', AGREEING), servers: SHIPPED_MCP_SERVERS });
    expect(outcome.code).toBe(1);
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0]).toContain('tag v0.2.0 is version 0.2.0');
  });

  it('a malformed tag fails naming the tag and the expected shape, and the pin half still reports in the same run', () => {
    const outcome = runGuard({ tag: 'v1.2.3-rc1', repoRoot: repo('1.2.3', null), servers: SHIPPED_MCP_SERVERS });
    expect(outcome.code).toBe(1);
    expect(outcome.errors[0]).toMatch(/^error: "v1\.2\.3-rc1" is not a release tag: expected v<major>\.<minor>\.<patch>, optionally followed by a prerelease suffix/);
    expect(outcome.errors.slice(1).join('\n')).toContain('the setup manifest could not be read');
  });

  it('a pin disagreement alone fails the same stage with the same exit code', () => {
    const outcome = runGuard({ tag: 'v0.1.0', repoRoot: repo('0.1.0', { schemaVersion: 1, toolServerPackages: [{ name: '@playwright/mcp', version: '0.0.81' }] }), servers: SHIPPED_MCP_SERVERS });
    expect(outcome.code).toBe(1);
    expect(outcome.errors).toEqual([expect.stringContaining('"@playwright/mcp"\'s version disagree')]);
  });
});

describe('the command line — REQ-STARTUP-149\'s exit codes', () => {
  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, streams: { out: (t: string) => { out.push(t); }, err: (t: string) => { err.push(t); } } };
  };

  it('anything but exactly one tag is a usage error: exit 2, error: on stderr, and the usage line', () => {
    for (const argv of [[], ['v0.1.0', 'v0.2.0'], ['--help'], ['--'], ['--', '--', 'v0.1.0']]) {
      const { out, err, streams } = io();
      expect(guardCommandLine(argv, REPO, streams), JSON.stringify(argv)).toBe(2);
      expect(out).toEqual([]);
      expect(err.join('')).toMatch(/^error: expected exactly one argument, the release tag/);
      expect(err.join('')).toContain(USAGE);
    }
  });

  it('a single leading -- is pnpm\'s separator, not an argument: `pnpm release:guard -- <tag>` checks the tag', () => {
    const { err, streams } = io();
    expect(guardCommandLine(['--', 'v99.0.0'], REPO, streams)).toBe(1);
    expect(err.join('')).toContain('tag v99.0.0 is version 99.0.0');
  });

  it('the script itself boots, reads this repository and exits 1 on a tag this build does not declare', () => {
    const declared = (JSON.parse(readFileSync(join(REPO, 'apps', 'desktop', 'package.json'), 'utf8')) as { version: string }).version;
    const r = spawnSync(process.execPath, [CLI, 'v99.0.0'], { cwd: REPO, encoding: 'utf8', timeout: 60_000 });
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain('tag v99.0.0 is version 99.0.0');
    expect(r.stderr).toMatch(new RegExp(`apps/desktop/package\\.json \\("version"\\)\\s+"${declared.replaceAll('.', '\\.')}"\\s+← differs`));
    expect(r.stderr).toContain('server "browser" launches `npx -y @playwright/mcp@0.0.80 --headless`');
  });

  it('the script finds no version disagreement for the version this repository declares', () => {
    const declared = (JSON.parse(readFileSync(join(REPO, 'apps', 'desktop', 'package.json'), 'utf8')) as { version: string }).version;
    const r = spawnSync(process.execPath, [CLI, `v${declared}`], { cwd: REPO, encoding: 'utf8', timeout: 60_000 });
    // Exit 0 once the setup manifest exists; until then 1 on the pin half alone (ADR-0054's §4.1 note).
    expect([0, 1], r.stderr).toContain(r.status);
    expect(r.stderr).not.toContain('disagree on the product version');
    expect(spawnSync(process.execPath, [CLI], { cwd: REPO, encoding: 'utf8', timeout: 60_000 }).status).toBe(2);
  });
});
