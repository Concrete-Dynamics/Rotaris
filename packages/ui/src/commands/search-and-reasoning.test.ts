import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCatalogue } from '../slash/catalogue.js';
import { CONTRACT_SCHEMA_VERSION } from '@rotaris/contracts';
import {
  bindReasoningPreference, displayPreferencePatch, REASONING_HIDDEN_BODY, REASONING_HIDDEN_TITLE, REASONING_NOT_CHANGED_TITLE, REASONING_SHOWN_BODY,
  REASONING_SHOWN_TITLE, toggleReasoningBodies, type PreferenceAnswer,
} from '../display-host.js';
import { DisplaySettings } from '../settings/DisplaySettings.js';
import { useShellState } from '../shell-state.js';
import { commandById, filterCommands, shortcutCommands } from './registry.js';

/**
 * N71 (2026-10-13): the two palette entries `OMITTED_COMMANDS` withheld for reasons that were no longer true
 * (`docs/defects/fixed/search-transcript-and-the-reasoning-toggle-are-withheld-for-reasons-no-longer-true.md`).
 * Each claim here failed before the repair: neither entry was in `COMMANDS`, nothing wrote `display/showReasoning`,
 * Settings → Display had no reasoning switch, and Ctrl+F was the transcript pane's private window listener.
 */
