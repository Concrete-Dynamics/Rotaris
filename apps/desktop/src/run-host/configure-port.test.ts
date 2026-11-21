/**
 * PD-CONFIG-014: the run host's side of `configure` — reads from the saved files, writes only by asking main.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProcessReply, ServiceAsk } from '@rotaris/contracts';
import { configurationPort } from './configure-port.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function scope(): { globalDir: string; workspaceRoot: string } {
  const base = mkdtempSync(join(tmpdir(), 'rotaris-configure-port-'));
  dirs.push(base);
  const globalDir = join(base, 'config');
  const workspaceRoot = join(base, 'ws');
  mkdirSync(globalDir, { recursive: true });
  mkdirSync(join(workspaceRoot, '.rotaris'), { recursive: true });
  return { globalDir, workspaceRoot };
}

describe('configurationPort (PD-CONFIG-014)', () => {
  it('reads the effective value and the file that states it, and a value no file states as a default', () => {
    const s = scope();
    writeFileSync(join(s.workspaceRoot, '.rotaris', 'agents.yaml'), 'runtime:\n  max_iterations: 17\n');
    const port = configurationPort({ ...s, ask: () => Promise.reject(new Error('unused')), reload: () => undefined, log: () => undefined, env: {} });
    expect(port.read('runtime.max_iterations')).toMatchObject({ value: 17, scope: 'workspace', file: join(s.workspaceRoot, '.rotaris', 'agents.yaml') });
    expect(port.read('runtime.max_depth')).toMatchObject({ scope: 'default', file: null });
  });

  it('writes nothing itself: it asks main, and reloads the cached resolution after a tool-server write', async () => {
    const s = scope();
    const asked: ServiceAsk[] = [];
    const reloaded: string[] = [];
    const ask = (request: ServiceAsk): Promise<ProcessReply> => {
      asked.push(request);
      return Promise.resolve({ kind: 'config.agentWritten', file: '/f', scope: 'workspace', key: (request as { key: string }).key, stated: false, snapshot: {} as never } as ProcessReply);
    };
    const port = configurationPort({ ...s, ask, reload: (r) => { reloaded.push(r); }, log: () => undefined, env: {} });
    expect(await port.write('medium_model', 'workspace', 'x')).toMatchObject({ ok: true, file: '/f', stated: false });
    expect(asked).toEqual([{ kind: 'config.agentWrite', workspaceRoot: s.workspaceRoot, scope: 'workspace', key: 'medium_model', value: 'x' }]);
    expect(reloaded).toEqual([]);
    await port.write('mcp_servers.browser.enabled', 'workspace', true);
    expect(reloaded).toEqual([s.workspaceRoot]);
    expect(() => readFileSync(join(s.workspaceRoot, '.rotaris', 'agents.yaml'))).toThrow();
  });

  it('turns a refusal or a lost answer into an error', async () => {
    const s = scope();
    const refused = configurationPort({ ...s, ask: () => Promise.resolve({ kind: 'refused', code: 'config.invalid', headline: 'The setting could not be written', detail: 'bad' }), reload: () => undefined, log: () => undefined, env: {} });
    expect(await refused.write('medium_model', 'workspace', 'x')).toEqual({ ok: false, error: 'The setting could not be written — bad' });
    const lost = configurationPort({ ...s, ask: () => Promise.reject(new Error('main did not answer')), reload: () => undefined, log: () => undefined, env: {} });
    expect(await lost.write('medium_model', 'workspace', 'x')).toMatchObject({ ok: false });
  });
});
