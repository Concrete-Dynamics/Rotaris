import type { TerminalStreamMeta } from '@rotaris/contracts';

/**
 * Part AM — every string the terminal window and its tabs show, in one place: REQ-SHELL-082 (tab labels and
 * tooltips), 083 (the empty state), 087 (the header), 088 (the controls' names and descriptions), 089/090/091/094
 * (the four banners and the ended reason), 092 (the kill dialog), 099 (the grid's description), 081 (the window
 * title, for wave 2's `main/windows.ts`). Where the specification fixes a string it is written verbatim; the rest
 * follows the design's copy voice (README §1.11).
 */
export const TAB_LABEL_MAX = 28;
export const COMMAND_LABEL_MAX = 90;
export const BACKGROUND_ID_MAX = 12;

/** Elide to at most `max` characters, the last of them the ellipsis. */
export function elide(text: string, max: number): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  const chars = Array.from(flat);
  return chars.length <= max ? flat : `${chars.slice(0, Math.max(0, max - 1)).join('')}…`;
}

/** REQ-SHELL-082: a raw stream identifier never appears; an unknown stream is "Terminal". */
export function displayNameOf(meta: Pick<TerminalStreamMeta, 'displayName'> | null | undefined): string {
  const name = meta?.displayName?.trim() ?? '';
  return name === '' ? 'Terminal' : name;
}

/** REQ-SHELL-082: the background stream's display name — the run host builds it; the rule lives here for the tests. */
export function backgroundDisplayName(sessionId: string): string {
  return `Background session ${elide(sessionId, BACKGROUND_ID_MAX)}`;
}

export function tabLabel(meta: Pick<TerminalStreamMeta, 'command' | 'displayName'> | null | undefined): string {
  const command = meta?.command?.trim() ?? '';
  return command === '' ? displayNameOf(meta) : elide(command, TAB_LABEL_MAX);
}

/** REQ-SHELL-087: "running", "exit {code}", or "exited" when the code is unknown. */
export function outcomeLabel(meta: Pick<TerminalStreamMeta, 'running' | 'exitCode'>): string {
  if (meta.running) return 'running';
  return meta.exitCode === undefined ? 'exited' : `exit ${meta.exitCode}`;
}

/** REQ-SHELL-082: "{name} · running" while the command runs, "{name} · exit N" once it has ended. */
export function tabTooltip(meta: Pick<TerminalStreamMeta, 'running' | 'exitCode' | 'displayName'>): string {
  return `${displayNameOf(meta)} · ${outcomeLabel(meta)}`;
}

/** REQ-SHELL-087: "$ {command}" elided at 90 characters; with no command known, the display name stands alone. */
export function commandLabel(meta: Pick<TerminalStreamMeta, 'command' | 'displayName'>): { readonly text: string; readonly full: string } {
  const command = meta.command?.trim() ?? '';
  if (command === '') { const name = displayNameOf(meta); return { text: name, full: name }; }
  return { text: `$ ${elide(command, COMMAND_LABEL_MAX)}`, full: `$ ${command}` };
}

/** REQ-SHELL-081. */
export function terminalWindowTitle(sessionLabel: string | null | undefined): string {
  const label = sessionLabel?.trim() ?? '';
  return label === '' ? 'Rotaris · Terminal' : `Rotaris · Terminal — ${label}`;
}

export const TABLIST_NAME = 'Terminal sessions';
export const GRID_NAME = 'Terminal output';

/** REQ-SHELL-099. */
export const GRID_DESCRIPTION = Object.freeze({
  armed: 'Live output of the running command. You have control: what you type is sent to the command. Shift+Tab leaves the terminal, Shift+Page Up scrolls back.',
  readOnly: 'Live output of the running command. Shift+Tab leaves the terminal, Shift+Page Up scrolls back. Read-only until you take control.',
});

/** REQ-SHELL-087. */
export const HEADER = Object.freeze({
  statusName: 'Command status',
  commandName: 'Command',
  truncationLabel: 'Earlier output dropped',
  truncationName: 'Scrollback limit reached',
  truncationTooltip: 'This terminal produced more output than Rotaris keeps; the oldest lines are gone.',
  outcomeName: 'Command outcome',
});

/** REQ-SHELL-088 / REQ-SHELL-089 / REQ-SHELL-091. */
export const CONTROLS = Object.freeze({
  takeControl: 'Take control',
  releaseControl: 'Release control',
  takeControlName: 'Take control of this terminal',
  takeControlDescription: 'Keystroke forwarding is off by default: this terminal belongs to the agent, and anything you type becomes part of the output it reads back. Turn it on to send what you type to the command.',
  interrupt: 'Interrupt (Ctrl-C)',
  interruptName: 'Interrupt the running command',
  endInput: 'End input (Ctrl-D)',
  endInputName: 'Send end of input to the running command',
  helpName: 'Input availability',
  helpAvailable: 'Interrupt and end input need no arming. Typed keys reach the command only after you take control.',
  copyAll: 'Copy all',
  copyAllName: 'Copy all terminal output',
  kill: 'Kill',
  killName: 'Kill the process behind this terminal',
  killDescription: 'Terminates the running process. Asks for confirmation first.',
  endedReason: 'The process has ended, so it cannot accept input.',
});

/** REQ-SHELL-092. */
export const KILL_DIALOG = Object.freeze({
  title: 'Kill this command?',
  body: 'The process behind this terminal is terminated immediately.',
  confirm: 'Kill command',
  lines(command: string | undefined): readonly string[] {
    const named = (command?.trim() ?? '') === '' ? 'The command running in this terminal' : `$ ${command!.trim()}`;
    return [named, "The agent reads the killed command's output as its result.", 'Anything the command had not written yet is lost.'];
  },
});

/** REQ-SHELL-083. */
export const EMPTY_STATE = Object.freeze({
  title: 'No terminal yet',
  body: 'A terminal appears here as soon as an agent runs a shell command. Start a run in Workspace and this window fills itself.',
  action: 'Go to Workspace',
  maxWidthPx: 460,
});

/** REQ-SHELL-094's attempt phrases. */
export type Attempt = 'send that key' | `send ${string}` | 'interrupt the command' | "end the command's input" | 'kill the process';

export type BannerSeverity = 'info' | 'warning';
export interface BannerText { readonly severity: BannerSeverity; readonly title: string; readonly body: string; readonly action?: string | undefined }

/** REQ-SHELL-089 / 090 / 091 / 094 — the four banners, one slot per tab, the newest replacing whatever occupied it. */
export const BANNERS = Object.freeze({
  control: (): BannerText => ({ severity: 'warning', title: 'You have control', body: "You are typing into the agent's terminal. Keys you send become part of the command output the agent reads back." }),
  readOnly: (): BannerText => ({ severity: 'info', title: 'This terminal is read-only', body: 'It belongs to the agent. Take control to send what you type to the command.', action: 'Take control' }),
  exited: (outcome: string): BannerText => ({ severity: 'info', title: 'Process exited', body: `${outcome}. The output stays readable and copyable.` }),
  refused: (attempt: Attempt): BannerText => ({ severity: 'warning', title: 'The terminal did not take that', body: `Rotaris could not ${attempt}. The process may have ended already.` }),
});

/** The transcript preview's caption (mockup craft; the wording is the design's). */
export const PREVIEW = Object.freeze({
  live: 'live screen',
  caption: 'Read-only preview — take control in the terminal window to type; keys are forwarded only after you take control.',
  openName: 'Open this terminal',
});
