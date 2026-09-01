# Open questions and escalations

Everything the architecture record leaves unresolved, in three groups:

- **Escalations** — decisions that change what the product *is* for a user. These belong to the product
  owner, not to the architect. Each states the options and what each costs.
- **Specification questions** — places where the specification is silent, under-determined, or where two
  live requirements disagree. Each is raised rather than invented around.
- **Design-reference dependencies** — decisions that cannot be made without the approved visual design
  reference, which was not available to the architects who produced the slice proposals.

Nothing here blocks the Architecture Gate from being *held*. Several items block specific ADRs from
being *ratified*, and those are marked **blocking**.

**Counts, as of the measurement-and-amendment pass of 2026-09-01.** **Twenty-five escalations, eighteen
ruled** (`owner-decisions.md`) **and seven open** — the seven are new with this pass and every one of
them is a cost of a ruling rather than a decision anyone deferred. **Forty-six specification questions**,
four **resolved** and closed with their reasons below, leaving forty-two open, **none of which blocks a
named ADR any more**. Two design-reference dependencies. **Twenty-one numbered spikes**, one withdrawn,
two discharged and one discharged for Windows only, leaving seventeen outstanding.

**Nothing here is closed because a ruling said it would be, and nothing is closed because a measurement
was taken nearby.** Two closures in this pass were **rewritten rather than deleted**, because they were
right about the outcome and wrong about the reason: OQ-11 is closed, but not by dissolution, and OQ-44's
statement of fact was false. Two questions the ADRs decided against the specification's silence are filed
as **new** questions (OQ-47, OQ-48) rather than being presented as settled, because leaving them open
means an implementer picks and in both cases the appealing pick is the unsafe one.

**Where a measurement overturned something, the claim is preserved beside what replaced it.** Four spike
reports arrived on 2026-09-01 and each of them changed at least one entry below. They are in
[`spikes/`](spikes/) and are cited by filename.

---

## Escalations — product-owner decisions

**ESC-1 to ESC-18 have all been ruled on.** The rulings are in
[`owner-decisions.md`](owner-decisions.md), together with nine structural rulings (SR-1 to SR-9) taken
under the owner's standing direction that inherited structure is not a reason. The entries below are kept
as the statement of what was decided **between**, because a ruling is only legible beside the options it
chose from; each remains the canonical description of the choice and `owner-decisions.md` is canonical
for the answer.

**ESC-19 to ESC-25 are new with the 2026-09-01 pass and carry no ruling.** Every one of them is a cost of
a ruling or a consequence of a measurement rather than a decision anyone deferred, and **two of them
(ESC-19, ESC-20) are requirements SR-9 minted that are not in the specification** — which is the sharpest
kind of open item this register can hold, because a reader of `owner-decisions.md` alone would believe
they were closed.

Three of the ruled entries are marked below where a later ruling reached back into them: **ESC-3**, whose
accepted defect a transaction makes unreachable (ESC-18); **ESC-9** and **ESC-10**, whose mechanisms
SR-1 and SR-4 dissolved without disturbing either ruling; and **ESC-15**, whose ruling created ESC-19 and
ESC-21.

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

### ESC-13 — A benchmark invariant against screen-reader access *(conditional on OQ-28)*

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

### ESC-18 — ESC-3's ruling has been overtaken

**Where:** ADR-0058 consequence 5; ADR-0041. **Source:** ESC-3 as ruled, against `REQ-LIBRARY-042` read
under a transaction.

ESC-3 was ruled deliberately: match the specification, accept silent loss on the ordinary write path.
Under SR-4 the improvement store's read-modify-write is one transaction, so two genuinely interleaved
review decisions **can no longer lose one another**. Every guarantee `REQ-LIBRARY-042` states still holds
— no reader sees a partly applied change, the later replacement wins whole where the two do not
interleave, `REQ-LIBRARY-164`'s agreement is unaffected — and the accepted defect becomes unreachable.

That is divergence in the **safe** direction and needs no remedy. It is raised because the owner ruled on
it explicitly, on the reasoning that "adding a refusal to every write where the specification has none is
a larger change than the defect warrants" — and the defect is now gone without any refusal being added,
which is a different world from the one the ruling was taken in. Confirm, or state that the
specification's stated consequence must be reproduced.

### ESC-19 — SR-9(b)'s backup disclosure is not in the specification *(new, 2026-09-01)*

**Where:** ADR-0058; constraint W-22. **Source:** `owner-decisions.md` SR-9(b), against
`REQ-SESSION-198` and the absence of any requirement discharging it.

SR-9(b) ruled that a machine-local store changes what a backup protects and that **a requirement is
minted** so the product states the property rather than letting a user infer it from an absence.
**No such requirement exists.** Twenty-one domains contain no backup, restore or synchronised-folder
disclosure; `resolutions/07` records "the backup profile of a machine-local store" only as a *concern
raised*; and the ruling table in `docs/clean-room/specification-gate.md` lists SR-4 to SR-8 and does not
mention SR-9 at all.

The consequence is user-visible and is not small. A user's session history, permission audit, improvement
library and artifact bodies now live outside anything they back up when they back up their project. The
failure mode is a user who backs up their workspace, restores it, and finds their history was never in
it. Every mitigation this record has is an **export**, and `REQ-SESSION-199` forbids building anything
that repeats one. **ADR-0058 cannot close this from the architecture side** — it can place the store, and
it cannot make the product tell anyone.

1. **Mint the disclosure requirement**, which SR-9(b) calls the minimum honest fix.
2. **Take the structural option** SR-9(b) explicitly does not foreclose — a configurable store location,
   or an explicit backup action covering the whole store rather than per-record exports. This returns
   ADR-0058's alternative N and makes the store's location a user setting, with a second set of failure
   modes (a location on a share re-creates ESC-15; a location that moves orphans a history).

### ESC-20 — SR-9(a)'s two exports are not minted, and the argument reaches a third record the specification excludes *(new, 2026-09-01)*

**Where:** ADR-0024, ADR-0058; constraint W-23. **Source:** SR-9(a) and SR-6, against
`REQ-SESSION-199`, domain 14, and `REQ-TOOLS-190`.

SR-9(a) ruled improvement artifacts and delivery records into the export list "on the same terms as the
four in SR-6". `REQ-SESSION-199` carries the four. **Neither of the two exists**: domain 14 contains no
occurrence of the word *export* at all, and no export requirement for delivery records exists in domain
08 or 15.

The second half is sharper, because it is not an omission. `REQ-TOOLS-190`'s verification-gate record is
reached by the **identical** argument — it was a file under the withdrawn evidence set, a user could read
it, and unlike the tool-call evidence it carries no argument values that would make an export unsafe —
and `REQ-TOOLS-190` excludes it by a positive sentence: *"that only this application reads it is why it
is a record rather than a file the user is offered."* Either that sentence is SR-6's stated stopping
point, in which case SR-6's reasoning has a boundary nobody has drawn, or the list is short again.

**One case must never be swept in whichever way this goes.** `REQ-SESSION-136`'s tool-call evidence
deliberately holds **unredacted** arguments; the permission audit exports safely only because
`REQ-TOOLS-079` gives an entry no argument values at all. That is the principled line between the two
cases and it is stated in ADR-0024.

### ESC-21 — the one lock with a cross-machine obligation is the one the product cannot enforce *(new, 2026-09-01)*

**Where:** ADR-0005, ADR-0058; constraints C-01, W-20. **Source:** `REQ-GIT-128` against
`REQ-STARTUP-166`.

`REQ-GIT-128` keeps the integration lock a **file** deliberately: what it protects is the base
repository, which is the user's own material and travels with the workspace, so "a second machine
reaching the same checkout must meet the same lock". Under ESC-15 the session lock became machine-local
and got **safer**; the integration lock got **lonelier**, and it is now the only lock in the product with
a cross-machine obligation.

**Exclusive create is a real primitive on a true network filesystem. Inside a file-synchronisation
client's tree it is not.** Such clients replicate after the fact, so two machines can each successfully
create the file and the conflict is reconciled afterwards — by which time both integrations have started
and both are merging into one base branch. A silent double promotion into one base branch is the worst
outcome anywhere in this record.

`REQ-STARTUP-166` is the **only** mechanism in the product that distinguishes storage another machine
reaches directly from storage an agent replicates, and it drives only a warning about the user's own
files (constraint B-24). This is the one place where that distinction changes a **safety** property, and
nothing connects the two. Options are: extend `REQ-STARTUP-166`'s determination to gate integration on
replicated storage; state the limitation in the requirement and accept it; or give the integration lock a
second, non-filesystem interlock, which is a new mechanism.

### ESC-22 — the aggregate terminal-frame rate is unbounded, and a conformance budget now depends on it *(new, 2026-09-01)*

**Where:** ADR-0021, ADR-0044; constraints T-42, X-19. **Source:**
`spikes/ipc-hop-latency.md` §6 question 2 and §7.1, against `REQ-TOOLS-108` and `REQ-MONITOR-222`.

Measurement shows a distinct Electron IPC **channel name is not a distinct transport**, so ADR-0044's
stated isolation for terminal frames does not exist as described and the architecture's whole protection
for `REQ-MONITOR-222` is ADR-0021's coalescing cap. That cap licenses an aggregate of
*(stream count × 50 frames/s)* at its 20 ms floor, and the stream count is bounded only by
`runtime.shell_max_background_sessions` — default 20, **minimum 1, no maximum** (`REQ-TOOLS-108`), each
publishing its own stream (`REQ-TOOLS-127`) — plus `REQ-MONITOR-285`'s 20 agents. **One of the two
factors in a conformance budget is user-writable without a ceiling.**

At the licensed rate nothing showed a problem (transcript p95 1.514 ms at 999 frames/s). At 12,000
frames/s it rose 97.8× to 126.207 ms. Three remedies and none is architecture's alone:

1. **State a maximum on the key** — a specification change.
2. **Impose an aggregate rate budget across streams**, which is an architecture decision but changes what
   a user who configures many background sessions observes.
3. **Adopt the direct message port**, measured holding transcript p95 at 1.119 ms under 12,000 frames/s —
   ADR-0044's and ADR-0002's, and cost without a requirement behind it.

**The failure this protects against is invisible to every detector the record has.** In the measured
collapse nothing was dropped and nothing was reordered — every one of 586,960 frames arrived, in order,
`refused = 0` — so `REQ-MONITOR-226`'s gap counter never fires and the only symptom is a stale interface.

### ESC-23 — `REQ-CONFIG-423` loses its antecedent under ESC-1 *(new, 2026-09-01)*

**Where:** ADR-0037; constraint G-19. **Source:** ESC-1 as ruled, against `REQ-CONFIG-423` and
`REQ-CONFIG-288`.

