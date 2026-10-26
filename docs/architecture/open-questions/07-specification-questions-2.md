# Open questions — Specification questions (2 of 27)

Part 7 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-2 – OQ-4, OQ-6 – OQ-17.

**OQ-2 — The workspace service.** *(ADR-0002.)* No slice other than DATA proposes it. Keeping it isolates
two genuinely unbounded workloads — project-supplied regular expressions and the deliberately unbounded
engine read — from both the windows and the runs, at the cost of a fourth process kind and one more
boundary in front of the board projection. `REQ-TRACE-239`'s 100 ms budget is measured *after* the engine
answers, so that crossing is real cost no requirement covers. **Measure the projection crossing at
`REQ-TRACE-300`'s scale before implementation begins** (spike 7). *SR-4 adds a second cost to each
answer.* The workspace service is now one of the **two** processes that open the workspace store, so
keeping it means two writer processes contending for one write lock on the path U-03 forbids delaying
(constraints W-01, W-02, W-05; spike 18) — and folding it into the run host removes that contention
entirely, which is what ADR-0058's alternative G exists to do by another route. Against that, the two
unbounded workloads are unchanged and are exactly what must not share a loop with a run. ADR-0002 records
the verdict that the topology stands, with one of its original reasons — the cost of the durable flush —
**explicitly withdrawn**, because a synchronous transaction commit is cheap where a whole-document
rewrite plus rename was not. The other six reasons are untouched by the store and each is independently
sufficient. **Neither of the two new costs has been measured.**

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** closed as ADR-0002 decided it. The workspace service stays a process of its own, as built, and the two costs this entry names as unmeasured are accepted with it.

*Two further costs land on the same bill under ESC-15 and neither changes the balance on its own.* The
workspace service becomes the **only** process that resolves a workspace identifier and the only one that
opens the store, handing the run host a resolved store path (constraint W-18) — which is an argument
*for* keeping it, because folding it into the run host would leave nowhere for the resolution to happen
before a run exists. Against that, at quit **two of the three processes hold connections to one
machine-local store**, so the quit sequence must close two connections in a defined order rather than
leaving it to process exit (ADR-0014). And the record's own keying is now in tension with the
specification's notion of identity — see OQ-47.

**OQ-3 — Resolved.** See *Resolved, and closed with the reason* above.

**OQ-4 — Presenter registration: per window or per session?** *(ADR-0019.)* `REQ-TOOLS-053` defines
"unattended" as "the session has no registered approval presenter", while `REQ-MONITOR-253` requires an
approval request to reach the run that asked for it **even when that run is not focused**. If registration
tracked focus, an unfocused session's next `ask` would be classed unattended and denied by the headless
policy — silently, with the run still executing. The record reads registration as **per application
window**, with "unattended" a property of the application. **Confirm**, because it changes what
`REQ-TOOLS-069`'s "the presenter was torn down" means in a multi-window application.

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built. Presenter registration is per application window (ADR-0019; `PresenterRegistry`, a 250 ms poll and a 3 s lapse), so attendedness is a property of the application and not of focus, and an unfocused session's `ask` still reaches a person (REQ-MONITOR-253). REQ-TOOLS-069's "the presenter was torn down" means that no window's registration remains, because the last window closed or every registration lapsed.

**OQ-6 — The provider catalogue's declared attributes.** *(ADR-0012, ADR-0028.)* `REQ-PROVIDER-002`
declares the attribute set closed and `REQ-PROVIDER-003` rejects a build that violates it, yet
`REQ-CONFIG-370` names three further catalogue fields and spells the hosted connection mode differently;
`REQ-CONFIG-371` requires a quick-start URL on the entry and **branches on the connection-mode spelling**;
and `REQ-MONITOR-021` makes concurrency-quota sharing a declared property. Two questions: **which spelling
of the hosted mode is canonical**, and **does the quota property carry a number or a boolean** —
`REQ-CONFIG-095` gives one provider a cap of 3 by name while `REQ-MONITOR-021` gives a uniform cap of 2
and explicitly refuses to hold a list of names, and `REQ-PROVIDER-049` disclaims one too. A number
resolves the second cleanly.

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** `hosted-cloud` is the canonical spelling of the hosted connection mode, as the catalogue spells it, and the shared-quota property is a number each provider's catalogue entry declares: the cap of concurrent calls its models carry unless the user sets one. [`PD-PROVIDER-001`](../../product/directives/pd-provider-001.md#pd-provider-001) states both and narrows REQ-CONFIG-370 and REQ-MONITOR-021. **The build differed in one place:** the caps in force were the directive's (`deepseek` 3, `claude-code` 2), but configuration's default held them as a list of two provider names (`defaultMaxParallel`) and the catalogue entry declared none — recorded in [`the-shared-quota-cap-is-a-list-of-provider-names-not-a-catalogue-property.md`](../../defects/fixed/the-shared-quota-cap-is-a-list-of-provider-names-not-a-catalogue-property.md), not built here; built by fin22 the same day, each catalogue entry declaring `sharedQuotaCap`.

