import { PRIMARY_VIEWS, type ViewId } from '@rotaris/contracts';

/**
 * REQ-SHELL-048 — the window's ONE vocabulary of named actions, presented three ways: the command palette
 * (REQ-SHELL-051..053), the keyboard-help dialog (REQ-SHELL-054) and, later, the composer's slash catalogue
 * (REQ-SHELL-056, REQ-CHAT-028 — not built; `slashName` is its normal form so that catalogue consumes THIS table and
 * not the reverse). The table is REQ-SHELL-049's, minus what this window cannot yet carry out (REQ-SHELL-048's last
 * sentence); every omission is recorded in `OMITTED_COMMANDS` with its reason, so nothing is dropped quietly.
 *
 * Escape is NOT a command (REQ-SHELL-048): it is a contextual dismissal with the scope of REQ-SHELL-055, handled by
 * the window keydown handler in `useCommandShortcuts` and named in keyboard help by a prose line only.
 *
 * Chords are written in the spec's own form — `Ctrl+K`, `Ctrl+,`, `Ctrl+Return`, `F1`, a trailing `++` for the plus
 * key (REQ-SHELL-057) — and rendered per platform by `Kbd` (`Ctrl` on Windows and Linux, the command symbol on macOS).
 */
export interface CommandContext {
  readonly activeView: ViewId;
  switchView(id: ViewId): void;
  openSettings(category: string): void;
  openPalette(): void;
  openKeyboardHelp(): void;
  /** REQ-CHAT-002 / REQ-SHELL-049: after the switch to Workspace, put the caret in the composer once it is mounted. */
  focusComposer(): void;
  /** REQ-SHELL-049 / REQ-SHELL-050: the window-wide fallback submit — only while the send control is enabled. */
  submitRun(): void;
}

export interface Command {
  readonly id: string;
  readonly label: string;
  /** The written chord, absent for a palette-only entry (REQ-SHELL-049's "About & Legal"). */
  readonly shortcut?: string;
  /** REQ-SHELL-053: everyday words the palette matches on and NEVER displays. */
  readonly keywords: readonly string[];
  available(ctx: CommandContext): boolean;
  run(ctx: CommandContext): void;
}

/** REQ-SHELL-048: an entry of REQ-SHELL-049 this window cannot carry out, so no surface presents it — with the reason. */
export interface OmittedCommand {
  readonly label: string;
  readonly shortcut: string | null;
  readonly reason: string;
}

const VIEW_KEYWORDS: Record<ViewId, readonly string[]> = {
  overview: ['dashboard', 'home', 'summary', 'start'],
  workspace: ['chat', 'composer', 'transcript', 'run', 'conversation'],
  mission: ['agents', 'delegation', 'tree', 'team'],
  requirements: ['board', 'reqs', 'backlog', 'stories'],
  git: ['branch', 'worktree', 'checkpoints', 'repository', 'commits', 'source'],
  library: ['artifacts', 'proposals', 'skills', 'documents'],
  settings: ['preferences', 'config', 'configuration', 'options'],
};

const always = (): boolean => true;