ESC-1 rules that the composer's permission-mode control writes only its own key, through
`REQ-CONFIG-441`'s scoped per-field writer, and states that the decision "must not break
`REQ-CONFIG-423`". `REQ-CONFIG-423` fixes that a permission-mode change made while Settings is open **by
another surface that writes through the shared save path (`REQ-CONFIG-288`)** lands in the pending
settings state. Under the ruling the composer no longer writes through that path — so, read literally, a
composer change now lands in the file and **not** in the pending state, leaving an open Settings screen
showing a value the file no longer holds.

Two candidate rules exist and neither is stated: the composer's per-field write **also** updates the
pending settings state, or `REQ-CONFIG-423` is amended so the pending state tracks only the shared save
path. The difference is user-visible, in the same security-relevant control the ruling was made to
protect. *Related and separate:* `REQ-CONFIG-288` still states the coupling ESC-1 ruled against, in the
present tense, so an implementer reading it alone would build the coupling the owner refused.

### ESC-24 — a launch handed to an instance inside its force-exit allowance *(new, 2026-09-01)*

**Where:** ADR-0014, ADR-0055; constraints P-16, R-17. **Source:** `REQ-STARTUP-161` to
`REQ-STARTUP-164` against `REQ-MONITOR-131`.

`REQ-STARTUP-161` says the single-instance record is "released when the instance's process ends", and
during `REQ-MONITOR-131`'s 30 s force-exit allowance the exiting instance still holds it.
`REQ-STARTUP-162` then requires the hand-over to surface a window — and where no window is open, to
**build** one — while writing nothing and reporting nothing, not even an error.

Building a window in a process about to force-exit is wrong. Silently doing nothing is also forbidden.
Neither `REQ-MONITOR-131` nor `REQ-STARTUP-161` to `REQ-STARTUP-164` says which wins. Every available
answer is user-visible, and **SR-1 is what created the case**, so it belongs with the ruling rather than
with the ADR.

### ESC-25 — ESC-8's signature has no available placement, and rotation is a release commitment *(new, 2026-09-01)*

**Where:** ADR-0054. **Source:** ESC-8 as ruled, against `REQ-STARTUP-152` and `REQ-STARTUP-035`.

ESC-8 rules that the checksums manifest is signed with a key shipped in the application. Two consequences
were not visible when it was ruled and neither is architecture's to settle.

**There is no detached signature file available.** `REQ-STARTUP-152` requires every published filename to
be a value of the one naming scheme and `REQ-STARTUP-035` allows exactly one release-body row per asset
except the manifest, so a `SHA256SUMS.txt.sig` is not a thing this release may publish. The signature
must therefore live **inside** the manifest, in a form the standard checking tool `REQ-STARTUP-032` names
still tolerates, or in the release body's manifest row. If neither placement is acceptable, **ESC-8 as
ruled is not implementable without amending `REQ-STARTUP-152` or `REQ-STARTUP-035`.**

**Rotation is a release problem, not a runtime one.** A client can only verify with the key it was built
with, so rotating strands every older client on "unverifiable" — invisible at check time under
`REQ-STARTUP-110` and visible and alarming at install time under `REQ-STARTUP-120`. The mitigation is
dual signatures across a window long enough to cover the versions in the field, which is an **operational
commitment** the owner should see stated rather than an architecture detail.

---

## Specification questions

### Resolved, and closed with the reason

Four entries are answered. They keep their numbers and stay here because ADRs cite them, and each says
what closed it, so a reader who finds the citation is not left guessing. **Nothing is listed here that
the record did not actually settle** — three further questions the rulings expected to close did not, and
they are still open below with their residues stated (OQ-12, OQ-19, OQ-41).

**OQ-3 — Is a second application instance on one workspace a supported configuration? *Resolved: no.***
*(ADR-0011, ADR-0030.)* `REQ-STARTUP-161` fixes at most one instance per user account and makes every
window a window of that one instance; SR-1 is the ruling behind it. The three pieces of evidence that
pointed to *yes* have each been re-read and none survives: `REQ-MONITOR-013` now says in terms that the
boundary it means "is never the boundary between two instances of the application"; `REQ-GIT-124`'s
"whether or not this application started it" now covers this instance's own runs and a lock an instance
that crashed left behind (constraint P-14); and `REQ-PROVIDER-152`'s cross-process credential lock
survives on a **narrower rationale** — every window of the one instance reaches the same per-user files,
several read-modify-write sequences can be in flight at once, and `REQ-STARTUP-164`'s reclaim path is one
interval in which two processes of this application genuinely coexist (constraint C-14). The finding
"the evidence points to yes" is struck. ESC-10, which rested on this, is dissolved.

**OQ-11 — Two incompatible Windows retry schedules. *Resolved — and the reason previously recorded here
was wrong. Rewritten rather than deleted, because ADRs cite it.*** *(ADR-0004.)* `REQ-LIBRARY-043`'s
five attempts within 1 second governed the improvement artifact store and `REQ-SESSION-033`'s five-step
ladder summing to 1.55 s governed every state file.

**It is not closed because "neither ladder has a file left to govern".** That was the closure this record
wrote and it is false. `REQ-SESSION-033` was **narrowed, not withdrawn**: it still governs the
human-readable summary — which `REQ-SESSION-028` rebuilds on every save, `REQ-SESSION-006` keeps a file
and `REQ-SESSION-140` names — it still states its constants (0.05, 0.1, 0.2, 0.4, 0.8 s), and it declares
itself "the only replacement ladder this domain states". ADR-0004's per-store policy table therefore
**keeps** its retry-schedule field with exactly one value in it, which is literally what that record's own
*Revisit if* predicted would happen.

**It is closed because the resolution turned out to be one-sided.** `REQ-LIBRARY-043`'s ladder went with
its document layout, and the requirement gives the reason: **no writer outside this application can reach
a record in that store** (`REQ-LIBRARY-158`), so there is no foreign handle for a ladder to defend
against. `REQ-SESSION-033`'s survived precisely because its file **is** reachable by one — an antivirus
scanner, an indexer, a cloud-sync client, or the user's own editor opened through `REQ-SESSION-191`.
There is now exactly one ladder in the corpus and nothing to reconcile: **the conflict is gone, the
ladder is not.** Constraint D-25 records the re-derivation.

**The caveat travels with the closure and is unchanged in kind:** the one ladder the corpus states is in
the sessions domain, and `REQ-TRACE-061` — which faces exactly the case it was written for — still
requires a failed replace re-raised with none. That is **OQ-44**, whose own statement of fact was also
wrong and has been corrected.

**OQ-26 — Ordering between the delivery state write and the audit append. *Resolved.*** *(ADR-0041.)*
The delivery state, the requirement's history, `REQ-CONFIG-192`'s 200-entry prune and the audit record
are written in **one transaction**, so there is no "between them" for a crash to fall into and neither
the state-first argument nor `REQ-TRACE-133`'s opposite precedent has to be chosen between.
`REQ-TRACE-133` itself is untouched: it orders one file write against another in ADR-0040's store, which
stays files. What made the transaction available was a citation correction rather than the ruling —
neither `REQ-LIBRARY-042` nor `REQ-TRACE-502` reaches the delivery store, and no requirement subjects it
to atomic-replacement-alone (constraint C-10). **The audit trail now shares a durability domain with the
state it audits**, where under files the two could survive each other; no requirement asks otherwise, so
it is accepted rather than escalated, and it is recorded because it was not chosen deliberately.

**OQ-27 — Delivery record file granularity. *Resolved by dissolution.*** *(ADR-0041.)* The question's
stated stakes were that the choice "is observable to anyone who opens the workspace directory". Under
SR-4 nothing is. The store is rows; there is no file granularity to choose. Constraint Y-20 records that
the specification is still silent and that the silence no longer needs an answer.

### Named against a specific ADR

***No question in this group blocks an ADR from ratification any more.*** OQ-28 was the last one, and
ESC-13 unblocked it by ruling the trade instead of leaving the record to pay it. The heading is kept
because ADRs cite it, and each entry still names the record it decides something for; what it no longer
means is that the named record cannot be ratified until the question is answered. **Ratification is now
blocked by the gate items in `docs/clean-room/specification-gate.md` and by the escalations above, not by
anything in this list.**

**OQ-1 — Where the queued-prompt service lives.** *(ADR-0002, ADR-0043.)* `REQ-CHAT-041` scopes queue
visibility and consumption to windows and runs "sharing the same process", and `REQ-CHAT-038` requires an
atomic queued-to-triggered transition **exactly one caller wins**, while `REQ-MONITOR-139` and
`REQ-ORCH-071` make the queue session-owned and let a run consume only its own session's prompts. Under
ADR-0002 the windows and the run engine are in different processes, so "the same process" is satisfied on
one side or the other but not both. The record places the service in the run host; **confirm, because it
decides whether the phrase is satisfied or merely not violated.** *Unchanged by SR-4, and SR-1 adds one
argument against the alternative: several main windows may display one session (`REQ-MONITOR-243`), so
"the window side" is not a single place to put it.*

**OQ-5 — What the closing terminal `screen` frame carries.** *(ADR-0021.)* `REQ-TOOLS-127` requires the
closing frame's text to **equal the observation's final output text**, which is plain, capped and
truncated from the oldest end — not terminal control bytes. `REQ-SHELL-095`, `REQ-SHELL-098` and
`REQ-SHELL-166` require a full character grid with alternate-screen fidelity, per-cell attributes and
sixteen colours, which plain text cannot carry. The record's reading is that the closing frame is a
literal plain-text replacement carrying an explicit marker, while every earlier frame is byte-faithful.
**That is a reading, not a fact**, and the alternative reading — plain text throughout — would contradict
three shell requirements.

**OQ-38 — The output sampling period versus the echo budget.** *(ADR-0021; changes what a configured key
does for a user who sets it.)* `REQ-TOOLS-126` names `runtime.terminal_stream_interval_ms` the **output
sampling period**, default 100 ms, range 20–2000. `REQ-SHELL-166` requires the character a keystroke
produces to be visible within `REQ-SHELL-150`'s **100 ms** gesture budget, measured key press to painted
frame, and the path crosses two process hops and a paint. Read as a fixed period, the default alone spends
the whole budget in the worst case and half of it on average before either hop is counted, so the echo
criterion is unmeetable at `REQ-TOOLS-126`'s own default **and at every larger value its range permits**.
Neither requirement notices the other. **The record's reading:** the period is a **ceiling on batching**,
and writing a keystroke to the pseudo-terminal arms an immediate flush of that stream's next output.
**That is a reading, not a fact**, and it is user-observable — under a strict fixed-period reading a
configured 2000 withholds the user's own echo for two seconds, and under this one it does not. If the
fixed-period reading is intended, one of the two published 100 ms figures has to move, which is a
product-owner decision rather than an architectural one. Spike 15 measures it. *(Numbering note: ADR-0004
and ADR-0040 cite "OQ-38" for a different question, drafted against a provisional number before this one
was filed; they mean **OQ-41**.)*

