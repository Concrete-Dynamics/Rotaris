import type { ProcessEvent } from '@rotaris/contracts';

/**
 * The application log (PD-MONITOR-002): what the main process writes to its standard output — its own lines, and
 * the `log` events the run host and the workspace service send it. It is not the per-session log of REQ-SESSION-142
 * and REQ-MONITOR-238, and `session_log_level` (REQ-CONFIG-121) does not reach it.
 *
 * Every line carries its level as a field — a column of its own ahead of the message, never text inside it — and a
 * line is recorded only when its level is at or above the threshold: `info`, unless `ROTARIS_APP_LOG_LEVEL` names
 * another. That variable is the only thing that moves it. No configuration key, setting or command reaches this
 * module; `index.ts` reads the variable once, at start, and builds the one logger every writer in main is handed.
 *
 * Before this, a `debug` line and an `error` line reached the log identically and nothing could be left out of it:
 * a driven launch measured on 2026-09-16 held 195 lines, 141 of them one MCP server's `debug` stderr
 * (`docs/defects/fixed/the-application-log-keeps-every-level-because-nothing-reads-one.md`).
 */

/**
 * A line's level. It is the child protocol's own type (`process-protocol.ts`), so a forwarded line keeps the level
 * its child gave it with nothing mapped in between, and main's own lines use the same four.
 */
export type AppLogLevel = Extract<ProcessEvent, { kind: 'log' }>['level'];

/** The order the threshold compares in. Total over the protocol's levels: one added there and not here fails to compile. */
const RANK: Record<AppLogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * The word a line is written with, which is also the word the variable accepts for that level. PD-MONITOR-002 names
 * `debug`, `info`, `warning` and `error`, so the protocol's `warn` is written `warning`: a reader can set the variable
 * to exactly the word they see in the level column.
 */
const WORD: Record<AppLogLevel, string> = { debug: 'debug', info: 'info', warn: 'warning', error: 'error' };
const WORD_WIDTH = Math.max(...Object.values(WORD).map((w) => w.length));

/** The one switch (PD-MONITOR-002). */
export const APP_LOG_LEVEL_VARIABLE = 'ROTARIS_APP_LOG_LEVEL';

/**
 * The threshold the variable's value names: `debug`, `info`, `warning` or `error`, in any casing. Unset or empty is
 * `info`. Any other value is `info` too — `warn` among them, because the directive's list is the list — and comes
 * back with a warning saying so, the shape the session log's `parseLogLevel` answers an unknown level with.
 */
export function appLogThreshold(value: string | undefined): { readonly threshold: AppLogLevel; readonly warning: string | null } {
  switch (value?.toLowerCase()) {
    case undefined:
    case '':
    case 'info': return { threshold: 'info', warning: null };
    case 'debug': return { threshold: 'debug', warning: null };
    case 'warning': return { threshold: 'warn', warning: null };
    case 'error': return { threshold: 'error', warning: null };
    default: return { threshold: 'info', warning: `${APP_LOG_LEVEL_VARIABLE} '${value}' is not one of debug, info, warning or error; recording info and above` };
  }
}

/**
 * One record as written: `[main <instant>] <level> <source>: <message>`. The level is padded to one width so the
 * column lines up; the source is present only on a line forwarded from a child (`run host`, `workspace service`).
 * A message of several lines — a stack — is written as several lines, each with the same stamp, level and source,
 * so no line of the log is without its level. A message's own final line break ends its last line rather than
 * opening an empty one; an empty message is still one line.
 */
export function formatAppLogLine(at: string, level: AppLogLevel, source: string | null, message: string): string {
  const head = `[main ${at}] ${WORD[level].padEnd(WORD_WIDTH)} ${source === null ? '' : `${source}: `}`;
  const lines = message.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.map((line) => `${head}${line}`).join('\n');
}

/** Write one line: at `level`, from `source` (`null` for main's own), unless the threshold leaves it out. */
export type AppLog = (level: AppLogLevel, source: string | null, message: string) => void;

export interface AppLogDeps {
  readonly threshold: AppLogLevel;
  /** The instant a line is written at, as ISO-8601 UTC. */
  readonly now: () => string;
  /** Where a recorded line goes: main's standard output. */
  readonly write: (line: string) => void;
}

/** PD-MONITOR-002's predicate, in one place: a line below the threshold is neither stamped nor formatted nor written. */
export function createAppLog(deps: AppLogDeps): AppLog {
  const floor = RANK[deps.threshold];
  return (level, source, message) => {
    if (RANK[level] < floor) return;
    deps.write(formatAppLogLine(deps.now(), level, source, message));
  };
}
