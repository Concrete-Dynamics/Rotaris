# Open questions — Escalations — product-owner decisions (1 of 3)

Part 3 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds ESC-1 – ESC-12, ESC-14 – ESC-17.

## Escalations — product-owner decisions

**ESC-1 to ESC-18 have all been ruled on.** The rulings are in
[`owner-decisions.md`](../owner-decisions.md), together with nine structural rulings (SR-1 to SR-9) taken
under the owner's standing direction that inherited structure is not a reason. The entries below are kept
as the statement of what was decided **between**, because a ruling is only legible beside the options it
chose from; each remains the canonical description of the choice and `owner-decisions.md` is canonical
for the answer.

**ESC-19, ESC-20 and ESC-21 were ruled on 2026-09-01** against comparative evidence from seven coding
harnesses, and **ESC-23 and ESC-25 have since been answered by the specification itself** rather than by
a ruling. ***"ESC-22 and ESC-24 remain open and neither is architecture's to settle" is WITHDRAWN and must
not be cited.*** **ESC-22, ESC-24 and ESC-27 to ESC-31 were ruled together on 2026-09-02** — the ruling is
in `owner-decisions.md` under that heading — and all seven have landed in requirements: `REQ-MONITOR-306`
bounds the aggregate terminal-frame rate, `REQ-SHELL-169` refuses a launch inside the force-exit allowance,
`REQ-CONFIG-216` fixes `secrets.yaml` at `0600`, `REQ-CONFIG-183` reports and carries on for a withdrawn key
in either scope, `REQ-LIBRARY-047` and `REQ-LIBRARY-176` make a never-recorded version distinguishable from
a pruned one, and `REQ-TOOLS-079` puts the permission-audit identifier in the entry.
`docs/clean-room/specification-gate.md` *(removed 2026-10-26)* carries what each amendment
says. **Every one of the seven was a cost of a ruling or a consequence of a measurement rather than a
decision anyone deferred, and no escalation in this register is now open.**

Four of the ruled entries are marked below where a later ruling or a later amendment reached back into
them: **ESC-3**, whose accepted defect a transaction makes unreachable (ESC-18); **ESC-9** and **ESC-10**,
whose mechanisms SR-1 and SR-4 dissolved without disturbing either ruling; **ESC-15**, whose ruling
created ESC-19 and ESC-21; and **ESC-1**, whose consequence ESC-23 named and whose antecedent
`REQ-CONFIG-423` has since been restored by amendment.

### ESC-1 — The shared save path between Settings and the composer's permission-mode control

**Where:** ADR-0037. **Source:** `REQ-CONFIG-288`, which states the behaviour and then explicitly hands
the decision over: "A rewrite must decide about this cross-surface coupling explicitly."

Choosing a permission mode in the composer currently **also commits every other pending Settings edit**.

1. **Preserve the coupling.** Matches the stated behaviour exactly. The only option with no conformance
   risk, and the only one where a user can be surprised — in a security-relevant control.
2. **The composer control writes only its own key**, through the scoped per-field writer that already
   exists for exactly this shape of write. Pending Settings edits stay pending. Smallest change; the
   machinery is already specified.
3. **The composer control becomes an in-memory change only** — the next run reads it, no file is
   written. `REQ-CONFIG-328` already notes that the composer's control writes and applies immediately,
   so this changes that.

The decision must not break `REQ-CONFIG-423` or `REQ-CONFIG-418`.

### ESC-2 — Whether configuration write-back preserves comments

**Where:** ADR-0036. **Source:** `REQ-CONFIG-252`, which states that "comments and formatting are lost
while content is preserved — the observable cost of editing models from a UI".

A spike run for the DATA proposal showed that **preserving comments is nearly free**: the document API
recommended for the tri-state model keeps comments, layout and key order through a targeted edit, and
only parse-then-re-emit loses them. **Preserving them is less work than deliberately discarding them.**

