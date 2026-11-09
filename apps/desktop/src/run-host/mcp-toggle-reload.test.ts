import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitConfigFields, loadConfiguration, type LoadedConfiguration } from '@rotaris/config';
import { FakeClock } from '@rotaris/kernel';
import { McpHost } from './mcp.js';
import { reloadWorkspaceConfiguration } from './mcp-reload.js';

/**
 * PD-CONFIG-006, the ON direction (REQ-CONFIG-417 as narrowed, with REQ-CONFIG-441, REQ-MCP-094 and REQ-MCP-115):
 * a press on an AVAILABLE row whose configured value is `false` must really make the row enabled — the scoped
 * per-field write persists `mcp_servers.<name>.enabled: true`, and the run host's cached resolution of that
 * workspace is dropped and read again, so the listing (which reads `configuredFor`) reports the file.
 *
 * The chain driven here is the product's, minus the transports: the real writer (`commitConfigFields`, the path
 * main → workspace service takes), the real loader, the run host's real `McpHost.list`, and the reload the run host
 * performs (`reloadWorkspaceConfiguration` — the same call `dispatch`'s `mcp.reload` makes inside `createRunHost`,
 * which needs a utility process's parent port and is not reachable from a unit test).
 *
 * The counterfactuals that make this a regression test rather than a demonstration, each carried by a DIFFERENT case
 * (measured by mutation 2026-11-09, not read off the intent):
 *   - remove the WRITE (`commitConfigFields`) and the row stays off after the reload — the `control: without the
 *     write…` case, and the ON assertion of the main case;
 *   - remove the INVALIDATION (`configured.delete`) and the failure-ordering case goes red — `a reload whose file no
 *     longer loads leaves no cached resolution`; the MAIN case is NOT what catches it, because the reload re-configures
 *     and re-sets the cache, so only the ordering (drop BEFORE the re-configure) is observable there;
 *   - the main case additionally pins the absence of the whole reload hop: without any reload the listing still serves
 *     the pre-write resolution although the file reads `true` (explicit stale-cache assertion) — the false green.
 */
const scratchDirs: string[] = [];
function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}
afterEach(() => { for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); });

/** The workspace's own file: a comment, an unrelated key, and the configured-off row this defect is about. */
const AGENTS = `# the workspace's own file — a comment the writer must keep.
runtime:
  max_depth: 3
mcp_servers:
  browser:
    type: stdio
    command: npx
    args: ['-y', '@playwright/mcp@0.0.80', '--headless']
    enabled: false
`;

function workspace(): string {
  const ws = join(scratchDir('rotaris-toggle-'), 'ws');
  mkdirSync(join(ws, '.rotaris'), { recursive: true });
  writeFileSync(join(ws, '.rotaris', 'agents.yaml'), AGENTS);
  return ws;
}

/**
 * What the run host's `configure` does for one workspace: the real loader, and the write of the cached resolution
 * that `host.ts` performs on success.
 */
const configureInto = (configured: Map<string, { cfg: LoadedConfiguration }>, globalDir: string, home: string) => (root: string) => {
  const loaded = loadConfiguration({ globalDir, workspaceRoot: root, env: {}, home, keepIgnored: false, onPath: () => true });
  if (!loaded.ok) return { ok: false as const, error: { reason: 'the configuration could not be loaded' } };
  const value = { cfg: loaded.value };
  configured.set(root, value);
  return { ok: true as const, value };
};

const loadFrom = (globalDir: string, home: string, ws: string) => loadConfiguration({ globalDir, workspaceRoot: ws, env: {}, home, keepIgnored: false, onPath: () => true });

const newHost = (): McpHost => new McpHost({ clocks: new FakeClock(), log: () => undefined, acknowledge: () => undefined, parentEnv: {}, productVersion: '0.0.0' });
const rowOf = (mcp: McpHost, cfg: LoadedConfiguration, name: string) => mcp.list(cfg).rows.find((r) => r.name === name)!;
const patch = { mcp_servers: { browser: { enabled: true } } };

