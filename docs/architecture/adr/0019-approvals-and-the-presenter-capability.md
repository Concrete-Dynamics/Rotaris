# ADR-0019 — Approvals: the wait registry lives with the gate; the presenter is a revocable capability

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. **The amended `REQ-TOOLS-053` and `REQ-TOOLS-069` dissolve the requirement
  conflict this record was written around**, and the liveness signal it invented as an answer stops
  being an invention. `owner-decisions.md` **SR-1** additionally makes the per-window registration
  reading well defined rather than merely recommended. The decision is unchanged in every particular;
  its *justification* moves from "the architecture supplies what the specification omits" to "the
  architecture implements the test the specification states". A residual tension with
  `REQ-SANDBOX-101` is named below rather than smoothed away.
- **Revised:** 2026-09-02, against `../spikes/presenter-liveness-and-instance-claim.md`, which measured
  this record's remedy on the target platform. **The decision stands in every particular and the state it
  detects is now reproducible rather than argued.** Three things changed underneath it, and two of them
  are reasons rather than conclusions. (1) The detection mechanism gains **a condition that must be built
  as stated**: the lapse test is *the gap since the last reply*, never *did a reply for sequence N
  arrive*. (2) Obligation 3 is restated **application-wide and much harder** — no synchronous
  platform-dialog call may ever be made on main — because the exposure turned out not to be the approval
  dialog at all. (3) The consequence that registration "is revoked automatically when the channel to main
  closes … **without a timeout**" was tested and **that path is not exercisable in this topology**; the
  conclusion that a dead main leaves nothing hanging survives, the stated reason does not, and the reason
  that actually holds has consequences of its own. Each is marked at the sentence it corrects rather than
  only summarised here.
