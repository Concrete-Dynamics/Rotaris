[Product directives](../directives.md) › PD-MONITOR-002

<a id="pd-monitor-002"></a>

### PD-MONITOR-002 — the application log keeps `info` and above

The application log — the main process's log, distinct from the per-session debug log of REQ-MONITOR-238
and REQ-SESSION-142 — SHALL carry a level on every line as a field rather than as text inside the message,
and SHALL record a line only when its level is at or above a threshold. The threshold is `info` by default.
Lines forwarded from a child process (the run host, the workspace service) keep the level the child gave
them and are filtered by it like any other line.

The threshold SHALL be changeable only through the environment variable `ROTARIS_APP_LOG_LEVEL`, read once
at start, accepting `debug`, `info`, `warning` and `error` in any casing; an unset or unrecognized value
means `info`. No configuration key, settings control or other surface sets it, and `session_log_level`
(REQ-CONFIG-121) does not reach it.

A line that another requirement obliges the product to write to the application log (REQ-TOOLS-171,
REQ-HOOKS-102, REQ-HOOKS-138, REQ-SANDBOX-071, REQ-LIBRARY-035, REQ-LIBRARY-047, REQ-LIBRARY-124) SHALL be
written at `info` or above, so the default threshold never drops it.

**Why, and what it costs.** A launch log measured on 2026-09-16 held 195 lines, 141 of them one MCP
server's `debug` stderr. Nothing in the specification set a level for this log, which is why OQ-63 was
raised; this directive is the owner's ruling on it. A developer diagnosing a child process restores the
detail with one variable, and the log a packaged build keeps is the one a person can read after an
incident. What is given up: `debug` lines from a packaged build that was not started with the variable
are not recorded, and cannot be recovered afterwards.

> **New:** no live requirement covers this.