describe('PD-CONFIG-006 — an ON press on a configured-off, available row is durable', () => {
  it('the write persists enabled: true, the reload serves it, and no comment or unrelated key is lost', async () => {
    const globalDir = scratchDir('rotaris-toggle-cfg-');
    const home = scratchDir('rotaris-toggle-home-');
    const ws = workspace();
    const configured = new Map<string, { cfg: LoadedConfiguration }>();
    const configure = configureInto(configured, globalDir, home);
    const mcp = newHost();

    // 1. The cached resolution, as a run start or an earlier listing left it: configured off, available.
    expect(configure(ws).ok).toBe(true);
    expect(rowOf(mcp, configured.get(ws)!.cfg, 'browser')).toMatchObject({ enabled: false, overridden: false, available: true });

    // 2. The press: the scoped per-field write, exactly as main's `config.setField` performs it.
    const written = await commitConfigFields(globalDir, ws, undefined, patch, new FakeClock().timers);
    expect(written.ok).toBe(true);
    const afterWrite = readFileSync(join(ws, '.rotaris', 'agents.yaml'), 'utf8');
    // (c) nothing else moved: the comment, the unrelated key and the entry's other fields are still there.
    expect(afterWrite).toContain('# the workspace\'s own file');
    expect(afterWrite).toContain('max_depth: 3');
    expect(afterWrite).toContain('@playwright/mcp@0.0.80');
    expect(afterWrite.match(/enabled:/g)).toHaveLength(1);

    // (a) the file itself now reads enabled: true, through the product's own loader.
    const fromFile = loadFrom(globalDir, home, ws);
    expect(fromFile.ok && fromFile.value.mcp.servers['browser']!.entry.enabled).toBe(true);

    // A stale cache is what a listing would serve with no reload at all: the write changed the FILE, and the
    // resolution the listing reads (`configured`) still holds the value from before it — the reload is load-bearing.
    expect(rowOf(mcp, configured.get(ws)!.cfg, 'browser').enabled).toBe(false);

    // 3. The reload main asks for (`mcp.reload`): drops the cache and resolves the file again.
    expect(reloadWorkspaceConfiguration(configured, configure, ws)).toEqual({ ok: true });
    // (b) the resolved configuration the listing reads now reports it enabled.
    expect(rowOf(mcp, configured.get(ws)!.cfg, 'browser')).toMatchObject({ enabled: true, overridden: false, available: true });

    // The reload writes nothing: the run host never touches the file, and it is byte for byte what the write left.
    expect(readFileSync(join(ws, '.rotaris', 'agents.yaml'), 'utf8')).toBe(afterWrite);
  });

  it('control: without the write the row stays off, so the ON assertion fails for exactly one reason', () => {
    const globalDir = scratchDir('rotaris-toggle-cfg-');
    const home = scratchDir('rotaris-toggle-home-');
    const ws = workspace();
    const configured = new Map<string, { cfg: LoadedConfiguration }>();
    const configure = configureInto(configured, globalDir, home);
    const mcp = newHost();
    expect(configure(ws).ok).toBe(true);

    // No `commitConfigFields`: the reload can only re-read what the file still says.
    expect(reloadWorkspaceConfiguration(configured, configure, ws)).toEqual({ ok: true });
    expect(rowOf(mcp, configured.get(ws)!.cfg, 'browser').enabled).toBe(false);
  });

  /**
   * The invalidation's own effect, where it is the only thing that can carry it: the cached resolution is dropped
   * BEFORE the re-configure, so a reload whose file no longer loads leaves no entry behind — the next listing
   * attempts a fresh read (and fails the same way, `mcp.configuration`) rather than serving a resolution taken
   * before the edit. Remove the `configured.delete` and this case is red: the stale entry survives the failure.
   */
  it('a reload whose file no longer loads leaves no cached resolution (the invalidation is load-bearing)', () => {
    const globalDir = scratchDir('rotaris-toggle-cfg-');
    const home = scratchDir('rotaris-toggle-home-');
    const ws = workspace();
    const configured = new Map<string, { cfg: LoadedConfiguration }>();
    const configure = configureInto(configured, globalDir, home);
    expect(configure(ws).ok).toBe(true);
    expect(configured.has(ws)).toBe(true);

    // The file stops loading (a hand edit, or a write racing a save) between the write and the reload.
    writeFileSync(join(ws, '.rotaris', 'agents.yaml'), 'runtime:\n  max_depth: not-a-number\n');
    const r = reloadWorkspaceConfiguration(configured, configure, ws);
    expect(r.ok).toBe(false);
    expect(configured.has(ws)).toBe(false);
  });

  it('the writer is deterministic: two identical runs leave sha256-identical files', async () => {
    const run = async (): Promise<string> => {
      const globalDir = scratchDir('rotaris-toggle-cfg-');
      const ws = workspace();
      const r = await commitConfigFields(globalDir, ws, undefined, patch, new FakeClock().timers);
      expect(r.ok).toBe(true);
      return createHash('sha256').update(readFileSync(join(ws, '.rotaris', 'agents.yaml'))).digest('hex');
    };
    expect(await run()).toBe(await run());
  });
});