1. **Match the specification** — parse and re-emit, losing comments. Conformant. Costs the user the
   comment header the bootstrap itself writes (`REQ-CONFIG-025`) the first time they touch a model slot.
2. **Preserve comments** — a strictly better user outcome and cheaper to build, but it changes an
   observable the specification fixes, so a black-box conformance comparison would flag it.

Key order preserved and never alphabetised (`REQ-CONFIG-248`) holds under both. Nothing else depends on
comments being lost.

### ESC-3 — Silent loss of a review decision under last-writer-wins

**Where:** ADR-0003, ADR-0041. **Source:** `REQ-LIBRARY-042`, which fixes the semantics and accepts the
consequence: "only two writers whose read and write genuinely interleave can lose one of the two
changes, and in that case the later replacement wins whole… The agreement guarantee is an agreement
about what the store holds, not a promise that no decision can be overwritten."

So a user can approve a proposal, another window can reject it, and one decision disappears with no
report. This would not be raised except that **the product already reports a concurrent change in one
place and silently loses it in another**: `REQ-LIBRARY-173` posts a warning where an action's target is
no longer present, and `REQ-LIBRARY-116` requires the undo path to write nothing and report that the
proposal has since changed, naming the status it now holds.

1. **Match the specification.** Silent loss on the ordinary write path, a stated report on the undo
   path. Conformant, and the recommendation absent a decision.
2. **Extend the reporting to every write** — compare the freshly read state against what the surface was
   showing and, where they differ, write nothing and report it. This adds a refusal where the
   specification has none.

**Ruled option 1, and the ruling has since been overtaken by SR-4.** Under a transaction the
read-modify-write is atomic, so the loss the owner deliberately accepted becomes unreachable rather than
merely rare. Every guarantee `REQ-LIBRARY-042` states still holds; only the accepted defect goes. See
**ESC-18**, which asks the owner to confirm rather than assuming that divergence in the safe direction
needs no ruling.

### ESC-4 — A workspace with no version-control repository has no undo