- **Origin:** EXEC (ADR-EXEC-05), RUNTIME (constraint C10.5), UI (ADR-UI-05)
- **Depends on:** ADR-0002, ADR-0013, ADR-0017
- **Contains an unresolved conflict between slices** (presenter registration per window or per session,
  OQ-4 — narrowed by SR-1, not closed) *(OQ-4 ruled 2026-10-06, [R-071](../../product/requests.md#r-071): per application window, as built)*.
- **No longer names a conflict between two live requirements.** The earlier header read: "`REQ-TOOLS-053`
  and `REQ-TOOLS-069` test attendedness by *presence* of a presenter alone, while `REQ-TOOLS-064` forbids
  a hang; a wedged presenter satisfies the first and defeats the second (OQ-39)." Both requirements have
  since been rewritten and neither says that any more — see *What the amendment changed*.

## Context

`REQ-TOOLS-050` and `REQ-TOOLS-053`: an `ask` suspends exactly one tool call, identified by its own
request id; the session's other agents keep running and can raise approvals of their own.

`REQ-TOOLS-051` and `REQ-TOOLS-052`: options are exactly three — approve once, approve for session,
deny — and terminal wait states are exactly three — resolved, cancelled, timed out — each mapping to a
fixed decision, rule id, source and reason clause.

`REQ-TOOLS-054` and `REQ-TOOLS-177` enumerate the wait-registry semantics, all of which must hold: an
empty request id is rejected; a duplicate pending id is rejected with a fixed message; resolving or
cancelling an unknown id fails without side effect; **waiting on an unknown id resolves cancelled
immediately**; a request discarded before it was shown counts as cancelled; bulk-cancel releases every
waiter and is used on run cancellation, shutdown and host teardown.

`REQ-TOOLS-055`, `REQ-TOOLS-178` and `REQ-CONFIG-126`: the wait budget is
`runtime.approval_timeout_seconds` — one key, shared with the user-question wait, a float of at least
0, default 300.0, with `0` meaning wait without limit (still released by cancellation, shutdown or
teardown) and a negative value rejected at load.

`REQ-TOOLS-056` and `REQ-TOOLS-060`: the approval payload is a fixed nine-field record, fully
JSON-serialisable, written into session state when presented and removed on answer, timeout or
cancellation.

`REQ-TOOLS-061`: **every** `ask` — interactive or headless — publishes `approval.requested` before the
wait begins, with `resolver` in `{brokered, headless}`, `timeout_seconds` null on the headless path
meaning no wait occurs at all, and `unattended_reason` `headless-policy` there. A failed publish never
fails the dispatch.

`REQ-TOOLS-059`: approval answers can come **only** from the host UI. Nothing in agent output or tool
output can satisfy an approval. `REQ-TOOLS-058` and `REQ-TOOLS-026`: a presenter that raises causes the
pending request to be discarded and the call denied with source `presenter-error`; approval resolution
that raises, or returns another `ask`, denies with source `fail-closed`.

`REQ-TOOLS-064` to `REQ-TOOLS-066`: a session with no registered presenter routes every ask through
`runtime.headless_approval_policy` in `{deny (default), abort}`, unrecognised behaving as `deny`;
`abort` invokes the session's registered abort hook and degrades to `deny` with a warning when none is
registered; with no approval resolver wired at all, a built-in fail-safe resolver denies with source
`headless-policy`. **Never a silent allow, never a hang.**

`REQ-TOOLS-053`, `REQ-TOOLS-069` and `REQ-SANDBOX-101` define **unattended**. What they now say, and
what they used to say, is the load-bearing change in this pass; it is set out below under *What the
amendment changed* rather than summarised here, because summarising it is how the old reading survives.
`REQ-TOOLS-064`'s own gloss is worth carrying into the Context, though, because it is the same
capability language: a session for which no approval presenter is registered is "one for which the modal
dialog of `REQ-TOOLS-063` **cannot be shown**".

`REQ-TOOLS-177` fixes teardown ordering: discarding a session's approval host **cancels all waiting
approvals**, and those waiters resolve `cancelled`, which `REQ-TOOLS-052` maps to deny with source
`cancelled`. The resolution record for domain 5
(`docs/spec/resolutions/05-tools-permissions-approvals.md`, questions on `REQ-TOOLS-064` and
`REQ-TOOLS-069`) restates the unattended run as one "whose session never gained, **or has lost**, an
approval presenter". Losing a presenter mid-run is therefore a first-class transition with a specified
settlement path, not merely an initial condition.

`REQ-TOOLS-063` and `REQ-TOOLS-185` fix the dialog: modal, minimum 560x380 logical pixels, **no default
action**, initial focus on Deny, answering Deny on Escape and on window close; exactly one dialog open
per window; queued requests presented oldest-first by `approval.requested` publication order, the next
within 100 ms of the previous closing; a request answered or cancelled elsewhere closes its open
dialog without asking again; a request that timed out or was cancelled while queued is dropped unshown
and counts as cancelled; an undeliverable answer leaves the dialog open with all three buttons
disabled and a status line.

`REQ-TOOLS-062` and `REQ-TOOLS-183`: a recorded decision carries the `request_id` only when it directly
resolved a raised approval, checked strictly, and pairing works from both sides.

## What the amendment changed

**This is the load-bearing change in this pass and it must not be read past.** The two requirements that
define attendedness were rewritten, and they no longer define it by registration.

- `REQ-TOOLS-053` now reads: "A session counts as interactive exactly when **an approval prompt for that
  session can be put in front of a person.** A session that cannot prompt anyone is not interactive and
  never borrows another session's ability to prompt."
- `REQ-TOOLS-069` now reads: "A run is attended exactly when its session **can put an approval prompt in
  front of a person** (`REQ-TOOLS-053`), and unattended otherwise." Absent or torn-down registration
  appears in the next sentence as a case that "cannot prompt anyone and **therefore** meets condition (a)
  of `REQ-TOOLS-067`" — a sufficient condition, not the definition.

The test is therefore a **capability** test, and a wedged main satisfies it no better than a crashed one:
a dialog that never appears has not been put in front of anybody. The consequence for this record is
direct. The channel-level liveness signal below was introduced as the architecture's answer to a gap
between two requirements, and this record carried a header saying so. Under the amended text it is
instead **the implementation of `REQ-TOOLS-053`'s own test** — the only way one process can decide
whether another can actually show a dialog is to ask it and see whether it answers. Nothing about the
mechanism changes. What changes is that it no longer needs defending as an addition, and
`REQ-TOOLS-064`'s "never a hang" holds at `runtime.approval_timeout_seconds: 0` without any requirement
being read against its own words. **A ruling did not cause this; a rewritten requirement did.**

**The residual tension, stated rather than smoothed away.** `REQ-SANDBOX-101` still says "Only the
presence of the channel is tested, **not whether it later answers**", and asserts that its condition is
"exactly the one fixed by `REQ-TOOLS-053` and `REQ-TOOLS-069`". Read literally beside the amended
`REQ-TOOLS-053`, those are no longer the same test. The reading this record takes — and it is a reading
— is that `REQ-SANDBOX-101`'s clause is about **the person**, not the channel: its own sentence
continues "an unanswered prompt is settled instead by `runtime.approval_timeout_seconds` and
`runtime.headless_approval_policy`", which is a disposal for a prompt that *was shown* and not answered.
A wedged presenter is a prompt that was never shown, and `REQ-SANDBOX-101` does not dispose of it. On
that reading the two agree; on a literal one they do not, and the assertion that they fix the same
condition is what makes the disagreement invisible to a reader of either. **Reported as a defect in the
amended specification and not repaired here.**

**One narrowing this record must respect.** `REQ-SANDBOX-101` fixes attendedness "**at the moment its
mode is resolved**", for the purpose of `REQ-TOOLS-067`'s downgrade. Attendedness for the downgrade is
therefore a value taken once at run start. The liveness revocation below governs **where a later `ask`
is routed**, not whether a mode resolution already made is revisited. A lapse mid-run does not
retroactively downgrade a run's permission mode and must not be implemented as though it did.

**SR-1 makes the per-window registration reading well defined.** The recommendation below reads
"unattended" as a property of *the application* — whether any live presenter is attached — rather than
of the focused session. Before SR-1 that phrase had a soft edge: it was not settled whether a presenter
held by some other instance of the product counted. `REQ-STARTUP-161` now fixes at most one instance per
user account per machine and says in terms that "several workspaces and several windows are not a second
instance", so **"the application" is one process tree and "any live presenter" is a single global
predicate.** Two further things follow. The multi-window case the recommendation assumes is now the
ordinary case rather than an edge (`REQ-STARTUP-163`), which strengthens it. And this record's statement
that "one channel carries every registration main holds, so a lapse makes the whole application
unattended at once" becomes literally true rather than a design intention, because there is exactly one
main. **OQ-4 is narrowed, not answered:** it asked per window or per session, and SR-1 removes an
alternative from the field without deciding between those two. *(Ruled 2026-10-06, [R-071](../../product/requests.md#r-071): per application window, as built.)*

## Alternatives considered

**A — Registry in the Electron main process, gate calls out and awaits.** The dialog, the queue and the
pending map all sit next to the window, so the one-dialog-per-window rule is local bookkeeping.
Against: `REQ-TOOLS-020` and `REQ-TOOLS-064` require an `ask` raised when the presenter is unreachable
to resolve *without a prompt and without a hang*. If the registry is in main and the channel to main
is what has failed, the run host has no registry to fall back to and must invent a timeout-based
guess. The gate would also have to make a cross-process call on the decision path merely to discover
that there is nothing to call, which puts the fail-closed branch behind a round trip.

**B — Registry in the run host; the presenter is a capability registered by main over the channel.**
Chosen.

**C — No registry; the gate blocks on a promise per call.** Rejected against `REQ-TOOLS-054`:
duplicate-id rejection, resolve and cancel of unknown ids, bulk cancel, and `REQ-TOOLS-056`'s
"pending approvals are visible in session state as a mapping from request id to payload" all require a
first-class, enumerable map. Recorded because a promise-per-call is the natural first sketch.

## Decision

The run host owns a `PendingApprovals` map per session, keyed by request id, implementing
`REQ-TOOLS-054`'s semantics exactly, including the deliberately odd ones — waiting on an unknown id
resolves *cancelled*, not rejected.

**Attendedness is a boolean the run host maintains**, true exactly while main holds a live presenter
registration. Registration is explicit and revocable, and it is revoked automatically when the channel
to main closes — so a lost channel makes every session unattended, routes every ask to the headless
policy, and makes the fail-closed branch resolve `deny` rather than `ask`. That is the correct
direction and it is reached **without a timeout**.

> **Corrected 2026-09-02. The conclusion stands; the sentence above describes a mechanism that does not
> operate, and it must not be cited as the account of what happens when main dies.** See *The
> channel-close revocation is not the mechanism that operates* below. In one sentence: the run host does
> not outlive main, so it never observes the close and never performs the revocation — nothing hangs
> because nothing survives to hang, which is a different guarantee with different consequences. The
> revocation that actually operates in every reachable case is the **gap-based lapse** recorded next.

**Registration is revoked on a lapsed liveness signal as well as on a closed channel.** Main answers a
periodic liveness poll on the channel that carries registration, and a registration whose answer does
not arrive within the lapse window is revoked exactly as a closed channel revokes it. **This is how
`REQ-TOOLS-053`'s test is evaluated across a process boundary**: the requirement asks whether an
approval prompt for this session *can be put in front of a person*, the presenter that would do so is in
another process, and a poll is the only evidence available. It is also what makes `REQ-TOOLS-064`'s
"never a hang" hold at `runtime.approval_timeout_seconds: 0`, which `REQ-TOOLS-055` and `REQ-TOOLS-178`
make a supported, user-writable value meaning wait without limit: a wedged main is otherwise
indistinguishable from a person who has not answered yet. Four properties are obligations rather than
implementation latitude.

- **The lapse settles waits through the path the specification already fixes.** Revocation discards the
  session's approval host, which `REQ-TOOLS-177` requires to cancel every waiting approval; those
  waiters resolve `cancelled` → deny with source `cancelled` (`REQ-TOOLS-052`). Asks raised afterwards
  find the session unattended and route to `runtime.headless_approval_policy` (`REQ-TOOLS-064`,
  `REQ-TOOLS-065`). **No new terminal wait state, decision source or reason clause is introduced, and
  none may be** — `REQ-TOOLS-051`, `REQ-TOOLS-052` and `REQ-TOOLS-062` close those vocabularies.
- **No timer is placed on the user's wait.** The lapse window bounds how long main may fail to answer a
  poll; it does not bound how long a person may take to read a dialog. `runtime.approval_timeout_seconds`
  keeps its specified meaning, `0` included, and is never shortened to stand in for liveness.
- **The check is a gap since the last reply, never a receipt for a particular poll. This is a
  requirement on the mechanism, not a choice of implementation.** The lapse test is the elapsed time
  since a reply last arrived, evaluated on a clock the **run host** owns. A check written as "did a
  reply for sequence *N* arrive" is not an equivalent formulation and does not work, because a blocked
  main does not lose messages — it answers late. Measured across the nine blocked runs: the
  `utilityProcess` channel never emitted `close`, `process.kill(mainPid, 0)` returned true throughout,
  every `postMessage` was accepted while main was blocked, and when the 8,000 ms block ended **all 84
  outstanding replies arrived, the last with a measured round trip of 7,885 ms**. A receipt-based check
  would have reported success eight seconds late and would never have fired
  (`../spikes/presenter-liveness-and-instance-claim.md`, §4.2). The two states this record has to tell
  apart — "the channel is closed" and "the channel is open and nothing answers" — are therefore genuinely
  distinct, and it is the second that occurs.

- **The poll must be answerable while a dialog is open.** For the dialog `REQ-TOOLS-063` itself
  specifies this is now **measured and satisfied**: a child `BrowserWindow` with `parent` set,
  `modal: true` and 560×380 left the run-host → main channel at a maximum inter-reply gap of
  **266–267 ms across three repetitions** — indistinguishable from the 263–267 ms idle cadence. Main's
  loop is not blocked by its own modal child window. **But the measurement moved this obligation off the
  approval dialog and onto the whole application**, and in its restated form it reads: *no synchronous
  platform-dialog call may ever be made on the main process.* See *The synchronous-native-dialog
  prohibition* below. Presentation being asynchronous remains a constraint on how a dialog is shown and
  not on what it shows; what changed is that the dialogs at risk belong to other domains.

The lapse window is a free parameter — no requirement fixes one — and must be long enough that ordinary
main-process work cannot trip it. **A lapse is not a focus change and must never be driven by one**: the
per-window registration rule recorded below stands unaltered, and because one channel carries every
registration main holds — and under SR-1 there is exactly one main — a lapse makes the whole application
unattended at once, the same transition the last window closing makes, which is exactly what
`REQ-TOOLS-069` describes for a torn-down presenter.

**The window now has a measured floor, and a measured demonstration that the state it detects is real.**
The `ipc-hop-latency` spike instrumented main while it relayed run-host traffic to a renderer. Two
figures bear on sizing. On the low side, main's own relay work produced a single `webContents.send` of a
69 KB payload taking **88.263 ms while main's event loop was otherwise idle**, and under load a
contiguous burst of 32 samples over 50 ms as main drained a backlog — so a lapse window must be
comfortably above a hundred milliseconds or ordinary main-process work will trip it, and a false lapse
denies asks in flight. On the high side, main under an unthrottled frame load reached an **event-loop lag
of 22,777 ms while dropping and reordering nothing**: a main that answers eventually rather than never is
a measured mode of this topology, not a hypothetical. That is precisely the state `REQ-TOOLS-053`'s
capability test must call unattended, and it is the state a timeout on the *user's* wait would
misdiagnose. That spike's own gap — that it never measured a main showing a dialog — is closed by the
liveness spike below. **Neither sizes the window. Sizing it remains open (OQ-39).** *(Ruled 2026-10-06, [R-071](../../product/requests.md#r-071): the 250 ms poll and the 3 s lapse accepted as built.)*

**Detection, measured.** `../spikes/presenter-liveness-and-instance-claim.md` reproduced this record's
topology — main, a `utilityProcess` standing in for the run host, and a renderer — and heartbeated three
transports at 250 ms through nine scenarios, three repetitions each.

- **The floor.** Over the twelve runs in which main was never deliberately blocked — **258.1 s** of
  heartbeating, n ≈ 1,000 replies — the run-host → main channel showed an inter-reply gap of
  **p50 263 ms, p95 266 ms, p99 267 ms, max 303 ms, and zero gaps above 400 ms**. The one false-lapse
  candidate in the whole 258 s was a single 545 ms gap on the *renderer* channel, which the poll does not
  ride; no cause was determined and none is asserted.
- **Detection latency.** On the run-host → main channel, a 500 ms gap threshold was crossed at
  **+386 … +468 ms** after the block began, in all nine blocked runs, and the figure is the same whether
  main was in a busy loop, showing a synchronous message box or showing a synchronous folder chooser.
  **The heartbeat does not care why main stopped answering**, which is the correct behaviour for a
  capability test.
- **What that does and does not license.** On this host, with this workload, any threshold in
  **[400 ms, ∞)** produced no false lapse and detected every real lapse. That is a **floor, not a size**.
  The harness's main process paints one `<h1>`; it has no renderer framework, no transcript pipeline, no
  session writer and no Git invocation, and it does **not** reproduce the 22,777 ms of event-loop lag the
  `ipc-hop-latency` spike measured under frame load — which is the state the window must also survive.
- **The direction of the failure was not exercised.** The spike measured detection, not the decision
  path: no permission gate, no `PendingApprovals` map, no `headless_approval_policy`, no
  `approval.requested`. `REQ-TOOLS-064`'s **"never a silent allow"** is a property of the gate and remains
  untested by measurement; only **"never a hang"** has evidence.

### The synchronous-native-dialog prohibition — application-wide, and not a style preference

**The rule.** Every platform-native dialog this product opens SHALL be opened through its **asynchronous**
form. No synchronous platform-dialog call may be made on the main process, anywhere in the application,
for any reason.

**What was measured (§4.4).** Five probes ran concurrently in one process tree, n = 1 per scenario. While
a **synchronous** native dialog was open on main, over 6,489 ms (`showMessageBoxSync`) and 7,339 ms
(`showOpenDialogSync`):

| probe on main | firings during the dialog | largest gap |
|---|---|---|
| `setInterval(250 ms)` | **0** | 6,742 / 7,621 ms |
| `ipcMain.on` from the renderer | **0** | 6,648 / 7,571 ms |
| main → renderer → main round trip | **0** | 6,666 / 7,587 ms |
| `utilityProcess` `parentPort` reply — *the channel this poll rides* | **0** | 6,601 / 7,417 ms |
| run host ⇄ renderer direct `MessagePort` — *never touches main* | 25 / 28 | max gap **267 ms** |

The busy-loop control produced the same pattern. **A synchronous native dialog is, from the run host's
side, indistinguishable from a main process spinning in an infinite loop.** The only transport in the
tree that survives it is the one that does not go through main.

*One qualification the summary of this result loses, and it matters for anyone tempted to build on it:*
"no main-process JavaScript runs" is true of every route the run host can reach and is **not** true in
general. In the same spike (§5.3) the platform's own single-instance notification callback ran on main
**+2,742 ms into a synchronous modal while main's own timers were dead**, because it is dispatched from
the nested message pump's window procedure rather than from the Node event loop. That is not a route the
run host has, it does not rescue the poll, and the spike labels the mechanism an inference. It is
recorded so that nobody reads "nothing runs" as a licence and nobody rediscovers the exception as a bug.

**Why the asynchronous form is a real remedy rather than a hope.** The blocking is a property of the
`…Sync` call and not of the native dialog. With the *same* `#32770` native dialog on screen for ~6 s, the
promise forms of the message box and the folder chooser left the run-host → main channel at a maximum gap
of **267–303 ms** — inside the idle floor. And `REQ-TOOLS-063`'s own modal `BrowserWindow` measured
**266–267 ms over three repetitions**.

**Why this is architectural, and where it bites.** `REQ-SHELL-164` enumerates the product's
platform-native dialogs: *"the folder choosers of `REQ-SHELL-011`, `REQ-SHELL-021` and `REQ-SHELL-163`,
and the native message boxes of `REQ-SHELL-119`"*. `REQ-WORKSPACE-009` requires the operating system's
native folder chooser for choosing a project folder, reached from the title-bar control of
`REQ-WORKSPACE-016`, from the deferred first-launch prompt of `REQ-SHELL-011`, from the workspace chip of
`REQ-SHELL-021` and from the diagnostics output-folder control of `REQ-SHELL-163`. And `REQ-SHELL-119`'s
third close guard asks **"Quit while a run is active?"** — a native message box raised, by construction,
*while a run is active*, which is precisely when an approval is most likely to be in flight.

If any one of those is opened with a `…Sync` call, then for as long as the user leaves it open: the lapse
fires at +386…+468 ms, registration is revoked, `REQ-TOOLS-177` cancels every waiting approval, those
waiters resolve `cancelled` → **deny with source `cancelled`** (`REQ-TOOLS-052`), and every subsequent
`ask` routes to `runtime.headless_approval_policy` (`REQ-TOOLS-064`, `REQ-TOOLS-065`) — which under
`abort` stops the run through the session's abort hook. **A user picking a project folder would silently
deny their own agent's tool calls. A user answering "Quit while a run is active?" would deny the very run
they are being asked about.**

**This record cannot enforce it and says so.** Nobody writing the workspace chooser or the window-close
guard reads an approvals ADR. The rule belongs where those implementers look: **ADR-0048** owns the
modality contract and already states that native dialogs are used only where the specification names
them, and `constraints.md` **T-31** carries the *never a hang* obligation without mentioning that its
reachability depends on this prohibition. **Reported to both rather than applied here** — this record is
not the owner of either.

**The limits of the evidence, stated so the rule is not over-claimed.** Windows 11 only; Electron 44.1.0;
**unpackaged**, run as `electron.exe <appdir>` with no artifact, no ASAR and no portable extraction; n = 1
for the §4.4 probe run and n = 3 for the scenario matrix. **Only `…Sync` blocking was measured.** The
promise forms of `showMessageBox` and `showOpenDialog` were verified non-blocking on Windows and nothing
else was — whether every native dialog the product needs has a non-blocking form on every platform is
**not** established, and a dialog family that turns out to have none is an escalation rather than an
implementation problem.

### The channel-close revocation is not the mechanism that operates

**Conclusion first, because it survives:** a main that has died leaves no approval hanging. That was the
point of the consequence and it is still true.

**The stated reason was tested and is false in this topology.** Three repetitions each of
`process.crash()` on main and of `taskkill /F` on main's pid alone (§4.5):

- the run host's `parentPort` **never emitted `close`** — 0 of 6 runs;
- the run host itself was **gone within 207–341 ms** of main's death — 6 of 6;
- **zero** run-host records were written after main's death in any run;
- and in the single run that got a tick in before dying, the run host recorded main's pid already gone
  with **`portClosed: false` in the same record**, then was gone two milliseconds later.

**What actually operates.** For a main that has died, the run, its `PendingApprovals` map and its host
cease to exist along with main. No revocation executes. No waiter is settled `cancelled`. No later `ask`
is routed to `runtime.headless_approval_policy`, because there is no gate left to route it. Nothing hangs
**because nothing survives to hang** — which is a different guarantee from the one this record described,
and the difference has a consequence the record must carry:

> **Nothing that must happen on the way down can be placed in the run host.** Settling pending approvals,
> flushing the session, writing a terminal timeline entry — none of it runs when main dies. What is
> durable is what had already committed: ADR-0009's per-event transaction and ADR-0024's per-entry
> transaction are the design's answer, and they are the *whole* answer. Any additional on-teardown work
> is not merely best-effort, it is unreachable.

**The channel-close branch is kept, and it is not dead code.** It is the branch for a main that closes its
end deliberately, and it is the branch a different hosting of the run host would exercise: the spike notes
that a run host built as a detached child process or a separate executable might well outlive main and
would then see the close — an alternative that was neither built nor measured. **For the case this record
described it — main died — the branch does not run.** The revocation that operates in every reachable case
is the gap-based lapse.

### No platform signal for "main is unresponsive" is usable from the run host

Recorded so that it is not re-proposed, because it looks like the obvious shortcut past a heartbeat.

- **Electron's `unresponsive` / `responsive` are `webContents` events.** They report on a *renderer* and
  they are emitted **by main**. A wedged main emits nothing. This is structural and no measurement can
  change it.
- **A `utilityProcess` has no observer of its parent.** It has `process.parentPort` — which does not close
  before it dies, above — and `process.ppid`, and nothing else bearing on main's liveness.
- **The operating system does have a signal and it detects the wrong case.** Probed every 250 ms from an
  external process against main's own window:

  | main is… | `IsHungAppWindow` | `SendMessageTimeout(WM_NULL, SMTO_ABORTIFHUNG, 300 ms)` |
  |---|---|---|
  | in a busy loop | **true from +5,176 / +5,407 / +5,435 ms** | **failed from +309 / +528 / +547 ms** |
  | showing a **synchronous** native message box or folder chooser | **never true** | **never failed** |
  | idle, or showing an async dialog, or showing a modal `BrowserWindow` | never true | never failed |

  The dialog's own window was probed too: `IsHungAppWindow` was `0` on all 23 samples per run. The spike's
  explanation — stated there as an inference — is that a native dialog runs a nested message pump on
  main's thread, so the thread keeps pumping window messages while running no JavaScript, and the OS's
  definition of *hung* is *not pumping messages*.

**So the one case the OS detects is the one a heartbeat detects trivially, and the case the OS misses is
exactly the case this mechanism exists to find.** Reaching either signal from a Node `utilityProcess`
needs a native addon or an FFI binding; that was **not measured**, and on this table there is no reason to
build one.

**One cross-record observation, reported and not applied.** The spike records that a main which stops
pumping messages both fails this poll *and* swallows ADR-0055's instance hand-over — the same host state
seen from two sides, currently reasoned about independently by two records. Whatever detects one is in a
position to inform the other. That is ADR-0055's to take up, not this record's.

### The flow, and the headless path

Flow: the gate resolves `ask`, publishes `approval.requested` with `resolver: "brokered"` and the
configured `timeout_seconds`, inserts the payload into `PendingApprovals` and mirrors it into session
state, posts a present-request to main, and awaits a settled outcome. **Main owns the per-window dialog
queue and nothing else**: it never decides, it only presents and returns one of the three answers. If
presenting raises, main returns a `presenter-error` outcome and the run host discards the pending
entry and denies. If the answer cannot be delivered — the run host settled the wait first, by timeout
or cancellation — main is told and the dialog enters the buttons-disabled status-line state rather
than closing on an answer nobody received.

For a session with no presenter the gate never posts anything: it publishes `approval.requested` with
`resolver: "headless"`, `timeout_seconds: null` and `unattended_reason: "headless-policy"`, applies
`runtime.headless_approval_policy`, and returns. **No wait is created at all**, which is what
`REQ-TOOLS-061`'s "meaning no wait occurs" requires.

**`PD-TOOLS-005` (built 2026-09-28) puts a third arm between the two.** A brokered wait that ends by
timeout marks the run's user **away** (the engine's `UserPresence`, one holder per run, on every
agent's port); while the mark stands, an ask that would otherwise be brokered takes the headless arm —
the same event shape, no wait created, the decision `headless-policy` — with a reason that names the
timeout that expired rather than the absence of a UI. The user's next input to the session clears the
mark (`Sessions.control`, `controlAsync`, and the id-routed answers). A session with no presenter is
still reported as such, ahead of the check.

The timeout is an explicit deadline on the wait rather than a per-wait timer, with `0` meaning **no
deadline registered** — the wait is then released only by an answer or by a cancellation. Bulk cancel
walks the map and settles each waiter `cancelled`, which `REQ-TOOLS-052`'s mapping turns into `deny`
with source `cancelled`.

Ordering across windows is carried in the payload as a **monotonic sequence number** assigned at
`approval.requested` publication, because the dialog queue is per window while the wait registry is per
session and a window can change which session it shows.

## Unresolved conflict between slices

**EXEC proposed that main register and revoke presenters "in particular on window close and on session
focus change". `REQ-MONITOR-253` forbids the consequence:** an approval request must reach the run
that asked for it **even when that run is not focused**. If a focus change revoked the presenter for
the previously focused session, that session's next `ask` would be classed unattended and denied by
`runtime.headless_approval_policy` — silently, and with the run still executing.

Two positions:

- **EXEC's, as written:** presenter registration is per session and tracks focus. Simple mapping from
  a window to the session it shows; breaks `REQ-MONITOR-253`.
- **Recommended:** presenter registration is **per application window, not per session**, and
  "unattended" is a property of the application — whether any live presenter is attached — rather than
  of the focused session. `REQ-TOOLS-053`'s "the session has no registered approval presenter" is then
  read as "no presenter is attached to this session's owning application". A focus change never
  revokes; a window close revokes that window's registration and the last one closing makes the
  application unattended, which is exactly the behaviour `REQ-TOOLS-069` describes for a torn-down
  presenter. Routing to a dialog is then by request id (ADR-0013), not by focus.

The recommendation is taken in the decision above. It should be confirmed, because it changes what
`REQ-TOOLS-069`'s "the presenter was torn down" means in a multi-window application (open question
OQ-4). *(Confirmed 2026-10-06 by the owner, [R-071](../../product/requests.md#r-071): per application window, and "torn down" means no window's registration remains.)*

## Consequences accepted

1. The run host, not main, decides that a session is unattended, so main must register and revoke
   presenters explicitly and promptly on window creation and close, or a torn-down presenter will be
   treated as live until something else notices. **That "something else" is the lapse and only the
   lapse.** The earlier text said "until the channel notices"; the channel does not notice for a main
   that has died, and for a main that is alive with no window left there is nothing for it to notice.
   An explicit revoke on window close is therefore load-bearing rather than an optimisation: without it
   an application with no windows stays *attended* until a lapse it will never suffer, because a healthy
   main answers the poll perfectly well while being unable to show anything to anybody.
2. **A live-but-unresponsive presenter is now *inside* the specification's vocabulary, and the liveness
   signal is how the test is evaluated rather than a gap-filler.** The earlier text of this consequence
   read: "`REQ-TOOLS-053` and `REQ-TOOLS-069` test presence of a registration and nothing else — never
   whether the presenter later answers — so a main that is wedged rather than crashed is *attended* by
   the specification's own test while satisfying nobody… The two requirements conflict on this case."
   **That is no longer true of the requirements as they stand.** `REQ-TOOLS-053` asks whether a prompt
   can be put in front of a person and `REQ-TOOLS-069` derives attendedness from it; a wedged main fails
   that test, so `REQ-TOOLS-064`'s "never a hang" and the attendedness definition now agree instead of
   conflicting. The earlier argument is preserved above rather than deleted, because it is the reason
   the mechanism exists and because a reader coming from OQ-39 or constraint T-41 — both of which still
   quote the superseded wording — needs to see which sentence moved. ADR-0002's process split still makes
   the wedged case reachable in ordinary operation rather than exotic, and the spike figures above show
   it occurring. The costs of the answer are accepted and are all on the fail-closed side: a false lapse denies the
   asks that were in flight, and under `runtime.headless_approval_policy: abort` the *next* ask after a
   false lapse stops the run through the session's abort hook (`REQ-TOOLS-065`); an answer arriving from
   a dialog whose request was already cancelled is undeliverable, which `REQ-TOOLS-063` already disposes
   of by leaving the dialog open with all three buttons disabled and a status line. The direction cuts
   against the corpus's usual rule that an unanswerable liveness question resolves toward *alive*
   (`REQ-NOTIFY-255`, `REQ-SESSION-051`, `REQ-GIT-093`). The underlying principle is the same — resolve
   toward refusal — and only the mapping flips, because for a restore refusal means calling a process
   alive, while for an approval it means calling a presenter gone.
3. Session-state mirroring means a pending approval is written to persisted session state
   (`REQ-TOOLS-056` — the payload is "rendered by hosts **and persisted into session state**") and
   removed on settlement, so a crash can leave a stale pending entry. **Resume must treat any pending
   entry read back from the session record as cancelled**, since `REQ-TOOLS-059` forbids anything but
   the host UI from answering it and the waiting agent no longer exists. **Under SR-4 the rule is
   unchanged and its window shrinks.** The mirror is a row written in the same transaction as the wait's
   creation and removed in the transaction that settles it (ADR-0008), and `REQ-SESSION-067` no longer
   defers any save, so the stale entry a crash can leave is bounded by one interrupted transaction
   rather than by a deferral window. `REQ-SESSION-196` restores "the pending questions and approvals, as
   trailer rows", which is what the resume rule then settles. Under SR-1 and SR-2 there is additionally
   no rival process that could be waiting on the entry this instance is about to cancel.
4. Pairing (`REQ-TOOLS-062`) is enforced where the decision record is built, and it reads the pending
   payload — so it must happen before the entry is removed from the map.
5. **The run host does not outlive main, so the wait registry has no shutdown path of its own.** Measured
   at 207–341 ms in 6 of 6 runs. `REQ-TOOLS-054`'s bulk cancel and `REQ-TOOLS-177`'s teardown ordering are
   therefore reachable only for the cases where *something in the process tree is still running* — run
   cancellation, session teardown, an orderly quit. They are **not** a recovery path for a dead main, and
   must not be documented, tested or relied on as one. Consequence 3's resume rule is what settles a
   pending entry after that kind of death, and it is the only thing that does.
6. **A lapse that is a false positive is now bounded on one side only.** The floor is measured — 258 s of
   unblocked running with no main-channel gap above 303 ms — but on an idle main. The loaded case is not
   measured and the lapse window is not sized; OQ-39 is untouched by this evidence and the *Revisit if*
   trigger about a window that cannot be set wide enough remains live.

## Revisit if

The product gains a second presenter kind — a system notification that can be answered, or a remote
approver — at which point "registered presenter" stops being a boolean and `REQ-TOOLS-053`'s
definition of attended needs re-reading; or `approval_timeout_seconds: 0` is reconsidered; or the lapse
window cannot be set wide enough to avoid false revocations under ordinary main-process load, in which
case the choice narrows to a hang at `0` or a specification change, and the question becomes an
escalation rather than an architecture decision. **Or `REQ-SANDBOX-101`'s presence-only sentence is
confirmed as the operative test rather than `REQ-TOOLS-053`'s capability test**, in which case the
conflict this record was originally written around returns exactly as it stood and the argument
preserved in consequence 2 becomes live again.

**Or the run host stops being a `utilityProcess`.** The correction above is a fact about *this* hosting:
a run host built as a detached child process or a separate executable could outlive main, would then
observe `parentPort` closing, and the channel-close branch would become the mechanism this record
originally described. Anything that changes the run host's hosting re-opens that paragraph and the
teardown consequence that follows from it.

**Or a native dialog family turns out to have no asynchronous form on some platform.** The
synchronous-native-dialog prohibition is measured on Windows for two dialog families. A platform where a
dialog `REQ-SHELL-164` requires can only be shown synchronously is a conflict between that requirement
and `REQ-TOOLS-064`'s *never a hang*, and is an escalation rather than an architecture choice.

## First execution — 2026-09-03, the presenter across the real boundary

*Recorded under GD-10.*

**Built and run.** `packages/agent-tools/src/approvals.ts`: `PendingApprovals` with every clause of
`REQ-TOOLS-054` (waiting on an unknown id resolves *cancelled*), and `PresenterRegistry` — registrations per
main window, a 250 ms poll on the channel that carries registration, and the lapse test as THE GAP SINCE THE
LAST REPLY on the run host's own clock, never a receipt for sequence *N*. **The lapse window is 3,000 ms**:
ten missed replies, an order of magnitude above the measured 303 ms idle maximum, inside the 22,777 ms lag
the `ipc-hop-latency` spike says must read as unattended. That is a first figure, not a sizing: the loaded
case is still unmeasured and **OQ-39 stays open** *(ruled 2026-10-06, [R-071](../../product/requests.md#r-071): the poll and the window accepted as built)*. Main registers each window on creation and revokes it on
`closed` (consequence 1), answers each poll at once with the windows it holds, owns the per-window dialog
queue and nothing else; the dialog is a modal `BrowserWindow` painting the one renderer bundle with
`role=approval` — never a synchronous native call. The gate's flow is the one this record describes:
`approval.requested` published before the wait with `brokered` and the configured timeout, or `headless`,
`timeout_seconds: null` and `unattended_reason: headless-policy` with no wait created at all.

**"Never a silent allow" now has evidence beyond measurement** — the direction this record said the spike
had not exercised. The gate's tests drive the decision path: an unattended session routes every ask to the
headless policy and denies; `abort` invokes the registered hook; a presenter that fails discards the
pending entry and denies with `presenter-error`; approval resolution that raises denies `fail-closed`; a
lapse settles every waiter `cancelled` and the next reply clears it. In the built app, a run stopped while
a dialog waited released the waiter first (`REQ-MONITOR-012`) and the decision was audited with source
`cancelled` and the request id.

**Found — the synchronous-dialog prohibition has a second entrance, and it was walked through.** Main's
`closed` handler for the dialog read `webContents` of the already-destroyed window. That throw is the
pitfall the toolchain notes already record; what this record had not stated is its consequence *here*: an
uncaught exception in main raises the platform's native error box, which is exactly the synchronous modal
this record forbids, and it blocked the loop and every poll reply — the run completed in the run host while
main sat wedged. Two corrections: the handler holds the id read up front, and **main now logs uncaught
exceptions instead of letting the platform present them** (`process.on('uncaughtException')`). The
prohibition is therefore not only "open every dialog asynchronously"; it is also "let no exception reach
the platform's own presenter". ADR-0048 and constraint T-31 are the owners of the rule and are told here
rather than amended.

**One handshake this record did not describe.** The run host cannot request from main, so `present()` posts
an `approval.present` event and awaits main's `approval.shown` request, bounded at 10 s; a late or absent
confirmation is a presenter error. Main reports `ok: false` when no main window exists, which is the
unattended case reached without a lapse.

**The handshake's bound met a queued request (2026-09-28, the fourteenth review round of the merged revision 4 build of
`PD-ORCH-005`).** *"A late or absent confirmation is a presenter error"* was false for a request queued behind an open
dialog. Main confirmed only what it showed, so such a request was denied unshown once the open dialog had stayed up for
10 s, although `REQ-TOOLS-063` drops a queued request only on a timeout or a cancellation
(`docs/defects/fixed/a-queued-approval-is-denied-unshown-after-ten-seconds.md`). Main now acknowledges a request that
waits behind the open dialog, or behind requests queued ahead of it, with `approval.queued`. The bound then no longer
applies. A request main never acknowledges is still a presenter error at 10 s. The gate races the presentation against
its own wait, so a queued request that times out or is cancelled is dropped unshown and counts as cancelled
(`REQ-TOOLS-054`). A window that closes while the application stays hands its queued requests back to main, which
answers each not shown (`REQ-TOOLS-058`), so a request the bound no longer covers never hangs (`REQ-TOOLS-064`). During
the application's quit it answers nothing, and the shutdown withdraws them (`PD-ORCH-005` clause 9).

**Second execution, 2026-09-03, with children.** `PendingApprovals` is per TOOL PORT, and with delegation every
agent — the root and each child — holds its own port. A session-level route for an answer would have reached the
one port the session was created with and missed every agent's; caught in the code before it ran, so it is not
counted with the seven, but it is a fact this record did not state: **the run fans an answer, a cancel and a mode
change out over every port it created** (`Run.answerApproval`, `Run.cancelPending`, `Run.setPermissionMode`), and
`REQ-TOOLS-030`'s "every live agent of the session" is met by that fan-out rather than by one registry.
