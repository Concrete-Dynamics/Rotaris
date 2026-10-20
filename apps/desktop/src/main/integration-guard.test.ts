import { describe, expect, it } from 'vitest';
import {
  FINISH_INTEGRATION_FIRST,
  integrationAllowsClose,
  integrationAllowsUpdate,
  integrationDeclinesWorkspaceOpen,
  integrationInProgressBox,
  noWorktreeIntegration,
  type IntegrationCloseDeps,
  type IntegrationInProgressBox,
} from './integration-guard.js';

/** A close's deps over a reader that records each asking's workspace id (`'none'` for an instance-wide asking). */
function closeDeps(options: {
  readonly running: (workspaceId?: string) => boolean | Promise<boolean>;
  readonly othersStaying?: boolean;
  readonly workspaceId?: string;
  readonly show?: (box: IntegrationInProgressBox) => Promise<unknown>;
}) {
  const asked: string[] = [];
  const shown: IntegrationInProgressBox[] = [];
  const log: string[] = [];
  const warn: string[] = [];
  const deps: IntegrationCloseDeps = {
    othersStaying: () => options.othersStaying ?? false,
    workspaceId: options.workspaceId,
    running: async (workspaceId) => { asked.push(workspaceId ?? 'none'); return options.running(workspaceId); },
    show: options.show ?? (async (box) => { shown.push(box); return 0; }),
    log: (m) => log.push(m),
    warn: (m) => warn.push(m),
  };
  return { deps, asked, shown, log, warn };
}

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
    const h = closeDeps({ running: () => true });
    expect(await integrationAllowsClose(h.deps)).toBe(false);
    expect(h.shown).toEqual([integrationInProgressBox()]);
    expect(h.log).toEqual(['close: refused while a worktree integration is running (REQ-SHELL-119 guard 2)']);
  });

  it('a box that cannot be shown still refuses the close, and says so', async () => {
    const h = closeDeps({ running: () => true, show: async () => { throw new Error('no parent'); } });
    expect(await integrationAllowsClose(h.deps)).toBe(false);
    expect(h.log[0]).toContain('could not be shown (no parent); the close is refused all the same');
  });

  it('with none running, nothing is shown and the close goes on to guard (3)', async () => {
    const h = closeDeps({ running: () => false });
    expect(await integrationAllowsClose(h.deps)).toBe(true);
    expect(h.shown).toEqual([]);
  });
});

/*
 * OQ-361, ruled 2026-10-20 under R-072 (PD-SHELL-009 revision 3): guard (2) counts the closing window's own workspace when
 * another main window stays, and the whole instance at the last window; a record main cannot read refuses no close.
 */
describe('guard (2) counts the closing window\'s own workspace, the last window the instance (OQ-361, PD-SHELL-009 revision 3)', () => {
  it('one of several windows, its own workspace integrating: refused, the box shown once, the reader asked with that id', async () => {
    const h = closeDeps({ othersStaying: true, workspaceId: 'id:a', running: (id) => id === 'id:a' });
    expect(await integrationAllowsClose(h.deps)).toBe(false);
    expect(h.shown).toEqual([integrationInProgressBox()]);
    expect(h.asked).toEqual(['id:a']);
  });

  it('one of several windows, another workspace integrating: allowed, no box', async () => {
    // The reader answers the instance-wide asking true too: an instance-wide guard would refuse this close.
    const h = closeDeps({ othersStaying: true, workspaceId: 'id:b', running: (id) => id === undefined || id === 'id:a' });
    expect(await integrationAllowsClose(h.deps)).toBe(true);
    expect(h.shown).toEqual([]);
    expect(h.asked).toEqual(['id:b']);
  });

  it('one of several windows that holds no workspace: allowed, the reader not asked', async () => {
    const h = closeDeps({ othersStaying: true, running: () => true });
    expect(await integrationAllowsClose(h.deps)).toBe(true);
    expect(h.asked).toEqual([]);
    expect(h.shown).toEqual([]);
  });

  it('the last window: the reader asked with no id, and the close refused while any integration runs', async () => {
    const h = closeDeps({ othersStaying: false, workspaceId: 'id:b', running: (id) => id === undefined || id === 'id:a' });
    expect(await integrationAllowsClose(h.deps)).toBe(false);
    expect(h.asked).toEqual(['none']);
    expect(h.shown).toHaveLength(1);
  });

  it('a record that cannot be read refuses no close: allowed, no box, one warn line', async () => {
    const h = closeDeps({ running: () => { throw new Error('unreadable'); } });
    expect(await integrationAllowsClose(h.deps)).toBe(true);
    expect(h.shown).toEqual([]);
    expect(h.warn).toEqual(['close: the worktree-integration record could not be read (unreadable); the close goes on to guard 3 (REQ-SHELL-119 guard 2, PD-SHELL-009 revision 3)']);
  });

  it('never rejects, even when the reader and the warn line both fail', async () => {
    const h = closeDeps({ running: () => Promise.reject(new Error('gone')) });
    const deps: IntegrationCloseDeps = { ...h.deps, warn: () => { throw new Error('log closed'); } };
    await expect(integrationAllowsClose(deps)).resolves.toBe(true);
  });
});

