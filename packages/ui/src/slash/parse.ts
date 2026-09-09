import type { SlashOutcome, SlashParse } from './types.js';

/**
 * REQ-CHAT-018 — the slash parser, as a value. A command is a SINGLE-LINE text starting with `/`; a slash followed by
 * whitespace (`"/ "`) is an escape that makes the text an ordinary prompt; any text containing a newline is always an
 * ordinary prompt. The first token after `/`, lowercased, is the command name; the remainder, stripped, is the argument.
 *
 * A bare `/` is a command with an empty name: it starts with `/`, holds no newline and no escape, so it is recognised
 * as a slash submission and answered `Unknown command /` rather than sent to an agent (REQ-CHAT-023). Leading
 * whitespace before the slash makes the text a prompt — "starting with `/`" is read literally.
 */
export function parseSlash(text: string): SlashParse {
  if (!text.startsWith('/')) return { kind: 'prompt' };
  if (text.includes('\n') || text.includes('\r')) return { kind: 'prompt' };
  if (text.length > 1 && /\s/.test(text.charAt(1))) return { kind: 'prompt' };
  const body = text.slice(1);
  const split = /^(\S*)([\s\S]*)$/.exec(body);
  const name = (split?.[1] ?? '').toLowerCase();
  const argument = (split?.[2] ?? '').trim();
  return { kind: 'command', name, argument };
}

/**
 * REQ-CHAT-024 — exactly when the suggestion popup is open: single-line text starting with `/` with no whitespace yet
 * after the name token. A bare `/` qualifies (it lists everything); an argument (whitespace after the name), the
 * `/ ` escape and a second line all close it. Zero matches also closes it, which is the caller's to decide from the
 * registry's filter, so it is not folded in here.
 */
export function slashPopupShouldOpen(text: string): boolean {
  return /^\/\S*$/.test(text);
}

/** REQ-CHAT-024: the filter the popup runs — the name token so far, without its slash. */
export function slashNameToken(text: string): string {
  return slashPopupShouldOpen(text) ? text.slice(1) : '';
}

/** REQ-CHAT-021: the title of the persistent notice a non-executed slash submission raises. */
export const COMMAND_NOT_RUN_TITLE = 'Command not run';

/** REQ-CHAT-020: the default reason of an unavailable command that states none. */
export function defaultUnavailableReason(name: string): string {
  return `/${name} is not available right now.`;
}

/**
 * REQ-CHAT-020 / REQ-CHAT-021: the message the "Command not run" notice carries for each non-executed outcome.
 * `executed` and `not-a-command` raise no notice, and answer null.
 */
export function slashOutcomeMessage(outcome: SlashOutcome, name: string): string | null {
  switch (outcome.kind) {
    case 'unknown': return `Unknown command /${outcome.name}`;
    case 'unavailable': return outcome.reason.trim() === '' ? defaultUnavailableReason(name) : outcome.reason;
    case 'failed': return outcome.message;
    default: return null;
  }
}
