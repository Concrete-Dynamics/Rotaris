import { describe, expect, it } from 'vitest';
import type { ConfigSnapshot } from '@rotaris/contracts';
import { announceConfig } from './config-broadcast.js';

/**
 * REQ-WORKSPACE-105 / PD-SHELL-001 / REQ-TOOLS-131: a configuration write in one workspace repopulates each main window
 * from its own workspace's snapshot. Until 2026-10-03 every window took the written workspace's snapshot, so with two main
 * windows open (REQ-SHELL-020) a save in one rewrote the other's `outside-workspace!`/`workspace-scoped` flag to the first
 * workspace's opt-out.
 */
const snapshotOf = (workspaceRoot: string, outside: boolean): ConfigSnapshot => ({ workspaceRoot, runtime: { allow_outside_workspace: outside } }) as unknown as ConfigSnapshot;
const samePath = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

describe('announceConfig — each window repopulates from its own workspace', () => {
  it('sends the written snapshot to its own workspace\'s window and each other window its own, read again', async () => {
    const got = new Map<string, ConfigSnapshot[]>();
    const window = (workspace: string) => ({ workspace, send: (s: ConfigSnapshot) => { got.set(workspace, [...(got.get(workspace) ?? []), s]); } });
    const read: string[] = [];
    const written = snapshotOf('/work/a', true);
    const pending = announceConfig('/work/a', written, [window('/work/A'), window('/work/b'), window('(no workspace)')], {
      samePath,
      readOwn: async (workspace) => { read.push(workspace); return snapshotOf(workspace, false); },
    });
    // The holder is told at once, before any other window's read answers.
    expect(got.get('/work/A')).toEqual([written]);
    await pending;
    expect(got.get('/work/b')).toEqual([snapshotOf('/work/b', false)]);
    expect(read).toEqual(['/work/b']);
    expect(got.has('(no workspace)')).toBe(false);
  });

  it('sends a window nothing when its own workspace cannot be read, never another workspace\'s snapshot', async () => {
    const got: ConfigSnapshot[] = [];
    await announceConfig('/work/a', snapshotOf('/work/a', true), [{ workspace: '/work/b', send: (s) => { got.push(s); } }], {
      samePath,
      readOwn: async () => null,
    });
    await announceConfig('/work/a', snapshotOf('/work/a', true), [{ workspace: '/work/b', send: (s) => { got.push(s); } }], {
      samePath,
      readOwn: () => Promise.reject(new Error('service gone')),
    });
    expect(got).toEqual([]);
  });
});