const src = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('"Search transcript" — REQ-SHELL-049 Ctrl+F, one binding on every surface (REQ-SHELL-048/054)', () => {
  it('is a shortcut-bearing command, so keyboard help lists it and the palette finds it', () => {
    expect(shortcutCommands().map((c) => [c.id, c.shortcut])).toContainEqual(['transcript.search', 'Ctrl+F']);
    expect(filterCommands('search transcript').map((c) => c.id)).toEqual(['transcript.search']);
  });

  it('switches to Workspace first and then opens the panel, from any view', () => {
    const calls: string[] = [];
    commandById('transcript.search')!.run({
      activeView: 'git',
      switchView: (id) => { calls.push(`switchView:${id}`); },
      openSettings: () => undefined, openLibrary: () => undefined, openPalette: () => undefined, openKeyboardHelp: () => undefined,
      focusComposer: () => undefined, submitRun: () => undefined,
      openTranscriptSearch: () => { calls.push('openTranscriptSearch'); },
    });
    expect(calls).toEqual(['switchView:workspace', 'openTranscriptSearch']);
  });

  it('reaches the panel through the opener the pane registers in shell state, and none once it unmounts', () => {
    const open = vi.fn();
    useShellState.getState().registerTranscriptSearch(open);
    useShellState.getState().transcriptSearch?.();
    expect(open).toHaveBeenCalledTimes(1);
    useShellState.getState().registerTranscriptSearch(null);
    expect(useShellState.getState().transcriptSearch).toBeNull();
  });

  it('is bound in one place: the pane registers an opener and binds no chord, and /search runs the command', () => {
    const pane = src('../transcript/TranscriptPane.tsx');
    expect(pane).toContain('registerTranscriptSearch(');
    // The pane's private Ctrl+F listener is gone, so the window's one handler (`useCommandShortcuts`) is the only binding.
    expect(pane).not.toMatch(/addEventListener\('keydown'/);
    const view = src('../WorkspaceView.tsx');
    expect(view).toContain("commandById('transcript.search')?.run(commandContext)");
    // `/search` no longer presses a synthetic Ctrl+F at the window.
    expect(view).not.toMatch(/dispatchEvent\(new KeyboardEvent\('keydown', \{ key: 'f'/);
  });

  it('is mirrored as /search-transcript with its chord, and the built-in /search keeps its own gating (REQ-CHAT-028/030)', () => {
    const ran: string[] = [];
    const registry = buildCatalogue({ stashCount: 0, reachable: { search: true }, runPalette: (c) => { ran.push(c.id); } });
    const mirror = registry.lookup('search-transcript');
    expect(mirror?.description).toBe('Search transcript (Ctrl+F)');
    void mirror!.run('', {} as never);
    expect(ran).toEqual(['transcript.search']);
    expect(registry.lookup('search')?.description).toBe('Search the transcript');
  });
});

describe('"Toggle reasoning bodies" — REQ-CHAT-167, the one writer of display/showReasoning', () => {
  let stored = false;
  let refuse: string | null = null;
  const acks: { kind: string; title: string; body?: string }[] = [];
  const write = vi.fn(async (value: boolean): Promise<PreferenceAnswer> => {
    if (refuse !== null) return { ok: false, reason: refuse };
    stored = value;
    return { ok: true };
  });
  beforeEach(() => {
    stored = false; refuse = null; acks.length = 0; write.mockClear();
    bindReasoningPreference({ current: () => stored, write, acknowledge: (kind, title, body) => { acks.push(body === undefined ? { kind, title } : { kind, title, body }); } });
  });
  afterEach(() => bindReasoningPreference(null));

  it('is a shortcut-less palette entry the palette finds by its everyday words', () => {
    const entry = commandById('display.toggleReasoning');
    expect(entry).toMatchObject({ label: 'Toggle reasoning bodies' });
    expect(entry?.shortcut).toBeUndefined();
    expect(filterCommands('thinking').map((c) => c.id)).toContain('display.toggleReasoning');
  });

  it('flips the stored preference and reports the state it now holds, each way', async () => {
    expect(await toggleReasoningBodies()).toBe(true);
    expect(write).toHaveBeenLastCalledWith(true);
    expect(stored).toBe(true);
    expect(await toggleReasoningBodies()).toBe(false);
    expect(write).toHaveBeenLastCalledWith(false);
    expect(acks).toEqual([
      { kind: 'ok', title: REASONING_SHOWN_TITLE, body: REASONING_SHOWN_BODY },
      { kind: 'ok', title: REASONING_HIDDEN_TITLE, body: REASONING_HIDDEN_BODY },
    ]);
  });

  it('reports a refused write with main\'s reason and claims no new state', async () => {
    refuse = 'The preference store is read-only.';
    expect(await toggleReasoningBodies()).toBeNull();
    expect(stored).toBe(false);
    expect(acks).toEqual([{ kind: 'fail', title: REASONING_NOT_CHANGED_TITLE, body: 'The preference store is read-only.' }]);
  });

  it('does nothing in a window with nothing bound', async () => {
    bindReasoningPreference(null);
    expect(await toggleReasoningBodies()).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it('runs from the palette entry and from its slash mirror /toggle-reasoning-bodies (REQ-CHAT-028)', async () => {
    commandById('display.toggleReasoning')!.run({} as never);
    await vi.waitFor(() => expect(stored).toBe(true));
    const registry = buildCatalogue({ stashCount: 0, reachable: {}, runPalette: (c) => c.run({} as never) });
    const mirror = registry.lookup('toggle-reasoning-bodies');
    expect(mirror?.description).toBe('Toggle reasoning bodies');
    await mirror!.run('', {} as never);
    await vi.waitFor(() => expect(stored).toBe(false));
  });

  it('has a switch in Settings → Display, after REQ-CONFIG-403\'s two, drawn from the stored value', () => {
    const draw = (showReasoning: boolean) => renderToStaticMarkup(createElement(DisplaySettings, {
      autoCollapseTools: false, groupTools: true, showReasoning,
      onAutoCollapseTools: async () => ({ ok: true as const }), onGroupTools: async () => ({ ok: true as const }), onShowReasoning: async () => ({ ok: true as const }),
    }));
    const off = draw(false);
    const order = ['auto-collapse-tools', 'group-tools', 'show-reasoning'].map((id) => off.indexOf(`data-testid="${id}"`));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(off).toContain('Show reasoning bodies');
    expect(/data-testid="show-reasoning"[^>]*data-on="false"|data-on="false"[^>]*data-testid="show-reasoning"/.test(off)).toBe(true);
    expect(/data-testid="show-reasoning"[^>]*data-on="true"|data-on="true"[^>]*data-testid="show-reasoning"/.test(draw(true))).toBe(true);
  });
});

/**
 * Channel 14 (REQ-CHAT-167, REQ-CONFIG-403): every window folds a stored display preference main announces, so a persona
 * window already open follows a change made elsewhere (`docs/defects/fixed/an-open-persona-window-keeps-the-display-preferences-it-booted-with.md`).
 */
describe('a display:changed announcement folded into a window\'s display store — REQ-CHAT-167, REQ-CONFIG-403', () => {
  it('sets the one field the stored key names to the stored value', () => {
    expect(displayPreferencePatch({ v: CONTRACT_SCHEMA_VERSION, preference: 'display/showReasoning', value: true })).toEqual({ showReasoning: true });
    expect(displayPreferencePatch({ v: CONTRACT_SCHEMA_VERSION, preference: 'display/autoCollapseTools', value: false })).toEqual({ autoCollapseTools: false });
    expect(displayPreferencePatch({ v: CONTRACT_SCHEMA_VERSION, preference: 'display/groupTools', value: false })).toEqual({ groupTools: false });
  });

  it('ignores a payload that is not an announcement: another key, a non-boolean, another contract version', () => {
    expect(displayPreferencePatch({ v: CONTRACT_SCHEMA_VERSION, preference: 'interface/agentPopOut', value: true })).toBeNull();
    expect(displayPreferencePatch({ v: CONTRACT_SCHEMA_VERSION, preference: 'display/showReasoning', value: 'true' })).toBeNull();
    expect(displayPreferencePatch({ v: CONTRACT_SCHEMA_VERSION + 1, preference: 'display/showReasoning', value: true })).toBeNull();
    expect(displayPreferencePatch(null)).toBeNull();
  });

  it('every window subscribes before its role branch, the preload exposes the channel, and the persona window reads the store', () => {
    const renderer = src('../../../../apps/desktop/src/renderer/shell.ts');
    expect(renderer).toContain('bridge.onDisplayChanged((payload) => { const patch = displayPreferencePatch(payload); if (patch !== null) displayPrefs.setState(patch); });');
    expect(src('../../../../apps/desktop/src/preload/index.ts')).toContain('onDisplayChanged: subscribe(CHANNEL.displayChanged),');
    expect(src('../../../../apps/desktop/src/renderer/windows.tsx')).toContain('useStore(displayPrefs, (s) => s)');
  });
});
