/**
 * REQ-TOOLS-112/113: the six-test ordered classification and the three independent output checks plus
 * the pipeline check; REQ-TOOLS-098/100: the `[terminal_output]` section that is never omitted and the
 * `[terminal_diagnostic]` block with sorted keys and null-valued keys dropped.
 */
export type FailureKind = 'timeout' | 'invalid_request' | 'execution_error' | 'sandbox_unavailable';
export type OutcomeKind = 'success' | 'shell_failure' | 'suspicious_success' | 'soft_pause' | 'timeout' | 'invalid_request' | 'execution_error' | 'background_running' | 'background_terminal' | 'sandbox_unavailable';
export type Severity = 'info' | 'warning' | 'error';
export type BackgroundStatus = 'running' | 'completed' | 'failed' | 'killed' | 'timeout';

export interface TerminalFacts {
  readonly failureKind?: FailureKind | null;
  readonly exitCode: number | null;
  readonly output: string;
  readonly command: string;
  readonly backgroundStatus?: BackgroundStatus | null;
}

interface FailureMarker {
  readonly text: string;
  readonly caseSensitive: boolean;
}

/**
 * REQ-TOOLS-113's literal failure markers, in its fixed order. Four are searched case-insensitively; the fifth,
 * `FAILED ` with its trailing space, matches in capitals only (PD-TOOLS-003) — test runners print it that way,
 * and the lower-case `failed ` of ordinary prose, docker's `failed to connect to the docker API` among it, is
 * what warned falsely.
 */
const MARKERS: readonly FailureMarker[] = [
  { text: 'Traceback (most recent call last):', caseSensitive: false },
  { text: 'ERROR: file or directory not found', caseSensitive: false },
  { text: 'no tests ran', caseSensitive: false },
  { text: 'AssertionError', caseSensitive: false },
  { text: 'FAILED ', caseSensitive: true },
];

/** Whether `text` carries `marker` in the casing it is matched in — the one test the search and the quoted line share. */
function containsMarker(text: string, marker: FailureMarker): boolean {
  return marker.caseSensitive ? text.includes(marker.text) : text.toLowerCase().includes(marker.text.toLowerCase());
}

/**
 * Commands whose exit 1 is a success-with-output convention, not a failure. `git diff` (and
 * `diff --no-index`) exits 1 when differences were found — the payload the caller asked for — and
 * `grep` exits 1 when nothing matched, which is an answer rather than an error. `findstr` is the
 * Windows native with the same no-match convention. Matched on the command's own leading tokens
 * (case-insensitive head, REQ-TOOLS-033's rule), so `git diff --no-index` and `git --no-pager diff`
 * both read as diff invocations while `git difftool` does not.
 */
function successExitOne(command: string): boolean {
  const head = command.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const rest = command.trim().split(/\s+/).slice(1).map((t) => t.toLowerCase());
  if (head === 'grep' || head === 'egrep' || head === 'fgrep' || head === 'rg' || head === 'findstr') return true;
  if (head === 'diff') return true;
  if (head === 'git' && rest.includes('diff')) return true;
  return false;
}

/** Longest quoted line in a marker warning; past this the line is cut and the cut is shown. */
const MARKER_LINE_CAP = 120;

/**
 * REQ-TOOLS-113's marker warning "names the marker that matched", and naming it alone is what cost run
 * `2e21e324` two explanations: `FAILED ` matched docker's `failed to connect to the docker API` on one
 * exit-0 command and git's own chatter on another, and from the warning by itself neither the agent nor
 * the reader could tell either from a test runner's `FAILED test_a`. The marker is still named first —
 * the requirement's clause is untouched — and the line it matched on is quoted after it, so the judgement
 * is one read rather than a second pass over the whole output. Both of that run's matches were lower case
 * and no longer warn at all (PD-TOOLS-003). The line is found with `containsMarker`, the test the search
 * used, so a `failed ` line ahead of the `FAILED ` line that matched is never the one quoted.
 */
function markerWarning(output: string, marker: FailureMarker): string {
  const line = (output.split('\n').find((l) => containsMarker(l, marker)) ?? '').trim();
  if (line === '') return `Output contains the failure marker '${marker.text.trim()}'.`;
  const quoted = line.length > MARKER_LINE_CAP ? `${line.slice(0, MARKER_LINE_CAP - 1)}…` : line;
  return `Output contains the failure marker '${marker.text.trim()}', in: ${quoted}`;
}