*Raised by the owner, 2026-09-23; logged as [R-048](../requests.md#r-048).*

> **First execution, 2026-09-27, built under [R-055](../requests.md#r-055):** the mechanism was built as written, and the
> text met the code in three places. **(1) The vocabulary.** The directive names `warning`; the child protocol and
> every writer in the code say `warn`. The line is written with the directive's word and the variable accepts exactly
> the four the directive lists, so `ROTARIS_APP_LOG_LEVEL=warn` is unrecognized and means `info` — the product says so
> in one `warning` line after the instance claim, rather than silently. **(2) "Every line".** Main's own lines carried
> no level at all, and the collaborators that already told a warning apart (the improvement coordinator,
> initialization, the credential store, the settings store, the provider service) had it dropped by the wiring, so
> REQ-LIBRARY-035(b)'s *warning* reached the log as an unlabelled line; each now arrives at `warning`. Main's own
> reports of a loss are `error` — an uncaught exception or rejection, a refused launch, a failed hand-over, a renderer
> or child process gone for any reason but `clean-exit`, the run host or a workspace service exiting with any status
> but 0, and a `shutdown` either child refused or left unanswered, still running, when its bound elapsed at quit — and
> a dialog or review that could not be presented is `warning`; every other line of main's stays `info`. An exit of 0
> was first read as proof of main's own `shutdown`; it is not, because Electron reports 0 for a child it tears down at
> quit, so the unanswered `shutdown` is the line that says work was cut off. A message of several lines (a stack) is
> written with the stamp and level on each line. **(3) The obliged lines.** Every line the seven named requirements
> oblige reaches the log at `info` or above: the confinement verdict (REQ-SANDBOX-071) at `info`,
> REQ-LIBRARY-035(b)/124's failure and REQ-LIBRARY-047's unrecorded version at `warning`; REQ-TOOLS-171 and
> REQ-HOOKS-102 oblige no line, they constrain text, which a threshold can only drop. REQ-HOOKS-138's hook lines in
> this log are `info` and `warning`, but the hook engine's own sink — documented "the application log only" — is wired
> to the per-session log at `INFO`, where the default `WARNING` drops it; that is recorded as
> [`hook-faults-reach-only-the-session-log-at-a-level-it-drops.md`](../../defects/fixed/hook-faults-reach-only-the-session-log-at-a-level-it-drops.md)
> and not changed here, because it is a question of which log, not of this one's threshold. Three proof readers
> matched the old shape and two proofs read `debug` lines; the readers were updated and those two launches set the
> variable. Measured on a driven launch in a Linux container as root, without the bundled runtime, so the 141 stderr
> lines of 2026-09-16 could not recur: 72 lines at the default (66 `info`, 6 `warning`, 0 `debug`); 69 with the
> variable at `debug`, the same lines plus the code-intelligence child's two `debug` lines, less five the first
> launch's own driving wrote. At `warning` a clean launch and quit writes nothing, its `quit:` lines included, which
> is what a threshold above `info` costs: 24 launches driven to a last-window close at the default level wrote no
> `warning` or `error` line and quit in 40–69 ms, and one ended by the driver's `app.exit` at `warning` wrote nothing
> at all. *Falsified 2026-09-29 for the immediate exit (the sentence above is kept as written): in the live run of that day
> 7 of 9 launches ended through the capture seam's immediate exit (`exitCleanly`, `endRunHost` with a grace of 0) wrote
> `error   CHILD PROCESS GONE (Utility rotaris-run-host: killed, exit 15)` after "run host exited (0)" and "quit: exiting
> with status 0" — main kills the run host itself and logs Electron's report of the kill at `error`. One such exit writing
> nothing was the race going the other way. Recorded as
> [`an-orderly-quit-logs-the-run-host-gone-at-error.md`](../../defects/fixed/an-orderly-quit-logs-the-run-host-gone-at-error.md)
> (live-run finding L13); the last-window close's 24 clean quits are not contradicted. Repaired the same day under
> [R-067](../requests.md#r-067): main records the run host it ends itself (`ChildrenEndedByMain`, `main/exit.ts`), and
> Electron's `killed` report of that end is written at `info`, saying main ended it — so "a child process gone for any
> reason but `clean-exit`" above now reads "… but `clean-exit`, or `killed` by main's own end"; a child killed from
> outside, one that crashed and one main never ended stay `error`. `pnpm live-run --only=ask` then ended both of its
> launches through the immediate exit with that line at `info` and no `error` line of main's.* The review's run of the same close found the first version of the unanswered-`shutdown` line firing on
> orderly quits (3 in 26, each waiting out the 30 s bound), because a child's answer can lose the race with its own
> exit; the quit now races each `shutdown` against the child's exit, recorded as
> [`a-childs-shutdown-ack-can-lose-the-race-with-its-exit.md`](../../defects/fixed/a-childs-shutdown-ack-can-lose-the-race-with-its-exit.md).
> A loss still writes its `error`, driven against this build at `warning`: a run host killed with SIGKILL and then the
> last window closed wrote exactly `run host exited (9)` and
> `CHILD PROCESS GONE (Utility rotaris-run-host: killed, exit 9)` and quit in about 60 ms; one stopped with SIGSTOP
> before the close wrote `quit: the run host did not complete its shutdown (… no reply to shutdown within 30000 ms)`
> after 30 s, and nothing else. The other exit statuses rest on a scratch Electron 44.1.1 app, not this build: an
> uncaught throw, `process.exit(3)`, SIGABRT, SIGKILL, SIGSEGV and SIGTERM reported 1, 3, 6, 9, 11 and 15, and a
> teardown at quit and `utilityProcess.kill()` reported 0. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **2026-09-28, under [R-062](../requests.md#r-062):** the one obliged surface the note above left outside this log is
> inside it. The hook engine's `log` sink and the run host's account of an unresolvable hook set (REQ-HOOKS-085) now
> reach `Sessions` as its new `SessionsDeps.log`, which the run host fills with its `log` event at `info`, so REQ-HOOKS-138's
> hook lines are written at the default threshold and the per-session log no longer receives them. The checkpoint port's
> `log`, which said nothing about which log it meant, is documented as the per-session log, because its root already
> writes every checkpoint line to this log through a channel of its own. Measured by unit tests against the store, not on
> a driven run with a failing hook. The note is moved to
> [`hook-faults-reach-only-the-session-log-at-a-level-it-drops.md`](../../defects/fixed/hook-faults-reach-only-the-session-log-at-a-level-it-drops.md)
> and the row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Driven in the built app, 2026-10-13 (fin42, whats-next N61).** Two hook-fault paths now run on the built app. A global hook
> that always fails is switched off by `notice-proof`'s section 1 (since 2026-09-18), and its launch output carries "switched off".
> `notice-proof`'s new section 1b gives the run an invalid entry (`timeout_seconds: 0`). That entry never reaches the account
> above: REQ-HOOKS-012 fails the **configuration** load first, so the run is refused with REQ-CONFIG-478's report, which names
> the file, the global scope and `hooks.entries.0.timeout_seconds`. No hook runs, and no "Could not resolve this run's hooks"
> line is written. So in the built app, an invalid entry does not lead to REQ-HOOKS-085's `info` line. The line needs a hook set
> that fails to assemble after the configuration has loaded, and no free seam produces that. Its run-host unit cases remain its
> evidence. Neither section reads the hook engine's own `log` sink lines (REQ-HOOKS-128) in the application log. *Added
> 2026-10-14 ([OQ-279](../../archive/architecture/open-questions/58-spikes-and-later-questions-25.md#oq-279), ruled 2026-10-13 under [R-072](../requests.md#r-072)):* the
> same fatal load is now raised as a persistent error notice when the workspace opens, before any prompt (section 1b reads
> it on screen, section 1c in the workspace scope), and cleared by a later clean load.

> **2026-09-28, under [R-062](../requests.md#r-062):** the quit's race over each `shutdown` is unchanged, and main now also
> waits, bounded, for the run host's EXIT before it is gone (`endBeforeMain`, `main/exit.ts`; ADR-0014's "Main is gone
> only after the run host"). The race answered "the answer can be lost to the exit"; it did not make main leave before
> the exit, and a run host left behind kept every session it held refused to the next launch until its pid stopped
> answering ([note](../../defects/fixed/a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md)).
> The levels are this directive's: a run host ended at quit reports exit 0 and writes its `info` line; one still running
> past the bound after it was ended is a loss, written at `error`. A driven close at the default level wrote no
> `warning` or `error` line from the close onwards, and main was gone 103 ms after it.

> **2026-09-29, under [R-067](../requests.md#r-067):** the log's one writer wrote through `console.log`, and a standard output
> whose reader had gone failed each write with EPIPE, reported as an `error` event nothing listened for — an uncaught
> exception the uncaught-exception handler logged to the same stream, without end, so the quit and REQ-MONITOR-131's
> backstop starved. The writer is now `standardStreamWriter` (`main/app-log.ts`): it listens for the stream's failure and
> writes nothing more after it, and standard error gets the same listener. Measured on the built app by closing the
> pipes of a running launch and sending SIGTERM: it exited in about 60 ms, where the writer put back to `console.log`
> spun at full CPU until SIGKILL. The note is moved to
> [`a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`](../../defects/fixed/a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md)
> and the row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