**Where:** ADR-0039. **Source:** `REQ-GIT-044` ("a tree the tool cannot manage resolves to disabled — a
workspace without undo") and `REQ-LIBRARY-163` ("a workspace with no repository must lose only the
rollback capability").

A content-addressed snapshot store of our own would close that gap, and it was assessed and rejected in
ADR-0039 because `REQ-GIT-029` requires checkpoints to be **ordinary commit objects** and `REQ-GIT-060`
requires overwritten content to be retrievable from the safety checkpoint's **commit**. Closing the gap
would change what the product does for a user whose workspace is not a repository, so it is not an
architectural decision. Options: accept the gap as specified, or amend `REQ-GIT-029` and accept a second
snapshot mechanism with its own restore semantics.

### ESC-5 — Does the pooled terminal backend ship?

**Where:** ADR-0020. **Source:** `REQ-TOOLS-099`, `REQ-TOOLS-100`, `REQ-TOOLS-103`, `REQ-TOOLS-187`.

The backend vocabulary is closed at two values; two `kill_status` values only a pane-based pool can
produce are specified; pooled-recovery behaviour is specified in detail; **and nothing states when a
pooled backend is used, whether it must exist, or what selects it.** It would also be POSIX-only, while
Windows mandates a different shell, and the two backends must be observationally identical apart from
the name.

1. **Ship one backend** and withdraw the pooled name and its two status values, keeping the field for
   forward compatibility.
2. **Ship both**, accepting the engineering cost, the external dependency and the platform asymmetry.
3. **Keep both names and define the pooled one as a future backend**, leaving a specified behaviour with
   no implementation.

This changes what a conformance claim can say rather than what a user sees.

### ESC-6 — Windows users get no confinement at all

**Where:** ADR-0022. **Source:** `REQ-SANDBOX-065` closes the platform set at two identifiers and forbids
adding one; `REQ-SANDBOX-048` forbids an opportunistic mode.

A Windows user therefore runs every agent command unconfined, and an unattended permissive run on
Windows is always downgraded unless they set the opt-out key — at which point the agent runs unattended
and unconfined on their machine. Technical options exist and each would change what the product **does
for a Windows user**; adopting any contradicts the two requirements as written.

1. **Accept the specification** and document plainly, on the settings surface and in the launch
   advisory, that Windows has no confinement.
2. **Amend `REQ-SANDBOX-065`** to admit a third platform with a genuinely enforcing mechanism, accepting
   that `REQ-SANDBOX-127`'s real-host conformance obligation then extends to a third continuous-
   integration platform.
3. **Treat a Linux subsystem as the supported Windows path** and say so in the product's system
   requirements rather than only in a remediation string.

### ESC-7 — Custom tool plugins are specified as in-process Python; the runtime is not

**Where:** ADR-0025 (blocking that ADR). **Source:** `REQ-TOOLS-163` requires plugins to execute "inside
the host process with exactly that process's OS privileges"; `REQ-TOOLS-165` and the workspace layout fix
the extension as `*.py`; ADR-0001 chose TypeScript on Node.

1. **Change the plugin language** to modules the host can genuinely import in-process, amending
   `REQ-TOOLS-165` and the layout. **The only option that satisfies `REQ-TOOLS-163` as written**, and it
   costs nothing in bundle size or supply chain. Recommended if the requirement may be amended.
2. **Bundle an interpreter and host plugins in a sidecar**, preserving the file format and the folder
   but re-reading "inside the host process" as "with the host's privileges", and accepting tens of
   megabytes, a second signing and update surface, and a fifth process kind.
3. **Drop custom plugins**, removing a capability the specification carries.

Choosing the plugin language changes what a user can write and therefore what the product is.

### ESC-8 — What the update path establishes

**Where:** ADR-0054. **Source:** `REQ-STARTUP-021`, `REQ-STARTUP-023`, `REQ-STARTUP-123` — binaries are
deliberately unsigned, and the update path establishes **what** was downloaded and nothing about **who**
published it, over the same connection the download came from.

1. **Keep it as specified**, disclosed in the release notes.
2. **Add code signing and notarization**, changing cost, release process and two requirements, and
   making signature verification possible in the updater.
3. **Sign the checksums manifest with a key shipped in the application** — cheaper than (2), gives
   publisher authenticity for updates, and does not change first-launch platform warnings.

The architecture is materially different under (2) or (3), and it is far cheaper to decide now than
after the updater exists.

### ESC-9 — Session retention

**Where:** raised by the RUNTIME slice; touches ADR-0003 and ADR-0008. **Source:** nothing in domains 01,
02, 07, 09 or 20 prunes *sessions*. There is retention **within** a session — the journal cap, the
5,000-row transcript window, the ring-capped evidence files — but a workspace accumulates session
directories without bound, and deletion is only ever an explicit user action (`REQ-SESSION-166`,
`REQ-SESSION-182`). Every session listing is a read per session (`REQ-SESSION-042`) and every history
listing decodes two lines per session (`REQ-EVENTS-126`), both against `REQ-SHELL-150`'s 100 ms gesture
budget.

1. **Leave it unbounded** and accept that the session browser degrades in long-lived workspaces.
2. **Add a user-visible retention preference** — keep N sessions, or N days — with explicit deletion
   semantics.
3. **Leave it unbounded but add the derived read index** ADR-0003 keeps as a named escape hatch, so the
   surfaces stay fast while nothing is deleted.

Option 3 is purely an architecture decision and can be taken later without foreclosing 1 or 2. Options 1
and 2 change what the product *is* for a user with a year-old workspace.

**Ruled option 3, and the ruling stands unchanged: retention is unbounded and nothing is ever deleted.**
Its second half — the derived read index outside the sessions tree, with its validate-against-`updated_at`
machinery and its never-consulted-by-resume-repair-locking-or-following carve-outs — is **withdrawn as
unnecessary, not as wrong**. It existed because `REQ-SESSION-001` closed the session-directory root
against any other name, so a fast listing had to live somewhere else and be defended against staleness.
Under SR-4 a session listing is an indexed query over the same rows the listing describes, so there is no
second copy and no staleness question to answer. What replaced the escape hatch is simply an index.
**The obligation it carried did not go with it:** a listing that used to be a directory scan is now a
query plan, and spike 8 measures it rather than assuming it.

### ESC-10 — Controlling a run owned by a second application instance

**Where:** ADR-0011, ADR-0013; related to OQ-3. **Source:** `REQ-MONITOR-013` requires every control
operation to be issuable against a run in a different process; `REQ-SESSION-161` says the only channel to
a foreign session is the filesystem; **and no filesystem control channel is specified anywhere.**

If the user opens a second instance on the same workspace and presses Stop on a session the first
instance owns, one of three things must happen:

1. **The control is refused with a reason naming the owning process** — consistent with
   `REQ-MONITOR-005`'s "a `false` outcome states the operation did not happen" and with
   `REQ-SESSION-183`'s existing vocabulary, and requiring no new mechanism. **Recommended**, and it
   appears to be what the specification already implies.
2. **A filesystem control mailbox** under the session directory — which `REQ-SESSION-001` forbids at the
   session-directory root, so it would need a new specified location and a new set of ordering rules.
3. **An operating-system channel between instances**, which `REQ-EVENTS-178`'s refusal of any
   programmatic driving surface makes awkward to justify.

The difference is visible to a user with two windows open from two launches.

**Ruled option 1, and SR-1 has since dissolved the premise.** `REQ-STARTUP-161` makes a second launch
surface the running instance, so there is no second instance whose control must be refused and a user
cannot have two windows open from two launches. The refusal survives as a **defence against a state that
should not arise**, not as routine behaviour, and ADR-0011 consequence 4 records it that way.
`REQ-STARTUP-164`'s reclaim path is the one interval in which two processes of this application
genuinely coexist, and what makes that interval safe is the session lock (C-14, W-09), not the refusal.

### ESC-11 — The Linux artifact's runtime, and the sandbox that comes with it

**Where:** ADR-0054, which records it as its second escalation. **Source:** `REQ-STARTUP-024` requires
the application image to run **unextracted on an unmodified Ubuntu 24.04 installation**;
`REQ-STARTUP-159` requires first paint on that baseline with nothing else installed; `REQ-STARTUP-031`
closes the artifact set at four.

The packaging tool's legacy image runtime dynamically loads `libfuse.so.2`, which that distribution does
not ship, so the user's first launch fails at the dynamic loader — or silently, from a file manager. The
same legacy path also **disables the shell's own process sandbox unconditionally**, because the
distribution restricts unprivileged user namespaces; the static runtime detects the condition instead and
disables it only where the namespaces are genuinely unavailable. ADR-0002 makes the sandboxed renderer
load-bearing — the transcript renders Markdown a model wrote and the terminal grid renders bytes an
arbitrary process wrote — so "Linux users get that surface unsandboxed" is a different product, not a
build flag. The static runtime is the default only of the tool's pre-release line.

1. **Ship on the pre-release line.** Changes the release process, nothing the specification fixes.
2. **Ship on the stable line and pin the runtime explicitly**, if that line permits it — to be
   established, not assumed.
3. **Ship on the stable line and disclose the library prerequisite.** Contradicts `REQ-STARTUP-024` as
   written.
4. **Change the Linux artifact form.** Forbidden by `REQ-STARTUP-031`'s closed four-artifact set without
   a requirement change.

`REQ-STARTUP-156`'s release gate names a machine the release owner controls, **not** an unmodified
installation of the baseline distribution, so the gate can pass while the requirement fails. Spike 12
below is what decides this.

### ESC-12 — Which protocol era floor the tool-server client ships with

**Where:** ADR-0033, which records it as an escalation. **Source:** `REQ-MCP-067` requires exactly one
stdio server process per server per session; `REQ-MCP-048` degrades a server that reports no tools to an
empty list rather than an error.

The choice of SDK line decides **which of a user's existing tool servers connect**. The 1.x line tops out
at the `2025-11-25` protocol era and exposes no negotiation control at all; the 2.x line adds the current
era and the negotiation control `REQ-MCP-067`'s countable one-process guarantee depends on, and is one
month old.

1. **2.x with the pre-2026 offered-version entries retained** — widest server compatibility, at the cost
   of resting the product's whole tool story on a young major. **ADR-0033 recommends this.**
2. **1.x** — a settled dependency, but servers speaking only the current era are unreachable and, under
   `REQ-MCP-048`, present to the user as servers offering **no tools** rather than as an error.
3. **2.x with the pre-2026 entries dropped** — simplest, and breaks every 2025-era server the user
   already has.

What a user observes — which of their servers work — differs under all three, and the choice is not
cheaply reversible once user configurations exist.

> **Measured 2026-09-05 (Part S; `spikes/mcp-negotiation.md`) — option (a) taken, and the balance changed in
> one respect.** Over ADR-0033's own transport the SDK spawns **no** sibling probe under any mode (eleven of
> twelve cells: one launch per connection), so `REQ-MCP-067`'s process count is held by the transport's
> shape and **no pin is needed**. The shipped mode is `'auto'` (probe, fall back to `initialize`): it is the
> only mode that reaches all four fixture eras. The two costs the escalation named were measured: a 2026 pin
> refuses every 2025-era server (option (c)); `'legacy'` cannot reach a server that speaks only the new
> negotiation (option (b)). The one case the SDK's sibling exists for — a 2025 server that **exits** on the
> unknown pre-`initialize` probe — is handled by a single sequential retry under `'legacy'` (two launches,
> never two processes at once). Option (a) stands: the 2.x line (`@modelcontextprotocol/client` 2.0.0,
> pinned exactly) with the pre-2026 offered list retained. A real third-party server was not tested; the
> fixture only. — A benchmark invariant against screen-reader access *(conditional on OQ-28)*