export const COMMANDS: readonly Command[] = [
  // REQ-SHELL-049: Ctrl+1 … Ctrl+7 open the seven views in view order, labelled "Open {Label}".
  ...PRIMARY_VIEWS.map((view, index): Command => ({
    id: `view.${view.id}`,
    label: `Open ${view.label}`,
    shortcut: `Ctrl+${index + 1}`,
    keywords: VIEW_KEYWORDS[view.id],
    available: always,
    run: (ctx) => ctx.switchView(view.id),
  })),
  // REQ-SHELL-049 names no label for Ctrl+K ("opens the command palette"); "Open command palette" is the reading taken.
  { id: 'palette.open', label: 'Open command palette', shortcut: 'Ctrl+K', keywords: ['commands', 'actions', 'search', 'find'], available: always, run: (ctx) => ctx.openPalette() },
  // REQ-SHELL-049: Ctrl+, "Open Settings" — the same label as Ctrl+7's entry and a second row; both are the spec's.
  { id: 'settings.open', label: 'Open Settings', shortcut: 'Ctrl+,', keywords: VIEW_KEYWORDS.settings, available: always, run: (ctx) => ctx.switchView('settings') },
  // REQ-SHELL-049 / REQ-CHAT-002: Ctrl+L "Focus run prompt" — switches to Workspace, then the caret goes to the composer.
  { id: 'composer.focus', label: 'Focus run prompt', shortcut: 'Ctrl+L', keywords: ['prompt', 'composer', 'chat', 'type', 'message', 'input'], available: always, run: (ctx) => { ctx.switchView('workspace'); ctx.focusComposer(); } },
  // REQ-SHELL-049 / REQ-SHELL-050: Ctrl+Return "Start or continue run" — switches to Workspace, submits only while the send control is enabled.
  { id: 'run.submit', label: 'Start or continue run', shortcut: 'Ctrl+Return', keywords: ['send', 'go', 'execute', 'submit', 'launch'], available: always, run: (ctx) => { ctx.switchView('workspace'); ctx.submitRun(); } },
  // REQ-SHELL-049 / REQ-SHELL-054: F1 "Show keyboard help".
  { id: 'help.keyboard', label: 'Show keyboard help', shortcut: 'F1', keywords: ['shortcuts', 'keys', 'hotkeys', 'bindings', 'keyboard'], available: always, run: (ctx) => ctx.openKeyboardHelp() },
  // REQ-SHELL-138 / REQ-SHELL-049: "About & Legal" is palette-only, no shortcut; it opens Settings on the About tab.
  { id: 'about.open', label: 'About & Legal', keywords: ['version', 'licence', 'license', 'legal', 'credits', 'notices', 'diagnostics'], available: always, run: (ctx) => ctx.openSettings('about') },
];

/** REQ-SHELL-048's last sentence applied to REQ-SHELL-049's table: what is not offered, and why. Owed, not dropped. */
export const OMITTED_COMMANDS: readonly OmittedCommand[] = [
  { label: 'Search transcript', shortcut: 'Ctrl+F', reason: 'no transcript search panel exists yet (REQ-CHAT domain); the entry returns with the panel' },
  { label: 'Open terminal', shortcut: 'Ctrl+Shift+T', reason: 'no terminal window exists yet (ADR-0021 owed); the entry returns with the window' },
  { label: 'Open demo window', shortcut: null, reason: 'no demo mode exists yet (REQ-SHELL-162, REQ-SHELL-005); the entry returns with the mode' },
  { label: 'Toggle reasoning bodies', shortcut: null, reason: 'the display/showReasoning preference of REQ-CHAT-167 is not registered in the preference store yet; the entry returns with the key' },
];

export function commandById(id: string): Command | undefined {
  return COMMANDS.find((c) => c.id === id);
}

/** REQ-SHELL-049: every shortcut-bearing command — the keyboard-help rows and the chords the window handler listens for. */
export function shortcutCommands(commands: readonly Command[] = COMMANDS): readonly (Command & { readonly shortcut: string })[] {
  return commands.filter((c): c is Command & { readonly shortcut: string } => typeof c.shortcut === 'string' && c.shortcut.length > 0);
}

/**
 * REQ-SHELL-052: a case-folded substring match over the label, the hidden keywords and the identifier; an empty query
 * matches everything. Order is the table's (the first row is auto-selected by the palette whenever results exist).
 */
export function filterCommands(query: string, commands: readonly Command[] = COMMANDS): readonly Command[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return commands;
  return commands.filter((c) => c.label.toLocaleLowerCase().includes(needle) || c.id.toLocaleLowerCase().includes(needle) || c.keywords.some((k) => k.toLocaleLowerCase().includes(needle)));
}

/**
 * REQ-SHELL-052: activation closes the dialog FIRST and then runs the command. The palette passes a `close` that removes
 * the dialog synchronously (a flushed render) and restores focus; the command runs after that returns, so a command
 * that moves focus or changes the view sees no dialog in its way. Escape is `close` alone (REQ-SHELL-055).
 */
export function activateCommand(command: Command, ctx: CommandContext, close: () => void): void {
  close();
  command.run(ctx);
}

/**
 * REQ-CHAT-028's normal form for the slash catalogue's mirror of a palette entry: the label lower-cased, each run of
 * characters outside `[a-z0-9:_.-]` collapsed to one `-`. (REQ-SHELL-056's skill-name reduction is a different rule for
 * generated entries and is not this function.) Not consumed yet — the catalogue is the CHAT domain's, not built.
 */
export function slashName(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9:_.-]+/g, '-');
}

