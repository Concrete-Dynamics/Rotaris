import { isNavigationKey, type EncodedKey, type TerminalCommand } from '@rotaris/contracts';

/**
 * Part AM — REQ-SHELL-107's renderer half. Typed characters accumulate per stream and become ONE entry when Enter
 * submits the line, so a held key never floods the log; Backspace removes from the pending buffer; navigation keys
 * are not logged; a control chord flushes the pending line and then logs itself; taking control, releasing control
 * and kill are their own entries. The sentences ("took control of the terminal", "sent C-c") and the secret redaction
 * of both the line and the command context are the run host's (ADR-0047: written by the run host through the one
 * session writer; the renderer cannot reach the log). `text` carries the raw line for a `line` entry and `C-<letter>`
 * for a `control` entry.
 */
export type AuditEntry = Extract<TerminalCommand, { kind: 'terminal.audit' }>['entry'];

export class AuditBuffer {
  private pending = '';

  get pendingLine(): string { return this.pending; }

  onKey(key: EncodedKey): readonly AuditEntry[] {
    if (key.kind === 'text') { this.pending += key.text; return []; }
    if (isNavigationKey(key)) return [];
    if (key.key === 'BS') { this.pending = Array.from(this.pending).slice(0, -1).join(''); return []; }
    if (key.key === 'ENTER') return this.flush();
    // A control chord: the pending line first, then the chord.
    return [...this.flush(), { kind: 'control', text: key.key }];
  }

  /** The Interrupt and End-input controls are control sequences too (REQ-SHELL-093) and log the same way. */
  control(chord: `C-${string}`): readonly AuditEntry[] { return [...this.flush(), { kind: 'control', text: chord }]; }

  tookControl(): readonly AuditEntry[] { return [{ kind: 'took-control' }]; }
  /** What was typed and not yet submitted still reached the process, so releasing flushes it before its own entry. */
  releasedControl(): readonly AuditEntry[] { return [...this.flush(), { kind: 'released-control' }]; }
  kill(): readonly AuditEntry[] { return [...this.flush(), { kind: 'kill' }]; }

  /** A submitted line. An empty pending buffer submits nothing worth auditing — a held Enter is the held key REQ-SHELL-107 names. */
  private flush(): readonly AuditEntry[] {
    if (this.pending === '') return [];
    const text = this.pending;
    this.pending = '';
    return [{ kind: 'line', text }];
  }
}
