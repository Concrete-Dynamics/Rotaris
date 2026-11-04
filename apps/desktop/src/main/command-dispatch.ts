/**
 * The dispatcher behind `runCommand` (ADR-0019, ADR-0044, REQ-SHELL-020): resolve the window a command was raised for, read
 * the request, call the handler the table names, and answer with a `CommandOutcome` whatever the handler does.
 *
 * **Nothing throws out of here** (`.claude/rules/contracts-and-ipc.md`). Until 2026-11-01 the handler's call was awaited bare
 * while the comment beside it said a throw "is caught below", and nothing below caught it: a handler that threw rejected the
 * renderer's `invoke` with Electron's wrapped error text in place of an outcome
 * (`docs/archive/defects/the-command-dispatcher-catches-nothing-so-a-handler-that-throws-rejects-the-renderers-invoke.md`). A
 * throw is now `command.failed`, its detail the error's message through the one redaction pass (REQ-TOOLS-171) cut to
 * `COMMAND_FAILED_DETAIL_MAX` characters, and one `error` record in the application log carries the command's kind and the
 * stack, through the same pass — never the request, whose payload may carry a prompt, a path or a key (PD-MONITOR-002).
 *
 * `CommandOutcomeSchema.code` is a free string, so `command.failed` widens no vocabulary.
 *
 * **A malformed request leaves one `warning` line** (OQ-485, ruled 2026-11-04; PD-MONITOR-002). Until then a request
 * `CommandRequestSchema` could not read, or one past OQ-467's bounds, was answered `command.malformed` with no line, so a stale
 * renderer surviving an in-place update (ADR-0044, Versioning) left nothing to read after the incident. The line names the
 * window that sent it, the class (`malformedClass`), the `kind` only where it is a member of the command union, and
 * `malformedHeadline`'s text, which names the field and the bound — never a value, the request least of all. A burst is
 * bounded per sender and per class by the fold the process link uses (`RefusalFold`, `@rotaris/shell`): the first in full,
 * the rest of a 60 s window counted into one line.
 */
import { redact, type Timers } from '@rotaris/kernel';
import { CommandRequestSchema, malformedClass, malformedHeadline, type CommandOutcome, type CommandRequest, type MalformedClass } from '@rotaris/contracts';
import { REFUSAL_FOLD_WINDOW_MS, RefusalFold } from '@rotaris/shell';
import type { AppLogLevel } from './app-log.js';
import type { CommandHandler, CommandHandlers, MainWindowState } from './commands/context.js';

/** The kinds of the command union: the one `kind` a refusal line may name (OQ-485), since any other is the sender's own text. */
const COMMAND_KINDS: ReadonlySet<string> = new Set(CommandRequestSchema.options.map((option) => option.shape.kind.value));

/** OQ-485: the bound on main's malformed-command lines — one for the application, every line written at `warning`. */
export function commandRefusals(timers: Timers, log: (message: string, level: AppLogLevel) => void): RefusalFold {
  return new RefusalFold(timers, (line) => { log(line, 'warn'); });
}

/** OQ-485: one malformed request, written or counted under its sender's and its class's window. */
function refuseMalformed(refusals: RefusalFold, raw: unknown, senderId: number, windowId: number, cls: MalformedClass, headline: string): void {
  const kind = cls !== 'unknown kind' && typeof raw === 'object' && raw !== null && 'kind' in raw && typeof raw.kind === 'string' && COMMAND_KINDS.has(raw.kind) ? `, kind ${raw.kind}` : '';
  const from = `from window ${String(senderId)}${senderId === windowId ? '' : ` for window ${String(windowId)}`}`;
  refusals.refuse(
    `${String(senderId)}:${cls}`,
    () => `refused a command ${from} (${cls}${kind}): ${headline}; answered command.malformed (OQ-485)`,
    (count) => `refused ${String(count)} more command${count === 1 ? '' : 's'} ${from} (${cls}) within ${String(REFUSAL_FOLD_WINDOW_MS / 1000)} s of the first; answered command.malformed (OQ-485)`,
  );
}

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
  /** OQ-485: the fold a malformed request's `warning` line is written through (`commandRefusals`), one for the application. */
  readonly refusals: RefusalFold;
}

export async function dispatchCommand<W extends MainWindowState>(raw: unknown, senderId: number, deps: CommandDispatch<W>): Promise<CommandOutcome> {
  const w = deps.forCommand(senderId);
  if (!w) return { ok: false, code: 'window.notMain', headline: 'No main window is open' };
  const parsed = CommandRequestSchema.safeParse(raw);
  // OQ-467: a request past a bound is refused here, its headline naming the field and the bound and never the value; OQ-485:
  // with one warning line, folded.
  if (!parsed.success) {
    const headline = malformedHeadline(parsed.error.issues);
    refuseMalformed(deps.refusals, raw, senderId, w.wcId, malformedClass(parsed.error.issues), headline);
    return { ok: false, code: 'command.malformed', headline };
  }
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
