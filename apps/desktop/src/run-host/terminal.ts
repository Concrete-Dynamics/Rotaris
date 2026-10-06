import { type AuditDecision, type AuditDecisionSource, bytesFor, CONTRACT_SCHEMA_VERSION, type ProcessMessage, type ProcessReply, type TerminalCommand, type TerminalRefusal } from '@rotaris/contracts';
import { asSessionId, redact, toIsoUtc, type Clocks } from '@rotaris/kernel';
import type { StreamSettings, TerminalManager, TerminalStreams } from '@rotaris/agent-tools';
import type { Sessions } from '@rotaris/engine';

/**
 * Part AL — the run host's side of the live terminal (ADR-0021 first executed).
 *
 * The streams registry lives in `agent-tools` beside the PTY (ADR-0020) and is fed by the `terminal` tool; this
 * module does three things at the process boundary and nothing else: it installs the publisher — every frame the
 * registry emits becomes a `publish.terminal` event for main (channel 3) — hands the registry the run's
 * `runtime.terminal_stream_*` settings (REQ-TOOLS-126), and answers the seven `terminal.*` requests
 * (REQ-TOOLS-128, REQ-SHELL-106).
 *
 * REQ-SHELL-107: a user's terminal action is not a tool call — it bypasses permission patterns and is written to the
 * session's permission audit as user-originated input, one entry per submitted line, the typed line and the command
 * text through the ONE redaction pass (REQ-TOOLS-171) before writing. The entry's `decision: user-input` and
 * `source: user` are spec 12's own words (Data & Formats, "Permission audit entries for user terminal actions") and
 * sat OUTSIDE REQ-TOOLS-012/028's closed vocabularies — raised as OQ-54, written as spec 12 says because the writer takes
 * the strings as given. OQ-54's ruling (2026-10-06, R-071, `PD-TOOLS-011`) adds both to the audit vocabularies
 * (`AUDIT_DECISIONS`, `AUDIT_DECISION_SOURCES`), carried by this entry alone.
 */
export interface TerminalHostDeps {
  readonly ready: Promise<TerminalManager | null>;
  readonly send: (m: ProcessMessage) => void;
  readonly sessions: Sessions;
  readonly settings: (workspaceRoot: string) => StreamSettings;
  readonly clocks: Clocks;
  readonly log: (message: string, level?: 'info' | 'warn') => void;
}
export interface TerminalHost {
  handle(req: TerminalCommand): Promise<ProcessReply>;
}

const HEADLINES: Readonly<Record<TerminalRefusal, string>> = {
  ended: 'The process has ended, so it cannot accept input.',
  'unknown-stream': 'No terminal stream with that id exists.',
  'no-kill-capability': 'This terminal has no registered kill capability.',
  'streaming-disabled': 'Live terminal streaming is switched off (runtime.terminal_stream_enabled).',
};
export const AUDIT_REASON = 'The user acted in the terminal directly; no policy applies.';
/** REQ-SHELL-107's `decision` and `source` for a user's own terminal action, members of the audit's vocabularies (PD-TOOLS-011, OQ-54). */
export const USER_TERMINAL_DECISION: AuditDecision = 'user-input';
export const USER_TERMINAL_SOURCE: AuditDecisionSource = 'user';

/** REQ-SHELL-107's detail sentences, one per entry kind. */
export type TerminalAuditEntry = Extract<TerminalCommand, { kind: 'terminal.audit' }>['entry'];
export function auditDetail(entry: TerminalAuditEntry): string {
  switch (entry.kind) {
    case 'line': return `typed ${JSON.stringify(entry.text ?? '')}`;
    case 'control': return `sent ${entry.text ?? 'C-?'}`;
    case 'took-control': return 'took control of the terminal';
    case 'released-control': return 'released control of the terminal';
    case 'kill': return 'killed the process';
  }
}

