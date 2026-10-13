/**
 * The terminal shapes the live run replays, and the reader that finds them again in the store.
 *
 * These live here rather than inside `live-run.mjs` for one reason: they are the part of the `terminal` scenario
 * that can be wrong SILENTLY. A pattern that no longer matches its own command turns every check in that
 * scenario into "the model never attempted it" — a NOTE, a green run, and a question that stopped being asked
 * without anyone being told. `terminal-shapes.test.ts` pins the round trip so that failure is loud and local.
 *
 * Each shape is a command a recorded defect actually carried, not a plausible command of the same family.
 * `codebase.md`'s strongest finding of 2026-09-12 is why: sixty real-PTY runs at four geometries could not
 * reproduce a concatenation because the trigger was an empty write between two non-empty ones, present in the
 * production commands and in none of the sixty. Sixty negative runs are not a negative result when none of them
 * carries the input that failed.
 *
 * Nothing here is product code. It runs only from the live run.
 */

/** How wide one line of the long-output shape is, past any sane single-write boundary. */
const PAD = 'x'.repeat(100);
/** How many lines the long-output shape emits. The assertion counts distinct markers against this. */
export const LONG_OUTPUT_LINES = 40;

/**
 * The input line the long-command shape must outgrow: Linux's canonical-mode line discipline keeps 4,095 characters of
 * one line (termios(3)), and live-run finding M1's 4,304-byte wrapper reached the shell cut there
 * (`docs/defects/fixed/a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole.md`). A command
 * this long is longer than its own one-line wrapper could ever be under the cap, whatever the wrapper adds.
 */
export const PTY_INPUT_LINE_BYTES = 4_096;
/** How many rows the long-command shape's here-document carries: enough that the command alone outgrows the line. */
export const LONG_COMMAND_ROWS = 56;

/**
 * The long-command shape's command (live-run finding M1): a here-document of `LONG_COMMAND_ROWS` rows read by `wc -c`,
 * about 4.7 KB, so the one-line carrier ADR-0020 used before 2026-10-06 is past the PTY's input line. Its delimiter is
 * `ROWS`, never `EOF`, so the here-string shape's pattern does not read it, and it carries no pipe, no `LINE-` and no
 * `sleep`, so no other shape's does either.
 */
function longCommand() {
  const rows = Array.from({ length: LONG_COMMAND_ROWS }, (_, i) => `row-${String(i + 1).padStart(2, '0')} 0123456789 abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789`);
  return [`wc -c <<'ROWS'`, ...rows, 'ROWS'].join('\n');
}

/**
 * REQ-CONFIG-116's default for `runtime.shell_command_timeout`, in seconds: the hard cap (`hardMs`) a terminal call that
 * supplies no `timeout` is bounded by (REQ-TOOLS-097). The live run's sandbox does not set the key, so the default governs.
 */
export const DEFAULT_SHELL_COMMAND_TIMEOUT_S = 100;
/** How often the `steady` shape prints, and how many lines: well inside the 30 s no-output window, and well past the cap. */
export const STEADY_INTERVAL_MS = 2_000;
export const STEADY_TICKS = 65;

/**
 * The `steady` shape's command: one `tick-<n>` line every `STEADY_INTERVAL_MS` for `STEADY_TICKS` lines (130 s), issued with
 * no `timeout`. It never goes quiet for the no-output window, so REQ-TOOLS-098's soft pause never fires, and it runs past
 * the default hard cap, so the cap is the bound that ends it. The `wedge` prints nothing and soft-pauses 70 s before the cap
 * (`docs/defects/fixed/the-live-runs-terminal-wedge-can-never-reach-the-default-hard-cap.md`). No `$`, so PowerShell's
 * double quotes expand nothing in it; no `setTimeout`, `sleep` or `LINE-`, so no other shape's pattern reads it.
 */
function steadyCommand() {
  return `node -e "let n = 0; const t = setInterval(() => { n += 1; console.log('tick-' + n); if (n === ${STEADY_TICKS}) clearInterval(t); }, ${STEADY_INTERVAL_MS})"`;
}

/**
 * The shapes, in the dialect of one platform: eleven on Windows, fifteen elsewhere.
 *
 * `match` is a pattern rather than a substring because the question is whether the SHAPE was issued, not
 * whether the model reproduced this file's whitespace. Too strict and a call that happened reads as a call that
 * did not; too loose and one shape's assertions run against another shape's call. The test pins both directions.
 */
