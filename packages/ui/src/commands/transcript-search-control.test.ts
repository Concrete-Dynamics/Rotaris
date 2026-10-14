import { readFileSync } from 'node:fs';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchPanelCloser } from '../transcript/search.js';
import { useShellState, type OverlayCloser, type OverlayKind } from '../shell-state.js';
import { resolveWorkspaceEscape } from './useCommandShortcuts.js';
import { SEARCH_TRANSCRIPT_LABEL, TranscriptSearchControl, WorkspaceView } from '../WorkspaceView.js';
import type * as HostModule from '../terminal/host.js';

// The terminal control reads the renderer's terminal host, which a static render does not have.
vi.mock('../terminal/host.js', async (importOriginal) => ({ ...(await importOriginal<typeof HostModule>()), TerminalToolbarControl: () => null }));

const src = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const ok = async () => ({ ok: true as const });

/**
 * REQ-CHAT-074's "opened by toolbar button or Ctrl+F": until 2026-10-14 the transcript toolbar carried no search control,
 * so a reader who did not know the chord had no visible way in
 * (`docs/defects/fixed/the-transcript-has-no-toolbar-control-for-search.md`).
 */
describe('the transcript toolbar\'s search control — REQ-CHAT-074, REQ-SHELL-048/058', () => {
  it('is drawn in the Workspace\'s transcript toolbar, named "Search transcript", its tooltip carrying Ctrl+F', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceView, { session: null, rows: [], onSubmit: ok, onStop: ok, onOpenStash: () => undefined }));
    const toolbar = /<div class="transcript__toolbar"[^]*?<\/div>/.exec(html)?.[0] ?? '';
    const control = /<button[^>]*data-testid="transcript-search-open"[^>]*>/.exec(toolbar)?.[0];
    expect(control, 'the toolbar has no search control').toBeDefined();
    expect(control).toContain(`aria-label="${SEARCH_TRANSCRIPT_LABEL}"`);
    expect(control).toMatch(/title="Search transcript \((Ctrl)\+F\)"/);
    expect(control).toMatch(/aria-description="Search transcript \(Ctrl\+F\)"/);
  });

  it('formats the registry\'s chord for the host (REQ-SHELL-057): the command symbol on macOS', () => {
    const html = renderToStaticMarkup(createElement(TranscriptSearchControl, { onOpen: () => undefined, platform: 'mac' }));
    expect(html).toContain('title="Search transcript (⌘+F)"');
    expect(html).toContain('ph-magnifying-glass');
  });

  it('a press runs the opener it is handed, and the Workspace hands it the registry\'s "Search transcript" (one vocabulary)', () => {
    const onOpen = vi.fn();
    const element = TranscriptSearchControl({ onOpen, platform: 'windows' }) as ReactElement<{ onClick: () => void }>;
    expect(isValidElement(element)).toBe(true);
    element.props.onClick();
    expect(onOpen).toHaveBeenCalledTimes(1);
    const view = src('../WorkspaceView.tsx');
    expect(view).toContain('<TranscriptSearchControl onOpen={openSearch} />');
    expect(view).toContain("const openSearch = () => { commandById('transcript.search')?.run(commandContext); };");
  });
});

/**
 * REQ-SHELL-055 step (1): with the transcript search panel visible, window-level Escape closes it and focus returns to the
 * composer, before the drawers are considered. Until 2026-10-14 nothing registered the `searchPanel` slot, so Escape with
 * focus outside the panel's field closed the drawers and left the panel open
 * (`docs/defects/fixed/window-level-escape-skips-the-open-transcript-search-panel.md`).
 */
describe('window-level Escape and the transcript search panel — REQ-SHELL-055 (1), REQ-CHAT-074', () => {
  const empty: Record<OverlayKind, OverlayCloser | null> = { slashPopup: null, searchPanel: null, drawers: null };
  afterEach(() => useShellState.setState({ overlays: { ...empty } }));

  it('the open panel holds the slot and closes before the drawers, refocusing the composer through the pane\'s one close', () => {
    const calls: string[] = [];
    const close = () => { calls.push('panel closed'); calls.push('composer focused'); };
    const drawers = vi.fn(() => true);
    useShellState.getState().registerOverlay('drawers', drawers);
    useShellState.getState().registerOverlay('searchPanel', searchPanelCloser(true, close));
    expect(resolveWorkspaceEscape(useShellState.getState().overlays)).toBe(true);
    expect(calls).toEqual(['panel closed', 'composer focused']);
    expect(drawers).not.toHaveBeenCalled();
  });

  it('a closed panel leaves the slot empty, so Escape walks on to the drawers', () => {
    expect(searchPanelCloser(false, () => undefined)).toBeNull();
    const drawers = vi.fn(() => true);
    useShellState.getState().registerOverlay('drawers', drawers);
    useShellState.getState().registerOverlay('searchPanel', searchPanelCloser(false, () => undefined));
    expect(resolveWorkspaceEscape(useShellState.getState().overlays)).toBe(true);
    expect(drawers).toHaveBeenCalledTimes(1);
  });

  it('the slash popup still answers first, and nothing registered closes nothing', () => {
    const order: string[] = [];
    useShellState.setState({ overlays: { slashPopup: () => { order.push('popup'); return true; }, searchPanel: searchPanelCloser(true, () => order.push('panel')), drawers: null } });
    expect(resolveWorkspaceEscape(useShellState.getState().overlays)).toBe(true);
    expect(order).toEqual(['popup']);
    expect(resolveWorkspaceEscape(empty)).toBe(false);
  });

  it('the pane registers its panel in the slot while open, and the field\'s Escape, Close and the window\'s Escape share one close', () => {
    const pane = src('../transcript/TranscriptPane.tsx');
    expect(pane).toContain("registerOverlay('searchPanel', searchPanelCloser(searchOpen, closeSearch));");
    expect(pane).toContain("return () => registerOverlay('searchPanel', null);");
    expect(pane).toMatch(/if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); closeSearch\(\); \}/);
    expect(pane).toContain('data-testid="transcript-search-close" onClick={closeSearch}');
    expect(src('./useCommandShortcuts.ts')).toContain('if (resolveWorkspaceEscape(useShellState.getState().overlays)) e.preventDefault();');
  });
});
