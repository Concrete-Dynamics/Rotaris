import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIMARY_VIEWS } from '@rotaris/contracts';
import {
  activateCommand, chordMatches, COMMANDS, commandById, commandForEvent, describeWithShortcut, detectPlatform,
  filterCommands, formatChord, OMITTED_COMMANDS, parseChord, platformKeys, shortcutCommands, slashDescription,
  slashName, type ChordEvent, type Command, type CommandContext,
} from './registry.js';
import { modalSurfaceOpen } from './useCommandShortcuts.js';
import { ESCAPE_HELP_LINE } from './KeyboardHelp.js';
import { OVERLAY_ORDER, useShellState } from '../shell-state.js';

/** A context that records what a command did, so activation order and target are observable without a DOM. */
function context(): CommandContext & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    activeView: 'overview',
    switchView: (id) => { calls.push(`switchView:${id}`); },
    openSettings: (category) => { calls.push(`openSettings:${category}`); },
    openPalette: () => { calls.push('openPalette'); },
    openKeyboardHelp: () => { calls.push('openKeyboardHelp'); },
    focusComposer: () => { calls.push('focusComposer'); },
    submitRun: () => { calls.push('submitRun'); },
  };
}

const chord = (key: string, mods: Partial<ChordEvent> = {}): ChordEvent => ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });

describe('the command registry — REQ-SHELL-048/049, the ONE vocabulary', () => {
  it('carries REQ-SHELL-049\'s table: seven view entries in view order, the five other chords, and the palette-only About entry', () => {
    const rows = COMMANDS.map((c) => [c.id, c.label, c.shortcut ?? null] as const);
    expect(rows.slice(0, 7)).toEqual(PRIMARY_VIEWS.map((v, i) => [`view.${v.id}`, `Open ${v.label}`, `Ctrl+${i + 1}`]));
    expect(rows.slice(7)).toEqual([
      ['palette.open', 'Open command palette', 'Ctrl+K'],
      ['settings.open', 'Open Settings', 'Ctrl+,'],
      ['composer.focus', 'Focus run prompt', 'Ctrl+L'],
      ['run.submit', 'Start or continue run', 'Ctrl+Return'],
      ['help.keyboard', 'Show keyboard help', 'F1'],
      ['about.open', 'About & Legal', null],
      // Part AK2 — REQ-TRACE-390's move control, registered here rather than bound privately by the board (the pin rides with the entry).
      ['requirements.move', 'Move requirement', 'Ctrl+M'],
      ['terminal.open', 'Open terminal', 'Ctrl+Shift+T'], // Part AL2 — the sixth chord, back from the omitted list
      ['run.compress', 'Compress context', null], // Part AO — REQ-MONITOR-097's palette entry, shortcut-less
    ]);
  });

  it('gives every entry an identifier, a label and hidden keywords, and no two entries share an id or a chord', () => {
    for (const c of COMMANDS) {
      expect(c.id.length, c.id).toBeGreaterThan(0);
      expect(c.label.length, c.id).toBeGreaterThan(0);
      expect(c.keywords.length, c.id).toBeGreaterThan(0);
    }
    expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(COMMANDS.length);
    const chords = shortcutCommands().map((c) => c.shortcut);
    expect(new Set(chords).size).toBe(chords.length);
    expect(commandById('about.open')?.shortcut).toBeUndefined();
    expect(commandById('no.such.command')).toBeUndefined();
  });

  it('offers no Escape entry, and records every omitted entry of REQ-SHELL-049 with its reason (REQ-SHELL-048)', () => {
    expect(COMMANDS.some((c) => /escape|close current overlay/i.test(c.label))).toBe(false);
    // Part AL2: "Open terminal" (Ctrl+Shift+T) left the omitted list — the window exists (REQ-SHELL-080/108).
    expect(OMITTED_COMMANDS.map((o) => o.label)).toEqual(['Search transcript', 'Open demo window', 'Toggle reasoning bodies']);
    expect(COMMANDS.find((c) => c.id === 'terminal.open')).toMatchObject({ label: 'Open terminal', shortcut: 'Ctrl+Shift+T' });
    for (const o of OMITTED_COMMANDS) expect(o.reason.length, o.label).toBeGreaterThan(20);
    // What is omitted is not also offered: the two vocabularies are disjoint.
    for (const o of OMITTED_COMMANDS) expect(COMMANDS.some((c) => c.label === o.label)).toBe(false);
  });

  it('runs each entry against its target (REQ-SHELL-115: the same identifier, the same result)', () => {
    const ctx = context();
    for (const c of COMMANDS) c.run(ctx);
    expect(ctx.calls).toEqual([
      ...PRIMARY_VIEWS.map((v) => `switchView:${v.id}`),
      'openPalette', 'switchView:settings',
      'switchView:workspace', 'focusComposer',
      'switchView:workspace', 'submitRun',
      'openKeyboardHelp', 'openSettings:about',
      'switchView:requirements', // Part AK2 — the chord shows the view and places focus on the move control (REQ-TRACE-390).
    ]);
  });
});