export function createTerminalHost(deps: TerminalHostDeps): TerminalHost {
  let streams: TerminalStreams | null = null;
  let present: boolean | null = null;
  const decoder = new TextDecoder();
  void deps.ready.then((manager) => {
    present = manager !== null;
    if (!manager) return;
    streams = manager.streams;
    manager.streams.settings = deps.settings;
    manager.streams.onFrame((frame) => deps.send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'publish.terminal', payload: frame } }));
    deps.log('terminal: the live stream publisher is installed (ADR-0021, channel 3)');
  }, (e: unknown) => { present = false; deps.log(`terminal: no stream publisher — the terminal manager did not load: ${String(e)}`, 'warn'); });

  const refused = (error: TerminalRefusal): ProcessReply => ({ kind: 'refused', code: `terminal.${error}`, headline: HEADLINES[error] });
  const ack: ProcessReply = { kind: 'ack' };

  return {
    async handle(req) {
      if (!streams) {
        if (present === false) return { kind: 'refused', code: 'terminal.unavailable', headline: 'No shell is present on this host, so there is no terminal (REQ-TOOLS-104).' };
        return { kind: 'refused', code: 'terminal.starting', headline: 'The terminal is still starting.' };
      }
      switch (req.kind) {
        case 'terminal.streams': {
          const list = streams.list(req.sessionId);
          // ADR-0021: a screen frame on attach, so a late attacher is given the output accumulated so far (REQ-SHELL-104).
          void streams.resync(req.sessionId).catch((e: unknown) => deps.log(`terminal: resync of ${req.sessionId} failed: ${String(e)}`, 'warn'));
          return { kind: 'terminal.streams', streams: list };
        }
        case 'terminal.sendKeys': {
          // Part AL2: every key is AM's `EncodedKey`, and `bytesFor` (contracts `terminal-keys.ts`, the ONE table) gives its
          // bytes — text verbatim, a named key its CSI form, a chord its control byte (REQ-SHELL-096/166). A key the table
          // has no bytes for transmits NOTHING and is skipped, never substituted (REQ-SHELL-096's last sentence; the
          // encoder never produces one, so this is the guard for a request that did not come from the grid). Receipt
          // order is write order (REQ-SHELL-166's ordering criterion); one request's keys are written as one string.
          const bytes = req.keys.map((k) => { try { return decoder.decode(bytesFor(k)); } catch { return ''; } }).join('');
          if (bytes === '') { const meta = streams.metaOf(req.streamId); return meta ? (meta.running && meta.acceptsInput ? ack : refused('ended')) : refused('unknown-stream'); }
          const r = streams.sendKeys(req.streamId, bytes);
          return r.ok ? ack : refused(r.error);
        }
        case 'terminal.resize': {
          const r = streams.resize(req.streamId, req.cols, req.rows);
          return r.ok ? ack : refused(r.error);
        }
        case 'terminal.interrupt': {
          const r = streams.interrupt(req.streamId);
          return r.ok ? ack : refused(r.error);
        }
        case 'terminal.endInput': {
          const r = streams.endInput(req.streamId);
          return r.ok ? ack : refused(r.error);
        }
        case 'terminal.kill': {
          const r = await streams.kill(req.streamId);
          if (r.ok) deps.log(`terminal: ${req.streamId} killed from the terminal window (REQ-SHELL-092)`);
          return r.ok ? ack : refused(r.error);
        }
        case 'terminal.audit': {
          const meta = streams.metaOf(req.streamId);
          if (!meta) return refused('unknown-stream');
          const writer = deps.sessions.writer(asSessionId(meta.sessionId));
          if (!writer) return { kind: 'refused', code: 'terminal.session-not-live', headline: 'That session is not live, so its audit cannot be written.' };
          const summary = redact(`terminal ${req.streamId}: ${auditDetail(req.entry)} (in: ${meta.command ?? ''})`);
          const r = writer.recordDecision({
            timestamp: toIsoUtc(deps.clocks.wall.instant()), session_id: meta.sessionId, agent_id: meta.agentId ?? '', persona: meta.displayName, tool_name: 'terminal',
            decision: USER_TERMINAL_DECISION, rule_id: '', source: USER_TERMINAL_SOURCE, summary, reason: AUDIT_REASON,
          });
          if (!r.ok) return { kind: 'refused', code: `terminal.audit.${r.error.code}`, headline: 'The audit entry could not be written', detail: 'reason' in r.error ? r.error.reason : r.error.code };
          return ack;
        }
      }
    },
  };
}