/** REQ-CHAT-028: the mirrored entry's description — the label with ` (<shortcut>)` appended where a shortcut exists. */
export function slashDescription(command: Command): string {
  return command.shortcut ? `${command.label} (${command.shortcut})` : command.label;
}

export type KeyboardPlatform = 'windows' | 'linux' | 'mac';

/** REQ-SHELL-057: the host's own key names — `Ctrl` on Windows and Linux, the command symbol on macOS. */
export function detectPlatform(platformString: string | undefined = globalThis.navigator?.platform): KeyboardPlatform {
  const p = (platformString ?? '').toLowerCase();
  if (p.startsWith('mac') || p.includes('iphone') || p.includes('ipad')) return 'mac';
  if (p.includes('linux')) return 'linux';
  return 'windows';
}

/**
 * REQ-SHELL-057: a chord string is split on `+`; a trailing `++` denotes the plus key. Returns the key names in
 * writing order, or null for a sequence that cannot be parsed (empty parts, nothing at all), which is then shown verbatim.
 */
export function parseChord(chord: string): readonly string[] | null {
  if (chord.length === 0) return null;
  let body = chord;
  let plus = false;
  if (body.endsWith('++')) { body = body.slice(0, -2); plus = true; }
  const parts = body === '' ? [] : body.split('+');
  if (parts.some((p) => p.length === 0)) return null;
  const keys = plus ? [...parts, '+'] : parts;
  return keys.length === 0 ? null : keys;
}

const MAC_NAMES: Record<string, string> = { Ctrl: '⌘', Alt: '⌥', Shift: '⇧', Return: '↩' };

/** REQ-SHELL-057: the platform-formatted key names, one per keycap; the wrapper's accessible name is `join('+')` of these. */
export function platformKeys(chord: string, platform: KeyboardPlatform): readonly string[] | null {
  const keys = parseChord(chord);
  if (keys === null) return null;
  return platform === 'mac' ? keys.map((k) => MAC_NAMES[k] ?? k) : keys;
}

/** REQ-SHELL-057: the whole written sequence as ONE accessible name — a three-key chord is never three labels. */
export function formatChord(chord: string, platform: KeyboardPlatform): string {
  const keys = platformKeys(chord, platform);
  return keys === null ? chord : keys.join('+');
}

/** REQ-SHELL-058: a tooltip sentence becomes the accessible description with the platform-formatted chord in parentheses. */
export function describeWithShortcut(sentence: string, chord: string | undefined, platform: KeyboardPlatform): string {
  return chord ? `${sentence} (${formatChord(chord, platform)})` : sentence;
}

/** The subset of a keyboard event the matcher reads, so it is testable without a DOM. */
export interface ChordEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

const KEY_ALIASES: Record<string, string> = { return: 'enter', esc: 'escape', space: ' ', plus: '+' };

/**
 * REQ-SHELL-049 / REQ-SHELL-165: a chord matches EXACTLY — the primary modifier (Ctrl; the command key on macOS) as the
 * chord says, Shift only where the chord says, never Alt, never the other primary. A chord the host consumed never
 * reaches here and nothing compensates; a chord that does not match falls through to the browser untouched.
 */
export function chordMatches(chord: string, event: ChordEvent, platform: KeyboardPlatform = 'windows'): boolean {
  const keys = parseChord(chord);
  if (keys === null) return false;
  const modifiers = new Set<string>();
  let main: string | null = null;
  for (const k of keys) {
    if (k === 'Ctrl' || k === 'Shift' || k === 'Alt') modifiers.add(k);
    else main = k;
  }
  if (main === null) return false;
  const primary = platform === 'mac' ? event.metaKey : event.ctrlKey;
  const otherPrimary = platform === 'mac' ? event.ctrlKey : event.metaKey;
  if (primary !== modifiers.has('Ctrl')) return false;
  if (event.shiftKey !== modifiers.has('Shift')) return false;
  if (event.altKey !== modifiers.has('Alt')) return false;
  if (otherPrimary) return false;
  const want = main.toLowerCase();
  const got = event.key.toLowerCase();
  return got === (KEY_ALIASES[want] ?? want);
}

/** The first shortcut-bearing command whose chord the event matches, or null. */
export function commandForEvent(event: ChordEvent, platform: KeyboardPlatform = 'windows', commands: readonly Command[] = COMMANDS): Command | null {
  for (const c of shortcutCommands(commands)) if (chordMatches(c.shortcut, event, platform)) return c;
  return null;
}