describe('REQ-SHELL-021 gate (2), REQ-STARTUP-053 gate (2): the workspace-open flow declines while an integration runs', () => {
  it('declines with the requirement\'s sentence while one runs in the requesting window\'s workspace, and goes on when none does', async () => {
    const warn: string[] = [];
    expect(await integrationDeclinesWorkspaceOpen(async () => true, 'id:a', (m) => warn.push(m))).toBe('Finish the worktree integration before opening another project.');
    expect(FINISH_INTEGRATION_FIRST).toBe('Finish the worktree integration before opening another project.');
    expect(await integrationDeclinesWorkspaceOpen(async () => false, 'id:a', (m) => warn.push(m))).toBeNull();
    expect(warn).toEqual([]);
  });

  it('counts the requesting window\'s own workspace: another workspace\'s integration goes on (OQ-361)', async () => {
    const asked: (string | undefined)[] = [];
    const running = async (id?: string) => { asked.push(id); return id === undefined || id === 'id:a'; };
    expect(await integrationDeclinesWorkspaceOpen(running, 'id:a', () => undefined)).toBe(FINISH_INTEGRATION_FIRST);
    expect(await integrationDeclinesWorkspaceOpen(running, 'id:b', () => undefined)).toBeNull();
    expect(asked).toEqual(['id:a', 'id:b']);
  });

  it('a window that holds no workspace passes, the reader not asked (OQ-361)', async () => {
    const asked: (string | undefined)[] = [];
    expect(await integrationDeclinesWorkspaceOpen(async (id) => { asked.push(id); return true; }, undefined, () => undefined)).toBeNull();
    expect(asked).toEqual([]);
  });

  it('a record that cannot be read declines nothing, with one warn line (OQ-361)', async () => {
    const warn: string[] = [];
    expect(await integrationDeclinesWorkspaceOpen(async () => { throw new Error('unreadable'); }, 'id:a', (m) => warn.push(m))).toBeNull();
    expect(warn).toHaveLength(1);
    expect(warn[0]).toContain('could not be read (unreadable)');
    expect(warn[0]).toContain('gate 3');
  });
});

describe('the update\'s closes ask guard (2) for the whole instance (OQ-361 (a), REQ-SHELL-119 guard (2), REQ-NOTIFY-056)', () => {
  function updateDeps(running: (workspaceId?: string) => Promise<boolean>, show?: (box: IntegrationInProgressBox) => Promise<unknown>) {
    const asked: string[] = [];
    const shown: IntegrationInProgressBox[] = [];
    const log: string[] = [];
    const warn: string[] = [];
    const deps = {
      running: async (workspaceId?: string) => { asked.push(workspaceId ?? 'none'); return running(workspaceId); },
      show: show ?? (async (box: IntegrationInProgressBox) => { shown.push(box); return 0; }),
      log: (m: string) => log.push(m),
      warn: (m: string) => warn.push(m),
    };
    return { deps, asked, shown, log, warn };
  }

  it('running: the box is shown, a line is written, and the update declines', async () => {
    const h = updateDeps(async () => true);
    expect(await integrationAllowsUpdate(h.deps)).toBe(false);
    expect(h.asked).toEqual(['none']);
    expect(h.shown).toEqual([integrationInProgressBox()]);
    expect(h.log).toHaveLength(1);
  });

  it('a box that cannot be shown is logged, and the update still declines', async () => {
    const h = updateDeps(async () => true, async () => { throw new Error('no window'); });
    expect(await integrationAllowsUpdate(h.deps)).toBe(false);
    expect(h.log.some((l) => l.includes('could not be shown (no window)'))).toBe(true);
  });

  it('none running: the update goes on', async () => {
    const h = updateDeps(async () => false);
    expect(await integrationAllowsUpdate(h.deps)).toBe(true);
    expect(h.shown).toEqual([]);
  });

  it('a record that cannot be read declines the update, with no box and one warn line', async () => {
    const h = updateDeps(async () => { throw new Error('unreadable'); });
    expect(await integrationAllowsUpdate(h.deps)).toBe(false);
    expect(h.shown).toEqual([]);
    expect(h.warn).toHaveLength(1);
    expect(h.warn[0]).toContain('nothing is started (REQ-SHELL-119 guard 2, REQ-NOTIFY-056, OQ-361)');
  });
});

describe('the product reads no integration until one is built (REQ-GIT-083, REQ-GIT-125 to REQ-GIT-135 deferred)', () => {
  it('noWorktreeIntegration answers none running, with and without a workspace id, so the guard is vacuous today', async () => {
    expect(await noWorktreeIntegration()).toBe(false);
    expect(await noWorktreeIntegration('id:a')).toBe(false);
  });
});
