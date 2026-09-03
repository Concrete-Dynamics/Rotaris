import { toIsoUtc, type WallClock } from '@rotaris/kernel';

/**
 * REQ-SESSION-142: per-session debug logging to the session's log, a file a person opens in a text
 * reader (REQ-SESSION-002/191), at the configured level — default WARNING; DEBUG/INFO/WARNING/ERROR or
 * an integer accepted; an unknown string falls back to WARNING with a warning of its own. The engine
 * writes lines through an injected appender (the run-host root supplies the file); `close()` restores
 * whatever the run changed, which here is nothing beyond the sink itself.
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
const RANK: Record<LogLevel, number> = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40 };

export function parseLogLevel(value: string | undefined | null): { level: LogLevel; warning: string | null } {
  const v = (value ?? '').trim();
  if (v === '') return { level: 'WARNING', warning: null };
  const upper = v.toUpperCase();
  if (upper === 'WARN') return { level: 'WARNING', warning: null };
  if (upper in RANK) return { level: upper as LogLevel, warning: null };
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    const level: LogLevel = n >= 40 ? 'ERROR' : n >= 30 ? 'WARNING' : n >= 20 ? 'INFO' : 'DEBUG';
    return { level, warning: null };
  }
  return { level: 'WARNING', warning: `unknown session log level '${v}'; using WARNING` };
}

export interface SessionLogDeps {
  readonly wall: WallClock;
  readonly level: LogLevel;
  readonly append: (line: string) => void;
}

export class SessionLog {
  private open = true;
  constructor(private readonly deps: SessionLogDeps) {}
  write(level: LogLevel, message: string): void {
    if (!this.open || RANK[level] < RANK[this.deps.level]) return;
    try {
      this.deps.append(`${toIsoUtc(this.deps.wall.instant())} ${level.padEnd(7)} ${message.replace(/\r?\n/g, ' ')}\n`);
    } catch {
      /* a log that cannot be written never fails the run */
    }
  }
  debug(m: string): void { this.write('DEBUG', m); }
  info(m: string): void { this.write('INFO', m); }
  warn(m: string): void { this.write('WARNING', m); }
  error(m: string): void { this.write('ERROR', m); }
  /** REQ-SESSION-142: prior logging state restored at run end — nothing later reaches the file. */
  close(): void {
    this.open = false;
  }
}
