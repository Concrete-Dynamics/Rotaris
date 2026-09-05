/**
 * ADR-0034: every stage of the MCP configuration pipeline returns a value AND a diagnostics list; a diagnostic is a
 * value carrying its severity, a de-duplication key and its scope, and ONE sink (the run host's) applies the scope
 * rules and fans out to REQ-MCP-044's two channels. The four de-duplication scopes the requirements name:
 *   `load`    — once per configuration load (REQ-MCP-027's unknown-key warning);
 *   `process` — once per process (REQ-MCP-041's detailed log line, REQ-MCP-058's inert grant, REQ-MCP-048's identity);
 *   `session` — once per server per session (REQ-MCP-069).
 * A diagnostic with no key is delivered every time it is produced.
 */
export type DiagnosticSeverity = 'info' | 'warning' | 'error';
export type DiagnosticScope = 'load' | 'process' | 'session';

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly scope: DiagnosticScope;
  /** De-duplication key within the scope; empty means never de-duplicated. */
  readonly key: string;
  /** REQ-MCP-044: whether this reaches the user's two channels (a warning notice and a session issue) or the log alone. */
  readonly channels: 'user' | 'log';
  readonly server?: string;
  readonly persona?: string;
}

export interface Staged<T> {
  readonly value: T;
  readonly diagnostics: readonly Diagnostic[];
}

export const warn = (message: string, scope: DiagnosticScope, key: string, extra: Partial<Pick<Diagnostic, 'server' | 'persona' | 'channels'>> = {}): Diagnostic => ({ severity: 'warning', message, scope, key, channels: extra.channels ?? 'user', ...(extra.server === undefined ? {} : { server: extra.server }), ...(extra.persona === undefined ? {} : { persona: extra.persona }) });
export const info = (message: string, scope: DiagnosticScope, key: string, extra: Partial<Pick<Diagnostic, 'server' | 'persona'>> = {}): Diagnostic => ({ severity: 'info', message, scope, key, channels: 'log', ...(extra.server === undefined ? {} : { server: extra.server }), ...(extra.persona === undefined ? {} : { persona: extra.persona }) });
export const fatal = (message: string, key: string, extra: Partial<Pick<Diagnostic, 'server' | 'persona'>> = {}): Diagnostic => ({ severity: 'error', message, scope: 'load', key, channels: 'user', ...(extra.server === undefined ? {} : { server: extra.server }), ...(extra.persona === undefined ? {} : { persona: extra.persona }) });

/**
 * The ONE sink: keeps what each scope has already delivered and answers whether a diagnostic is new. The `load` scope
 * is cleared by `newLoad()`, the `session` scope by `newSession(id)`, the `process` scope never.
 */
export class DiagnosticSink {
  private readonly perLoad = new Set<string>();
  private readonly perProcess = new Set<string>();
  private readonly perSession = new Map<string, Set<string>>();

  newLoad(): void {
    this.perLoad.clear();
  }
  endSession(sessionId: string): void {
    this.perSession.delete(sessionId);
  }
  /** Whether `d` should be delivered now, recording it as delivered when so. */
  admit(d: Diagnostic, sessionId = ''): boolean {
    if (d.key === '') return true;
    const set = d.scope === 'load' ? this.perLoad : d.scope === 'process' ? this.perProcess : this.sessionSet(sessionId);
    const k = `${d.severity}|${d.key}`;
    if (set.has(k)) return false;
    set.add(k);
    return true;
  }
  private sessionSet(sessionId: string): Set<string> {
    let s = this.perSession.get(sessionId);
    if (!s) { s = new Set(); this.perSession.set(sessionId, s); }
    return s;
  }
}
