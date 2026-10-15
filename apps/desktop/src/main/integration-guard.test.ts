import { describe, expect, it } from 'vitest';
import {
  FINISH_INTEGRATION_FIRST,
  integrationAllowsClose,
  integrationDeclinesWorkspaceOpen,
  integrationInProgressBox,
  noWorktreeIntegration,
  type IntegrationInProgressBox,
} from './integration-guard.js';

describe('REQ-SHELL-119 guard (2): a close is refused while a worktree integration is running', () => {
  it('the dialog is informational, titled "Integration in progress", its body the requirement\'s sentence, acknowledgement its only answer', () => {
    expect(integrationInProgressBox()).toEqual({
      type: 'info',
      title: 'Integration in progress',
      message: 'Keep Rotaris open until the isolated worktree integration finishes.',
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
  });

  it('while one runs, the box is shown and the close is refused whatever the answer', async () => {
    const shown: IntegrationInProgressBox[] = [];
    const log: string[] = [];
    const allowed = await integrationAllowsClose({ running: async () => true, show: async (box) => { shown.push(box); return 0; }, log: (m) => log.push(m) });
    expect(allowed).toBe(false);
    expect(shown).toEqual([integrationInProgressBox()]);
    expect(log).toEqual(['close: refused while a worktree integration is running (REQ-SHELL-119 guard 2)']);
  });

  it('a box that cannot be shown still refuses the close, and says so', async () => {
    const log: string[] = [];
    const allowed = await integrationAllowsClose({ running: async () => true, show: async () => { throw new Error('no parent'); }, log: (m) => log.push(m) });
    expect(allowed).toBe(false);
    expect(log[0]).toContain('could not be shown (no parent); the close is refused all the same');
  });

  it('with none running, nothing is shown and the close goes on to guard (3)', async () => {
    const shown: unknown[] = [];
    expect(await integrationAllowsClose({ running: async () => false, show: async (box) => { shown.push(box); return 0; }, log: () => undefined })).toBe(true);
    expect(shown).toEqual([]);
  });

  it('a state that cannot be read counts as an integration running (OQ-361 (c))', async () => {
    const shown: unknown[] = [];
    expect(await integrationAllowsClose({ running: async () => { throw new Error('unreadable'); }, show: async (box) => { shown.push(box); return 0; }, log: () => undefined })).toBe(false);
    expect(shown).toHaveLength(1);
  });
});

describe('REQ-SHELL-021 gate (2), REQ-STARTUP-053 gate (2): the workspace-open flow declines while an integration runs', () => {
  it('declines with the requirement\'s sentence while one runs, and goes on when none does', async () => {
    expect(await integrationDeclinesWorkspaceOpen(async () => true)).toBe('Finish the worktree integration before opening another project.');
    expect(FINISH_INTEGRATION_FIRST).toBe('Finish the worktree integration before opening another project.');
    expect(await integrationDeclinesWorkspaceOpen(async () => false)).toBeNull();
    expect(await integrationDeclinesWorkspaceOpen(async () => { throw new Error('unreadable'); })).toBe(FINISH_INTEGRATION_FIRST);
  });
});

describe('the product reads no integration until one is built (REQ-GIT-083, REQ-GIT-125 to REQ-GIT-135 deferred)', () => {
  it('noWorktreeIntegration answers none running, so the guard is vacuous today', async () => {
    expect(await noWorktreeIntegration()).toBe(false);
  });
});
