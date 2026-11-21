import { describe, expect, it } from 'vitest';
import { type OnboardingView, type ProviderRow } from '@rotaris/contracts';
import { createOnboarding } from '../onboarding.js';
import { onboardingCommands } from './onboarding.js';

type Slice = Parameters<typeof onboardingCommands>[0];
type At = Parameters<ReturnType<typeof onboardingCommands>['onboarding.read']>[1];

function facet(options: { workspace?: string; remembered?: string; rows?: readonly Partial<ProviderRow>[]; state?: 'started' | 'done' } = {}) {
  let state = options.state;
  const raised: string[] = [];
  const chosen: { senderId: number; useCurrent: boolean }[] = [];
  const onboarding = createOnboarding({ readState: () => state, writeState: async (next) => { state = next; }, log: () => undefined });
  onboarding.begin(true);
  const handlers = onboardingCommands({
    log: () => undefined,
    firstLaunchSetup: onboarding,
    preferences: { read: (key: string) => (key === 'workspace/lastOpened' ? options.remembered : undefined) },
    providerChoices: () => [],
    providerRows: () => (options.rows ?? []) as ProviderRow[],
    raiseNoProviderNotice: () => { raised.push('no-provider'); },
    mainWindows: { chooseForSetup: async (senderId: number, o: { useCurrent: boolean }) => { chosen.push({ senderId, useCurrent: o.useCurrent }); return { ok: true }; } },
  } as unknown as Slice);
  const at = { senderId: 7, w: { workspace: options.workspace ?? '(no workspace)' } } as unknown as At;
  return { handlers, at, raised, chosen, state: () => state };
}

describe('the first-launch setup\'s commands (PD-WORKSPACE-010)', () => {
  it('reads a first launch as owed with no project chosen: the folder it opened on was never remembered', async () => {
    const f = facet({ workspace: '/home/a/started-here' });
    const r = await f.handlers['onboarding.read']({ kind: 'onboarding.read' }, f.at);
    expect(r.ok && (r.value as OnboardingView)).toMatchObject({ owed: true, project: { chosen: false, path: '/home/a/started-here' }, providers: { authenticated: [] } });
  });

  it('reads the project as chosen once the window\'s folder is the remembered one, and names only authenticated providers', async () => {
    const f = facet({ workspace: '/home/a/project', remembered: '/home/a/project', rows: [{ id: 'deepseek', displayName: 'DeepSeek', authenticated: true, modelCount: 2 }, { id: 'copilot', displayName: 'GitHub Copilot', authenticated: false, modelCount: 0 }] });
    const r = await f.handlers['onboarding.read']({ kind: 'onboarding.read' }, f.at);
    const view = r.ok ? r.value as OnboardingView : null;
    expect(view?.project.chosen).toBe(true);
    expect(view?.providers.authenticated).toEqual([{ id: 'deepseek', displayName: 'DeepSeek', modelCount: 2 }]);
  });

  it('reads no project where the window has no workspace open', async () => {
    const f = facet({ remembered: '/home/a/project' });
    const r = await f.handlers['onboarding.read']({ kind: 'onboarding.read' }, f.at);
    expect(r.ok && (r.value as OnboardingView).project).toEqual({ chosen: false, path: null, currentIsRepository: false });
  });

  it('asks the window that sent it for the project, and names no folder itself', async () => {
    const f = facet();
    await f.handlers['onboarding.chooseProject']({ kind: 'onboarding.chooseProject', useCurrent: true }, f.at);
    await f.handlers['onboarding.chooseProject']({ kind: 'onboarding.chooseProject' }, f.at);
    expect(f.chosen).toEqual([{ senderId: 7, useCurrent: true }, { senderId: 7, useCurrent: false }]);
  });

  it('ends the setup once, stores it, and only then lets the no-provider notice be raised', async () => {
    const f = facet();
    const first = await f.handlers['onboarding.finish']({ kind: 'onboarding.finish', outcome: 'skipped' }, f.at);
    expect(first).toEqual({ ok: true, value: { ended: true } });
    expect(f.state()).toBe('done');
    expect(f.raised).toEqual(['no-provider']);
    const second = await f.handlers['onboarding.finish']({ kind: 'onboarding.finish', outcome: 'completed' }, f.at);
    expect(second).toEqual({ ok: true, value: { ended: false } });
    expect(f.raised).toEqual(['no-provider']);
  });
});