**Where:** ADR-0045, through OQ-28. **Live only if OQ-28 resolves to the framework-neutral reading**;
ADR-0045 names the conflict and raises OQ-28 as blocking, but does not itself carry an escalation
section, so this entry is the record of what the answer costs.

**Source:** `REQ-UIBENCH-054` against `REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065`, `REQ-SHELL-144`.

If the framework-neutral counting rule is the operative one, a rendered Markdown body's elements enter
`widgets`, content changes move the count, and **no document-model transcript can hold
`REQ-UIBENCH-054`'s invariant.** Only a canvas can, and a canvas forfeits native text selection, keyboard
navigation and per-row accessible names, all of which are hard requirements.

1. **Confirm the framework-relative reading** — the product defines the counting rule, content nodes are
   accounted to `ui_objects`, ADR-0045 stands. Costs nothing; risks a reviewer concluding the counter was
   defined to pass.
2. **Confirm the framework-neutral reading and relax `REQ-UIBENCH-054`** — the invariant becomes a bound
   on the count's variation, or applies only to application-owned structure. Costs a specification
   amendment in a domain whose whole point is determinism.
3. **Confirm the framework-neutral reading and build the canvas**, with a hand-built accessibility tree
   and text-selection model. The failure mode is that a screen-reader user cannot read the conversation.
   Recommended only if (2) is refused.

