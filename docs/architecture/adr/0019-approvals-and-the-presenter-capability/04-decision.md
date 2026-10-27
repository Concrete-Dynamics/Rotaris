# ADR-0019 — Approvals: the wait registry lives with the gate; the presenter is a revocable capability — Decision

Part 4 of 8 of [ADR-0019](../0019-approvals-and-the-presenter-capability.md), which indexes every part.

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
liveness spike below. **Neither sizes the window. Sizing it remains open (OQ-39).** *(Ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): the 250 ms poll and the 3 s lapse accepted as built.)*

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