describe('palette filtering — REQ-SHELL-052/053', () => {
  it('matches case-folded substrings of the label, the identifier and the hidden keywords; an empty query matches everything', () => {
    expect(filterCommands('')).toHaveLength(COMMANDS.length);
    expect(filterCommands('   ')).toHaveLength(COMMANDS.length);
    expect(filterCommands('SETTINGS').map((c) => c.id)).toContain('settings.open');
    expect(filterCommands('view.git').map((c) => c.id)).toEqual(['view.git']);
    // "preferences" and "config" are keywords of Settings; "dashboard" is Overview's. Neither word is in a label.
    expect(filterCommands('preferences').map((c) => c.id)).toEqual(['view.settings', 'settings.open']);
    expect(filterCommands('dashboard').map((c) => c.id)).toEqual(['view.overview']);
    expect(filterCommands('zzzz')).toEqual([]);
  });

  it('keeps the table\'s order, so the first row of a result set is the first entry that matched', () => {
    expect(filterCommands('open').map((c) => c.id)[0]).toBe('view.overview');
  });

  it('never returns the keywords themselves for display — a row carries only its label and its chord', () => {
    const settings = commandById('settings.open')!;
    expect(settings.keywords).toContain('preferences');
    expect(settings.label).not.toMatch(/preferences/i);
  });

  it('closes the dialog BEFORE running the command (REQ-SHELL-052)', () => {
    const ctx = context();
    const order: string[] = [];
    const close = () => { order.push('closed'); };
    const command: Command = { id: 't', label: 'T', keywords: [], available: () => true, run: () => { order.push('ran'); } };
    activateCommand(command, ctx, close);
    expect(order).toEqual(['closed', 'ran']);
  });
});