export function terminalShapes(platform = process.platform) {
  const node = 'node -e "setTimeout(() => {}, 45000)"';
  const failed = `node -e "console.log('failed to connect to the docker API'); process.exit(0)"`;
  const diff = 'git --no-pager diff --no-index -- package.json src/todos.js';
  const win = platform === 'win32';
  const common = [
    // `hardMs` was passed by `index.ts` and read nowhere, so a call supplying no `timeout` had the soft pause
    // and no hard cap at all — REQ-TOOLS-097 wants both bounds with the first to fire governing.
    { id: 'wedge', match: /setTimeout/, command: node },
    // Live-run finding L2: an empty poll right after the wedge's soft pause returned in under a millisecond saying "No
    // output for 30 seconds", and the model counted thirty seconds a poll. `prompt` is how the list names it, since the
    // command itself is empty; the scenario reads the first empty-command call after the wedge.
    { id: 'poll', match: /^$/, command: '', prompt: 'an empty command (command "") — one poll of the command above, at once' },
    // `docs/defects/fixed/a-poll-after-c-c-says-the-interrupted-command-is-still-running.md` (OQ-147): REQ-TOOLS-098's
    // other advice, the interrupt. An interactive shell that takes it abandons the rest of the wrapper's line, so the end
    // frame never prints, and every poll before the agent's next command read "still running" over a process that had
    // died. `prompt` asks for the poll after it too, which the scenario reads as the first empty-command call after the
    // keystroke: a second empty-command shape would match the `poll` shape's command.
    { id: 'interrupt', match: /^C-c$/, command: 'C-c', prompt: 'the keystroke C-c with is_input=true (command "C-c") — interrupt the command above; then one more empty command (command "") to poll it' },
    // `docs/defects/fixed/a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced.md` (live-run finding a71-8,
    // OQ-164): the third move after a soft pause, a new command, which the shell queues behind the paused one. In the
    // autopsy's run the next command waited 5.9 s behind the wedge and said only "exited with code 0", and the wedge's own
    // end was never reported. A second wedge, 45 s so it soft-pauses at 30 s and is still running when the next command
    // is issued unless the model takes 15 s; either way the next command's observation must report its end.
    { id: 'wedge-again', match: /sleep\s+(?:-Seconds\s+)?45\b/i, command: win ? "Start-Sleep -Seconds 45; Write-Output 'slept'" : "sleep 45; printf '%s\\n' slept" },
    { id: 'behind-paused', match: /behind-the-wedge/, command: win ? "Write-Output 'behind-the-wedge'" : "printf '%s\\n' behind-the-wedge" },
    // Run `2e21e324`'s docker line, in the lower case it was recorded in, at exit 0. It warned as REQ-TOOLS-113's
    // `FAILED ` marker; PD-TOOLS-003 matches that marker in capitals only, so it must not warn now. A regression
    // guard, as `diff-exit-1` is for ESC-41.
    { id: 'failed-word', match: /failed\s+to\s+connect\s+to\s+the\s+docker\s+API/, command: failed },
    // ESC-41's carve-out: `git diff` exiting 1 IS the answer, and classifying it a failure made the agent
    // explain away its own evidence.
    { id: 'diff-exit-1', match: /--no-index/, command: diff },
  ];
  // REQ-TOOLS-097's default-path hard cap (`hardMs`, REQ-CONFIG-116's `runtime.shell_command_timeout`): a command that keeps
  // printing past it, issued with no `timeout`. Last on both platforms: the cap resets the session's shell, and no shape after
  // it should meet a fresh one.
  const steady = { id: 'steady', match: /setInterval/, command: steadyCommand() };
  return platform === 'win32'
    ? [
      // A multi-line command lost its newlines in the PTY, so the here-string never found its delimiter.
      { id: 'here-string', match: /@"/, command: '$t = @"\nalpha-one\nbeta-two\n"@\nWrite-Output $t' },
      // The concatenation the sixty runs missed, and the VT strip the agent's capture was left out of.
      { id: 'long-output', match: /LINE-/, command: `1..${LONG_OUTPUT_LINES} | ForEach-Object { "LINE-{0:D3} ${PAD}" -f $_ }` },
      ...common,
      // `starter:deny-pipe-to-shell` — the single deny among 340 permission decisions in run `2e21e324`.
      { id: 'pipe-to-shell', match: /\|\s*(?:pwsh|powershell)/i, command: 'git status --porcelain | powershell -NoProfile -Command "$input | Select-Object -First 5"' },
      steady,
    ]
    : [
      { id: 'here-string', match: /<<\s*'?EOF/, command: "cat <<'EOF'\nalpha-one\nbeta-two\nEOF" },
      { id: 'long-output', match: /LINE-/, command: `awk 'BEGIN{for(i=1;i<=${LONG_OUTPUT_LINES};i++)printf "LINE-%03d ${PAD}\\n", i}'` },
      // Live-run finding M1 (pack `2026-10-06T17-41-48-175Z`, requirements #67): a 3,700-character heredoc wrapped to one
      // physical line of about 4,304 bytes, which the PTY's line discipline cut inside its quote; the shell stood on its
      // continuation prompt, the command never ran, and the call read as a soft pause with `>` for its output. POSIX only:
      // the staging that repaired it is the POSIX carrier's, and whether ConPTY caps a line is owed to a Windows run.
      { id: 'long-command', match: /<<\s*'?ROWS\b/, command: longCommand() },
      // Acceptance finding A9 (OQ-144), the verifier's live run of 2026-09-29 (pack `2026-09-29T22-08-13-005Z`, call #5): the
      // model ran `exec bash`, which keeps the shell's pid and never returns to the wrapper's end frame, so it read as a
      // soft pause after 30,027 ms, and every later call ran under bash. Ahead of `unexpandable` on purpose: that shape
      // then shows which shell the next command met. POSIX only: PowerShell has no `exec`.
      { id: 'replaces-shell', match: /^\s*exec\s+bash\b/, command: 'exec bash' },
      // Live-run finding L1, the tail of the edit scenario's recorded test command: a bash-ism `/bin/sh` (dash) cannot
      // expand, which abandoned the rest of the line — the wrapper's end frame with it — so a command that finished at
      // once read as a soft pause, exit −1, after 30 s. POSIX only: PowerShell has no such expansion, and its wrapper's `try` is the
      // guard this one was modelled on.
      { id: 'unexpandable', match: /PIPESTATUS/, command: `printf '%s\\n' ran; echo "EXIT=\${PIPESTATUS[0]}"` },
      // `docs/defects/fixed/a-command-that-exits-the-session-shell-reads-as-a-soft-pause.md` (OQ-144's sibling case): a
      // command that ENDS the session's shell never prints the end frame, because the shell that would print it is gone, so
      // it read as a soft pause after 30 s and the next call ran in a fresh shell reporting `session_reinitialized` false.
      // The shape after it (the wedge) is the next call, which must say the session was reinitialized. POSIX only here:
      // PowerShell's `exit` takes the same path in the product, reasoned and not run on a Windows host.
      { id: 'ends-shell', match: /^\s*exit\s+3\s*$/, command: 'exit 3' },
      ...common,
      { id: 'pipe-to-shell', match: /\|\s*(?:sh|bash|zsh)\b/, command: "git status --porcelain | sh -c 'head -5'" },
      steady,
    ];
}

/**
 * The tool gate's refusals that come before a call runs and leave a shape's question unasked: REQ-ORCH-029's todo gate
 * (`todo_list_owed`, OQ-213 as ruled) and the schema check (`invalid_request`, REQ-TOOLS-032), both settled in
 * `packages/agent-tools/src/gate.ts`. A permission block is NOT among them: `pipe-to-shell` is measured by its block
 * (`blocked`, no `failure_kind`), so the selection never drops a call for being `blocked` alone, as
 * `coordinator-todo.mjs`'s `ran` does.
 */
export const GATE_REFUSALS = new Set(['todo_list_owed', 'invalid_request']);

/**
 * Whether a recorded terminal call reached the question its shape asks, rather than a gate refusal before it ran. The
 * confirming live run at 0bc3eee read `long-output` from the send the todo gate refused, whose result is the refusal's
 * text, and failed "all 40 lines" on 0 markers while the same command, sent again after the list, had returned all 40
 * (`docs/defects/fixed/the-live-runs-terminal-shapes-read-a-call-the-todo-gate-refused-before-it-ran.md`).
 */
export const reachedShape = (call) => !GATE_REFUSALS.has(call.failureKind ?? '');

/**
 * One shape's sends among a session's terminal calls (in ordinal order, as `readToolCalls` gives them): `reached`, the sends
 * that reached execution, of which the scenario reads the first; `refused`, those the gate refused before they ran; and
 * `kind` — `reached` where one did, `not-reached` where every send was refused (a NOTE: the question is unasked, never a
 * failure), `not-attempted` where none was sent.
 */
export function shapeSends(shape, calls) {
  const sent = calls.filter((call) => shape.match.test(String(call.args?.command ?? '')));
  const reached = sent.filter(reachedShape);
  const refused = sent.filter((call) => !reachedShape(call));
  return { reached, refused, kind: reached.length > 0 ? 'reached' : refused.length > 0 ? 'not-reached' : 'not-attempted' };
}

/**
 * The NOTE a shape leaves whose every send was refused before it ran (`shapeSends`'s `not-reached`): its title says it was
 * not reached and at which gate, its detail names each refused send and what stays unasked.
 */
export function notReachedNote(id, refused, unasked) {
  const todo = refused.every((call) => call.failureKind === 'todo_list_owed');
  const which = refused.map((call) => `#${call.ordinal} ${call.failureKind}`).join(', ');
  return {
    title: `${id} was not reached: refused at the ${todo ? 'todo gate' : 'tool gate'}`,
    detail: `${refused.length} send(s) refused before running${todo ? ' (REQ-ORCH-029)' : ''} and not re-sent (${which}); ${unasked}`,
  };
}

/**
 * The count the "what the model attempted" NOTE gives one shape: its sends that reached execution, and beside them the sends
 * refused before running, so a refused send is neither hidden nor counted as a try (`long-output×1 (+1 refused at the gate)`).
 */
export function attemptCount(id, sends) {
  return `${id}×${sends.reached.length}${sends.refused.length > 0 ? ` (+${sends.refused.length} refused at the gate)` : ''}`;
}

/**
 * The `[terminal_diagnostic] {…}` block every terminal observation ends with (`terminal/classify.ts`), or null.
 *
 * Read rather than inferred from prose: `exit_code`, `outcome_kind`, `timeout`, `timeout_seconds` and
 * `warnings` are what the scenario's checks are about, and the detail sentence above it is not evidence.
 */
export function diagnosticOf(result) {
  // The LAST block, not the first: the observation ends with its own, and the `[terminal_output]` section
  // above it holds whatever the command printed — which, for a command that read an earlier observation, is
  // another one of these. Taking the first would read a quoted diagnostic as this call's own.
  const blocks = [...String(result ?? '').matchAll(/\[terminal_diagnostic\] (\{.*\})\s*$/gm)];
  if (blocks.length === 0) return null;
  try { return JSON.parse(blocks[blocks.length - 1][1]); } catch { return null; }
}

/**
 * What the command printed — the `[terminal_output]` section (`[partial_terminal_output]` after a hard timeout),
 * or null. A check about the output reads this rather than the whole result, because the diagnostic block below
 * it repeats the command: a pattern taken from the command matches the whole result whether or not the command
 * printed anything. The first section header and the last diagnostic, for the reason `diagnosticOf` gives.
 */
export function outputOf(result) {
  const text = String(result ?? '');
  const start = text.search(/^\[(?:partial_)?terminal_output\]$/m);
  const end = text.lastIndexOf('\n[terminal_diagnostic] ');
  if (start === -1 || end <= start) return null;
  return text.slice(text.indexOf('\n', start) + 1, end);
}

/**
 * Whether BOTH lines of the here-string shape came back — read from what the command printed, never from the whole
 * result. The shape's command carries `alpha-one` and `beta-two` itself, and the diagnostic block repeats the command,
 * so a check over the whole result passed for an observation whose output was `(no output)`; it passed that way on the
 * live run of 2026-09-22 and proved nothing (`docs/defects/fixed/the-here-string-check-reads-its-own-command-back.md`).
 * An observation with no output section answers false: nothing came back.
 */
export function hereStringLinesReturned(result) {
  const printed = outputOf(result);
  if (printed === null) return false;
  return /alpha-one/.test(printed) && /beta-two/.test(printed);
}

/**
 * What the `unexpandable` shape (live-run L1) met, read from one recorded observation — so the scenario credits the
 * wrapper's guard only where a shell actually failed to expand the bash-ism.
 *
 * - `refused`: the shell said it could not expand the line (`Bad substitution`, dash's and bash's words) and the call
 *   ended with a nonzero exit code of its own — the guard was asked, and answered.
 * - `paused`: the call soft-paused, or returned exit −1, or took the whole no-output window — L1's signature, which is
 *   a FAIL whatever the shell was, since a line that ended at once must not read as still running.
 * - `expanded`: neither, and the line's second half printed `EXIT=<n>`: the shell expanded it (bash; the verifier's
 *   live run of 2026-09-29 met it after the model ran `exec bash`), so the guard was never asked and the scenario says
 *   so as a NOTE, never as a PASS.
 * - `other`: none of those — a result the scenario cannot credit either way, also a NOTE.
 */
export function unexpandableReading(result, elapsedMs) {
  const d = diagnosticOf(result);
  const printed = outputOf(result) ?? '';
  const exit = typeof d?.exit_code === 'number' ? d.exit_code : null;
  const paused = d?.outcome_kind === 'soft_pause' || exit === -1 || !(Number.isFinite(elapsedMs) && elapsedMs < 30_000);
  const badSubstitution = /bad substitution/i.test(printed);
  const refused = !paused && badSubstitution && exit !== null && exit > 0;
  const expanded = !paused && !refused && /EXIT=\d+/.test(printed);
  return { kind: paused ? 'paused' : refused ? 'refused' : expanded ? 'expanded' : 'other', exit, badSubstitution, printed };
}

/**
 * What the `replaces-shell` shape (acceptance A9, OQ-144) met, read from one recorded observation.
 *
 * - `restarted`: the call ended inside the no-output window as an `execution_error` with no exit code, and its detail
 *   says the command replaced the session's shell — the product noticed, ended the program and restarted the shell.
 * - `paused`: the call soft-paused, or returned exit −1, or took the whole no-output window — A9's signature, a FAIL.
 * - `not-replaced`: it ended with an exit code of its own (no `bash` on the host: 127), so nothing was replaced and
 *   the watch was never asked — a NOTE.
 * - `other`: none of those — a NOTE.
 */
export function replacedShellReading(result, elapsedMs) {
  const d = diagnosticOf(result);
  const exit = typeof d?.exit_code === 'number' ? d.exit_code : null;
  const paused = d?.outcome_kind === 'soft_pause' || exit === -1 || !(Number.isFinite(elapsedMs) && elapsedMs < 30_000);
  const restarted = !paused && exit === null && d?.failure_kind === 'execution_error' && /replaced the session's shell/.test(String(d?.detail ?? ''));
  const notReplaced = !paused && !restarted && exit !== null;
  return { kind: paused ? 'paused' : restarted ? 'restarted' : notReplaced ? 'not-replaced' : 'other', exit, killStatus: d?.kill_status ?? null };
}

/**
 * What the `ends-shell` shape (OQ-144's sibling case) met, read from one recorded observation.
 *
 * - `restarted`: the call ended inside the no-output window as an `execution_error` with no exit code, and its detail
 *   says the command ended the session's shell — the product saw the shell go and respawned it.
 * - `paused`: the call soft-paused, or returned exit −1, or took the whole no-output window — the defect's signature, a FAIL.
 * - `other`: none of those (an exit code of its own: the shell was not ended) — a NOTE.
 */
export function endedShellReading(result, elapsedMs) {
  const d = diagnosticOf(result);
  const exit = typeof d?.exit_code === 'number' ? d.exit_code : null;
  const paused = d?.outcome_kind === 'soft_pause' || exit === -1 || !(Number.isFinite(elapsedMs) && elapsedMs < 30_000);
  const restarted = !paused && exit === null && d?.failure_kind === 'execution_error' && /ended the session's shell/.test(String(d?.detail ?? ''));
  return { kind: paused ? 'paused' : restarted ? 'restarted' : 'other', exit, killStatus: d?.kill_status ?? null };
}

/**
 * What the `behind-paused` shape (OQ-164) met, read from one recorded observation: the command issued while `wedge-again`
 * was soft-paused.
 *
 * - `reported`: its detail names the soft-paused `sleep 45` command and how it ended — the call waited behind it, or the
 *   command had ended before the call was submitted — so the paused command's end was not left for a poll.
 * - `still-running`: its detail says the paused command is still running — the call soft-paused behind it; a NOTE.
 * - `silent`: it says nothing of the paused command — the defect's signature, a FAIL.
 * - `other`: no diagnostic — a NOTE.
 */
export function pausedBehindReading(result) {
  const d = diagnosticOf(result);
  const detail = String(d?.detail ?? '');
  const named = /the soft-paused command `[^`]*sleep[^`]*45[^`]*`/i.test(detail);
  const ended = named && /(waited behind it: that command ended|had ended) .*with exit code \d+/.test(detail);
  const running = named && /that command is still running/.test(detail);
  return { kind: d === null ? 'other' : ended ? 'reported' : running ? 'still-running' : 'silent', exit: typeof d?.exit_code === 'number' ? d.exit_code : null, waited: /waited behind it/.test(detail) };
}

/**
 * What the poll after the `interrupt` shape met (OQ-147), read from one recorded observation.
 *
 * - `ended`: exit −1 as an `execution_error` whose detail says the paused command ended without an exit status of its
 *   own — the product found the end of the interrupted line, as OQ-147's reading, confirmed 2026-10-06 by R-071, reports it.
 * - `still-running`: a soft pause, "still running" — the defect's signature, a FAIL.
 * - `ended-own`: the command ended with an exit status of its own, so the interrupt reached nothing still running (the
 *   wedge had ended first) — a NOTE.
 * - `other`: none of those — a NOTE.
 */
export function interruptedPollReading(result) {
  const d = diagnosticOf(result);
  const exit = typeof d?.exit_code === 'number' ? d.exit_code : null;
  const stillRunning = d?.outcome_kind === 'soft_pause';
  const ended = !stillRunning && exit === -1 && d?.failure_kind === 'execution_error' && /without an exit status of its own/.test(String(d?.detail ?? ''));
  const endedOwn = !stillRunning && !ended && exit !== null && exit >= 0;
  return { kind: stillRunning ? 'still-running' : ended ? 'ended' : endedOwn ? 'ended-own' : 'other', exit, outcome: d?.outcome_kind ?? null };
}

/**
 * What the `long-command` shape (live-run finding M1) met, read from the command the model actually sent and one recorded
 * observation, so the check credits the carrier only where the line was in fact past the PTY's input line.
 *
 * - `short`: the command as sent is shorter than `PTY_INPUT_LINE_BYTES`, so its line may have fit and the question was
 *   never asked — a NOTE.
 * - `paused`: the call soft-paused, or returned exit −1, or took the whole no-output window — M1's signature, a FAIL.
 * - `whole`: it ended at exit 0 and `wc -c` printed exactly the bytes of the here-document the command carries: the
 *   command reached the shell whole.
 * - `other`: none of those (a cut body counts short, a command without its `ROWS` line) — a FAIL in the scenario, since
 *   a long command that ran and printed the wrong count was cut on the way.
 */
export function longCommandReading(command, result, elapsedMs) {
  const text = String(command ?? '');
  const bytes = Buffer.byteLength(text);
  const d = diagnosticOf(result);
  const exit = typeof d?.exit_code === 'number' ? d.exit_code : null;
  const printed = (outputOf(result) ?? '').trim();
  const lines = text.split('\n');
  const close = lines.findIndex((line, i) => i > 0 && line === 'ROWS');
  const expected = close === -1 ? null : lines.slice(1, close).reduce((sum, line) => sum + Buffer.byteLength(line) + 1, 0);
  const counted = /^\d+$/.test(printed) ? Number(printed) : null;
  if (bytes < PTY_INPUT_LINE_BYTES) return { kind: 'short', bytes, exit, expected, counted, printed };
  const paused = d?.outcome_kind === 'soft_pause' || exit === -1 || !(Number.isFinite(elapsedMs) && elapsedMs < 30_000);
  const whole = !paused && exit === 0 && expected !== null && counted === expected;
  return { kind: paused ? 'paused' : whole ? 'whole' : 'other', bytes, exit, expected, counted, printed };
}

/**
 * What the `steady` shape met (REQ-TOOLS-097's default-path hard cap, `hardMs`), read from one recorded call: its arguments,
 * its observation and its own duration, against the cap the session was configured with (`capSeconds`, REQ-CONFIG-116).
 *
 * - `capped`: the call supplied no `timeout`, and the observation is a hard timeout naming `capSeconds`, not a soft pause —
 *   the cap a call that names no bound of its own is held to, reached while the command still printed.
 * - `supplied`: the call carried a `timeout` of its own, which is the hard bound and turns the soft pause off, so `hardMs` was
 *   never read — a NOTE: the question is unasked.
 * - `paused`: a soft pause over a command that never went quiet for the no-output window — a FAIL.
 * - `other-cap`: a hard timeout naming another bound than `capSeconds` — a FAIL: the configured cap did not govern.
 * - `uncapped`: the command ended with a status of its own after running past the cap — the defect `hardMs` once was (passed
 *   and read nowhere, so the default path had no hard cap), a FAIL.
 * - `other`: none of those (no diagnostic, or an end before the cap) — a NOTE.
 *
 * `ticks` is how many `tick-<n>` lines came back in the output section, `killStatus` the diagnostic's `kill_status`.
 */
export function hardCapReading(call, { capSeconds = DEFAULT_SHELL_COMMAND_TIMEOUT_S } = {}) {
  const d = diagnosticOf(call?.result);
  const printed = outputOf(call?.result) ?? '';
  const ticks = new Set([...printed.matchAll(/tick-(\d+)/g)].map((m) => m[1])).size;
  const elapsedMs = Number.isFinite(call?.elapsedMs) ? call.elapsedMs : null;
  const base = { ticks, elapsedMs, killStatus: d?.kill_status ?? null, timeoutSeconds: typeof d?.timeout_seconds === 'number' ? d.timeout_seconds : null, exit: typeof d?.exit_code === 'number' ? d.exit_code : null };
  if (call?.args?.timeout !== undefined) return { kind: 'supplied', ...base };
  if (d === null) return { kind: 'other', ...base };
  if (d.outcome_kind === 'soft_pause') return { kind: 'paused', ...base };
  if (d.timeout === true) return { kind: d.timeout_seconds === capSeconds ? 'capped' : 'other-cap', ...base };
  if (elapsedMs !== null && elapsedMs > capSeconds * 1000) return { kind: 'uncapped', ...base };
  return { kind: 'other', ...base };
}

/**
 * What the long-output assertion asks of one captured result: the distinct markers, and the lines carrying more
 * than one of them. Two markers on one line is the concatenation; fewer than `LONG_OUTPUT_LINES` distinct is a
 * capture that lost output.
 */
export function longOutputReading(result) {
  const text = String(result ?? '');
  const markers = [...text.matchAll(/LINE-(\d{3})/g)].map((m) => m[1]);
  const doubled = text.split('\n').filter((line) => (line.match(/LINE-\d{3}/g) ?? []).length > 1);
  return { markers, distinct: new Set(markers).size, doubled, escaped: text.includes(`${String.fromCharCode(27)}[`) };
}

/**
 * How the `terminal` run ended, read against the calls it made, from the session row and the terminal-call count.
 *
 * - `absent`: no session was read — a FAIL.
 * - `died-early`: the run ended `failed` before any terminal call, so every shape reads "not attempted" — a FAIL. The
 *   2026-10-01 pack printed `live-run PASSED` over exactly this: the endpoint refused a replayed tool call (HTTP 400)
 *   and the run ended after two calls, none of them terminal, while the only run-level check asked whether the run
 *   reached a result, which a failed run does
 *   (`docs/defects/fixed/a-tool-call-whose-arguments-are-a-json-string-ends-the-run-with-http-400.md`).
 * - `failed-later`: the run ended `failed` after at least one terminal call — a NOTE: the shapes it reached are asserted.
 * - `ended-early`: the run ended otherwise than `completed` or `failed` (stopped, interrupted, still running) before any
 *   terminal call — a NOTE: nothing was refused, but no shape was asked, so the run says nothing about the terminal.
 * - `ended`: any other end.
 */
export function terminalRunEndReading(session, terminalCalls) {
  if (session === null || session === undefined) return { kind: 'absent', detail: 'no session was read' };
  const status = String(session.execution_status ?? 'unknown');
  const detail = `${status} (${session.stop_reason ?? 'no stop reason'}) after ${terminalCalls} terminal call(s)`;
  if (status !== 'failed') return { kind: status !== 'completed' && terminalCalls === 0 ? 'ended-early' : 'ended', detail };
  return { kind: terminalCalls === 0 ? 'died-early' : 'failed-later', detail };
}