**OQ-21 — Per-token prices: floating point in the format, exact decimal in the arithmetic.**
*(ADR-0031, ADR-0032; changes a persisted format.)* `REQ-PROVIDER-072` maps decimal-string prices "to
floating-point input/output cost per token" and the snapshot format types them as floats, while
`REQ-PROVIDER-121` states that no monetary amount — "**including the per-token pricing carried through
discovery**" — is computed in binary floating point anywhere. The same format block already types image
cost as a decimal string. **Recommended reading:** the price is carried and persisted as a decimal string
and the float typing is the defect, because a value that has been through a binary float cannot
afterwards be made exact.

**OQ-22 — Does a spawned stdio child inherit the parent process environment?** *(ADR-0034; the
environment-resolution stage's signature differs by the answer.)* `REQ-MCP-087` and `REQ-MCP-090` fix the
precedence among sources of the environment map but never say whether the result **replaces or overlays**
the parent environment. Servers launched through package runners plainly need a search path, and
`REQ-MCP-037` judges availability by a path lookup, so some inheritance is implied — but "some" is not a
contract, and the official client library's own default is a curated safe subset, which would be a third
behaviour.

**OQ-23 — What the reserved-token branch must do.** *(ADR-0035.)* `REQ-MCP-033` describes the branch only
as answering the protocol on standard streams, while `REQ-MCP-036` derives a command line from the same
entry and `REQ-MCP-099` runs it with three setup subcommands. **Recommended reading:** the branch is a
general pass-through and `REQ-MCP-033` describes what happens when the remaining arguments select the
server. If answered the other way, one of the two requirements must change.

**OQ-28 — What the two structural counts mean for a document-model interface.** ***De-blocked by ESC-13,
measured, and still open as a definitional question.*** *(ADR-0045 — **no longer blocked**; ADR-0051
consequence 3 depends on the answer.)*

**Two things changed and neither is an answer.** *A ruling:* ESC-13 is decided — accessibility wins, the
canvas is refused outright, and if the framework-neutral reading is the operative one then
`REQ-UIBENCH-054` is **relaxed**. ADR-0045 therefore survives **either** reading, and this question stops
being existential for it: it decides which counting rule gets written down, and it changes a benchmark
field and nothing a user can see. *A measurement:*
`spikes/renderer-invariance-and-benchmark-cadence.md` settles whether the conflict is real in a running
window, which is what spike 1 was filed to establish, and **it is**. Under reading 1 `widgets` was
**629 at all 384 observations** — 84 phase records across twelve runs, 130 intra-phase probes, 110
tail-loop samples, 60 resize steps, two scroll variants, onscreen and offscreen — invariant by
construction rather than by where the phases happen to end. Under reading 2 it moves **630 → 777**
(reader at the top) or **630 → 715** (reader at the bottom) at the `construct_window` → `apply_fixture`
boundary, **in every run**, before any of the phases this entry discusses, by +147 or +85, and padding
cannot repair it because a zero-size element is excluded by the definition itself. Under reading 2 the
count also stops being a property of the transcript and becomes a property of **where the reader is
scrolled** — 777 at the top, 668 at the bottom, 747 at minimum window size, same product, same fixture,
same iteration. The spike declines to choose between the readings and so does this entry; what it
establishes is that the choice is real.

**The specification has not moved, and that is the live item.** `REQ-UIBENCH-050` still supports both
readings in one paragraph and `REQ-UIBENCH-054` still states the invariant, so the corpus currently
states a requirement its own definition breaks on one live reading — while `resolutions/21` holds the
drafted relaxation back. That is a specification-side action.

Two readings are
live and they do not differ by a number — they differ by whether the chosen architecture is admissible,
and **`REQ-UIBENCH-050` supports both in one paragraph.** **Reading 1:** it says both counts are "defined
against the interface framework the product is built on" and that their absolute values are "deliberately
not comparable between product revisions or between implementations", so the product says which of its own
elements are structural — application-owned layout elements in `widgets`, content nodes inside a row in
the informational `ui_objects` (`REQ-UIBENCH-109`). **Reading 2:** the same requirement defines `widgets`
by an observable test — "the number of live visual elements of the constructed window — those that occupy
space in the window's layout and can be painted" — and `docs/spec/resolutions/21-ui-performance-benchmark.md`
row 29 records the counting rules as "fixed in framework-neutral terms", while row 13 renames the second
field to `ui_objects` precisely because the old name "leaks one GUI toolkit's vocabulary into a schema". On
that reading the framework clause explains only why absolute numbers are not portable, and a rendered
Markdown paragraph, code block or list item **is** a `widget`. **Why it blocks:** under reading 2 the count
inside a row varies with content; `apply_fixture`, `ordered_appends`, `streaming_updates` and
`tail_replacements_1000` all change content; so ADR-0045's recycler fails `REQ-UIBENCH-054` for the same
reason a conventional virtualiser does, and the only structure that passes is a canvas, which
`REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065` and `REQ-SHELL-144` rule out. **Under reading 2,
`REQ-UIBENCH-054` and the selection-and-accessibility requirements cannot both be satisfied** — *and
that is now a measured fact rather than a prediction.* **What has changed since this paragraph was
written:** the sentence that used to close it — "ADR-0045 proceeds on reading 1 and is **withdrawn rather
than amended** if reading 2 is confirmed" — is **withdrawn**, together with ADR-0045's own Revisit-if
clause and consequence 3 that carried it. ESC-13 ruled the exchange instead of leaving the record to pay
it: the requirement is relaxed and the architecture stands. The cost of that ruling is real and is stated
in ESC-13's own words rather than softened — under reading 2 the product ships a benchmark whose headline
structural invariant reports false, informational or not, in a domain whose whole point is determinism.

**OQ-36 — Host canonicalisation contradicts itself.** *(ADR-0023; must be resolved before the classifier
is written.)* `REQ-TOOLS-086` says the normaliser strips brackets from an IPv6 literal and then
**re-brackets** it; `REQ-SANDBOX-006` requires a bracketed loopback URL to canonicalise to the
**unbracketed** form as a stated required result. **Recommended reading: `REQ-SANDBOX-006`**, which owns
egress classification and states concrete required results.

### Silence and under-determination

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

**OQ-6 — The provider catalogue's declared attributes.** *(ADR-0012, ADR-0028.)* `REQ-PROVIDER-002`
declares the attribute set closed and `REQ-PROVIDER-003` rejects a build that violates it, yet
`REQ-CONFIG-370` names three further catalogue fields and spells the hosted connection mode differently;
`REQ-CONFIG-371` requires a quick-start URL on the entry and **branches on the connection-mode spelling**;
and `REQ-MONITOR-021` makes concurrency-quota sharing a declared property. Two questions: **which spelling
of the hosted mode is canonical**, and **does the quota property carry a number or a boolean** —
`REQ-CONFIG-095` gives one provider a cap of 3 by name while `REQ-MONITOR-021` gives a uniform cap of 2
and explicitly refuses to hold a list of names, and `REQ-PROVIDER-049` disclaims one too. A number
resolves the second cleanly.

**OQ-7 — "Leaves nothing behind" versus the documented artifact.** *(ADR-0022.)* `REQ-SANDBOX-077`
requires every carve-out to exist only inside the confined view with the host filesystem holding exactly
what it held before, and forbids a backend that cannot do so from creating anything. `REQ-TOOLS-123`
records as a "documented, deliberate artifact" that an empty directory may appear inside a writable root
on one platform. **These cannot both hold.** The record implements `REQ-SANDBOX-077` — refuse rather than
create — because it is the fail-closed reading and is stated as an obligation on the backend.

**OQ-8 — At what granularity is the usage event emitted?** *(ADR-0009.)* `REQ-EVENTS-053` fixes only that
it must not be emitted with no figures and that it carries run-to-date cumulative totals.
`REQ-MONITOR-166` fixes a **sampling** cadence for the token-history sparkline, which is a different
thing. Whether a usage event accompanies every model turn, or follows the sample, or both, is unstated
and affects journal volume against `REQ-EVENTS-091`'s cap.

**OQ-9 — Do hook descendants survive application exit?** *(ADR-0002, ADR-0015.)* `REQ-HOOKS-033` states
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

**OQ-11 — Resolved by dissolution.** See *Resolved, and closed with the reason* above, and **OQ-44**,
which the closure opened.

**OQ-12 — Durability semantics are unstated. *Materially moved by measurement, still open — and the fact
it partly rested on is false.*** *(ADR-0004.)* No requirement asks for a file-system sync.
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

**OQ-13 — Stderr in foreground capture.** *(ADR-0020.)* `REQ-TOOLS-098` requires the soft-pause detail to
tell the agent the process "may be writing to stderr" and to suggest re-running with a redirection, which
only makes sense if stderr is **not** captured — while a pseudo-terminal-backed persistent shell, required
by `REQ-SHELL-166`, necessarily merges it. The advisory text is required content either way, but the
underlying capture semantics should be stated.

**OQ-14 — `secrets.yaml` is given no file mode.** *(ADR-0004.)* `REQ-CONFIG-444` requires a mode for every
writer of the main configuration file and `REQ-CONFIG-212` for the discovery snapshot; `REQ-CONFIG-216`
requires the secrets file's write to be atomic and to create its directory and **says nothing about
mode**, so on the plain reading it inherits the process mask. It is the one file in the workspace that
holds credentials by design. This looks like an omission rather than a decision, and `0600` would be the
obvious value — **raised rather than chosen**, because tightening a mode the specification left unstated
is still a change to an observable. *Wholly unaffected by SR-4: `secrets.yaml` is configuration a user
edits and version control tracks, so it stays a file under the ruling's own principle, and the question
survives intact. It is the only survivor of the OQ-11/OQ-14 pair the atomic primitive carried.*

**OQ-15 — `error_class` is language-shaped.** *(ADR-0001.)* `REQ-TOOLS-101` fixes `ValueError` as a
literal observable value and `REQ-SANDBOX-083` defines the sandbox case as "the type name of the failure"
— an implementation-language-dependent string on an otherwise machine-readable field. Under ADR-0001's
language choice neither is a language artifact. Either `error_class` is a **closed product vocabulary**,
in which case the sandbox and terminal values need enumerating, or it is free text, in which case
`ValueError` is not a contract.

**OQ-16 — Configurable permission rule lists that no key defines.** *(ADR-0017.)* `REQ-TOOLS-049`'s "rule
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

**OQ-18 — What "shipped model-capability metadata" is.** *(ADR-0028.)* `REQ-PROVIDER-137` and
`REQ-PROVIDER-149` both draw on metadata the product ships that knows, per model, whether a
reasoning-effort parameter is supported, which levels are disclaimed, and whether images are accepted.
Nothing states where it comes from, how it is keyed, or how it is updated. Treating it as build data
alongside the known-limits table is the obvious reading, but it is a **third table of third-party model
facts** and its update policy should be decided deliberately.

**OQ-19 — The credential directory's contents rule versus the adjacent lock file.** *(ADR-0029.)*
`REQ-PROVIDER-018` says that once any credential operation has finished the directory holds nothing but
the per-provider files; `REQ-PROVIDER-152` requires an **adjacent** lock file for every read-modify-write.
The record reads the first as being about the operation's temp files. If it is meant literally and
exhaustively, the lock file must live elsewhere, which "adjacent" would then have to permit. *Still open,
with a cheaper resolution than it had: `REQ-PROVIDER-152`'s stated premise — "may be reached by more than
one application instance at once" — is withdrawn by SR-1, so the requirement is a candidate for amendment
under the standing direction, and **withdrawing the lock file makes the contradiction disappear rather
than needing adjudication**. If it is kept, the reclaim-a-dead-holder clause must be kept with it: that
clause is the part SR-2 makes* more *important, because it is the only thing that settles a lock an
instance that crashed left behind, and `REQ-STARTUP-164`'s reclaim path is one interval in which two
processes of this application genuinely coexist (constraint C-14). **Deleting a lock file and deleting a
settle-a-dead-owner obligation are different acts.***

**OQ-20 — "No diagnostic anywhere" versus the per-provider last error.** *(ADR-0030.)* The 30-second
non-interactive attempt that fails before contacting a provider must produce the failure result and
nothing else — no traceback, warning or other diagnostic in the log or the interface (`REQ-PROVIDER-013`).
Every other failure path records a per-provider last error (`REQ-PROVIDER-057`). Does the last-error
record count as "shown anywhere in the interface"? Read literally it does, so **this one path must skip
it**.

**OQ-24 — No cost budget for the parse-requiring checks.** *(ADR-0040.)* `REQ-TRACE-088`'s one-second
budget covers "the sweep alone — enumeration, reading and matching". `REQ-TRACE-104`'s re-export-only test
and `REQ-TRACE-109`'s test-function collection both require a **full syntax tree**, and `REQ-TRACE-091`
requires them in the same verification run. No budget is stated for them, and at the stated scale a
full-fidelity parse is materially more expensive than a pattern pass.

**OQ-25 — Project-supplied regular expressions run unbounded.** *(ADR-0040.)* `REQ-TRACE-073` compiles
four patterns per project-declared convention and evaluates them against every claimed file;
`REQ-TRACE-154` states that the absence of any time or resource limit on the scan is "a deliberate
decision and not a gap", and `REQ-TRACE-225` places no wall-clock bound on the engine read. A pattern with
catastrophic backtracking therefore hangs the pass indefinitely, and the specification's own mitigations —
the board stays usable, the last good board stays on screen — cover the **symptom** but leave the pass
wedged. ADR-0002's worker-thread placement makes it terminable; **whether it should be terminated, and
what the user is told, is not specified.** The pattern arrives with a checked-out repository, not from the
user.

**OQ-26 — Resolved.** See *Resolved, and closed with the reason* above.

**OQ-27 — Resolved by dissolution.** See *Resolved, and closed with the reason* above.

**OQ-29 — Native surfaces under a dark theme.** *(ADR-0048.)* `REQ-SHELL-160(b)` makes it an acceptance
criterion that no native surface presents a light background while a dark theme is active, on each
platform, and names native dialogs as things to inspect on screen; `REQ-SHELL-164` says the product is
answerable only for what it supplies to a native dialog. On most platforms the operating-system folder
chooser follows the **system** setting and no application-side call changes that, while four requirements
require the product to use native choosers. The record's reading is that `REQ-SHELL-160(b)` covers
surfaces the application itself tints and `REQ-SHELL-164` carves out the host's own dialogs. **Needs
confirming rather than assuming.**

**OQ-32 — Which process the benchmark's per-process figures describe.** *(ADR-0053.)* `REQ-UIBENCH-050`
reports memory, thread and handle counts "for the process that produced the record". In a multi-process
engine there are several. The record proposes the renderer process of the measured window; the sum over
the iteration's process tree is also defensible and gives different numbers. Since comparability is only
claimed between runs of one revision, either is conformant, **but the choice must be recorded**.

**OQ-33 — The configuration-home variable on non-Linux hosts.** *(ADR-0053, ADR-0042.)*
`REQ-UIBENCH-039` names it contractually and it is meaningful on one platform only. The record reads it
as named because it is the one *standard* variable available, with the benchmark-private variable
carrying the same job elsewhere. If instead the preference store must honour it on all three platforms,
ADR-0042's resolution order should say so. Either reading is implementable; they are different.

**OQ-34 — Demo mode and process-wide network silence.** *(ADR-0055.)* `REQ-SHELL-005` says that in demo
mode "the process opens no outbound network connection for its whole lifetime", while `REQ-SHELL-162`
lets a demo window be opened from a non-demo window and `REQ-STARTUP-057` says a non-demo window of the
same process is unaffected and checks for updates normally. **Those cannot both hold once a mixed process
exists.** Either the claim is per-window rather than per-process, or a demo window must be its own
process. *SR-1 sharpens this rather than resolving it, and forces the direction:* with one instance a
mixed process is not an unusual configuration to be avoided but the **only one available**, and "a demo
window must be its own process" is no longer an option the architecture can take, because a second
process of this application is exactly what `REQ-STARTUP-161` forbids. The per-window reading is
therefore the only one that can hold, and it should be **stated in the requirement rather than inferred**
by every reader who meets the pair. Still needs a product-owner statement.

**OQ-35 — Shell state under confinement.** *(ADR-0022.)* Foreground calls accumulate working directory,
exported variables and aliases in a persistent shell (`REQ-TOOLS-097`), but a confined command is rendered
as a nested shell invocation submitted into that shell (`REQ-SANDBOX-079`), so a directory change or an
export inside a confined command lives in the inner shell and dies with it. **Does shell state persist
across confined foreground calls?** The two requirements describe different behaviour for the unconfined
and confined modes and neither says so. This must be resolved before the terminal tool's description is
written, since the description is what tells the agent whether a directory change persists.

**OQ-37 — Proxy behaviour for `fetch`.** *(ADR-0023.)* Nothing says whether `fetch` honours system or
environment proxy settings. It matters: a proxy changes which host a connection is actually opened to, and
`REQ-SANDBOX-022` promises that a denied host observes zero connection attempts. The chosen client does
not honour proxy environment variables by default, which makes "no proxy" the de facto answer — the
fail-closed direction, but one that will surprise corporate users and **should be an explicit decision
rather than a library default**.

**OQ-39 — A presenter that is registered and never answers. *Premise stale on one side; the record's
answer is strengthened; the window is still unanchored.*** *(ADR-0019; not blocking. Constraint T-41.)*

***This entry's opening sentence is superseded and is kept only because ADR-0019 and constraint T-41 both
quote the wording it describes.*** It states that `REQ-TOOLS-053` and `REQ-TOOLS-069` define attendedness
as **presence** of an approval presenter. **They no longer do.** `REQ-TOOLS-053` now reads: a session
counts as interactive "exactly when an approval prompt for that session can be put in front of a person",
and `REQ-TOOLS-064` glosses the unattended case as one "for which the modal dialog of `REQ-TOOLS-063`
cannot be shown". Registration absence is a *sufficient* condition in `REQ-TOOLS-069`'s next sentence,
not the definition.

**That strengthens the record's answer rather than changing it.** Presenter registration is revoked on a
lapsed channel-level liveness signal as well as on a closed channel, which settles in-flight waits
through `REQ-TOOLS-177`'s teardown cancel (mapped by `REQ-TOOLS-052` to deny with source `cancelled`) and
routes later asks to the headless policy, without putting a timer on the user's wait. Under the amended
text that poll is **the implementation of the specification's own capability test** — a wedged presenter
is not one an approval can be put in front of — rather than an architecture-invented answer to a gap. One
narrowing comes with it: `REQ-SANDBOX-101` fixes attendedness "at the moment its mode is resolved", so
the revocation governs where a **later** ask is routed and never revisits a mode resolution already made.

**Two halves remain open and they are now different from each other.** The *TOOLS* half is answered by the
amended `REQ-TOOLS-053`. The *SANDBOX* half is not: `REQ-SANDBOX-101` still says "Only the presence of
that channel is tested, not whether it later answers" **and** asserts that its condition is exactly
`REQ-TOOLS-053`'s and `REQ-TOOLS-069`'s, which are no longer the same condition — reported as a
specification defect, with the reconciling reading (the clause is about the **person** not answering)
recorded as a reading and not as the text. And the **lapse window** is still a free parameter no
requirement anchors, with `runtime.approval_timeout_seconds: 0` still removing the only backstop
`REQ-SANDBOX-101` names.

**The measurement gives the window a floor and does not size it.**
`spikes/ipc-hop-latency.md` measured a single `webContents.send` of a 69 KB payload taking **88.263 ms**
while main's event loop was otherwise **idle**, and observed the wedged-main state directly at
**22,777 ms** of event-loop lag — so the window must clear the first comfortably and catch the second.
**The spike never showed a modal dialog**, which is exactly the case the window has to survive, so spike
14 is **not** discharged. If no workable window exists this still becomes an escalation between a hang at
`0` and a specification change.

**OQ-40 — The maximum supported transcript viewport height. *Premise now measured rather than argued;
still open, and the choice has a scale.*** *(ADR-0045; not blocking.)* The transcript's slot pool must be
a fixed capacity or `REQ-UIBENCH-054`'s element-count invariant has no meaning, but nothing in the
specification bounds the viewport: `REQ-SHELL-022` fixes the opening (1440×900) and minimum (1000×680)
window sizes and **no maximum**. ADR-0045 declares a product constant `H_max` and sizes the pool at
`ceil(H_max ÷ 30 px)` plus overscan, 30 px being `REQ-CHAT-057`'s minimum row height.

***The earlier formulation — size the pool for "the largest viewport the window can reach" — is now known
to have no referent, which was argued and is now measured.*** On Windows a content height of **20,000 CSS
pixels was requested, granted, and reported by the renderer as a real laid-out viewport**, on a machine
whose tallest display is 1,080 px and where the display enumeration offers nothing that bounds it. The
window manager did not clamp; the reachable height was at least 20,000 px and was not probed further. A
declared constant is therefore the **only** thing available to write down, not merely the tidier option.

**The measurement also gives the choice a scale.** At 20,000 px the viewport calls for **671 slots
against a pool of 80** — so the growth branch, if the constant is set low, means the transcript pane is
blank below the pool's coverage until it grows. And it confirms the not-blocking claim empirically rather
than by argument: across every phase record and all sixty resize steps of twelve runs the largest slot
count the viewport ever called for was **34**, with a pool-growth watermark of **0**, because
`REQ-UIBENCH-060`'s sweep never exceeds the construction size and `REQ-UIBENCH-098` pins the display
environment.

**Somebody must still choose the number**, because choosing it fixes the behaviour on a display taller
than it. It is a product statement about supported hardware rather than an implementation constant, which
is why it is filed rather than chosen. *Not measured and therefore not claimed:* behaviour when a display
is attached or removed while the window exists, behaviour at a scale factor other than 1, and whether
either other platform's window manager clamps where Windows does not.

**OQ-41 — `REQ-TRACE-502` on Windows. *Sharply narrowed by SR-1, not dissolved by SR-4. Still open.***
*(ADR-0004, ADR-0040 — both of which cite this as "OQ-38", a provisional number that collided with the
entry above; ADR-0040 proceeds and does not treat it as blocking its own ratification.)*

**The ruling said this was dissolved. It is not, and the record must not record a closure it did not
earn.** SR-4 argued that "that defect is unreachable in a store whose readers do not block its writers" —
but `REQ-TRACE-502` governs the generated symbol artifact, the three baselines and the retired-identifier
log, and **SR-4's own table keeps all four as plain files in the user's own repository**. They never
reach the store. ESC-14 is ruled and SR-4 now carries the correction in place.

***What has changed since: the correction is now backed by a requirement rather than by an argument.***
`REQ-TRACE-513` was minted in the amendment pass and states positively that those four artifacts **SHALL
be plain files in the user's own repository and SHALL NOT be moved into any store the application keeps
for itself**, recorded as a boundary "so that relocating them is a change someone has to argue for rather
than an optimisation that can be made while every other requirement still appears satisfied". So no
store's concurrency properties reach them, and no future reader can close this entry by pointing at the
store. Constraint D-30.

*The mechanism, unchanged:* `REQ-TRACE-502` requires concurrent invocations to be safe with no lock,
lease or coordination file, that **no invocation wait for another**, and that an invocation "SHALL NEVER
fail, hang or leave a lock behind because another was running." ADR-0004's own spike shows why the last
clause was unreachable: Node requests no share-delete, so an ordinary **reader** holding a descriptor
makes a concurrent replace fail with `EPERM`.

*What is now reached, and by what.* The premise was an unbounded population of concurrent toolchain
invocations in independent processes. **SR-1 removes it**, and two of its three supports are gone
outright: the toolchain has no command line (`REQ-TRACE-142`, `REQ-TRACE-144` to `REQ-TRACE-151`,
`REQ-TRACE-153`, `REQ-TRACE-184` to `REQ-TRACE-186` withdrawn), `REQ-TRACE-206` forbids launching the
engine as a process, `REQ-EVENTS-178` gives no programmatic entry point, and `REQ-STARTUP-161` removes
the second instance — so every invocation is in-process on ADR-0002's bounded worker pool; and
`REQ-GIT-140` gives each isolated run its own worktree, so `REQ-GIT-145`'s N concurrent runs read N
copies rather than being N readers of one file. C-13's use as an amplifier here is withdrawn. ADR-0040
discharges the rest with a **single I/O owner** over the four artifacts (constraint W-12): no descriptor
is open when the rename runs, so no coordination file, and what is ordered is individual whole-file
operations rather than invocations. `REQ-TRACE-502`'s own middle sentence supports reading the
no-waiting clause as a rule about **views** — "a check running beside a regeneration MAY legitimately
report the artifact stale even though the other invocation is in the act of refreshing it" — rather than
about I/O scheduling. A reader who rejects that reading should treat ADR-0040 as reaching "never fails"
and not "never waits", and the residue below grows accordingly.

*The residue, which is real and which two closures nearly hid.* On Windows a `REQ-TRACE-509`
regeneration can still fail because something else holds the file open. Two cases:
**(a)** a `REQ-TRACE-182` test session running in the same checkout — this one is squarely inside the
requirement's subject, "because another invocation was running"; **(b)** a foreign process — the user's
editor, an indexer, antivirus, a cloud-sync client — which `REQ-TRACE-502` does not speak to, so it is
not a conformance gap, but which a user will meet first and read as a defect. `REQ-TRACE-061` requires
either failure **re-raised** and states no retry ladder. **Bounded contention is exactly the condition
under which a bounded ladder becomes sufficient — the condition this question said did not hold — and the
corpus now states no ladder anywhere (OQ-44).** ADR-0004 deliberately declines to invent the constants.

*Two closures exist and neither belongs to the architect:* a runtime API exposing share-delete on open,
or `REQ-TRACE-061` gaining a bounded ladder. `REQ-TRACE-502` should also be amended to say what
"concurrent invocations" now means, since the only concurrency left is in-process work plus
`REQ-TRACE-182`'s test session — and `REQ-TRACE-182` itself presupposes an invocable toolchain the
product no longer has, which is its own amendment. C-11 records the narrowing and the residual conflict
and does **not** report the property satisfied.

**OQ-42 — After a sticky mid-run store failure, may publication continue unanchored? *Narrowed on one
side by the amendment; the remaining half is harder, not easier.*** *(ADR-0010 consequence 7, which cites
this; not blocking, because the record states an interim behaviour.)*

***One half of this question is settled and the other is not.*** The **store-will-not-open** half is
closed by the amendment ESC-16 authorised: `REQ-SESSION-089` now requires the run **refused** as a
pre-run failure conveying the session id, that nothing was started, which store could not be opened and
the reason the store itself gave, and `REQ-EVENTS-084` gives the attach failure a definite user-visible
outcome — no `session.start`, exactly one `result` with status `error`, carrying the store's own reported
reason unaltered. Both requirements state their own reason: there is no longer a coherent state in which
a run has somewhere to record itself but nowhere to be recorded. *This was named as a known disagreement
in the Specification Gate and it is now agreement.*

**What remains is `REQ-EVENTS-088`'s sticky mid-run failure, and it is materially harder than when this
entry was filed.** Under a file a failed append left the earlier history intact and only that event
missing; under one transaction a transcript row and its event share a commit, so a commit that will not
commit means **the session record stops advancing altogether**, and the failure is workspace-wide rather
than per session. Continuing to publish therefore means showing rows a reattach genuinely cannot restore,
not rows whose event is merely absent. The record states the interim behaviour rather than re-deciding
it; the question is the owner's.

`REQ-EVENTS-088` marks the store failed for the remainder of the run and leaves the run going. D-16
(`REQ-MONITOR-221`) says every change is persisted before it is published and **states no exception**,
and `REQ-MONITOR-292` makes the persisted record authoritative wherever the two could disagree. So when
the record stops being writable, either the surface keeps showing a run whose state no resume can restore,
or it stops showing a run that is still happening. **Nothing settles which.** *SR-4 shifts the balance
against the previous answer, which is why it is returned as a question rather than re-affirmed:* under a
file a failed append left the earlier history intact and only that event missing; under one transaction
the transcript row and its event share a commit, so a commit that will not commit means **the session
record stops advancing altogether**, and the failure is workspace-wide rather than per session. The
interim behaviour, which both readings share and which is not in question, is that the run surfaces the
failure as a **session issue** and not only as `REQ-EVENTS-088`'s one warning — otherwise the user sees a
healthy transcript over a history that stopped being written. Until this is answered the record continues
to publish and marks the surface **unanchored**, so the condition is visible rather than inferred.

**OQ-43 — Does the single-instance gate admit a benchmark iteration?** *(ADR-0042, ADR-0053, ADR-0055;
constraints P-16, P-17, W-14.)* `REQ-UIBENCH-037` to `REQ-UIBENCH-039` make a benchmark iteration a fresh
child process **of the product's own program that the product itself starts**, with `XDG_CONFIG_HOME` and
one benchmark-private variable redirected; `REQ-UIBENCH-046` makes it an acceptance criterion that the
user's real stored settings hold the same bytes afterwards. `REQ-STARTUP-161` says a second launch is
handed to the running instance. **An iteration is a second launch by any naive test.** If the gate catches
it, the iteration never receives its redirected configuration home, the measurement runs against the
user's real preferences, and `REQ-UIBENCH-046` fails **silently — the run still completes and still
reports numbers.** The specification does not say how the two compose. The architecture's answer is W-14,
a marker the parent sets that no user can set, but "which processes the gate admits" has a security
flavour and deserves stating in the requirement rather than being inferred. **If the answer is that the
gate admits no exception, `REQ-UIBENCH-046` is unimplementable and this becomes an escalation** between
the benchmark's isolation and the one-instance rule.

**OQ-44 — `REQ-TRACE-061` faces the one case a ladder is for, in the one domain that has none.** *(ADR-0004,
ADR-0040; constraints D-25, C-11, D-06. Successor to OQ-11 and to OQ-41's residue.)*

***The premise this entry was filed on is false and is corrected here rather than deleted, because the
question survives it.*** This entry asserted that "the corpus now states no Windows retry ladder
anywhere" and that both ladders "governed stores that are rows under SR-4, so both are withdrawable".
Neither is true. `REQ-SESSION-033` was **narrowed, not withdrawn**; it states a five-attempt ladder with
exponential backoff at 0.05, 0.1, 0.2, 0.4 and 0.8 s for the human-readable summary, and it declares
itself "the only replacement ladder this domain states" (D-06, and OQ-11 as rewritten).

**The real gap is narrower and sharper than this entry recorded.** One domain has a ladder for exactly
the case `REQ-TRACE-061` faces — a transient access-denied failure of a replacement caused by antivirus,
an indexer or a cloud-sync client holding a handle — and `REQ-TRACE-061` still **declares no ladder and
requires a failed replace to be re-raised**. OQ-41's residue is exactly that case, and its contention is
now *bounded*, which is precisely the condition under which a bounded ladder is sufficient rather than a
concession.

**ADR-0004 still declines to borrow the constants, and now has a second reason.** They are a sessions-
domain figure, and attaching one to a replace of the user's **version-controlled material** is a worse
kind of borrowing than attaching an invented one. Either the specification supplies a bounded ladder for
the traceability artifacts, or it states that re-raising on a foreign handle is intended and accepts that
a user's editor or an antivirus scanner momentarily holding `docs/requirements/retired-identifiers.tsv`
can fail a regeneration the user asked for. **No neighbouring store's constants may be borrowed to
pretend a ladder exists.**

**OQ-45 — No ADR owns the improvement artifact store.** *(ADR-0003, ADR-0004, ADR-0041; ESC-3, ESC-18.)*
`REQ-LIBRARY-042`'s read-modify-write semantics, `REQ-LIBRARY-043`'s atomic-replace-with-retry contract,
`REQ-LIBRARY-047`'s all-or-nothing artifact write with a best-effort history write, `REQ-LIBRARY-049`'s
full-copy version files and `REQ-LIBRARY-052`'s intermediate-version pruning are described **only** inside
ADR-0003 and ADR-0004 — and both of those are about the file/row line and the atomic primitive, not about
this store. SR-4 moves it to rows, which changes `REQ-LIBRARY-047`'s "best effort" into a deliberate
decision about whether the history write stays outside the transaction, and makes ESC-3's ruled defect
unreachable (ESC-18). **ESC-3's ruling therefore currently has no architectural home**, and the two ADRs
that mention it are exactly the two whose file-based framing has just been removed. This is a gap in the
decision record rather than in the specification, and it needs either an ADR or an explicit statement
that ADR-0041 adopts the store; ADR-0041 declines, correctly, because the rule is not the delivery
store's.

***Narrowed by the amendment rather than by any pass of this record.*** `REQ-LIBRARY-042` now requires
the read-modify-write to **take effect as one indivisible step** and records ESC-3's accepted defect as
withdrawn "as unreachable, not as unimportant"; `REQ-LIBRARY-043` states the atomicity observable and
withdraws the mechanism, and `REQ-LIBRARY-158` gives the reason no ladder is needed (constraints C-10,
D-25, and OQ-11 as rewritten). **What remains unowned is one write**: `REQ-LIBRARY-047`'s best-effort
artifact-history write, which is now a decision about whether that write stays outside the transaction —
and if it does, what a user is told when the artifact lands and its history entry does not.

**OQ-46 — The repair notice is specified in the singular and the failure it reports is plural.**
*(ADR-0002, ADR-0055; constraint R-17.)* `REQ-SESSION-062` and `REQ-SHELL-155` specify a repair notice
written for **one** stale session. ADR-0002 now accepts as a consequence rather than disputing that a
run-host crash produces **one stale session per in-flight run**, possibly across several workspaces — and
`REQ-MONITOR-249` to `REQ-MONITOR-258` make concurrent runs a supported and encouraged shape, so the
realistic failure is three or five sessions needing repair at once. Whether that is one notice naming
several sessions or several notices is a user-visible behaviour no requirement states. The reap must
settle **all** of them before any is offered for continuation, which is an architecture obligation and is
recorded in ADR-0002; what the user is shown is not. **This was hypothetical while a run-host crash was
disputed and is reachable now that it is accepted.** It becomes an escalation only if the answer changes
the notice vocabulary `REQ-NOTIFY-044` and `REQ-NOTIFY-048` to `REQ-NOTIFY-050` close.

**OQ-47 — Two concurrently open workspaces presenting one identifier.** *(New, 2026-09-01. ADR-0058,
ADR-0002; constraints W-19, W-01.)* `REQ-SESSION-197` fixes that a **copied** folder carries the
identifier unchanged, and that the product **MUST NOT** mint a replacement over an identifier it can read
— so two folders on one machine necessarily resolve to one store. **No requirement says what happens when
both are open at once.**

**The unstated-and-unsafe reading is that both windows share the store**, which lists in each window
sessions whose resume starts an agent writing files into the folder the user does not have open
(`REQ-SESSION-014`'s `workspace_root`). The hazard is not corruption.

**ADR-0058 decides it rather than leaving it, and the decision is filed here rather than presented as
settled**, because leaving it open means the implementation picks and the appealing pick is the unsafe
one. Concurrently: the identifier is claimed once per instance, beside the instance claim main already
holds, and the second workspace opens **without a store**, reporting the condition in `REQ-SESSION-089`'s
own vocabulary — the workspace opens, there is no store, there are no sessions and no runs — naming both
paths. Sequentially — open one, close it, open the other — **nothing** may happen, because that case is
indistinguishable from a move and any detection there would break `REQ-SESSION-197`. The whole decision
is expressible in vocabulary the specification already has, which is why it is offered for ratification
rather than as an amendment.

**A second, smaller silence sits underneath it and the above does not resolve it.** `REQ-SESSION-197`
forbids re-minting over a readable identifier **absolutely**, with no user-confirmed exception. That is
right for the failure it prevents — silently orphaning a history — and it means the **only** remedy for a
copied folder, and for a corrupt identifier file, is the user editing or deleting a file by hand. There
is no product action for either. None was invented, because the requirement is absolute; a reader should
notice that the product's answer to a common user action is "go and edit this file".

**And two records disagree about what identifies a workspace.** ADR-0002 keys the workspace service by
**resolved path**; ADR-0058 keys the store claim by **identifier**. That is the minimum consistent
arrangement and not a settled one, and it should be reconciled deliberately rather than by whichever ADR
a reader opens first. Both records now carry a pointer to this entry.

**OQ-48 — Reclaiming a machine-local store whose workspace no longer exists.** *(New, 2026-09-01.
ADR-0058; constraints W-17, W-22.)* `REQ-SESSION-166` deletes one session. ESC-15 moved every session's
record out of the workspace. **Nothing addresses a whole store that nothing points at** after the user
deletes the project, re-identifies it, or clones it fresh — a hole the ruling opened and the amendment
pass did not close.

**ADR-0058 decides it in three parts and refuses the appealing one.** The pre-migration copy is reclaimed
by the product at the next clean open. A store nothing references is reclaimed **only** by an explicit,
user-confirmed action from a surface listing this machine's stores with last-seen paths, size, session
count and last-open time, **offering the exports first**. **Automatic reclamation is refused**, and the
reason is the whole of it: the only signal available is that a last-seen path no longer resolves, and a
path fails to resolve when a drive is unmounted, when a share is down, and above all **when the folder
has been moved** — precisely the case the identifier exists to survive. Reclaiming on that signal would
delete a user's history to punish them for the operation the design supports.

**The surface that decision assumes does not exist**, in the specification or in any other ADR, and
`origin.txt` — which records last-seen paths for diagnostics and for exactly this listing — **must not**
be consulted to resolve a store, so it cannot quietly become an identity mechanism. Ratify the behaviour,
or state that an orphaned store is never reclaimed and the disk cost is accepted.

---

## Design-reference dependencies

The approved visual design reference was **not available** to the architects who produced the slice
proposals. Every proposal is therefore about *mechanism* — where state lives, what crosses a process
boundary, what paints a row, what a preference is written to. No mechanism above depends on the
reference, but **no screen can be built without it.**

**OQ-30 — Theme palettes and token values.** *(ADR-0050.)* `REQ-SHELL-129` fixes the default theme's shell
metrics and token groups and `REQ-SHELL-133` fixes what each built-in theme's description must convey,
**but the palettes themselves are not specified anywhere in `docs/spec/`**. They come from the design
reference. ADR-0050's mechanism — themes as data, corrections computed, contrast asserted from rendered
pixels — is independent of the values.

**OQ-31 — Which Markdown dialect is rendered.** *(ADR-0051.)* `REQ-CHAT-056` names five treatments and
requires links to be activatable; **nothing says whether tables, task lists, block quotes, headings or
images are supported**. This needs answering before the renderer's element list is fixed, and it is as
much a visual question as a functional one. **Images in particular interact with the no-network-request
rule.**

**Also needed from the reference, and not otherwise blocked:**

- The information architecture inside each of the seven primary views. The record fixes that all seven
  are constructed at window creation and that only one is visible (ADR-0048), and that every list surface
  with unbounded content uses the recycler (ADR-0045); it fixes nothing about what is in them.
- The visual form of the benchmark card and the diagnostics view, both of which have specified content
  and specified budgets but no specified layout.
- The glyph vocabulary that `REQ-SHELL-149`'s no-state-by-colour-alone rule requires to exist.

---

## Spikes required before the Architecture Gate closes

These are not open questions — they are measurements the record's decisions rest on. Each names the ADR
that changes if it fails.

**Numbers are stable and are never reused.** ADRs cite spikes by number, so a spike that is withdrawn
keeps its number as a tombstone (spike 9) and a spike whose subject changed keeps its number with new
content (spikes 8 and 19), exactly as constraint D-28 is handled. **Twenty-one numbered, one withdrawn,
two discharged and one discharged for Windows only — seventeen outstanding.**

### What has been measured, and what each report did not settle

Four reports exist, in [`spikes/`](spikes/), all dated 2026-09-01. **They are the first real evidence
this record has ever had, and several of them overturned something it asserted.** Where they did, the
overturned claim is preserved beside its replacement in the ADR that carried it, and the entries above
say which.

| Report | Spike | Discharged | Explicitly **not** settled |
|---|---|---|---|
| `ipc-hop-latency.md` | **10 — discharged** | ADR-0002's double-hop Revisit-if; ADR-0044's structured-clone trigger and its channel-isolation claim; `REQ-MONITOR-222` (p95 1.133 / 1.291 ms vs 250 ms), `REQ-MONITOR-223` (ratio 1.14 vs 2), `REQ-ORCH-155` (p95 5.951 ms vs 100 ms as SR-8 reads it) | **the commit `REQ-MONITOR-221` requires before publication**, which the report states is outside its interval, so every figure is a lower bound; fan-out to several windows; concurrent runs; the reconcile path (`refused = 0` everywhere); a real renderer |
| `packaged-first-paint.md` | **17 — discharged for Windows only** | that the `onefile` portable fails `REQ-STARTUP-155` at 13,287–19,580 ms across four bundle weights **including a zero-payload build**, with no packaging setting closing the gap; that bundle weight is close to free (~10 ms across 327 MB) on the flavours that pass. **It triggered SR-7** | the macOS `.dmg` and the Linux AppImage — **neither was built**, and `REQ-STARTUP-155` binds both; the harness "contains no product" — no persistence, no native module, nothing ADR-0055 puts before first paint |
| `renderer-invariance-and-benchmark-cadence.md` | **1 — discharged** | both counting rules against a running window (OQ-28); the tail-phase memory tripwire; that the reachable viewport is not knowable at construction (OQ-40); that ADR-0053's paint settle does not work and that `invalidate()` is worse than the timeout | whether a rAF settle and a paint settle measure the **same interval** where both resolve; the real component rather than a mock shell — the element counts and timings are stated as a **floor** |
| `windows-writer-handle-compaction.md` | **9 — withdrawn** | historically: that deleted rule 3 was right (0 of 115 trims, no observable symptom, ~73× throughput collapse), and **three corrections that outlive its subject** — what actually blocks a replace, that share-delete *is* requested, and that a directory `fsync` works on a write-opened handle | whether a replace survives a **power cut**, on any platform. The report declined to claim the guarantee from a success return |

**A note a reader should not have to work out.** Two of those four measured a design that no longer
exists — the file-based journal and compaction that SR-4 removed, and the packaging target SR-7 replaced.
Neither is therefore wasted: what generalises from the writer-handle report is a **diagnosis** (an
append-and-compact file whose writer holds it open is a silent cap-enforcement failure) and three factual
corrections, and what generalises from the first-paint report is that the packaging *mechanism*, not the
bundle weight, was the cost. Both are cited above and in constraints D-27, D-28 and B-03.

### What is new

**Spike 20 and spike 21 are new. Spike 20 is required before the gate by SR-7's own words; spike 21 is
required because the whole persist-before-publish design now rests on a number nobody has taken.**
Spike 19's question changed with ESC-15 and it keeps its number.

1. ***Discharged 2026-09-01 — `spikes/renderer-invariance-and-benchmark-cadence.md`.*** Element-count
   invariance of a fixed slot-pool recycler through the benchmark's seven phases, under *both* counting
   rules, plus the tail-phase memory tripwire. **Answered on both halves, and the answer for the second
   rule is the one this entry named as the expected result.** Under reading 1, `widgets` was **629 at all
   384 observations**. Under reading 2 it moves at the `construct_window` → `apply_fixture` boundary in
   every run — **earlier than this entry predicted**, before any of the four phases it names — so the
   conflict is real in a running window and OQ-28 could not be de-escalated on the measurement. It was
   de-blocked by ESC-13 instead. The tripwire passes at 106,496–7,172,096 bytes against 64 MiB, worst case
   **10.7 %** of the threshold. **Three things it also established that were not asked for** and that are
   recorded above: the reachable viewport is not knowable at construction (OQ-40); ADR-0053's paint settle
   fails on exactly the phases with no visible damage and `invalidate()` is worse than the timeout (I-13);
   and a settle that expires destroys the meaning of the memory sample taken beside it (I-31).
   **The residue: its own section 10 states the element counts and timings are a floor** — no framework,
   no state store, no theming, no accessibility tree, no syntax highlighting, no tool rows, no live-row
   redraw path — so the real component is still owed (see spike 13).
2. **A Windows access-control mechanism** that can set an explicit list with inheritance disabled **and
   read it back**. *(ADR-0029.)* If none is acceptable, `REQ-PROVIDER-016` is unimplementable as written
   and this becomes an escalation.
3. **Tool-server protocol version negotiation over our own transport.** *(ADR-0033, ESC-12.)* The
   sibling-probe policy is documented for the SDK's **standard** stdio transport, which ADR-0033 replaces
   with `OwnedStdioTransport`; establish what negotiation does over the custom transport before assuming
   a pin is needed there at all, then confirm that pinning to a mode which spawns no sibling probe
   process does not break servers speaking only the newer negotiation, against at least one modern and
   one legacy server. If the answer is that `REQ-MCP-067` is satisfied without pinning, ESC-12's balance
   changes.
4. **Console-window suppression verified on a packaged build spawning a console application** — that no
   window appears at any point. *(ADR-0033, `REQ-MCP-113`.)*
5. **The packaged binary's reserved-token branch** producing clean protocol output on standard output,
   nothing else on standard output, no window, and the correct exit status. *(ADR-0035.)*
6. **Responses-dialect model requests against a non-vendor base URL with custom headers.**
   *(ADR-0027.)* If it fails, the fallback is a hand-written dialect behind the same port.
7. **The board projection's serialisation cost across the workspace-service boundary** at
   `REQ-TRACE-300`'s scale. *(ADR-0002, ADR-0041, OQ-2.)* Unchanged by SR-4 — this measures the process
   crossing, not the store — but it now decides half of a question that has a second half in spike 18,
   and OQ-2 should be answered from both together rather than from either alone.
8. **Store query latency for the session listing and the requirements board, against real indexes.**
   *(ADR-0058 consequence 6, ADR-0041, ESC-9; constraints Y-04, I-15.)* **Rewritten: this spike used to
   decide whether ADR-0003's derived read index was needed, and that index is withdrawn as unnecessary
   under SR-4 — a listing served by an indexed query over the same rows has no staleness question. The
   measurement it existed to take is not withdrawn; it got harder.** A directory layout gave the listing's
   cost away for free and a schema does not: indexes and query plans are now a design obligation. Measure
   `REQ-SESSION-042`'s listing against `REQ-SHELL-150`'s 100 ms gesture budget, and `REQ-TRACE-239`'s
   board against its own 100 ms budget with `REQ-TRACE-367`'s linear-growth clause in force, both at a
   realistic workspace size and at `REQ-TRACE-300`'s scale, **with the indexes actually declared rather
   than assumed**. Report the plan each query takes, because a plan that degrades on a larger store is the
   failure this spike exists to catch and it is invisible in a wall-clock figure taken once.
   **Two things are added by the amendment and by ESC-15, and both are cheap here because the harness
   already has a store.** `REQ-SESSION-042` as amended now states the cost clause itself — a listing's
   cost grows with the number of sessions "and with nothing else" — so this is a conformance measurement
   rather than a prudence one (constraint D-13). And the **startup path** needs the same treatment:
   identifier read, store open, write-ahead-log recovery after an unclean shutdown, and an integrity check
   at realistic store sizes, measured where ADR-0058 puts it — inside `REQ-STARTUP-043`'s **post-show**
   activation — to confirm it never touches first paint. `spikes/packaged-first-paint.md` leaves roughly
   3.4–4.4 s of the 5 s budget on the flavours that pass and states that its harness contains **no
   persistence and no native module at all**, so nothing yet establishes what the store costs there.
   **Also owed here:** long-path behaviour on Windows for the layout ESC-15 produces — per-user data root
   plus identifier plus session id plus artifact body name, where the body name is the part that varies
   without bound.
9. ***Withdrawn 2026-08-31 under SR-4, deliberately and not by oversight.*** This was **Windows trim
   under an open writer and a concurrent follower** — the one failure mode ADR-0004's own evidence
   predicted and did not measure, and the only evidence rule 3 of ADR-0004 ever rested on. **Rule 3 is
   deleted and constraint D-28 is withdrawn with it**, because every file the discipline governed is now a
   table: `events.jsonl` (`REQ-EVENTS-091`), `permissions.jsonl` (`REQ-TOOLS-078`), the verification-gate
   log (`REQ-TOOLS-190`) and the ring-capped evidence files (`REQ-SESSION-133`). The concurrent-follower
   half went earlier, with SR-2. Checked rather than assumed: the only file still opened in append mode
   anywhere in the product is `evidence/debug.log` (`REQ-SESSION-142`), and nothing compacts it — **so no
   file in the product is now replaced by rename over a handle its own writer holds.** The number is
   retained because ADR-0004, ADR-0009 and ADR-0024 all cited it; it is not to be reused.

   ***It was nevertheless measured, after it was withdrawn, and the report is
   `spikes/windows-writer-handle-compaction.md`.*** That is worth reading rather than skipping, because
   two of its findings outlive the design it measured and **both correct claims this record was making
   about the platform**, not about the file layout. (a) An `unlink` **succeeds** against a runtime-held
   handle, from another process too, while both fail against a holder requesting read/write sharing
   without delete — so the runtime **does** request share-delete, and the record's stated cause for rule 1
   was wrong. What actually fails is the **replace-by-rename call**, which cannot replace a destination
   with any open handle whatever its share mode, and fails even where the holder explicitly permits
   delete. (b) A directory `fsync` fails **only on a read-only handle**; on a write-opened handle it
   returns success, 200/200, at ~0.115 ms — see OQ-12, whose premise this falsifies. And (c) the
   prescription this spike existed to validate **was right**: 0 of 115 trims completed under the naive
   shape, the cap was exceeded and growing, **no reader observed any symptom**, and append throughput
   collapsed roughly seventy-fold. The **diagnosis** is what generalises and is retained as a standing
   prohibition in constraint D-28; the number is still not to be reused.
10. ***Discharged 2026-09-01 — `spikes/ipc-hop-latency.md`.*** The update path across the process hop,
    against `REQ-MONITOR-222`, `REQ-MONITOR-223` and `REQ-ORCH-155`. **All three pass**, and the entry's
    stated interesting failure — that the empty-session denominator might be small enough for a fixed
    per-update overhead to blow the factor of two on its own — **did not occur**: the ratio is 1.14
    against a ceiling of 2, and 1.19 at `REQ-SESSION-192`'s actual 5,000-row cap. **It also closed three
    ADR clauses and overturned one**: ADR-0002's double-hop Revisit-if, ADR-0044's structured-clone
    trigger, ADR-0044's channel-isolation claim (overturned — a channel name is not a transport), and the
    question of whether the direct `MessagePort` is required (it is not, because SR-8 removed the only
    budget the relay failed).
    **Three things it did not measure and one of them is spike 21.** The commit `REQ-MONITOR-221` requires
    before publication is **outside the measured interval**, stated in the report's own section 8, so
    every figure is a lower bound on the interval the requirement bounds. Fan-out to several windows
    (`REQ-MONITOR-243`, `REQ-STARTUP-163`) multiplies main's per-message cost by the window count and was
    not measured. The reconcile path — a whole read plus an index-0 increment over the resident window,
    the one path that legitimately publishes from index 0 — has never been costed, because `refused = 0`
    in every run. Also not measured: the search panel open (`REQ-CHAT-074`), which remains this entry's
    one unaddressed sub-question and belongs to ADR-0046.
11. **Parse-cache behaviour through `streaming_updates` under the read-but-do-not-insert rule**, on the
    fixture the benchmark actually uses. *(ADR-0051; constraint I-05.)* Confirm that hits and misses both
    climb (`REQ-UIBENCH-063`), that entries and characters stay inside their bounds
    (`REQ-UIBENCH-086`) **for the stated reason rather than by continuous eviction**, and that
    `REQ-NOTIFY-243`'s settle-time insertion produces the correct final rendering. Cheap; it decides
    whether the insertion policy is right before it becomes a reported figure.
12. **The application image's runtime on an unmodified baseline installation.** *(ADR-0054, ESC-11,
    `REQ-STARTUP-024`, `REQ-STARTUP-159`.)* Launch the published image on a machine that has never had the
    legacy FUSE library installed, and record whether the shell's process sandbox is active.
    `REQ-STARTUP-156`'s release gate names a machine the release owner controls, which is **not** the
    machine the requirement names, so this is not covered by the existing gate. ESC-11 turns on it.
13. **Forced synchronous commits at recycler-pool scale — *narrowed, and answered from one side already.***
    *(ADR-0057, ADR-0045, ADR-0053.)* Whether committing synchronously on every applied state holds
    `REQ-MONITOR-222`'s 250 ms p95 and `REQ-UIBENCH-118`'s sub-100 ms lag through the
    thousand-replacement tail phase. **Spike 1 answered the lag half against a mock shell**: a burst phase
    driver produces 588–2,752 ms of lag and a driver that yields after every update produces ≤74.8 ms, at
    the cost of multiplying phase wall times by 17×–26×. **What remains is the real component**, which
    spike 1's own section 10 says its numbers are a floor for: renderer framework, state store, theming,
    accessibility tree, icon set, bundled fonts, syntax highlighting, tool rows, group headers, verifier
    rows and the live-row redraw path. A 2,000-line tool output or a very wide table is the case most
    likely to move the 200 ms budget. **Two cheap follow-ons belong here rather than as new numbers**: the
    settle comparison ADR-0053 consequence 5 turns on — a rAF settle against a paint settle in the phases
    where **both** resolve, which either retires that consequence or sizes it — and ADR-0052's maintained
    session-store counters under the run host's actual write rate, to confirm that a counter incremented
    inside every insert transaction is genuinely free when diagnostics is off (`REQ-STARTUP-129`,
    `REQ-STARTUP-130`). It shares a harness with spike 1, so the marginal cost is small.
14. **A presenter liveness lapse window that survives ordinary main-process load.** *(ADR-0019, OQ-39,
    constraint T-41.)* Measure the worst-case latency of a liveness poll answered by the desktop main
    process while it does the heaviest ordinary work it does — a large transcript render, a
    garbage-collection pause, a settings flush, a native dialog on the platform where one blocks — and
    confirm that a window exists comfortably above it that is still short enough that a wedged main does
    not read as attended for a user-noticeable time. **If no such window exists, ADR-0019's decision fails
    and OQ-39 becomes an escalation** between a hang at `runtime.approval_timeout_seconds: 0` and a
    specification change.
    ***Not discharged, and the reason is specific.*** `spikes/ipc-hop-latency.md` establishes a **floor**
    — a single `webContents.send` took 88.263 ms while main was otherwise **idle** — and confirms the
    wedged-main state occurs, at 22,777 ms of event-loop lag. **It never showed a dialog**, which is the
    one case this spike exists to measure, and a native modal is exactly the load the window must clear.
    The floor narrows the search; it does not size the window.
15. **Echo latency end to end against a real pseudo-terminal with the flush rule in force.** *(ADR-0021,
    OQ-38, `REQ-SHELL-166`.)* Measure key press to painted frame across both process hops with
    `runtime.terminal_stream_interval_ms` at its 100 ms default and at 2000, confirming that the
    ceiling-plus-flush reading actually lands inside `REQ-SHELL-150`'s 100 ms budget rather than merely
    removing the sampling term from the sum. If the two hops and the paint consume the budget on their
    own, the flush is necessary but not sufficient and OQ-38 becomes an escalation about the figures.
16. **The single-instance record's probe and reclaim, on all three platform keys.** *(ADR-0055, which
    records this as a verification obligation and names it a spike; constraint P-16; `REQ-STARTUP-164`,
    `REQ-STARTUP-030`.)* `REQ-STARTUP-164` fixes a 5-second hand-over interval, **at most one** reclaim,
    two claim attempts, no spin, no side effect on the probed process, and nothing written but the record.
    The platform primitive performs the probe and the reclaim **on its own schedule**, and the documented
    surface states no timeout and no reclaim rule — so whether the schedule matches the requirement's is a
    measurement the record does not have. Three observations decide it: **(a)** a record left by a process
    killed without cleanup must not make the application unlaunchable, and the next launch must reach a
    window inside `REQ-STARTUP-155`'s 5 seconds; **(b)** a recorded process that is running but not
    answering resolves within the stated interval, with at most one reclaim and no spin; **(c)** the probe
    leaves the probed process unaffected. **If any of the three fails, ADR-0055's alternative I is adopted
    on every platform — our own record file and our own discipline — and the primitive is dropped rather
    than wrapped in a timeout**, because one record resolved two different ways is worse than either. The
    failure mode is a product that will not start, and it is invisible until it happens.
17. ***Discharged for Windows 2026-09-01 — `spikes/packaged-first-paint.md`. Narrowed, not struck: the
    macOS `.dmg` and the Linux AppImage were not built and `REQ-STARTUP-155` binds both.*** Launch each
    of `REQ-STARTUP-031`'s four artifacts and measure launch to first painted frame, with **no
    per-flavour differential** permitted. **The Windows result triggered SR-7**: the portable produced by
    the packaging tool's own target reached first paint in 13,287–19,580 ms at four bundle weights
    including a zero-payload build — 92 % of it before any of our code starts — against 664–1,561 ms for
    the same payload installed. No setting inside the tool closes the gap.
    **ADR-0055's "Revisit if" fired exactly as written and named the wrong remedy**, which is recorded in
    that ADR as a reversal: it predicted the conversation would be "about the budget or about what is
    bundled", and SR-7 kept the budget, kept `REQ-STARTUP-013` and `REQ-STARTUP-031`, kept what is
    bundled, and changed the **launch mechanism**. The clause assumed only two variables existed.
    **One factual correction the record must carry:** the portable stub **deletes its extraction directory
    on exit**, so there was never a warm path and no design may assume a portable user gets a cheaper
    second launch, or that anything may be cached in that directory between launches.
    **Still owed:** the two remaining platform artifacts, on machines of their own platform key, which
    `REQ-STARTUP-156` now requires at the release gate anyway.
18. **Cross-process write contention on the one workspace store.** *(ADR-0058 consequences 2 and 6,
    ADR-0002, OQ-2; constraints W-01, W-02, W-05, U-03, D-16.)* The run host and the workspace service
    both open the store read-write, so they share one write lock — a coupling that did not exist when they
    wrote different files. Measure the delay a run host's publish commit suffers while the workspace
    service is committing, at `REQ-TRACE-300`'s scale, with W-05's short `IMMEDIATE` transactions in force
    and with the ban on holding a write transaction across `REQ-TRACE-073`'s regexes and
    `REQ-TRACE-225`'s unbounded read **deliberately violated in one arm**, so the cost of getting that rule
    wrong is a number rather than a warning. `REQ-MONITOR-218` forbids a delay floor **of any size** before
    publishing an unseen row and D-16 requires it committed first, so any contention lands exactly there.
    **If it is real, ADR-0058's alternative G — one store written only by the run host and one only by
    the workspace service — removes it entirely and no requirement can observe the split**; SR-4 ruled one
    store per workspace, so taking alternative G would need the ruling revisited, which is why the number
    matters before implementation rather than after. **Run this with spike 21**, which needs the same
    harness and the same contending writer, and whose figure is meaningless without this one's.
19. **What ELSE the product writes into `.rotaris/` on synchronised storage.** *(Same number, **new
    question**, changed by ESC-15 exactly as that ruling said it would be. ADR-0058, ADR-0005;
    constraints D-29, W-20, B-24; ESC-21.)*

    **The old question is answered by a requirement and is withdrawn.** It asked which of three things
    happens to a store on a share or in a sync folder. `REQ-SESSION-198` puts the store on the machine's
    own storage always, and requires such a workspace to be **fully usable** — so no store is ever there
    to refuse, degrade or corrupt.

    **What replaces it is narrower and touches a safety property rather than a usability one.** Two things
    the product writes into `<workspace>/.rotaris/` now travel with the workspace and are reached by
    exclusive create (constraint D-29): the **workspace identifier**, and `REQ-GIT-128`'s
    **`integration.lock`**. Establish, on a mapped network drive, on an SMB share and inside at least two
    cloud-sync clients: whether exclusive create is honoured as a primitive or reconciled after the fact;
    whether two machines can each successfully create `integration.lock` and both proceed; and whether the
    identifier file can be duplicated, conflict-renamed or resurrected by a sync client. **The integration
    lock is the sharp part**, because `REQ-GIT-128` states a cross-machine obligation and its failure mode
    is two machines merging into one base branch at once, silently. A cloud-sync folder is a **local**
    filesystem with a daemon on top and must be measured separately from a true network share rather than
    assumed to share the verdict. **ESC-21 turns on this.**
20. **The prepared portable's steady-state launch. *New. `owner-decisions.md` SR-7 names this as required
    before the gate.*** *(ADR-0054, ADR-0055, ADR-0056; constraint B-23, `REQ-STARTUP-165`,
    `REQ-STARTUP-155`.)* Three figures, in order of what they decide. **The cached-launch first paint**,
    which is the whole point: SR-7 keeps `REQ-STARTUP-155`'s 5 s bound for every run after the one that
    prepares, and the only evidence it is reachable is the §6.1 file-copy baseline of **0.7 s for the same
    508 MB tree**, which is a baseline and **not a result**. **The cost of the identity check on the fast
    path**, which ADR-0054 designs as one directory probe and one small marker read against a build-time
    token, deliberately not a launch-time digest of a 100–500 MB artifact. **Cache invalidation across an
    update**, where `REQ-STARTUP-125` lands the replacement on the artifact and leaves the preparation to
    be superseded on the next launch, so the next launch must notice.
    **ADR-0054's and ADR-0055's *Revisit if* clauses both turn on this**, and `REQ-STARTUP-156` now
    requires the release gate to observe **two runs** of a self-preparing artifact on the same machine —
    the one that prepares, and a later one where the bound is actually observed — so this is a release
    obligation as well as an architecture one. **One case has no stated outcome and should be exercised
    here:** a per-user root that is unwritable or full, where `REQ-STARTUP-165`(c)'s recovery path *is*
    preparing, so the artifact silently returns to the measured 13–19 s behaviour on every launch with no
    way for anyone to see why.
21. **The commit on the publish path. *New, and it is the single unmeasured link in the chain the whole
    persist-before-publish design now rests on.*** *(ADR-0058, ADR-0008, ADR-0009, ADR-0010;
    constraints D-16, U-03, U-04, W-05, W-06, W-21.)* `spikes/ipc-hop-latency.md` states in its own
    section 8 that "the database commit `REQ-MONITOR-221` requires before publication" is **outside** its
    measured interval, so every transport figure in this record is a **lower bound** on `REQ-MONITOR-222`'s
    and `REQ-ORCH-155`'s own intervals. `REQ-MONITOR-218` forbids a delay floor **of any size** before
    publishing an unseen row and D-16 requires it committed first, so any cost lands exactly there.
    Measure: commit cost at the weaker durability setting under write-ahead logging, for **one transcript
    row plus its event** in one transaction and for **one whole-session update**, at `REQ-MONITOR-219`'s
    20-per-second tick, **with a second writer process contending on `BEGIN IMMEDIATE`** (which is spike
    18's subject and shares this harness), plus the `fsync` cost of a terminal-status save
    (`REQ-SESSION-070`) on each platform's per-user data volume.
    **One input to this measurement does not exist yet and must be counted first.** With
    `REQ-SESSION-067`'s window withdrawn, the **save-request rate** is set by the run loop's call sites
    and by nothing this record controls, and `REQ-SESSION-071` states no bound. Nobody has counted it.
    **A related figure is owed on the same path**: the summary rewrite at that rate, including
    `REQ-SESSION-033`'s ladder under anti-malware, which the writer-handle spike showed is load-bearing
    rather than defensive at realistic reader cadences and which was never exercised against that file.
    *For calibration rather than as a claim: the file design's per-event durable write measured 0.518 ms
    p50 with an `fsync` and 0.0135 ms without one. An ordinary commit performs no `fsync` and should cost
    less — that is inference, and it is exactly what this spike exists to replace with a number.*