describe('chords — REQ-SHELL-057, REQ-SHELL-058, REQ-SHELL-165', () => {
  it('splits on "+", reads a trailing "++" as the plus key, and refuses a sequence it cannot parse', () => {
    expect(parseChord('Ctrl+K')).toEqual(['Ctrl', 'K']);
    expect(parseChord('Ctrl+Shift+T')).toEqual(['Ctrl', 'Shift', 'T']);
    expect(parseChord('F1')).toEqual(['F1']);
    expect(parseChord('Ctrl++')).toEqual(['Ctrl', '+']);
    expect(parseChord('++')).toEqual(['+']);
    expect(parseChord('Ctrl+')).toBeNull();
    expect(parseChord('')).toBeNull();
  });

  it('writes the host\'s own key names and announces the whole sequence as one accessible name', () => {
    expect(platformKeys('Ctrl+K', 'windows')).toEqual(['Ctrl', 'K']);
    expect(platformKeys('Ctrl+K', 'linux')).toEqual(['Ctrl', 'K']);
    expect(platformKeys('Ctrl+Shift+T', 'mac')).toEqual(['⌘', '⇧', 'T']);
    expect(formatChord('Ctrl+Return', 'windows')).toBe('Ctrl+Return');
    expect(formatChord('Ctrl+Return', 'mac')).toBe('⌘+↩');
    // Unparsable: displayed and announced verbatim.
    expect(formatChord('Ctrl+', 'windows')).toBe('Ctrl+');
  });

  it('reads the platform from the host string, defaulting to the Ctrl-writing platforms', () => {
    expect(detectPlatform('MacIntel')).toBe('mac');
    expect(detectPlatform('Linux x86_64')).toBe('linux');
    expect(detectPlatform('Win32')).toBe('windows');
    expect(detectPlatform(undefined)).toBe('windows');
  });

  it('appends the platform-formatted chord to a tooltip sentence, and leaves a shortcut-less one alone (REQ-SHELL-058)', () => {
    expect(describeWithShortcut('Open Git', 'Ctrl+5', 'windows')).toBe('Open Git (Ctrl+5)');
    expect(describeWithShortcut('Open Git', undefined, 'windows')).toBe('Open Git');
  });

  it('matches a chord exactly — never with Alt, never with the other primary modifier, Shift only where written', () => {
    expect(chordMatches('Ctrl+K', chord('k', { ctrlKey: true }))).toBe(true);
    expect(chordMatches('Ctrl+K', chord('K', { ctrlKey: true }))).toBe(true);
    expect(chordMatches('Ctrl+K', chord('k', { ctrlKey: true, altKey: true }))).toBe(false);
    expect(chordMatches('Ctrl+K', chord('k', { ctrlKey: true, metaKey: true }))).toBe(false);
    expect(chordMatches('Ctrl+K', chord('k', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(chordMatches('Ctrl+K', chord('k'))).toBe(false);
    expect(chordMatches('F1', chord('F1'))).toBe(true);
    expect(chordMatches('F1', chord('F1', { ctrlKey: true }))).toBe(false);
    // Return is the written name; the event's key is Enter.
    expect(chordMatches('Ctrl+Return', chord('Enter', { ctrlKey: true }))).toBe(true);
    // On macOS the command key is the primary and Ctrl is the other one.
    expect(chordMatches('Ctrl+K', chord('k', { metaKey: true }), 'mac')).toBe(true);
    expect(chordMatches('Ctrl+K', chord('k', { ctrlKey: true }), 'mac')).toBe(false);
  });

  it('resolves an event to at most one command and ignores an unbound chord (REQ-SHELL-165: nothing compensates)', () => {
    expect(commandForEvent(chord('k', { ctrlKey: true }))?.id).toBe('palette.open');
    expect(commandForEvent(chord('3', { ctrlKey: true }))?.id).toBe(`view.${PRIMARY_VIEWS[2]!.id}`);
    expect(commandForEvent(chord(',', { ctrlKey: true }))?.id).toBe('settings.open');
    // Part AL2: Ctrl+Shift+T is bound now (REQ-SHELL-080); Ctrl+T alone and Ctrl+F stay unbound.
    expect(commandForEvent(chord('T', { ctrlKey: true, shiftKey: true }))?.id).toBe('terminal.open');
    expect(commandForEvent(chord('t', { ctrlKey: true }))).toBeNull();
    expect(commandForEvent(chord('f', { ctrlKey: true }))).toBeNull();
  });
});

describe('the slash normal form — REQ-CHAT-028 (the catalogue consumes this table, not the reverse)', () => {
  it('lower-cases the label and collapses every run outside [a-z0-9:_.-] to one hyphen', () => {
    expect(slashName('Open Settings')).toBe('open-settings');
    expect(slashName('About & Legal')).toBe('about-legal');
    expect(slashName('Start or continue run')).toBe('start-or-continue-run');
    expect(COMMANDS.map((c) => slashName(c.label))).toEqual(COMMANDS.map((c) => slashName(c.label)).map((n) => n.toLowerCase()));
    expect(new Set(COMMANDS.map((c) => slashName(c.label))).size).toBeLessThanOrEqual(COMMANDS.length);
  });

  it('describes a mirrored entry with its chord in parentheses, and without one where there is none', () => {
    expect(slashDescription(commandById('palette.open')!)).toBe('Open command palette (Ctrl+K)');
    expect(slashDescription(commandById('about.open')!)).toBe('About & Legal');
  });
});

describe('the window keydown handler — REQ-SHELL-055', () => {
  it('reads "a modal surface is open" from the document, so every dialog counts without registering', () => {
    expect(modalSurfaceOpen({ querySelector: () => null })).toBe(false);
    expect(modalSurfaceOpen({ querySelector: () => ({}) as Element })).toBe(true);
    expect(modalSurfaceOpen(undefined)).toBe(false);
  });

  it('resolves Escape in REQ-SHELL-055\'s fixed order and skips the slots no surface registered', () => {
    expect(OVERLAY_ORDER).toEqual(['slashPopup', 'searchPanel', 'drawers']);
  });
});

describe('shell state — the two application-modal dialogs and the Escape slots', () => {
  beforeEach(() => {
    useShellState.setState({ paletteOpen: false, helpOpen: false, composer: null, overlays: { slashPopup: null, searchPanel: null, drawers: null } });
  });

  it('holds at most one application-modal dialog: opening one closes the other', () => {
    const s = () => useShellState.getState();
    s().openPalette();
    expect([s().paletteOpen, s().helpOpen]).toEqual([true, false]);
    s().openKeyboardHelp();
    expect([s().paletteOpen, s().helpOpen]).toEqual([false, true]);
    s().openPalette();
    expect([s().paletteOpen, s().helpOpen]).toEqual([true, false]);
    s().closePalette();
    expect([s().paletteOpen, s().helpOpen]).toEqual([false, false]);
  });

  it('takes the composer\'s registration and lets it go on unmount (REQ-SHELL-049\'s Ctrl+Return)', () => {
    const submit = vi.fn();
    const setText = vi.fn();
    useShellState.getState().registerComposer({ submit, enabled: false, setText });
    expect(useShellState.getState().composer?.enabled).toBe(false);
    useShellState.getState().registerComposer({ submit, enabled: true, setText });
    expect(useShellState.getState().composer?.enabled).toBe(true);
    useShellState.getState().registerComposer(null);
    expect(useShellState.getState().composer).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });

  it('registers and clears an overlay closer by slot, leaving the other slots alone', () => {
    const close = () => true;
    useShellState.getState().registerOverlay('drawers', close);
    expect(useShellState.getState().overlays).toMatchObject({ slashPopup: null, searchPanel: null, drawers: close });
    useShellState.getState().registerOverlay('drawers', null);
    expect(useShellState.getState().overlays.drawers).toBeNull();
  });
});

describe('keyboard help — REQ-SHELL-054', () => {
  it('lists every shortcut-bearing command and no other, and carries the Escape prose line instead of an Escape row', () => {
    const rows = shortcutCommands();
    expect(rows.map((c) => c.id)).toEqual(COMMANDS.filter((c) => c.shortcut).map((c) => c.id));
    expect(rows.some((c) => c.id === 'about.open')).toBe(false);
    expect(ESCAPE_HELP_LINE).toMatch(/escape/i);
    expect(ESCAPE_HELP_LINE).toMatch(/workspace/i);
  });
});
