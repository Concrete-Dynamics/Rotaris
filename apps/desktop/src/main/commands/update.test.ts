import { describe, expect, it } from 'vitest';
import { UpdateStateSchema } from '@rotaris/contracts';
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

  it('relay `update.cancel` to the updater, and answer `update.state` with channel 17\'s payload as it stands (REQ-STARTUP-170, PD-SHELL-018)', async () => {
    const state = { phase: 'downloading', version: '0.2.0', measured: '41%', noticeId: 3 } as const;
    const updater = {
      cancel: async () => ({ ok: true as const, value: { cancelled: true, ended: true } }),
      updateState: () => state,
    } as unknown as Updater;
    const handlers = updateCommands({ updater });
    expect(await handlers['update.cancel']({ kind: 'update.cancel' }, at)).toEqual({ ok: true, value: { cancelled: true, ended: true } });
    expect(await handlers['update.state']({ kind: 'update.state' }, at)).toEqual({ ok: true, value: state });
    expect(UpdateStateSchema.safeParse(state).success).toBe(true);
  });
});