/** REQ-TOOLS-113: at most one warning per check, in the fixed order; de-duplicated with the first occurrence kept. */
export function outputWarnings(command: string, output: string, exitCode: number | null): string[] {
  const out: string[] = [];
  if (exitCode === 0) {
    const marker = MARKERS.find((m) => containsMarker(output, m));
    if (marker) out.push(markerWarning(output, marker));
    const count = /(^|\n)[^\n]*\bfound (\d+) errors?\b/i.exec(output);
    if (count && Number(count[2]) !== 0) out.push(`Output reports ${count[2]} error(s).`);
    if (/(^|\n)=+[^\n]*failed[^\n]*=+\s*(\n|$)/i.test(output)) out.push('A test-runner failure banner appears in the output.');
  }
  if (command.includes('|') && /(error:|failed|traceback|no tests ran)/i.test(output)) out.push('Pipeline command may have hidden an upstream failure exit code.');
  return [...new Set(out)];
}

/** REQ-TOOLS-112: the first test that applies decides both fields. */
export function classifyOutcome(f: TerminalFacts, warnings: readonly string[]): { outcomeKind: OutcomeKind; severity: Severity } {
  if (f.failureKind) {
    switch (f.failureKind) {
      case 'timeout': return { outcomeKind: 'timeout', severity: 'error' };
      case 'invalid_request': return { outcomeKind: 'invalid_request', severity: 'warning' };
      case 'execution_error': return { outcomeKind: 'execution_error', severity: 'error' };
      case 'sandbox_unavailable': return { outcomeKind: 'sandbox_unavailable', severity: 'error' };
    }
  }
  if (f.backgroundStatus) {
    if (f.backgroundStatus === 'running') return { outcomeKind: 'background_running', severity: 'info' };
    return { outcomeKind: 'background_terminal', severity: f.backgroundStatus === 'completed' ? 'info' : f.backgroundStatus === 'killed' ? 'warning' : 'error' };
  }
  if (f.exitCode === -1) return { outcomeKind: 'soft_pause', severity: 'warning' };
  // REQ-TOOLS-112 test 4, narrowed: a known success-with-output convention (git diff, diff, grep)
  // reads exit 1 as success, not shell_failure. The run's `git diff --no-index` with differences was
  // classified a failure the agent then had to explain away; the payload was the answer, not an error.
  if (f.exitCode === 1 && successExitOne(f.command)) return { outcomeKind: 'success', severity: 'info' };
  if (f.exitCode !== null && f.exitCode !== 0) return { outcomeKind: 'shell_failure', severity: 'error' };
  if (f.exitCode === 0 && warnings.some((w) => !w.startsWith('Pipeline'))) return { outcomeKind: 'suspicious_success', severity: 'warning' };
  return { outcomeKind: 'success', severity: 'info' };
}

/** REQ-TOOLS-100: sorted keys, null-valued keys dropped. */
export function diagnosticBlock(fields: Record<string, unknown>): string {
  const clean: Record<string, unknown> = {};
  for (const k of Object.keys(fields).sort()) if (fields[k] !== null && fields[k] !== undefined) clean[k] = fields[k];
  return `[terminal_diagnostic] ${JSON.stringify(clean)}`;
}

/** REQ-TOOLS-098/100: the output section, `[partial_terminal_output]` before a hard timeout. */
export function outputSection(output: string, partial: boolean): string {
  return `[${partial ? 'partial_terminal_output' : 'terminal_output'}]\n${output === '' ? '(no output)' : output}`;
}

/** REQ-TOOLS-105: `$ command [timeout: Ns] [reset terminal] [background] [session: id] [action]`. */
export function renderAction(a: { command: string; timeout?: number | undefined; reset?: boolean; background?: boolean; session_id?: string | undefined; session_action?: string | undefined }): string {
  const parts = [`$ ${a.command}`];
  if (a.timeout !== undefined) parts.push(`[timeout: ${a.timeout}s]`);
  if (a.reset) parts.push('[reset terminal]');
  if (a.background) parts.push('[background]');
  if (a.session_id) parts.push(`[session: ${a.session_id}]`);
  if (a.session_action) parts.push(`[${a.session_action}]`);
  return parts.join(' ');
}

/**
 * Strip VT/ANSI control sequences from the RAW stream, for the marker scan of ADR-0020 — which works on the
 * raw stream by design, because the marker has to be found the instant the shell writes it.
 *
 * It is NOT what the agent's capture is built from any more. Deleting a sequence is not emulating it: a tab
 * stop ConPTY expressed as `ESC[<n>C` came back to the agent as `ab` where the screen read `a       b`, and a
 * `Clear-Host` came back as the rows of the screen left behind as blank lines. That capture is ADR-0021's
 * headless screen now (`ForegroundSession`); this stays for the scan, and for the marker only.
 */
export function stripVt(text: string): string {
  return text
    // CSI: \x1b [ params intermediates final
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    // OSC: \x1b ] ... BEL | \x1b backslash
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    // charset designations and single-character escapes
    .replace(/\x1b[()][A-Za-z0-9]/g, '')
    .replace(/\x1b[=>78MHDcN]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/\r/g, '');
}
