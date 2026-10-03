import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapConfigFile, commitConfigFields, readInitializationState, recordPatch, scopeFiles, starterDocument } from '@rotaris/config';
import { nodeClocks } from '@rotaris/platform';
import { serviceMarkerWriter, type MarkerServiceRequest } from './initialization.js';

/**
 * REQ-WORKSPACE-040: "when no `agents.yaml` exists, the minimal bootstrap file SHALL be written first" — for the writer of
 * the persisted initialization state. `docs/defects/fixed/a-first-run-workspace-never-gets-the-starter-agents-yaml.md`:
 * main's marker writer went straight to the per-field path (`config.setField`), which never bootstraps (REQ-CONFIG-030),
 * so a first record created the file without the starter. The service here answers the two requests the way the
 * workspace service does, over the real writers.
 */
const dirs: string[] = [];
const tmp = (): string => { const d = mkdtempSync(join(tmpdir(), 'rotaris-marker-writer-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function service(configDir: string): { asked: string[]; ask: (root: string, request: MarkerServiceRequest) => Promise<{ kind: string; headline?: string }> } {
  const asked: string[] = [];
  return {
    asked,
    ask: async (root, request) => {
      asked.push(request.kind);
      if (request.kind === 'config.bootstrap') {
        const r = bootstrapConfigFile(scopeFiles(configDir, root).workspace.agents);
        return r.ok ? { kind: 'config.snapshot' } : { kind: 'refused', headline: 'The starter configuration could not be written' };
      }
      const r = await commitConfigFields(configDir, root, request.scope, request.patch, nodeClocks().timers);
      return r.ok ? { kind: 'config.snapshot' } : { kind: 'refused', headline: 'The setting could not be written' };
    },
  };
}

function workspace(): { configDir: string; root: string; agents: string } {
  const configDir = join(tmp(), 'config');
  const root = join(tmp(), 'ws');
  mkdirSync(configDir, { recursive: true });
  mkdirSync(root, { recursive: true });
  return { configDir, root, agents: join(root, '.rotaris', 'agents.yaml') };
}

const PATCH = recordPatch({ completed: [], skipped: [], lastRun: null, classification: null }, [{ id: 'code-intelligence-setup', outcome: 'completed' }], 'non-code', '2026-10-03T04:58:42.726Z');

describe("the initialization marker's writer (REQ-WORKSPACE-040, REQ-WORKSPACE-085)", () => {
  it('a record into a missing file writes the starter first, then the record, and the starter survives it', async () => {
    const w = workspace();
    const svc = service(w.configDir);
    expect(await serviceMarkerWriter(svc.ask)(w.root, PATCH)).toEqual({ ok: true });
    expect(svc.asked).toEqual(['config.bootstrap', 'config.setField']);
    const text = readFileSync(w.agents, 'utf8');
    expect(text.startsWith(starterDocument())).toBe(true);
    expect(readInitializationState(w.agents)).toMatchObject({ completed: ['code-intelligence-setup'], classification: 'non-code' });
  });

  it("a file that exists is never bootstrapped over: the record lands beside the user's own keys (REQ-CONFIG-026, REQ-WORKSPACE-079)", async () => {
    const w = workspace();
    mkdirSync(join(w.root, '.rotaris'));
    writeFileSync(w.agents, '# mine\ndefault_persona: coder\n');
    expect(await serviceMarkerWriter(service(w.configDir).ask)(w.root, PATCH)).toEqual({ ok: true });
    const text = readFileSync(w.agents, 'utf8');
    expect(text.startsWith('# mine\ndefault_persona: coder\n')).toBe(true);
    expect(text).not.toContain('large_model: null');
    expect(text).toContain('initialization:');
  });

  it('a bootstrap that fails does not stop the record; a refused record is reported in its own words', async () => {
    const calls: string[] = [];
    const writer = serviceMarkerWriter(async (_root, request) => {
      calls.push(request.kind);
      if (request.kind === 'config.bootstrap') throw new Error('main did not answer config.bootstrap within 30000 ms');
      return { kind: 'refused', headline: 'The setting could not be written' };
    });
    expect(await writer('/ws', PATCH)).toEqual({ ok: false, reason: 'The setting could not be written' });
    expect(calls).toEqual(['config.bootstrap', 'config.setField']);
  });

  it('with no service running, the record fails as before, naming why', async () => {
    expect(await serviceMarkerWriter(async () => null)('/ws', PATCH)).toEqual({ ok: false, reason: 'the workspace service is not running' });
  });

  it("main's coordinator is given this writer", () => {
    const main = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8');
    expect(main).toMatch(/writeMarker: serviceMarkerWriter\(/);
    expect(main).not.toMatch(/writeMarker: async \(root, patch\)/);
  });
});