The invariants are informational either way (`REQ-UIBENCH-088`), so nothing fails a gate on this — which
is exactly why it must be decided deliberately rather than discovered when the numbers move.

### ESC-14 — Two corrections to SR-4's own reasoning, before it is cited further

**Where:** ADR-0003, ADR-0004, ADR-0036, ADR-0040, ADR-0041. **Source:** `owner-decisions.md` SR-4, the
paragraph headed "Why, in one paragraph", and SR-4's own table.

This is not a request to revisit the ruling. Three of that paragraph's four arguments hold, the table is
right, and the decision stands on them. **Two of the reasons given do not support the conclusions they
are attached to, and both will be cited by someone reading `owner-decisions.md` alone.**

1. **SR-4 lists OQ-41 among the things a database dissolves, and it does not.** The argument is that
   `REQ-TRACE-502` "is not satisfied by the file design either" and that "that defect is unreachable in a
   store whose readers do not block its writers". But `REQ-TRACE-502` governs the generated symbol
   artifact, the three baselines and the retired-identifier log, and **SR-4's own table keeps all four as
   plain files in the user's own repository** — correctly, by SR-4's own principle, since version control
   must track them and the compiler reads the generated artifact. They never reach the store. What
   actually narrows OQ-41 is **SR-1**: no command line (`REQ-TRACE-142`, `REQ-TRACE-144` to
   `REQ-TRACE-151`, `REQ-TRACE-153`, `REQ-TRACE-184` to `REQ-TRACE-186` withdrawn), no programmatic entry
   point (`REQ-EVENTS-178`), no second instance (`REQ-STARTUP-161`), no engine process
   (`REQ-TRACE-206`) — so unbounded cross-process concurrency becomes bounded in-process contention. The
   outcome is a sharp narrowing with a residue, not a dissolution. See OQ-41 as rewritten.
