import { describe, expect, it } from 'vitest';
import type { ConfigSnapshot } from '@rotaris/contracts';
import { announceConfig, configFamily } from './config-broadcast.js';

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

/**
 * A main window's family is every window that reads its configuration: itself, its persona windows
 * (`useConfigSnapshot('persona')`) and its terminal window. 5df1943 announced to the main window alone, so a persona window
 * kept a stale model, declared tools and compression threshold after a Settings save until it was reopened.
 */
describe('configFamily — the windows that take one main window\'s config:changed', () => {
  it('is the main window, each live persona window and the terminal window', () => {
    const personas = new Map([['orchestrator', 'p:orchestrator'], ['reviewer', 'p:reviewer']]);
    const view = {
      win: 'main',
      personaWindows: {
        list: () => [{ persona: 'orchestrator' }, { persona: 'reviewer' }, { persona: 'closed-meanwhile' }],
        entry: (persona: string) => (personas.has(persona) ? { win: personas.get(persona)! } : undefined),
      },
      terminalWindows: { current: () => ({ win: 'terminal' }) },
    };
    expect(configFamily(view)).toEqual(['main', 'p:orchestrator', 'p:reviewer', 'terminal']);
  });

  it('is the main window alone when it owns no auxiliary window', () => {
    expect(configFamily({ win: 'main', personaWindows: { list: () => [], entry: () => undefined }, terminalWindows: { current: () => null } })).toEqual(['main']);
  });
});
