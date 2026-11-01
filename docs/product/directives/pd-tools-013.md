[Product directives](../directives.md) › PD-TOOLS-013

<a id="pd-tools-013"></a>

### PD-TOOLS-013 — a call its run cancels reads `interrupted`

*Revision 2 (2026-10-13, [R-072](../requests.md#r-072)) — **every call its run cancels**, the ruling of
[OQ-238](../../archive/architecture/open-questions/51-spikes-and-later-questions-18.md#oq-238) (GC1) under the owner's delegation: the title and the scope widen from the
terminal to every tool call the run's signal cuts off, in the section **A call its run cancels, of any tool** after the
terminal's; REQ-TOOLS-092, REQ-SANDBOX-025 and REQ-SESSION-139 join the Narrows line. The terminal's clause stands as written.*

> *Revision 1's title said, and no longer governs:* "a terminal call its run cancels reads `interrupted`" — the scope it
> named was the foreground `terminal` call alone.

A foreground `terminal` call that its run cancels SHALL be recorded as interrupted: `failure_kind` and `outcome_kind`
`interrupted`, `outcome_severity` `warning`, `is_error` true, no exit code, and `timeout` false. Its run cancels it when
the tool context's signal is aborted before the command completes: a pause past REQ-ORCH-134's tool deadline, a stop, a
quit, the explicit cancel, an agent's cancellation or its limit, and a cancel that lands during OQ-144's first-call
handshake. The call ends the command's process tree and restarts the session, as built, and re-applies PD-TOOLS-001's
snapshot. `kill_status` is `session_reset` or `reset_failed`. Its detail SHALL say that the run cancelled the call before
the command completed, or before the command was written so that it never ran, what became of the session, that shell
state was lost, and what was restored; it SHALL NOT say that the command exceeded its timeout. Its output is labelled
`[terminal_output]`.

- **REQ-TOOLS-100:** the `failure_kind` vocabulary holds a fifth member, `interrupted`.
- **REQ-TOOLS-112:** the `outcome_kind` vocabulary holds an eleventh member, `interrupted`, and test 1 maps the failure kind
  `interrupted` to `interrupted` / `warning`.
- **REQ-SESSION-136:** a tool call recorded as interrupted under PD-ORCH-005 clause 3 files no outcome-driven issue. That
  covers the terminal's call under this directive, and the question tool's, the delegation tool's and a withdrawn approval's
  as the gate already records them.

The hard-timeout reading (exit code 124, `timeout`, `terminal_timeout`) stays reserved for a call that reached its hard
bound, as REQ-TOOLS-097, REQ-TOOLS-099 and REQ-TOOLS-179 state; those three, and REQ-TOOLS-103, are untouched.

**A call its run cancels, of any tool — revision 2.** Every tool call that its run's signal cuts off before it completes
SHALL be recorded with failure kind `interrupted`, SHALL file no outcome-driven issue, and SHALL be answered to its agent as
interrupted, as the turn already answers it:

- **(a) — revision 2.** A call whose executor throws while the call's signal is aborted SHALL be recorded with failure kind
  `interrupted` and the text "The '<tool>' call was cancelled by the run before it completed."
- **(b) — revision 2.** A fetch the run's signal ends SHALL be recorded with `failure_kind` `interrupted`, `error_class`
  `InterruptedError` and the detail "The fetch of <url> was cancelled by the run before it completed." This kind sits outside
  REQ-TOOLS-092's three groups (policy refusal, transient fault, call fault): it is the run's rest. `timeout` still wins when
  the deadline expired first, and the fetch's eight other kinds are unchanged.
- **(c) — revision 2.** An MCP call the run's signal ends SHALL be recorded with failure kind `interrupted` and a text naming
  the tool and the server and saying that the run cancelled the call before it completed and that it was not retried. The
  allowance-timeout reading is tested first and still reads `timeout`, filing `terminal_timeout`; a server fault with no
  cancel still reads `execution_error` and files `tool_error`.
- **(d) — revision 2.** None of these files an outcome-driven issue. No `outcome_kind` is added to them, so OQ-208's ruling
  stands. REQ-SESSION-139's histogram derives the bucket `interrupted` for a record that carries no `outcome_kind` and whose
  failure kind is `interrupted`; that also reaches a released delegation wait.

- **REQ-TOOLS-092 and REQ-SANDBOX-025 — revision 2:** the fetch vocabulary holds a ninth member, `interrupted`, and
  REQ-SANDBOX-025's "mints no further kind" holds except for it.
- **REQ-SESSION-139 — revision 2:** the derived buckets are rejected, tool-error, success, unknown and `interrupted`.
- **REQ-SESSION-136 — revision 2:** the exemption above reaches every call recorded under (a) to (c).

**Why revision 2, and what it costs.** Revision 1 repaired the terminal's cancel and left three siblings saying otherwise:
the gate's catch recorded an executor's throw on the cancel as `cancelled`, a kind no vocabulary holds; fetch recorded it as
`network_error`, the kind of a real transport fault; and the MCP catch recorded it as `execution_error`, though the SDK call
receives the run's signal. Each filed a `tool_error` warning that `summary.md`'s Tool errors line counts, for every quit,
stop or pause past the tool deadline that cut such a call, while the turn already answered the call as interrupted. One
word for one fact, and the gate's existing branch, cost: a ninth fetch kind that a reader of exported fetch records meets
for the first time, a fifth histogram bucket beside REQ-SESSION-139's four, and the cause of the cancel read from the turn,
not from the call.

**Why, and what it costs.** The build reported every cancel as a hard timeout: exit 124, "The command exceeded its timeout
of 100 seconds", `TimeoutError`, a `terminal_timeout` issue at `error`, and a Timeouts count in `summary.md`. In the final
default live run at `a68f121` (session `5df89df3`, call `#36`) a quit cut a 45 s wedge after 3,505 ms, and the record
claimed the 100 s bound had been hit; on Continue the agent would have read the same. REQ-TOOLS-103's `execution_error`
would have told the truth about the cause but read a deliberate cancel as a backend fault at severity `error` and filed a
`tool_error` warning for every quit. The product already has the word: the question tool, the delegation tool and a
withdrawn approval carry `interrupted`, and the gate settles that kind as interrupted with no issue. What it costs: two
closed vocabularies that REQ-TOOLS-100 calls exact gain a member, so a reader of exported records that assumed the closed
sets meets a new token; severity `warning` with `is_error` true is the one terminal kind whose `is_error` is not derived
from its severity; and the terminal's own text cannot tell a quit from a stop or a child's limit, so the cause comes from the
turn's interrupted result, and a child's limit that cut a call is recorded at the child, not at the call.

> **Narrows:** REQ-TOOLS-100, REQ-TOOLS-112, REQ-SESSION-136, REQ-TOOLS-092, REQ-SANDBOX-025, REQ-SESSION-139

*Revision 2's disposition (2026-10-13): REQ-TOOLS-092, REQ-SANDBOX-025 and REQ-SESSION-139 join the Narrows line. The ruling
(GC1) named REQ-SESSION-139, and kept REQ-TOOLS-112 and REQ-SESSION-136, as extended; OQ-237 (GV1), ruled and built the same
day, reads a change to an exact enumeration as a narrowing, and REQ-SESSION-139's derivation "into rejected, tool-error,
success or unknown" gains a fifth bucket, so all three are narrowed. No other directive holds a verb on REQ-TOOLS-092,
REQ-SANDBOX-025 or REQ-SESSION-139.*

*Corrected 2026-10-13 under [OQ-237](../../architecture/open-questions.md) (GV1, [R-072](../requests.md#r-072)): the three are
narrowed, as the ruling named them. This directive's case and `PD-TOOLS-009`'s on REQ-TOOLS-112 are disjoint (a cancel that
has no exit code; exit 1 from a diff or a search), and so are its case and `PD-SESSION-003`'s on REQ-SESSION-136 (which
issues are filed; how the error-path arguments are cut). The disposition read until then, and the reason it gave, no longer
govern:* "> **Extends:** REQ-TOOLS-112, REQ-SESSION-136" — *"The ruling named all three as narrowed. The symbol generator
admits one directive per verb on a requirement (`README.md`: "precedence must be unambiguous"), and `PD-TOOLS-009` already
narrows REQ-TOOLS-112 and `PD-SESSION-003` REQ-SESSION-136, so those two are named as extended, as OQ-218's build did for
PD-CONFIG-003; the case each one meets is stated above, exhaustively. Found while building, 2026-10-07."*

*Raised under the owner's delegation, 2026-10-07, ruling OQ-226 (the consortium's ruling of finding P2 of the final default
live run at `a68f121`); logged as [R-072](../requests.md#r-072).*

> **First execution, 2026-10-07, built under [R-072](../requests.md#r-072) (fin31):** the rule held as written, and the ruling's
> dispositions did not *(corrected 2026-10-13: they stand as the ruling named them, OQ-237)*: the generator admits one directive per verb on a requirement, so REQ-TOOLS-112 and REQ-SESSION-136,
> already narrowed by `PD-TOOLS-009` and `PD-SESSION-003`, are named as extended (above). `ForegroundSession.run`
> (`packages/agent-tools/src/terminal/foreground.ts`) returns `cancelled` with no exit code from both abort branches, and
> `terminal/index.ts` records the call `interrupted` / `warning`, `InterruptedError`, `is_error` true; the gate's existing
> `interrupted` branch files no issue, and `sessionMetrics` counts the call under `interrupted`, not Timeouts, with neither
> changed. **Found nothing else**: the turn already answered the call as interrupted (`callSignal.aborted`), so the cause
> sentence the agent reads on Continue was in place, and only the body under it was false. **What was measured.**
> `terminal.test.ts`'s handshake cancel case, its new mid-command cancel case (`sleep 5` cancelled at 300 ms: `interrupted`,
> the restore named, no timeout, the next call in the restored directory with the variable) and its classify case, each red
> on `fee3593`; `gate.test.ts` and `summary.test.ts` as guards; `pnpm driver-proof`'s launch 13d, a quit during `sleep 60`
> under a 100 s bound in the built app, red on `fee3593` (`timeout`, 124, "exceeded its timeout of 100 seconds",
> `terminal_timeout` at `error`) and green after (`interrupted`, no exit code, `kill_status` `session_reset`, no issue).
> **What was not measured.** No live run: the next default live run's quit is the measurement.
> *(2026-10-13, fin42, N51: no longer left to a quit that happens to land on a call. No live quit had cut one in the 552d346
> default and duress packs or at 0bc3eee, so the live run gained the `cut` scenario, which cuts a foreground `sleep 60` on
> purpose; see revision 2's built-app report below. Not yet run.)*
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Revision 2's first execution, 2026-10-13, built under [R-072](../requests.md#r-072) (fin34):** the revision held as
> written. **(a)** The gate's catch (`packages/agent-tools/src/gate.ts`) records a throw under an aborted signal as
> `interrupted`, "The '<tool>' call was cancelled by the run before it completed.", where it wrote `cancelled`; the gate's
> existing `interrupted` branch then marks the call interrupted and files no issue, unchanged. **(b)** Fetch's
> `transportFailure` (`packages/agent-tools/src/tools/fetch.ts`) returns `interrupted` / `InterruptedError` after its deadline
> test, and `FETCH_FAILURE_KINDS` holds the ninth kind. **(c)** The MCP executor's catch (`apps/desktop/src/run-host/mcp.ts`)
> tests the allowance first, then the abort. **(d)** `outcomeOf` (`packages/engine/src/export.ts`) derives a record with no
> `outcome_kind` and failure kind `interrupted` to `interrupted`. **Found nothing else**: the turn already answered each such
> call as interrupted, and no reader of the histogram assumed four buckets (`summary.md` prints the buckets it is given).
> **What was measured.** `gate.test.ts`'s revision 2 case, `fetch.test.ts`'s cancel case, `mcp.test.ts`'s cancel case and
> `summary.test.ts`'s `interrupted` bucket case, each red before the code and green after, beside guards that a throw with
> no cancel still reads `execution_error` / `tool_error`, a fetch deadline that expired first still reads `timeout`, and an
> exhausted MCP allowance still reads `timeout` / `terminal_timeout`; `pnpm fetch-proof`'s ninth launch, `cancelled`, a
> SIGTERM quit while the loopback server holds the request, red with (a) and (b) reverted (`failed / network_error`) and
> green after (`interrupted`, `InterruptedError`, 360 ms, the session `paused`, no issue for the call). **What was not
> measured.** No proof drives a cancelled MCP call or a throwing executor in the built app, and no live run: the first live
> quit that cuts a fetch or an MCP call is the measurement. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. No tool call was cut in flight at any quit; every run ended before its capture's quit, and 0 tool records read
> `interrupted`. The neighbour case held at `552d346`: the resume Pause left three calls of the step it ended unstarted
> (rows 12 to 14), each reading "This call was not run: it was interrupted by the pause before it started …" with no
> `tool_calls` record and no issue. Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Revision 2 in the built app, and the live measurement written, 2026-10-13 (fin42, N51):** the revision held as written
> where fin34 had pinned it by unit cases alone. **What was measured.** `pnpm mcp-proof`'s launches 2c quit the application
> by SIGTERM while the fixture holds `slow` (60 s, under a 120 s allowance): `cancel` read the MCP executor's catch, failed /
> `interrupted`, "The call to 'slow' on MCP server 'alpha' was cancelled by the run before it completed; it was not retried."
> (562 ms), no issue, no `outcome_kind`, the session `paused`, and `summary.md`'s "Tool outcomes: success 0, tool_error 0,
> rejected 0, unknown 0, interrupted 1" with "Tool errors: 0"; `cancel-throw` read the gate's catch through the run host's
> new verification seam `ROTARIS_CAPTURE_THROW_ON_ABORT` (`apps/desktop/src/run-host/throw-on-abort.ts`, compiled out of a
> packaged build), "The 'slow' call was cancelled by the run before it completed." (493 ms), with the same issues and
> bucket. Each was red with its branch reverted: (c) without its abort test read `execution_error`, "failed: AbortError:
> This operation was aborted", and (a) with its pre-revision form read `cancelled`. Load average 5.7 to 7.1 on four CPUs,
> beside a sibling plan. **Found nothing else**: no executor the product ships throws on its abort (fetch, the MCP executor
> and the terminal each return their own `interrupted` observation), which is why (a) needed a seam to be reached at all.
> **What was not measured.** No live run: the live run's `cut` scenario (`apps/desktop/scripts/lib/cut-scenario.mjs`,
> default set) asks a real model for one foreground `echo started > CUT-STARTED.txt && sleep 60` under a 90 s timeout and
> quits by SIGTERM once the call's record is open and the file marked; it must read revision 1's terminal record
> (`interrupted`, no exit code, `"timeout":false`, a session reset, no `terminal_timeout` or `tool_error` issue) and
> `summary.md`'s `interrupted` bucket with Timeouts 0. It is written and unit-tested, and is the orchestrator's to run. A fetch
> or MCP call cut live stays unmeasured: the scenario cuts the terminal, the case the record has never seen live. The row is
> in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **On Windows, 2026-10-21 (the Windows ARM64 session's F1; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, built at `af692eea`).** The 2c launches' "quit the application by SIGTERM" above is POSIX only: on Windows they quit through the driver's orderly quit, since 2026-10-16, because `kill(SIGTERM)` there is
> TerminateProcess and the cancellation path never ran ([the fixed note](../../defects/fixed/mcp-proofs-cancellation-launch-kills-electron-on-windows.md)). The 2c red the
> session's brief predicted did not happen and no harness note was owed. Both launches held: `cancel` failed / `interrupted`
> with the MCP executor's sentence (550 ms), `cancel-throw` failed / `interrupted` with the gate's (591 ms), no issue, the
> session `paused`, and `summary.md`'s "interrupted 1" with "Tool errors: 0"; the quit came 2.8 s into each launch.