2. **SR-4 says "`REQ-CONFIG-192`'s unmigrated-record rule is an argument about *configuration*, which
   stays in files."** `REQ-CONFIG-192` is a configuration *key* whose *subject* is the delivery store,
   and its unsupported-record rule is about **delivery records**, which move to the database. The
   conclusion — configuration stays in files — is right, and ADR-0036 now argues it on grounds that
   actually reach it (`REQ-CONFIG-183`'s top-level carry-and-ignore policy, `REQ-CONFIG-471` and
   `REQ-CONFIG-464`'s raw-file rendering, version control, and three of `REQ-CONFIG-031`'s five layers
   not being per workspace). The delivery-record rule is preserved in rows by W-11 and Y-17.

**What is asked:** amend the ruling's reasoning so neither imprecision propagates. Nothing about the
decision changes. Options are (1) correct the paragraph, (2) leave it and rely on this entry, or (3)
restate SR-4 as resting only on the three arguments that hold. **Option 2 is the risk**, because OQ-41 is
the kind of thing a later reader closes on the strength of a ruling that says it is closed.

### ESC-15 — A workspace on a network share or in a cloud-sync folder becomes unrunnable

**Where:** ADR-0058 consequence 3; constraint W-04. **Source:** SR-4, against no requirement at all —
nothing in the corpus says where a workspace may live.

Write-ahead logging is unsupported on network filesystems. The store therefore opens read-only, and since
acquiring a session lock is now a **write** (W-09), **no session in that workspace can start.** Under the
file design such a workspace worked, slowly. This is the single most likely way a real user meets SR-4 as
a regression: people keep projects on mapped drives, in OneDrive and in Dropbox constantly, and a
corporate user may have it by default without knowing.

1. **Accept and disclose** — detect at workspace open, refuse with a stated reason naming the
   filesystem, and document the limitation in the system requirements rather than only in an error
   string. Cheapest, and it makes the failure legible rather than mysterious.
2. **Open the store somewhere else for such a workspace** — a per-user store keyed by workspace path.
   This breaks `REQ-SESSION-001`'s workspace-path-plus-session-id anchor, makes a workspace
   non-portable with its own directory, and is a second store layout to test.
3. **Fall back to a file-backed session store for such a workspace**, keeping both designs alive. The
   cost is the whole of what SR-4 removed, permanently, in a second code path exercised only by the
   users least able to report on it.