**OQ-7 — Decision closed, 2026-09-07.** REQ-TOOLS-123 now cites
REQ-SANDBOX-077's host-path preservation rule. A backend unable to preserve
the host path refuses the command. Native confinement proof remains governed
by REQ-SANDBOX-127 and tracked as platform evidence.

**Historical question.** `REQ-SANDBOX-077`
requires every carve-out to exist only inside the confined view with the host filesystem holding exactly
what it held before, and forbids a backend that cannot do so from creating anything. `REQ-TOOLS-123`
records as a "documented, deliberate artifact" that an empty directory may appear inside a writable root
on one platform. **These cannot both hold.** The record implements `REQ-SANDBOX-077` — refuse rather than
create — because it is the fail-closed reading and is stated as an obligation on the backend.

**OQ-8 — CLOSED as a policy decision, 2026-09-06; implemented and measured 2026-09-13.** *(ADR-0009.)*

The accepted review names the **completed provider request** as the trigger: one `usage.update` per
request that contributes new usage, counting the usage a failed or partial request reported, skipping a
request whose figures leave the cumulative totals unchanged. `REQ-MONITOR-166`'s sampling keeps its own
cadence and neither raises nor suppresses one, and `REQ-SESSION-094`'s terminal `session.end` carries the
final cumulative totals regardless. Journal volume against `REQ-EVENTS-091`'s cap is therefore bounded by
the number of provider requests a run makes. `REQ-EVENTS-053` carries the amendment; ADR-0009 consequence
8 is reconciled with it.

***What building it found.*** The event was raised once per *iteration*, from the turn's returned report,
and that report carries only the attempts that survived: `resilientStep` discards the report of every
attempt it retries past, and `runWithChildren` returns the last parent turn of a resume loop. A run that
retried a transient failure or resumed its parent therefore spent tokens the session's totals, its terminal
event and its cost never counted. The decision's own wording — *including reported failed/partial-request
usage* — is what exposed it.

**Historical question — at what granularity is the usage event emitted?** `REQ-EVENTS-053` fixed only that
it must not be emitted with no figures and that it carries run-to-date cumulative totals.
`REQ-MONITOR-166` fixes a **sampling** cadence for the token-history sparkline, which is a different
thing. Whether a usage event accompanies every model turn, or follows the sample, or both, is unstated
and affects journal volume against `REQ-EVENTS-091`'s cap.

**OQ-9 — Decision closed, 2026-09-07.** REQ-TOOLS-111 now scopes cleanup
to terminal-tool process trees. REQ-HOOKS-033 retains its hook-descendant survival
exception. Hooks Settings discloses the distinction. Crash-path evidence remains
part of platform validation.

