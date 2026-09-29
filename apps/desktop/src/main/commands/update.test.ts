import { describe, expect, it } from 'vitest';
import type { CommandAt } from './context.js';
import { updateCommands } from './update.js';
import type { Updater } from '../updater/updater.js';

const at = { w: { wcId: 1 } } as unknown as CommandAt;

describe('the update commands — REQ-STARTUP-116, REQ-STARTUP-120, REQ-STARTUP-121', () => {
  it('relay `update.install` and `update.restart` to the updater and answer with its outcome, naming nothing themselves', async () => {
    const calls: string[] = [];
    const updater = {
      install: async () => { calls.push('install'); return { ok: true as const, value: { outcome: 'replaced' } }; },
      restart: async () => { calls.push('restart'); return { ok: false as const, code: 'update.notApplied', headline: 'No installed update to restart into' }; },
    } as unknown as Updater;
    const handlers = updateCommands({ updater });
    expect(await handlers['update.install']({ kind: 'update.install' }, at)).toEqual({ ok: true, value: { outcome: 'replaced' } });
    expect(await handlers['update.restart']({ kind: 'update.restart' }, at)).toMatchObject({ ok: false, code: 'update.notApplied' });
    expect(calls).toEqual(['install', 'restart']);
  });
});