Spike 19 establishes what actually happens — a clean refusal, a silent degradation, or a corruption
risk — and a cloud-sync folder is a local filesystem with a daemon on top, so it may behave differently
from a true network share and must be measured separately.

### ESC-16 — A store that will not open now means no run at all, rather than a run without history

**Where:** ADR-0058 consequence 4; ADR-0010. **Source:** `REQ-SESSION-089` and `REQ-EVENTS-084`, both of
which require a run to **proceed with a logged warning** when the durable event store cannot be attached.

Under the file design the event store, the session state and the lock were three different things, so
losing one was a partial failure and degrading was meaningful. Under SR-4 they are **one object**. There
is no partial failure left to degrade through: if the store will not open there is no session to run, no
lock to hold and nothing to write a warning into. The requirement's stated path is unreachable, not
merely awkward.

1. **Refuse to start, with a stated reason naming the store and the engine's own error.** What the
   requirement protects — that a store failure never silently discards a run — is served by refusing
   rather than by degrading, and it is what ADR-0058 and ADR-0010 are written against. Amends
   `REQ-SESSION-089` and `REQ-EVENTS-084`.
2. **Run with no durable record at all**, in memory, publishing to views. This is the literal reading of
   "the run MUST proceed", and it produces exactly the state `REQ-MONITOR-292` forbids: a view showing
   what no resume can restore, for the whole run.
3. **Split the store back apart** so a history failure is again partial. This gives back the transaction
   that discharges D-16, D-17 and `REQ-EVENTS-098`, for one failure path.

`REQ-EVENTS-088`'s sticky mid-run failure is a **different** case and stays reachable; what to do about
it is OQ-42. This entry is only about the store that will not open at all.

### ESC-17 — What a user can still read about their own runs without this application

**Where:** ADR-0058, ADR-0024, ADR-0009. **Source:** `REQ-SESSION-191`, which makes "the log, **the
timeline**, **the issues file**, **the metrics document** and **the evidence files**" reachable through
the platform's own file manager, without a shell.

**SR-4's table and SR-4's principle point in opposite directions here, and the table won by default
rather than by decision.** The principle says a file when a human is meant to read it. The table sends
the session wholesale to the database. Four of `REQ-SESSION-191`'s five items are rows under it.
`summary.md`, `evidence/debug.log` and the artifact bodies remain. The event history has an export
(`REQ-EVENTS-172`, `REQ-SESSION-189`); **the timeline, the issues and the permission audit have
nothing.**

The permission audit is where this matters most. It is a security record whose value partly consists in
being independently readable — it is what a user consults precisely when they do not trust this
application's own rendering of events. Moving it into an application-owned binary store makes it strictly
less independently auditable, however much stronger the immutability enforcement becomes (W-16 makes it
genuinely stronger, and that does not answer this).

1. **Extend the export** to the timeline, the issues and the audit, in the same line-delimited form
   `REQ-EVENTS-166` gets. Preserves the substance; the user must run a command to get it, where before
   they opened a folder.
2. **An in-application inspector** for these records. Convenient, and it is the option that does *not*
   answer the objection, because the record is then readable only through the thing being audited.
3. **Keep the permission audit and the verification-gate log as files**, accepting two write paths for
   evidence and the loss of the transaction that makes `REQ-TOOLS-081`'s three side effects atomic.

**One of the four has no ADR at all yet.** ADR-0008 computes the metric aggregates by query and
deliberately takes no position on the metrics *document*, because `REQ-SESSION-193` calls it one of three
machine-readable documents with a fixed key inventory and `REQ-SESSION-191` makes it file-manager-
reachable — which points at a file under SR-4's own **principle** — while SR-4's **table** does not name
it and sends the session wholesale to the store. That is the same disagreement this entry is about, in
miniature, and answering it answers where the document goes.

This is a real reduction in what a user owns about their own runs, it follows from the ruling rather than
from any implementation choice, and it does not look like it was foreseen.
