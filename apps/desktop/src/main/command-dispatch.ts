/**
 * The dispatcher behind `runCommand` (ADR-0019, ADR-0044, REQ-SHELL-020): resolve the window a command was raised for, read
 * the request, call the handler the table names, and answer with a `CommandOutcome` whatever the handler does.
 *
 * **Nothing throws out of here** (`.claude/rules/contracts-and-ipc.md`). Until 2026-11-01 the handler's call was awaited bare
 * while the comment beside it said a throw "is caught below", and nothing below caught it: a handler that threw rejected the
 * renderer's `invoke` with Electron's wrapped error text in place of an outcome
 * (`docs/defects/the-command-dispatcher-catches-nothing-so-a-handler-that-throws-rejects-the-renderers-invoke.md`). A
 * throw is now `command.failed`, its detail the error's message through the one redaction pass (REQ-TOOLS-171) cut to
 * `COMMAND_FAILED_DETAIL_MAX` characters, and one `error` record in the application log carries the command's kind and the
 * stack, through the same pass — never the request, whose payload may carry a prompt, a path or a key (PD-MONITOR-002).
 *
 * `CommandOutcomeSchema.code` is a free string, so `command.failed` widens no vocabulary.
 */
import { redact } from '@rotaris/kernel';
import { CommandRequestSchema, type CommandOutcome, type CommandRequest } from '@rotaris/contracts';
import type { AppLogLevel } from './app-log.js';
import type { CommandHandler, CommandHandlers, MainWindowState } from './commands/context.js';

/** How much of a thrown error's message an outcome carries. */
export const COMMAND_FAILED_DETAIL_MAX = 500;

/** The outcome a handler's throw is answered with. */
export function commandFailed(cause: unknown): CommandOutcome {
  const message = cause instanceof Error ? cause.message : String(cause);
  return { ok: false, code: 'command.failed', headline: 'The command failed', detail: redact(message).slice(0, COMMAND_FAILED_DETAIL_MAX) };
}

export interface CommandDispatch<W extends MainWindowState> {
  /** Every command this product answers, filed under its kind (`CommandHandlers` is total over the contract). */
  readonly handlers: CommandHandlers;
  /** The main window the command speaks for (`MainWindows.forCommand`), or undefined where none is open. */
  readonly forCommand: (senderId: number) => W | undefined;
  /** Resolves once window `wcId`'s workspace is open. */
  readonly awaitWorkspace: (wcId: number) => Promise<void>;
  /** What the answer becomes in the window it is given for (`answerUnderHeldRefusal`, OQ-281). */
  readonly settle: (outcome: CommandOutcome, w: W) => CommandOutcome;
  readonly log: (message: string, level: AppLogLevel) => void;
}

export async function dispatchCommand<W extends MainWindowState>(raw: unknown, senderId: number, deps: CommandDispatch<W>): Promise<CommandOutcome> {
  const w = deps.forCommand(senderId);
  if (!w) return { ok: false, code: 'window.notMain', headline: 'No main window is open' };
  const parsed = CommandRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'command.malformed', headline: 'The request could not be read' };
  const req = parsed.data;
  /**
   * A4: the handler the table names, called with the request narrowed to its own kind. The cast is the one place that
   * narrowing is asserted rather than proved — `handlers[req.kind]` is a union of handlers, and TypeScript cannot pair it
   * with `req` unaided. It is sound because `CommandHandlers` is total over the contract's kinds: every entry answers the
   * kind it is filed under, and a kind with no entry does not compile.
   */
  const handler = deps.handlers[req.kind] as CommandHandler<CommandRequest['kind']>;
  let outcome: CommandOutcome;
  try {
    outcome = await handler(req, { w, senderId, awaitWorkspace: () => deps.awaitWorkspace(w.wcId) });
  } catch (cause) {
    deps.log(`command ${req.kind} failed: its handler threw; answered command.failed (ADR-0019)\n${redact(cause instanceof Error ? cause.stack ?? cause.message : String(cause))}`, 'error');
    return commandFailed(cause);
  }
  return deps.settle(outcome, w);
}
