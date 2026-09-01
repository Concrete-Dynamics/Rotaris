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
- **Origin:** EXEC (ADR-EXEC-05), RUNTIME (constraint C10.5), UI (ADR-UI-05)
- **Depends on:** ADR-0002, ADR-0013, ADR-0017
- **Contains an unresolved conflict between slices** (presenter registration per window or per session,
  OQ-4 — narrowed by SR-1, not closed).
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
alternative from the field without deciding between those two.

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

**Registration is revoked on a lapsed liveness signal as well as on a closed channel.** Main answers a
periodic liveness poll on the channel that carries registration, and a registration whose answer does
not arrive within the lapse window is revoked exactly as a closed channel revokes it. **This is how
`REQ-TOOLS-053`'s test is evaluated across a process boundary**: the requirement asks whether an
approval prompt for this session *can be put in front of a person*, the presenter that would do so is in
another process, and a poll is the only evidence available. It is also what makes `REQ-TOOLS-064`'s
"never a hang" hold at `runtime.approval_timeout_seconds: 0`, which `REQ-TOOLS-055` and `REQ-TOOLS-178`
make a supported, user-writable value meaning wait without limit: a wedged main is otherwise
indistinguishable from a person who has not answered yet. Three properties are obligations rather than
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
- **The poll must be answerable while a dialog is open.** Presentation is asynchronous, because a
  presenter that shows `REQ-TOOLS-063`'s modal dialog by blocking main's loop would fail its own poll
  and revoke itself the instant it asked the user anything. That is a constraint on how the dialog is
  shown, not on what it shows.

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
misdiagnose. **The spike did not measure a main that was showing a dialog**, so it does not size the
window; it establishes the floor the window must clear and confirms that the condition being detected
occurs. Sizing it remains open (OQ-39).

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
OQ-4).

## Consequences accepted

1. The run host, not main, decides that a session is unattended, so main must register and revoke
   presenters explicitly and promptly on window creation and close, or a torn-down presenter will be
   treated as live until the channel notices.
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