**Crash-path evidence on Windows, 2026-10-20** (the Windows ARM64 session's C1; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `0fde55f2`). A background PowerShell heartbeat ended with its run host in every path measured: the run host killed alone with `taskkill /F` (the shell ended as the run host did, about 4-5 s after the kill), an orderly quit, and main killed without `/T` (within about 1 s). REQ-TOOLS-111 is met there with no Job Object of the product's; the observations fit libuv's kill-on-close job for the children it spawns, which would reach a hook's descendants too (not measured; ADR-0002, "First execution — 2026-10-20").

**Historical question.** `REQ-HOOKS-033` states
that descendants **may outlive the hook and the run**, that the run must neither track nor report them,
and that termination must not widen to the process group. `REQ-TOOLS-111` requires that once the
application has exited, no background command it started is still running, **whatever ended it** — which
on Windows needs a kill-on-close job covering the run host's subtree. If that job covers hook
descendants, `REQ-HOOKS-033`'s allowance becomes false at exit. **Recommended reading:** the job covers
only terminal-session children, because `REQ-TOOLS-111` sits in the terminal-execution section of domain
05 and `REQ-HOOKS-033` states its allowance in terms. *Unchanged in substance, more urgent in fact:*
ADR-0002 now records the run-host crash as an **accepted** consequence rather than a disputed one, so the
kill group must survive a **crash** of the run host and not only an orderly exit, or `REQ-TOOLS-111` is
unmet in exactly the case the record has just agreed to live with.

**OQ-10 — Signals on Windows.** *(ADR-0020.)* `REQ-TOOLS-096` and `REQ-TOOLS-110` fix a signal vocabulary
and `REQ-TOOLS-109` fixes a terminate-grace-kill sequence for background termination. Windows has no
signals; a send-signal call there has no faithful mapping, and the specification neither maps them nor
refuses them. The chosen pseudo-terminal library documents that its signal argument is **ignored** on
Windows.

**Ruled 2026-09-21 for background pipe sessions, on the owner's fix instruction ([R-044](../../product/requests.md#r-044)); the foreground/PTY scope stays open.** A pipe has no graceful interrupt on Windows, so SIGINT and SIGHUP terminate the session's own tree there — the mapping SIGTERM and SIGKILL already used (`packages/agent-tools/src/terminal/background.ts`). `send_signal` therefore delivers every signal in its vocabulary on every platform, as `REQ-TOOLS-110` states, and the stream-control `interrupt` (`REQ-TOOLS-128`) stops a win32 background session instead of answering false. *(Measured 2026-10-15 on Windows 11 ARM64 (build 26200.9457), dev tree, pwsh 7.6.6 and Windows PowerShell 5.1, the session's B1: "OQ-10 (R-044): send_signal SIGINT stops a background session instead of refusing it" and live-run L4's "a session the agent ends with send_signal SIGINT reads killed (−1) at warning" passed in every run under both shells (3 and 3); the background half is measured on windows-arm64, OQ-400's reading. The tree termination's timing per signal is the session's B8.)* *(B8, 2026-10-20, Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `9f898a00`: a background PowerShell session whose command started a node grandchild, ended by `send_signal` SIGINT, SIGHUP, SIGTERM and SIGKILL, by `session_action: kill` and by the stream-control `interrupt`, answered "Sent <SIG> to session …" (or "was killed.") and read `killed (exit -1)` at `warning` every time; the shell and the grandchild were gone 5,157-5,250 ms after the signal in three runs of each: the `taskkill /T` the pipe session's PowerShell does not answer, then `/T /F` at REQ-TOOLS-109's 5 s, SIGKILL included. `kill` answers only once the tree has gone. Pinned in `terminal.test.ts`, "on Windows: the background tree ends whole, whatever ends it".)* *(The first live run on Windows, 2026-10-20, `frictions` pack `2026-10-20T07-55-35-723Z`: not read. The child wrote `session_action=send_signal` into `command` with no `session_action`, the tool ran its default `query`, and no signal was sent; [`a-signal-sent-without-session-action-is-read-as-a-query-and-dropped-silently.md`](../../defects/a-signal-sent-without-session-action-is-read-as-a-query-and-dropped-silently.md), [`live-00957641-windows-terminal-frictions-crlf-autopsy.md`](../live-runs/live-00957641-windows-terminal-frictions-crlf-autopsy.md).)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the foreground scope is confirmed as built, and recorded here beside R-044's ruling for background pipe sessions. A foreground session runs in a pseudo-terminal on every platform, and is interrupted by writing the interrupt character (`C-c`, ETX) into it, which the Windows console host delivers to the running program as Ctrl+C (`ForegroundSession.interrupt`); the user's kill terminates the process tree behind the running command. No signal argument is ever passed to the pseudo-terminal library, which ignores one on Windows, and `send_signal` addresses background sessions alone. The Windows half is reasoned and not run on a Windows host (IC-3 — *corrected 2026-10-14: a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*). *(Run 2026-10-15 on Windows 11 ARM64, pwsh 7.6.6 and Windows PowerShell 5.1: the interrupt character written into the PTY ends a running `ping -t` and a running node within a second; the user's kill ends the running command and its grandchild, both gone, and node-pty's `kill()` is never given a signal argument. Recorded: a kill of a soft-paused command does nothing and reports success ([`the-terminal-windows-kill-of-a-soft-paused-command-does-nothing-and-reports-success.md`](../../defects/fixed/the-terminal-windows-kill-of-a-soft-paused-command-does-nothing-and-reports-success.md)), and a kill's reset does not restore the shell's state ([`a-kill-from-the-terminal-window-resets-the-session-without-restoring-its-state.md`](../../defects/fixed/a-kill-from-the-terminal-window-resets-the-session-without-restoring-its-state.md)).)*

**OQ-11 — Resolved by dissolution.** See *Resolved, and closed with the reason* above, and **OQ-44**,
which the closure opened.

<a id="oq-12"></a>

**OQ-12 — The WORDING is CLOSED as a policy decision, 2026-09-06 and applied 2026-09-13; the MEASUREMENT
stays open as evidence debt.** *(ADR-0004, ADR-0058.)*

*Pointer, 2026-10-24 (owner request T7; rules nothing): a test concept — the invariants after a cut, which checks
an agent can run and what each proves, and the owner's half — is [`power-loss-test-concept.md`](../../research/power-loss-test-concept.md).*

The accepted review answers the question this entry actually asked — what "atomic", "durable" and "flushed"
each promise — and `REQ-SESSION-034` is now the product's single definition, in **three levels** that may not
be collapsed: **(1) process-crash atomicity for every successful write**, owed unconditionally and never
traded; **(2) operating-system and power-loss survival for an acknowledged terminal commit and a completed
backup artifact**, subject to the storage device honouring the flushes the product issues — a condition
stated rather than assumed, because a device that acknowledges a flush it did not perform cannot be detected
from software; and **(3) a permitted loss of intermediate updates** between those boundaries, stated as
permitted rather than left to be discovered. The stronger terminal commit setting is preserved and may only
ever be reconsidered on power-loss and operating-system-crash grounds, never on readability, which
`spikes/commit-on-the-publish-path.md` §11.4 already disproved as a reason. `REQ-LIBRARY-138`'s "flushed to
disk" — the one durability verb the corpus carried, promising a level it never named — and
`REQ-LIBRARY-043`'s "readable after a crash or loss of power" now cite which level they mean instead of
implying one.

***The evidence is NOT discharged and the wording says so itself.*** No power-loss test has been run on any
supported platform. Both figures this entry owes — whether an acknowledged commit survives a power cut, and
how far behind the ordinary setting can be in commits and milliseconds — come from the same run, and the
fault half is a physical act on this machine that only the owner can perform: a forced power-off, or a
kernel crash that loses the operating-system cache while the disk stays powered, which is what separates the
software claim from the device's honesty. `spikes/power-loss.md` carries the steps and an empty table. The
proof is tracked **per supported platform**; on this one it is owed and unmeasured, and on the other two it
cannot even be attempted while **IC-3** stands. **Accepting the wording did not measure anything**, and no
surface may make a claim stronger than the three levels above until the table is filled.

**Historical question — durability semantics are unstated. *Materially moved by measurement — and the fact
it partly rested on is false. A SECOND measurement on 2026-09-02 pulls the same way and RAISES the
stakes.***

***Added 2026-09-02, and this entry is now larger than it was.*** Two things changed. **(a)** The
directory-flush picture gained a second, apparently contradictory result:
`spikes/remote-and-synchronised-storage.md` §8 found the call returning `EPERM` on **every** path spelling
**including local NTFS**, where the writer-handle spike found it succeeding 200 of 200. The two are
consistent and **the reconciliation is INFERRED rather than measured** — the second harness opened the
directory the ordinary way, which is read-only, so the available call needs a handle deliberately opened
for write. Both figures are kept rather than one being picked. What the pair adds is operational: **the
naive call an implementer would reach for fails everywhere**, so "add the missing flush" produces an error
rather than a guarantee, and no durability step may assume the containing directory is flushed. **(b) The
power-loss half of this question is no longer only about a file replace — it is now the SOLE STATED GROUND
for a durability decision in the store.** `spikes/commit-on-the-publish-path.md` §11.4 disproved the
reason ADR-0058 gave for forcing the stronger synchronous setting on a terminal save (readability, which
the weaker setting delivers across processes and bindings), and the decision was re-grounded on power-loss
and operating-system-crash survival — the one property the weaker setting in write-ahead-log mode
explicitly lacks. **Nothing measured anywhere says whether a committed log frame survives a power cut.**
So the unnumbered power-loss measurement this register already owed now decides two things rather than
one, and it is the only evidence that would keep an optimiser from dropping the forcing.

*(ADR-0004.)* No requirement asks for a file-system sync.
`REQ-LIBRARY-138` asks for one file to be "flushed to disk", the only durability verb in the corpus;
every other crash-safety requirement is phrased as an **ordering** or as **the replace is atomic**.

***The measurement corrects this entry rather than answering it.***
`spikes/windows-writer-handle-compaction.md` §3.3 shows a directory `fsync` fails **only on a read-only
handle**; on a write-opened directory handle it returns success, **200 of 200, at a mean of 0.115 ms**.
So the sentence this entry carried — that a directory sync is unavailable on Windows through the runtime,
and therefore the POSIX rename-durability idiom cannot be applied uniformly — **is withdrawn and must not
be cited.** The call is available. **What is not established is the guarantee**: a success return does not
prove the semantics, and the harness explicitly declined to claim it, because that needs a power-loss
test and no power-loss test has been run on any supported platform. The question is therefore now *"does
a directory `fsync` mean anything here"* rather than *"is it available"*, and the answer changes one line
of ADR-0004's replace path. The record's decision not to perform one is unchanged; **its ground is
replaced**, from a platform limitation to a decision with a price. **A power-loss test is the measurement
that would close this and it is deliberately not a numbered spike**, because no requirement asks for the
guarantee and it does not block the gate — but nothing establishes that a replace survives a power cut
anywhere, and this cannot be closed without it.

The question is whether "atomic" means
only "no torn read" — which rename gives — or also "survives a power loss", which it does not without
syncing the file before the rename. `REQ-LIBRARY-043` says "a write interrupted by a crash or power loss
must leave the artifact readable", which is satisfied by either reading. The record proposes syncing the
staged file and no directory sync. **What SR-4 changes and what it does not:** the question now applies
only to the five stores that remain files — configuration, credentials, the discovery snapshot and the
per-user documents, the user's repository artifacts, and `summary.md` (constraint D-07). Its sharpest
citation, `REQ-LIBRARY-138`, has moved to a row, so **every durability obligation still resting on a file
is phrased as an ordering or as "the replace is atomic" and none of them uses a durability verb at all.**
The store's own durability is decided separately and explicitly in W-06 and is **not** part of this
question; it is neither better nor worse than the file design's userspace flush against the failures
`REQ-EVENTS-029` names, and W-06 says which failures those are.

***Taken 2026-09-04 in its harness half — `spikes/power-loss.md`.*** The measurement now has an instrument:
a writer committing at `NORMAL` with periodic `FULL` commits and both replace shapes (ADR-0004's, and the
same plus a write-handle directory `fsync`), a process-death baseline (ten of ten lost nothing, gap-free,
whole), and a verifier whose dry run — a WAL tail truncated at a recorded `FULL` commit — reports exactly the
rows after the cut lost and everything before it present, ten of ten. **None of that is evidence about a
power cut**, and the report says so in its own section 3. The fault itself is a physical act on this machine
that only the owner can perform — a forced power-off, or a kernel crash that loses the operating-system
cache while the disk stays powered, which separates the software claim from the device's honesty — and the
report carries the steps and an empty table. This entry closes or narrows when that table is filled; both of
the figures it decides (whether a returned `FULL` commit survives; how far behind a `NORMAL` record can be,
in commits and milliseconds) come from the same run, and the directory-`fsync` half gets its answer from the
two documents' lag against each other.

**OQ-13 — Stderr in foreground capture. Decision closed 2026-09-07.** The accepted amendment to
`REQ-TOOLS-098` requires capture-aware advice: merged foreground PTYs capture stdout and stderr;
empty soft pauses report that fact and offer polling or interruption. Redirection advice applies
only to a backend that excludes stderr. ADR-0020, tool help and observations now agree; a real
PowerShell PTY regression verifies stderr capture and the soft-pause advisory.

Historical question: *(ADR-0020.)* `REQ-TOOLS-098` requires the soft-pause detail to
tell the agent the process "may be writing to stderr" and to suggest re-running with a redirection, which
only makes sense if stderr is **not** captured — while a pseudo-terminal-backed persistent shell, required
by `REQ-SHELL-166`, necessarily merges it. The advisory text is required content either way, but the
underlying capture semantics should be stated.

**OQ-14 — `secrets.yaml` is given no file mode. *RESOLVED 2026-09-02 by amendment, under ESC-27.***
*(ADR-0004; ESC-27.)* `REQ-CONFIG-216` **now requires every write to leave the file at mode `0600`**, with
no group or other bit, applied **explicitly on every write** rather than inherited from the process mask or
the parent directory; on a platform with no POSIX mode the protection is `REQ-PROVIDER-016`'s explicit
owner-only access control, cited rather than restated; and `REQ-CONFIG-444`'s "leave the platform's own
default in place" fallback is **explicitly denied to this file**, because inheriting the platform default is
the outcome this question was raised about. Where the protection cannot be applied, the write does not
happen. `REQ-MCP-082` and domain 16's secrets appendix now cite `REQ-CONFIG-216` instead of restating the
write without a mode. ***One consequence for a reader arriving from elsewhere: ADR-0004's table entry
reading "no mode at all (OQ-14)" is now false and is not this register's to edit.*** The entry as it stood
is kept below, because a question is only legible beside what it was asking.

*As it stood:* `REQ-CONFIG-444` requires a mode for every
writer of the main configuration file and `REQ-CONFIG-212` for the discovery snapshot; `REQ-CONFIG-216`
requires the secrets file's write to be atomic and to create its directory and **says nothing about
mode**, so on the plain reading it inherits the process mask. It is the one file in the workspace that
holds credentials by design. This looks like an omission rather than a decision, and `0600` would be the
obvious value — **raised rather than chosen**, because tightening a mode the specification left unstated
is still a change to an observable. *Wholly unaffected by SR-4: `secrets.yaml` is configuration a user
edits and version control tracks, so it stays a file under the ruling's own principle, and the question
survives intact. It is the only survivor of the OQ-11/OQ-14 pair the atomic primitive carried.*

**OQ-15 — Decision closed 2026-09-07.** REQ-TOOLS-101 retains the fixed compatibility
label `ValueError`; REQ-SANDBOX-083 fixes wrap refusals to `SandboxUnavailableError`.
Stable `failure_kind`/outcome codes govern machine classification. Implementation exception names
are optional redacted diagnostic detail. ADR-0001 records the amendment. Validation and gate
coverage are implemented; confinement-wrapper integration remains tracked in the progress ledger.

Historical question: *(ADR-0001.)* `REQ-TOOLS-101` fixes `ValueError` as a
literal observable value and `REQ-SANDBOX-083` defines the sandbox case as "the type name of the failure"
— an implementation-language-dependent string on an otherwise machine-readable field. Under ADR-0001's
language choice neither is a language artifact. Either `error_class` is a **closed product vocabulary**,
in which case the sandbox and terminal values need enumerating, or it is free text, in which case
`ValueError` is not a contract.

**OQ-16 — Decision closed, 2026-09-07.** REQ-TOOLS-049 now defines this
release's rule lists as shipped presets. Existing mode, grant and declared
permission controls remain authorable. A custom rule format requires a future
schema and validation contract.

**Historical question.** `REQ-TOOLS-049`'s "rule
lists replace rather than deep-merge across layers" reads as though a user may author permission rules,
but **no configuration key anywhere in domains 05, 10 or 15 defines one**, and the presets are fixed.
Either user rule authoring is in scope and needs a key and a settings surface, or the sentence covers only
the shipped lists and should say so.

**OQ-17 — Do a locally-hosted agent runtime's tool calls pass through the product's permission engine and
event stream?** *(ADR-0026; likely to become an escalation.)* `REQ-PROVIDER-117` tells the user the
product invokes a locally installed agent SDK and that traffic goes through it; `REQ-PROVIDER-049`
describes an external local-runtime subprocess; `REQ-MCP-043` requires the normalised server description
for "every agent backend the product supports". **No requirement states whether the approval flow of
domain 05, the tool events of `REQ-EVENTS-041` and the transcript rows of domain 03 are produced for tool
calls the external runtime performs itself.** This decides whether that provider is a model or a whole
agent. If the answer is "they do not", it is a **user-visible narrowing of the permission guarantee** and
must be escalated rather than absorbed.

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the locally hosted agent runtime is left out of the first release. If it is ever built, every tool call it performs SHALL pass through the product's approval flow (domain 05) and produce REQ-EVENTS-041's tool events and domain 03's transcript rows, as a model provider's calls do; nothing narrower is offered. As built, the `claude-code` catalogue entry stays listed and its sign-in states that this build does not provide its method (`packages/providers/src/signin.ts`), so no external runtime is ever started.
