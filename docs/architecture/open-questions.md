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

**Counts, as of the restore-measurement round of 2026-09-02.** **Thirty-one escalations. TWENTY-NINE are
ruled** (`owner-decisions.md`, ESC-1 to ESC-22, ESC-24 and ESC-26 to ESC-31), **two are closed by the
specification itself with no ruling needed** (ESC-23, ESC-25), and ***NONE IS OPEN***. **Forty-seven
specification questions**, **eight resolved** and closed with their reasons below — OQ-3, OQ-11, OQ-14,
OQ-26, OQ-27, OQ-28, OQ-44 and OQ-49 — leaving **thirty-nine open**, **none of which blocks a named ADR**.
Two design-reference dependencies. **Twenty-two numbered spikes**, one withdrawn, **eight discharged** and
one discharged for Windows only, leaving **twelve outstanding** — and see the spike section, which
separates them into the three groups the gate actually turns on.

**The specification-question count has moved since, and implementation is what moves it.** Four questions
were raised by building the thing that met the requirement: **OQ-50** (Part K, the public model catalogue),
**OQ-51** (Part AB, the unscoped queued prompt), **OQ-52** (Part AC, whether a delegated child may ask) and
**OQ-53** (Part AH, which event reports a compression), **OQ-54** (Part AL, the user-terminal audit entry outside the closed permission vocabularies) and **OQ-55** (Part AL, `shell_max_background_sessions` without a maximum). That is **fifty-three specification questions**. **Twelve are now resolved, leaving forty-one open**, and none
blocks a named ADR. Four closed together on **2026-09-11** on the owner's ruling — **OQ-5** and **OQ-38** (the two
terminal readings, ratified into `REQ-TOOLS-127` and `REQ-CONFIG-117`, the second narrowed in the ratifying),
**OQ-55** (the background-session key gains a maximum) and **OQ-45** (ADR-0061 takes the improvement store's write
path) — which is the first time a ruling closed more than one at once, and it happened because three of the four
had been priced by measurement before they were put. Each of the four is stated where it
was found, with what the build shipped meanwhile, so a ruling replaces an interim rather than filling a gap.

***Three of those counts changed on 2026-09-02 and the direction is not the usual one, so a reader should
not skim them.*** The seven escalations this register carried as open were **all ruled on that date** and
all seven have landed in requirements; OQ-14 and OQ-44 were **closed by amendment** and their entries below
say by which clause; and **spike 22 has been run**. Two entries were corrected rather than deleted because
they asserted a fact that is now false: OQ-44 said `REQ-TRACE-061` "states no ladder" and it now states
one, and OQ-14 said `REQ-CONFIG-216` "says nothing about mode" and it now fixes `0600` explicitly on every
write.

**Five spikes have now landed on 2026-09-02.** The first four closed nothing here, which was the point:
every owner ruling survived and what the measurements changed was the *reasons* — three platform facts this
record asserted were disproved, one ADR's own stated gate trigger fired, and one question a spike raised
was answered in the specification rather than filed here. **The fifth is different in kind.** Spike 22 ran
`REQ-SESSION-201`'s restore and **the mechanism did not work — 0 of 30** — so it closed a spike, found
three defects the record had decided on paper, produced a new requirement (`REQ-SESSION-202`), amended
another (`REQ-SESSION-201`), added two shapes to OQ-48, and left **eight further defects it found
uncorrected**. Those eight are in the gate verdict in [`README.md`](README.md) §6 and are not filed here as
questions, because they are defects with owners rather than silences with none.

**Sub-cases that went unmeasured inside spikes that otherwise passed are listed rather than absorbed**,
because a sub-case folded into a discharged spike is a gap nobody can see afterwards:
`REQ-STARTUP-165`(c)'s "no usable preparation at all" branch (spike 20), ESC-21's second premise
(spike 19), and — new — **the kill-in-the-gap case and the re-run of the corrected restore** (spike 22).

**Nothing here is closed because a ruling said it would be, and nothing is closed because a measurement
was taken nearby.** Two closures in the previous pass were **rewritten rather than deleted**, because
they were right about the outcome and wrong about the reason: OQ-11 is closed, but not by dissolution,
and OQ-44's statement of fact was false. Two questions the ADRs decided against the specification's
silence were filed as **new** questions (OQ-47, OQ-48) rather than being presented as settled, and both
are still open.

**What the second pass changed, stated so a reader can audit it.** Five escalations are closed
individually and each says which requirement closed it and what it left behind; **none of them is closed
because a ruling exists, and two are closed against the entry's own conclusion** (ESC-25 argued a
detached signature was unavailable and the specification amended the two requirements that forbade it;
ESC-23 argued the antecedent was lost and the specification restored it). One question is closed because
the specification moved under it (**OQ-28**). One is new because ADR-0002 had to decide a silence
(**OQ-49**). Three escalations remain open and one of them is new. **Nothing is closed that an agent did
not actually settle**: where a pass reported a conclusion this register could not verify against the
requirement text, the conclusion is recorded and the entry stays open.

**Where a measurement overturned something, the claim is preserved beside what replaced it.** **NINE
spike reports now exist** — four dated 2026-09-01 and five dated 2026-09-02, covering eight live spikes
and one withdrawn one — and each of them changed at least one entry below. They are in
[`spikes/`](spikes/) and are cited by filename. **In the 2026-09-02 group, what was overturned was more
often a *reason* than a *conclusion*, and the entries below say which:** where a measurement disproved a
reason but not a conclusion, the entry states the conclusion, states that the original reason was tested and
found false, and states the reason that actually holds. **The ninth is the exception and should not be read
in that pattern**: spike 22 disproved a *mechanism*, not a reason — the restore as ADR-0058 wrote it could
not complete at all.

---

## Escalations — product-owner decisions

**ESC-1 to ESC-18 have all been ruled on.** The rulings are in
[`owner-decisions.md`](owner-decisions.md), together with nine structural rulings (SR-1 to SR-9) taken
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
[`../clean-room/specification-gate.md`](../clean-room/specification-gate.md) carries what each amendment
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

### ESC-19 — SR-9(b)'s backup disclosure is not in the specification *(raised 2026-09-01; **RULED 2026-09-01; the specification has since landed both halves**)*

> **Status, 2026-09-02: CLOSED, and closed by requirement rather than by the ruling alone.** ESC-19 was
> ruled **option 1 *and* half of option 2**: mint the disclosure, add a whole-store backup and restore,
> and **refuse** the configurable store location. All three have landed. `REQ-SESSION-200` is the
> disclosure and is substantial — it names what sits outside a workspace backup, names what *is* carried
> so the statement is informative rather than alarming, names both remedies, requires reachability from
> `REQ-SESSION-182`'s session-management surface, and forbids delivery only inside a failure message.
> `REQ-SESSION-201` is the backup and restore, and it fixes far more than the ruling asked for: one
> artifact covering the whole store plus `REQ-SESSION-002`'s per-session files and nothing outside it, a
> user-chosen destination, validity **while runs are live**, a result that is "a state of the store that
> a reader could have observed at one moment", an explicit restore that never merges silently and is
> refused rather than half-done, and an artifact carrying the workspace identifier. `REQ-SESSION-182`
> places both actions. The store's location is unchanged and ESC-19 states in terms that ADR-0058's
> location decision does not reopen. **Constraint W-22 is relabelled MET; W-24 carries what the backup
> now forces.**
>
> **What is left is not this escalation and must not be filed under it.** One thing the pair *creates*
> is escalated separately below as **ESC-26**: `REQ-SESSION-201`'s restore and `REQ-SESSION-197`'s
> absolute identifier rule together make the intended disaster-recovery use end in a manual file edit.
> And the mechanism ADR-0058 built for it was entirely unmeasured — spike 22. ***That is no longer true.
> Spike 22 ran on 2026-09-02 and the restore as ADR-0058 wrote it failed in 30 of 30 attempts*** (
> `spikes/backup-restore-mechanism.md`). Three defects were found, all three are corrected in ADR-0058,
> `REQ-SESSION-201` and the new `REQ-SESSION-202`, and eight further defects the spike found are recorded
> uncorrected in the gate verdict. **None of it reopens this escalation**: the ruling asked for a
> whole-store backup and restore and the requirement states one; what the measurement corrected was the
> mechanism, which is the architecture's and not the owner's.

**Where:** ADR-0058; constraint W-22, and now W-24. **Source:** `owner-decisions.md` SR-9(b), against
`REQ-SESSION-198` and the absence of any requirement discharging it. **The options as they stood when
this was raised are kept below, because a ruling is only legible beside them.**

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

### ESC-20 — SR-9(a)'s two exports are not minted, and the argument reaches a third record the specification excludes *(raised 2026-09-01; **RULED 2026-09-01; the specification has since landed it in full**)*

> **Status, 2026-09-02: CLOSED.** ESC-20 was ruled: mint SR-9(a)'s two exports, and **draw the boundary
> on redaction safety rather than on readership**. `REQ-LIBRARY-176` and `REQ-TRACE-514` mint the two,
> each applying `REQ-EVENTS-166`'s guarantee "on the same terms `REQ-SESSION-199` applies it to the
> timeline, the issues record, the metrics document and the permission audit". The third case went the
> way this entry could not predict: `REQ-TOOLS-190` **gains** an export, in its continuation paragraph,
> and the readership sentence quoted below as the possible stopping point **has been deleted from the
> requirement** and replaced by the test itself, which `REQ-TOOLS-190` now calls "the product's single
> statement of that test" — *a record gains an export when it carries no unredacted user or tool content,
> and does not gain one when it does.* The one case this entry said must never be swept in is protected
> by the same requirement, in stronger terms than were asked for: `REQ-SESSION-136`'s tool-call evidence
> "MUST NEVER gain an export — not under this rule, and not under any later widening of it", and a
> future requirement proposing one "MUST be refused rather than reconciled". **Constraint W-23 is
> relabelled MET.**
>
> **One residue, and it is disclosure rather than boundary.** `REQ-SESSION-201`'s backup carries the
> tool-call evidence because it carries the store whole. The requirement states that itself and obliges
> the product to convey it where the action is offered, so it is not a widening — but a reader who meets
> it without that sentence will conclude the prohibition is porous, which is exactly the argument for
> widening it. ADR-0024 and ADR-0058 both state the distinction rather than omitting it.

**Where:** ADR-0024, ADR-0041, ADR-0058; constraint W-23. **Source:** SR-9(a) and SR-6, against
`REQ-SESSION-199`, domain 14, and `REQ-TOOLS-190`. **The question as it stood is kept below.**

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

### ESC-21 — the one lock with a cross-machine obligation is the one the product cannot enforce *(raised 2026-09-01; **RULED IN DIRECTION 2026-09-01; strength pending spike 19**)*

> **Status, 2026-09-02: direction settled and carried by requirement; strength still owed to a
> measurement that is running.** ESC-21 was ruled: **the product must not promise cross-machine mutual
> exclusion it cannot enforce**, and the integration operation must detect the condition and refuse
> rather than proceed under a lock that does not lock. There was no field precedent to borrow — every
> harness surveyed is single-machine and the one with multi-device continuity uses a server this product
> does not have and does not want — so this was reasoned rather than copied. The specification now
> carries it: `REQ-GIT-128`'s second paragraph refuses the integration where the workspace is classified
> as replicated and requires the lock **not be created at all**; `REQ-GIT-124` places that refusal in its
> ordered list **ahead of** the lock check "because it is exactly the condition under which the lock the
> next check reads does not mean what it says"; and `REQ-GIT-128` forbids domain 06 making the storage
> determination again or raising a second notice — the classification is `REQ-STARTUP-166`'s and the
> notice is `REQ-STARTUP-166`'s.
>
> **Two things are genuinely still open and one of them is not a measurement.** *(a)* **Strength.**
> Spike 19 decides whether refusal or a proceed-past warning is right. ADR-0005 states that if the answer
> is a warning, one refusal becomes a confirmation and its four mechanism rules are unaffected either
> way. *(b)* **The residual the mechanism cannot reach, which no spike closes.** An unrecognised
> synchronisation client classifies as *unknown*; `REQ-STARTUP-166` makes an inconclusive determination a
> silent negative, "and a silent negative is the only safe answer to an unknown"; `REQ-GIT-128` carries
> that forward in terms — a workspace the product could not classify does not refuse either. So the
> refusal removes the **recognised** cases and no more, and the worst outcome in this record — two
> machines merging into one base branch at once, silently — remains reachable through an unrecognised
> client. ADR-0005 records this as an unclosed residual rather than hiding it, and the owner should see
> it in the same breath as the ruling that produced it.

**Where:** ADR-0005, ADR-0058; constraints C-01, W-20. **Source:** `REQ-GIT-128` against
`REQ-STARTUP-166`. **The question as it stood is kept below.**

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

### ESC-22 — the aggregate terminal-frame rate is unbounded, and a conformance budget now depends on it *(new 2026-09-01; **RULED AND APPLIED 2026-09-02**)*

> ***RULED: bound it. APPLIED the same day.*** `REQ-MONITOR-306` is minted: live terminal output reaching
> surfaces is bounded **in aggregate** — across every live stream, of every session, delivered to every
> window — at **1,000 frames per second**, counted **per delivery**, so a stream shown in two windows counts
> twice. It cites `REQ-TOOLS-126` for the per-stream period and `REQ-TOOLS-127` for what a frame is and
> copies neither; what it adds is that **the number of live streams is not a multiplier on the per-stream
> period**, which is the whole of what this escalation said was missing. It is bounded **on frames and
> deliberately not on volume**, because a byte bound could be honoured only by discarding output, which
> `REQ-SHELL-103` and `REQ-MONITOR-294` both forbid. And it is stated as a **condition of
> `REQ-MONITOR-222`** rather than as a smoothness concern: it may not be widened, made configurable or
> raised by any per-stream setting unless `REQ-MONITOR-222` is re-measured at the new rate, and conformance
> is the **delivered aggregate rate**, never the appearance of a terminal grid. `REQ-MONITOR-287` and
> `REQ-SHELL-103` cite it and hold no copy of the figure. **The ground the owner gave is the IPC
> measurement**: transcript p95 rose sixfold at 65.5 MB/s and ninety-eightfold at 12,000 frames per second
> while staying at 1.51 ms at 999, so an unbounded rate left a load-bearing property resting on a default.
> **The entry below is kept as the statement of what was decided between.**
>
> **Re-checked against the amended corpus and unchanged.** `REQ-TOOLS-108` still reads "default 20,
> minimum 1" with **no maximum**, and `REQ-CONFIG-116` registers the key as `int ≥ 1, default 20`. The
> amendment pass did not touch either. One of the two factors in a conformance budget is still
> user-writable without a ceiling, and the three remedies below are unchanged. **Nothing about this is
> architecture's alone.**

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

### ESC-23 — `REQ-CONFIG-423` loses its antecedent under ESC-1 *(raised 2026-09-01; **ANSWERED BY AMENDMENT 2026-09-02, no ruling needed**)*

> **Status: CLOSED, and closed in favour of the first of the two candidate rules named below.** Both
> requirements have been amended. `REQ-CONFIG-288` no longer states the coupling in the present tense —
> it now *takes* the decision ESC-1 ruled, in its own voice: "**The composer's permission-mode control
> writes only its own key, and commits nothing else.** The decision this requirement previously handed
> over is taken here rather than left open, and it is taken against the coupling", through
> `REQ-CONFIG-441`'s scoped per-field writer, refusing outright where the target file cannot be read
> (`REQ-CONFIG-442`), with every pending Settings edit staying pending and still undone by Discard. And
> `REQ-CONFIG-423`'s antecedent is restored rather than deleted: a change to that field made while
> Settings is open "**by any other surface — the composer's control, which writes that key alone
> (`REQ-CONFIG-288`), or any other writer of it** — lands in that pending state". The dependence on the
> shared save path is gone; the pending state tracks the field however it was written. `REQ-CONFIG-423`
> additionally states why, which the entry below could not: "where a permission mode has been changed
> elsewhere and applied to a live run, a settings screen that went on showing the user's unsaved choice
> would be showing a mode no run is operating under."
>
> **ADR-0037 has not been swept against this and is stale in two places** — it says "The requirement has
> not been amended, and this record must not pretend otherwise" and treats `REQ-CONFIG-423`'s second
> sentence as having lost its antecedent. Reported under the ADR sweep rather than fixed here.

**Where:** ADR-0037; constraint G-19. **Source:** ESC-1 as ruled, against `REQ-CONFIG-423` and
`REQ-CONFIG-288`. **The question as it stood is kept below.**

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

### ESC-24 — a launch handed to an instance inside its force-exit allowance *(new 2026-09-01; **RULED AND APPLIED 2026-09-02**)*

> ***RULED: refuse the launch until exit completes. APPLIED the same day.*** `REQ-SHELL-169` is minted: such
> a launch is **refused rather than admitted**, and honoured once the shutdown has finished. Through that
> interval the instance builds no window, opens no workspace and writes nothing on the launch's behalf —
> **including the window `REQ-STARTUP-162` would otherwise have a window-less instance build**, which is the
> clause this entry identified as the trap. The refusal is **answered, never silent**, because an unanswered
> launch is the path `REQ-STARTUP-164` keeps for a process that *cannot* answer, and taking it for one that
> can would produce exactly the two simultaneous processes the refusal exists to avoid. **Domain 11 was
> amended in step so the two documents agree**: `REQ-STARTUP-164`(3) now states that an answered refusal
> stops the 5-second reclaim running at all — without which the launch would reclaim the record four seconds
> into a thirty-second allowance and become the second instance ESC-24 forbids — `REQ-STARTUP-162` gains the
> shutting-down exception to its build-a-window clause and states what a waiting launch shows, and
> `REQ-STARTUP-161` states that waiting is not a third outcome. **The owner's ground**: the force-exit
> allowance exists because a quit is already going wrong, so admitting a launch into it means two instances
> briefly exist at the one moment the product is least able to reason about its own state — and refusing is
> consistent with SR-1's own shape, in which a second launch never starts a rival process.
> **The entry below is kept as the statement of what was decided between.**
>
> **Re-checked against the amended corpus and unchanged in substance; one adjacent requirement now
> bounds it partly, which is worth stating precisely rather than letting a reader think it closed it.**
> `REQ-STARTUP-161` still releases the record "when that instance's process ends" and `REQ-STARTUP-162`
> still requires the hand-over to surface a window — and to **build** one where none is open — while
> writing nothing and reporting nothing. `REQ-STARTUP-164`(3) covers the case where the exiting instance
> **does not answer**: the launch reclaims after 5 seconds and retries once. It does **not** cover the
> case this escalation is about, which is the exiting instance **answering** the hand-over and being
> obliged to build a window in a process about to force-exit. *A second, adjacent case did close by
> amendment and should not be confused with this one:* `REQ-STARTUP-121`'s update restart now fixes the
> hand-over in terms — the record "passes from the current instance to the successor rather than being
> released for anyone to claim", and a launch arriving during it "SHALL be handed to whichever of the two
> holds the record at that moment and SHALL never start a third process". ADR-0055 meets that by argument
> rather than by construction and says so; see the gate verdict.

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

### ESC-25 — ESC-8's signature has no available placement, and rotation is a release commitment *(raised 2026-09-01; **ANSWERED BY AMENDMENT 2026-09-02, and answered against this entry's own conclusion**)*

> **Status: CLOSED. Both halves are settled, and the first is settled the opposite way to the one this
> entry and ADR-0054 both argued for.** This entry concluded that a detached `SHA256SUMS.txt.sig` "is not
> a thing this release may publish" and that the signature must therefore live *inside* the manifest.
> **That is withdrawn.** The specification took the third option — amend the two requirements that
> forbade it, individually. `REQ-STARTUP-032` now requires a release to publish, beside the manifest, "a
> detached signature over the manifest's exact published bytes, named `SHA256SUMS.txt.sig`", and states
> the reason the entry below missed: the manifest cannot carry a digest over a file derived from itself,
> and a detached signature leaves the manifest's bytes identical for the update path and for
> `sha256sum -c` alike. `REQ-STARTUP-152` excepts it from the naming-scheme agreement; `REQ-STARTUP-035`
> excepts it from the one-row-per-asset rule. `REQ-STARTUP-122` fixes the order — fetch manifest **and**
> signature, verify the signature, **then** parse the manifest, then stream, verify, apply — so untrusted
> bytes reach no parser of ours.
>
> **Rotation is settled too, and settled as this entry said it must be — in the build, at the release
> gate.** `REQ-STARTUP-167` fixes that every artifact carries the verification counterpart within itself,
> that the accepted set is fixed when the build is produced, and that nothing at run time may add to,
> replace or disable it. `REQ-STARTUP-168`(a) makes what a build carries **a set rather than a single
> value**; (b) requires a release to be signed with a key carried by every artifact it may be offered to,
> "decidable before publishing … and it SHALL be decided then rather than discovered afterwards", at
> `REQ-STARTUP-156`'s release gate. That is the operational commitment this entry asked the owner to see
> stated, and it is now stated. **ADR-0054 has been swept and carries the reversal**, with its superseded
> argument preserved and the reason it failed named: its premise was a requirement, and the requirement
> was amended.

**Where:** ADR-0054. **Source:** ESC-8 as ruled, against `REQ-STARTUP-152` and `REQ-STARTUP-035`.
**The question as it stood is kept below.**

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

### ESC-26 — the identifier cannot be re-established by any product action, and that blocks the recovery path ESC-19 just minted *(raised 2026-09-02; **RULED 2026-09-01 and APPLIED 2026-09-02**)*

> ***Ruled: option 2, drawn as narrowly as it can be drawn. `REQ-SESSION-197` gains one exception — a
> restore MAY establish the workspace identifier on explicit user confirmation, and no other action ever
> may.*** The ruling is in `owner-decisions.md`; the amendment has landed in `REQ-SESSION-197` (which
> carries the whole exception) and `REQ-SESSION-201` (which carries a pointer, because a contract has
> exactly one home). **Five conditions bind it and it is unavailable unless every one holds:** only inside
> the restore action, with the requirement naming the paths that do *not* gain it — opening or preparing a
> workspace, `REQ-SESSION-060`'s explicit repair, a migration, an update, a later convenience; explicit
> confirmation naming **both** identifiers and stating that this workspace's own sessions become
> unreachable from it, never automatic, never the default or pre-selected, with report-and-do-nothing kept
> as a correct outcome; the **absent**-identifier case unchanged and explicitly *not* this exception; a
> present-but-**unreadable** identifier still reported and never overwritten; and the displaced store
> **moved aside and kept**, never deleted, with the confirmation saying where it went. ADR-0058 adds that
> the operation is reversible by hand and says so in the confirmation, which is what makes a
> one-way-looking action safe to confirm.
>
> **What it does NOT settle, stated because the shapes are similar enough to be confused.** A user who
> **copies** a workspace folder and wants the copy to have an identity of its own still has no product
> action — **OQ-47 stays open on that side**, and ADR-0058 says so explicitly rather than letting the
> ruling read as covering it. **OQ-48 is more owed, not less**: the exception adds a third producer of
> orphaned stores, and the reclamation surface is now the only route *back* to a store a user may well
> want rather than only the route to clearing one they do not.
>
> *The reading question this entry flagged is answered by the amendment rather than by an ADR: the restore
> may write the identifier, on the conditions above and on no others.*

**The entry below is the statement of what was decided between, kept because a ruling is only legible
beside the options it chose from.**

**Where:** ADR-0058, ADR-0002; constraints W-19, W-24; OQ-47. **Source:** `REQ-SESSION-201` against
`REQ-SESSION-197`. **This is the one thing the backup pass could not settle inside the architecture,
because settling it means amending a requirement.**

ESC-19 was ruled so that a user can carry their history to another machine. `REQ-SESSION-201` builds
that: one artifact, the whole store, carrying "the workspace identifier it was taken from … so a backup
cannot be poured into the wrong workspace by accident". But `REQ-SESSION-197` forbids the identifier
changing "afterwards for any reason", forbids minting a replacement over one the product can read, and
states no user-confirmed exception — for a good reason, which the same requirement gives: overwriting one
"would silently orphan every session recorded under it".

**Follow the intended journey and it ends in a text editor.** A user's machine dies. On the new machine
they clone their repository — `.rotaris/` is kept out of version control by `REQ-CONFIG-013`, so no
identifier arrives. They open the workspace once, which is the natural first thing to do, and the product
mints a new identifier. *Then* they restore their backup. The artifact names identifier A; the open
workspace reads identifier B; `REQ-SESSION-197` says the product may not touch B. The sessions restore
into a store the open workspace will never resolve to, and the only remedy the product may offer is to
close the workspace, replace the identifier file by hand, and reopen. **This is the same dead end OQ-47
already records for a copied folder, reached from a second and much more likely direction** — and
reaching one dead end twice, from two independent routes, is evidence rather than coincidence.

Three options, and the architecture has taken the only part of the third that is unambiguously legal:

1. **Leave it.** `REQ-SESSION-200`'s disclosure at least means nobody is surprised. The cost is a
   recovery path people will get wrong, at the worst moment to get something wrong.
2. **Grant `REQ-SESSION-197` one narrow exception**, available only during a restore, only behind an
   explicit user confirmation that names what is being detached, and never automatic. This weakens the
   protection ESC-19's own comparative evidence identifies as this record's single best decision — the
   filed, painful, path-keyed history-loss bug three surveyed products have and this one does not — so it
   should not be granted casually.
3. **Allow a restore to establish an identifier only where the workspace has never been prepared.** This
   fixes the *clone-then-restore-before-first-open* order and leaves the common order broken.

ADR-0058 implements the part of (3) that no requirement forbids: where `.rotaris/` carries **no**
identifier file at all, the restore establishes it from the artifact by exclusive create, arguing that
nothing is replaced and the value established is the one the restored sessions were recorded under.
It is guarded twice — a file that is present but unreadable is **not** this case, because
`REQ-SESSION-197` requires that reported rather than overwritten, and the write is an exclusive create so
a racing file wins. It refuses to invent the rest, and records the residue undressed.

*One reading question rides on this and ADR-0058 flags it rather than burying it:* `REQ-SESSION-201`'s
"It MUST NOT reach outside that store" sits in the backup paragraph, and the restore's obligations are
stated separately in the same requirement with none of them forbidding an identifier write. ADR-0058
takes the narrow reading. **If the owner reads it the other way, the legal case above collapses into the
manual remedy and this escalation gets worse rather than better.**

### ESC-27 to ESC-31 — five product decisions the defect-correction round raised rather than took *(raised 2026-09-02; **ALL FIVE RULED AND APPLIED 2026-09-02**)*

> ***"All five OPEN and none ruled" is WITHDRAWN and must not be cited.*** All five were ruled on the day
> they were raised, together with ESC-22 and ESC-24, and all five have landed in requirements. **ESC-27:**
> `0600`, applied **explicitly on every write** by `REQ-CONFIG-216`, with `REQ-CONFIG-444`'s platform-default
> fallback denied to this one file by name and no write at all where the protection cannot be applied —
> **OQ-14 closes with it**. **ESC-28 and ESC-29:** *report and carry on*, owned by `REQ-CONFIG-183`, which
> reports and ignores a key this specification defined and withdrew and a key it names as not a
> configuration key of this domain, loads every other key as though they were absent, opens the workspace,
> and restates the hard load failure for a genuinely unknown key as **unweakened** with the carve-out
> bounded to exactly those two kinds. The second half of ESC-28 — a confirmed one-click removal — was **not**
> taken, because it would need the no-repair rule narrowed and nobody ruled that. **ESC-30:** *make them
> distinguishable* — `REQ-LIBRARY-047` records, inside its own all-or-nothing operation, that a version was
> **due**, so one the best-effort write then failed to record is afterwards known to be absent and countable;
> `REQ-LIBRARY-176` carries **two separate figures** per artifact, each identified as which it is and each
> stated as zero rather than omitted; and both exports are forbidden from carrying an absence figure in a
> shape shared with the other. **ESC-31:** *in the entry* — `REQ-TOOLS-079` makes the identifier a field of
> the entry and names it in the field set, because `REQ-EVENTS-056` requires the locator to resolve **through
> the export**, on a machine carrying none of this product's code. ***That discharges the one architecture
> consequence this group had***: ADR-0024's choice is no longer permitted-and-unblessed. What the ruling did
> **not** settle is the field's *token*, which would have been a decision the ruling did not make;
> `REQ-TOOLS-079` fixes the property instead. **The entries below are kept as the statement of what was
> decided between.**

**These are not architecture's and were not architecture's to raise.** The defect-correction round of
2026-09-02 corrected ten specification defects this record reported and, in five places, found that
closing the defect required deciding something a user would see. It recorded the decision rather than
taking it. **They are stated in full in
[`../clean-room/specification-gate.md`](../clean-room/specification-gate.md), which is canonical for
them; they were listed here so this register's count of open escalations stayed honest.**

- **ESC-27 — `secrets.yaml` has no file mode.** `REQ-CONFIG-216` fixes the write as atomic and
  directory-creating and states no mode, so the one configuration file that holds credentials by design
  inherits the process mask. `0600` plus the explicit access-control list treats it by what it holds;
  `0644` treats it by what it is, matching every other configuration file. Constraint **D-26** and
  **OQ-14** are the same fact from two directions and neither closes without this ruling.
- **ESC-28 — should the product do more than tell a user about a withdrawn configuration key?**
  `REQ-CONFIG-478` fixes the honest minimum. Opening the offending file for editing from the failure
  report, or a confirmed one-click removal, are further options; the second sits against the rule that the
  product does not repair a user's configuration and would need that rule narrowed explicitly.
- **ESC-29 — a withdrawn key in the *global* scope stops every workspace opening**, and no in-product
  surface is reachable from that state, including the settings screen that would edit the global file.
  Worth ruling with ESC-28.
- **ESC-30 — a version missing because it was never recorded is not distinguishable from one retention
  pruned.** This is **OQ-45**'s product half, escalated. `REQ-LIBRARY-047` makes recording a version
  best-effort and outside the write's all-or-nothing boundary; `REQ-LIBRARY-052` now obliges the store to
  say how many pruning dropped and `REQ-LIBRARY-176` forbids the export implying that figure accounts for
  every absence. Whether the export must tell the two causes apart is the owner's, and a conformant export
  can be built today under either ruling and widened later without rework.
- **ESC-31 — where the permission-audit entry's identifier lives.** `REQ-EVENTS-056` fixes the locator's
  form and its record-kind token; `REQ-TOOLS-079` is obliged to give an audit entry an identifier.
  Whether that identifier is a further **field** of the entry or travels **beside** it is deliberately
  left open, and the two are observably different in the exported audit file. **ADR-0024's choice that
  the identifier is the export ordinal is permitted and unblessed until this is ruled**, and whichever is
  chosen, `REQ-TOOLS-079`'s no-argument-values property must survive untouched: it is what makes the audit
  exportable at all.

---

## Specification questions

### Resolved, and closed with the reason

Four entries are answered here, and a fifth — **OQ-28** — was resolved on 2026-09-02 and is closed in
place among the ADR-specific entries below, because the argument that closed it is long and belongs
beside the measurement it rests on. They keep their numbers and stay in the register because ADRs cite
them, and each says what closed it, so a reader who finds the citation is not left guessing. **Nothing is
listed as closed that the record did not actually settle** — three further questions the rulings expected
to close did not, and they are still open below with their residues stated (OQ-12, OQ-19, OQ-41).

***A sixth entry closed on 2026-09-02: OQ-49, closed by amendment rather than by argument.***
`REQ-STARTUP-163` now owns what makes two directory strings the same directory — what is resolved, what is
deliberately not reconciled, and the bounded cost of not reconciling it — with two additions ADR-0002 did
not state: a trailing separator carries no meaning, and abbreviated alternate spellings the filesystem
itself resolves are resolved. It states explicitly that it is **not** the definition of workspace identity,
which is `REQ-SESSION-197`'s and is never derived from a path. **Constraint W-25 moves from a ruling to a
requirement citation and ADR-0002 should now cite rather than decide.** The store side of the same hazard
is *not* closed by that requirement and is now a rule of its own — see constraint **W-27** and the entry
immediately below.

***One question a spike raised is answered rather than filed, and it is recorded here in the closed form
so the spike's own request for an entry is not silently ignored.*** `spikes/remote-and-synchronised-storage.md`
section 11 item 14 asked: **where does a first-statement store failure after a successful open belong?**
`REQ-EVENTS-084` governs "opening the store only"; `REQ-EVENTS-088` governs a write that fails *during* a
run; the measured case — a store that opens cleanly, reports and reads back its journal mode, owns its
shared-memory companion at the expected size, and throws on the very next statement — belonged to neither,
**30 times out of 30 on a mapped network drive**. It is **minted and closed in the specification rather
than left open here**: `REQ-EVENTS-179` requires the store to be *exercised* rather than merely opened,
by a write made and then undone, before the run starts; it resolves its own failure into `REQ-EVENTS-084`
and refuses on exactly that requirement's terms; `REQ-EVENTS-084` and `REQ-EVENTS-088` each gained the
boundary sentence that routes to it; and `REQ-SESSION-089` gained the matching clause on the run-lifecycle
side. **What is NOT closed and is listed under the spikes below is the cost of the probe itself**, which
has not been measured on the startup path. Constraints **W-04**, **W-08** and **E-05** carry it.

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

**OQ-1 — Decision closed, 2026-09-07.** REQ-CHAT-041 now scopes the queue to
the application instance and session ID. The run host remains its authoritative
owner, with atomic queued-to-triggered transitions and session-filtered windows.
Cross-process conformance evidence is tracked in the resolution ledger.

**Historical question.** `REQ-CHAT-041` scopes queue
visibility and consumption to windows and runs "sharing the same process", and `REQ-CHAT-038` requires an
atomic queued-to-triggered transition **exactly one caller wins**, while `REQ-MONITOR-139` and
`REQ-ORCH-071` make the queue session-owned and let a run consume only its own session's prompts. Under
ADR-0002 the windows and the run engine are in different processes, so "the same process" is satisfied on
one side or the other but not both. The record places the service in the run host; **confirm, because it
decides whether the phrase is satisfied or merely not violated.** *Unchanged by SR-4, and SR-1 adds one
argument against the alternative: several main windows may display one session (`REQ-MONITOR-243`), so
"the window side" is not a single place to put it.*

**OQ-5 — Decision closed, 2026-09-11.** `REQ-TOOLS-127` now states that the closing frame is a literal
replacement of the displayed text carrying an explicit marker that it is one, that its text is plain on the terms
the requirement already fixed, and that it is **the only frame of a stream of which any of that is true**. The
record's reading is ratified rather than replaced, and the amendment states the reason the conflict was never
real: `REQ-SHELL-095` and `REQ-SHELL-098` govern the stream **while the process is running**, and this frame is
emitted after it has exited — no cursor to paint, no alternate screen to be in, no further output to attribute to
a cell. The two bind different instants. **One thing nobody had noticed is fixed with it:** the closing sentence
bound a *foreground* stream only, while all three executions emitted a closing frame for `bg:` streams as well and
a proof asserted it — the code was ahead of the requirement rather than outside it, and the amendment covers both.
No code changed. Recorded in ADR-0021's ruling section of the same date.

**Historical question.** *(ADR-0021.)* `REQ-TOOLS-127` requires the
closing frame's text to **equal the observation's final output text**, which is plain, capped and
truncated from the oldest end — not terminal control bytes. `REQ-SHELL-095`, `REQ-SHELL-098` and
`REQ-SHELL-166` require a full character grid with alternate-screen fidelity, per-cell attributes and
sixteen colours, which plain text cannot carry. The record's reading is that the closing frame is a
literal plain-text replacement carrying an explicit marker, while every earlier frame is byte-faithful.
**That is a reading, not a fact**, and the alternative reading — plain text throughout — would contradict
three shell requirements.

*Executed three times (Parts AL, AL′, T″; 2026-09-09, 2026-09-11).* The reading is unchanged and now
exercised three ways: the closing frame is a `screen` carrying `closing: true` and the observation's final plain
text; the proof asserts that text equals the observation byte for byte against a real 10,000-line command
(`closingEqualsObservation`); and with the stream sampled in motion the window's grid, the transcript preview and
the persona card reset and write that text together, agreeing at the instant they do it. What the executions add is
only this: the alternative reading — plain text throughout — is no longer merely argued against, because the
same proof renders cursor addressing and an alternate screen from the VT deltas that precede the closing frame,
which plain text cannot carry (`REQ-SHELL-095`, `REQ-SHELL-098`). Nothing measured contradicts the record's reading
and nothing measured establishes it as the specification's intent. **Still the owner's.**

**OQ-38 — Decision closed, 2026-09-11, and the ruling narrowed the reading it ratified.** `REQ-CONFIG-117` now
states that `terminal_stream_interval_ms` is a **ceiling on batching and not a fixed cadence**, and `REQ-TOOLS-126`
cites it rather than restating it. The strict fixed-period reading was not rulable: it makes `REQ-SHELL-166`, a
SHALL with a demonstration obligation against a real pseudo-terminal, unmeetable at `REQ-TOOLS-126`'s own default
and at every larger value in its range. **What the ruling changed is who holds the licence.** The first execution
armed the flush on the agent's own `is_input` call as well, on the reading that an agent's keystroke is "the same
as the user's"; the amendment states that it is not, because the licence exists for `REQ-SHELL-166`'s gesture
budget and an agent waits on the observation rather than on a painted frame. Output alone never arms. That closes
the transport pressure this register priced: the licence is 50 frames/s per stream, and spending it only where a
person is watching leaves a background session framing at the configured period — **ten frames a second at the
default rather than fifty** — so twenty background sessions offer 200 deliveries a second against
`REQ-MONITOR-306`'s 1,000 rather than consuming the whole aggregate. `REQ-TOOLS-126`'s new citation of
`REQ-MONITOR-306` also discharges the half of **ESC-22** domain 05 was recorded as owing. The falsified reading is
kept beside its replacement in ADR-0021 and in the code that held it.

**Historical question.** *(ADR-0021; changes what a configured key
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

*Executed three times (Parts AL, AL′, T″; 2026-09-09, 2026-09-11), and the reading now has a price on
both sides.* Echo under the ceiling-plus-flush reading, with the interval configured to 2,000 ms: framed in
**16.2 ms** (first execution), **15.0 / 15.2 ms** (its addendum) and **12.8 ms** (2026-09-11); key press to painted
frame through the real window, **12.4–25.0 ms** (second execution) and **6.8–21.2 ms** (2026-09-11). A strict
fixed-period reading makes the same keystroke wait up to the configured 2,000 ms. **The new figure is the cost of
the reading**, which ADR-0021's "One coupling to OQ-38" asked for and could not state: the ceiling-plus-flush
reading licenses 50 frames/s per stream, so at `REQ-TOOLS-108`'s shipped default of twenty background sessions
those streams **alone offer 1,000 deliveries a second — `REQ-MONITOR-306`'s entire aggregate** — where the
strict fixed-period reading at `REQ-TOOLS-126`'s own 100 ms default would offer 200. The two readings therefore
differ by a factor of five in transport pressure as well as by 2,000 ms in echo. **Still the owner's**; if the
fixed-period reading is intended, one of the two published 100 ms figures has to move, which is a product decision.

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

> **Reading taken on first execution, 2026-09-05 (Part S) — flagged for the owner, not resolved.** The child
> inherits the run host's environment **with the resolved map of `REQ-MCP-090` overlaid** (overlay, not
> replace): `REQ-MCP-087`'s "when the variable is unset, the key is omitted entirely" only makes sense as an
> overlay (an omitted key falls back to whatever the parent holds, or nothing), package runners need `PATH`,
> `HOME`/`APPDATA` and the `.cmd` wrap needs `ComSpec`, and the SDK's curated subset is a third behaviour the
> requirement never names. What is inherited is the run host's environment as it starts — no scrubbing is
> applied today (the ADR-0007/`REQ-GIT-031`-style name list is git's, not a general one; a general list would
> need the owner to say which names). Code: `resolveServerEnvironment` produces the overlay
> (`packages/config/src/mcp/environment.ts`), the run host hands the child `{ ...process.env, ...overlay }`
> through `OwnedStdioTransport`. The owner decides whether the parent environment should be scrubbed of
> named variables before the overlay and which; until then a secret in the run host's own environment reaches
> every stdio server.

**OQ-23 — What the reserved-token branch must do.** ***RESOLVED 2026-09-06 — the recommended reading, taken by
the first execution (Part T, ADR-0035's note; `spikes/code-intelligence-branch.md`).*** *(ADR-0035.)* `REQ-MCP-033`
describes the branch only as answering the protocol on standard streams, while `REQ-MCP-036` derives a command line
from the same entry and `REQ-MCP-099` runs it with three setup subcommands. **Recommended reading:** the branch is a
general pass-through and `REQ-MCP-033` describes what happens when the remaining arguments select the
server. If answered the other way, one of the two requirements must change.

> **Taken as the pass-through.** `apps/desktop/src/main/sentinel.ts` hands every remaining argument to the bundled
> runtime unchanged and propagates its exit status; `start-mcp-server …` makes it the server of `REQ-MCP-033`, and the
> three setup subcommands of `REQ-MCP-099` (`project create`, `project index`, `memories initialize`, each with the
> workspace root last) reach the runtime through the same branch — measured in the proof's setup launches (three
> `succeeded`, the marker written). Neither requirement changes. **One thing the entry did not anticipate:** Electron's
> binary on Windows exits before any JavaScript when a scheme-looking positional (the token's colon) is followed by
> another positional, so the launch is `Rotaris.exe builtin:code-intelligence -- …` — the token still first, `--` the
> branch's separator, dropped by it. Recorded in the spike and on ADR-0035.

**OQ-28 — What the two structural counts mean for a document-model interface.** ***RESOLVED 2026-09-02 —
the specification chose, and it chose reading 2 and then relaxed the requirement that reading breaks.***
*(ADR-0045, ADR-0051 consequence 3.)*

> **The live item this entry named — "the specification has not moved" — is discharged, and the sentence
> that carried it must not be cited.** It read: "`REQ-UIBENCH-050` still supports both readings in one
> paragraph and `REQ-UIBENCH-054` still states the invariant … while `resolutions/21` holds the drafted
> relaxation back." Both halves are now false. `REQ-UIBENCH-050` states in bold that **"The counting rule
> stated here is framework-neutral and is the operative one"**, spells reading 2 out — "a rendered
> paragraph, code block or list item inside a transcript row is a `widget`, and an element whose box is
> degenerate at the moment of counting is not" — and closes the escape route this entry identified as
> reading 1: the framework clause "explains only why absolute numbers do not travel between revisions or
> implementations; it does **not** license a product to count only the elements its own layout declares
> and to leave out what it drew." And `REQ-UIBENCH-054` carries the relaxation, in ESC-13's own terms:
> the element-count invariant is **withdrawn as unsatisfiable by any admissible implementation**, not
> merely as unmet, because the only structure that could hold it is a canvas and a canvas forfeits
> `REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065` and `REQ-SHELL-144`.
>
> **The measurement is what makes this a resolution rather than a preference, and it is preserved below
> rather than replaced by the conclusion.** Spike 1 established that the two readings diverge in a
> running window in every run, at the `construct_window` → `apply_fixture` boundary, by +147 or +85, and
> that under reading 2 the count is a property of where the reader is scrolled rather than of the
> transcript. That is the fact the requirement was amended against.
>
> **The cost ESC-13 accepted is unchanged and is not softened by the closure**: under the operative
> reading the product ships a benchmark whose headline structural invariant is gone, in a domain whose
> whole point is determinism. `REQ-UIBENCH-088` makes it informational either way. ADR-0045 stands.

*The question as it stood, and the two readings between which it could not choose, are kept below.*

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

**OQ-36 — CLOSED by accepted review, applied 2026-09-07.** REQ-TOOLS-086
cites REQ-SANDBOX-006's unbracketed IPv6 canonical form. Brackets belong to URL
authority serialization. The classifier handles bare IPv6 and DNS host/port
inputs; regression coverage verifies repeated normalization and matching.

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

**OQ-8 — At what granularity is the usage event emitted?** *(ADR-0009.)* `REQ-EVENTS-053` fixes only that
it must not be emitted with no figures and that it carries run-to-date cumulative totals.
`REQ-MONITOR-166` fixes a **sampling** cadence for the token-history sparkline, which is a different
thing. Whether a usage event accompanies every model turn, or follows the sample, or both, is unstated
and affects journal volume against `REQ-EVENTS-091`'s cap.

**OQ-9 — Decision closed, 2026-09-07.** REQ-TOOLS-111 now scopes cleanup
to terminal-tool process trees. REQ-HOOKS-033 retains its hook-descendant survival
exception. Hooks Settings discloses the distinction. Crash-path evidence remains
part of platform validation.

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

**OQ-11 — Resolved by dissolution.** See *Resolved, and closed with the reason* above, and **OQ-44**,
which the closure opened.

**OQ-12 — Durability semantics are unstated. *Materially moved by measurement, still open — and the fact
it partly rested on is false. A SECOND measurement on 2026-09-02 pulls the same way and RAISES the
stakes.*** *(ADR-0004, ADR-0058.)*

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

**OQ-18 — What "shipped model-capability metadata" is.** *(ADR-0028.)* *Part K (2026-09-05) ships the module EMPTY with a shape test: every discovered model exposes no reasoning levels until the owner decides the table's source and update policy; the slots grid keeps offering the five levels for a configured model.* `REQ-PROVIDER-137` and
`REQ-PROVIDER-149` both draw on metadata the product ships that knows, per model, whether a
reasoning-effort parameter is supported, which levels are disclaimed, and whether images are accepted.
Nothing states where it comes from, how it is keyed, or how it is updated. Treating it as build data
alongside the known-limits table is the obvious reading, but it is a **third table of third-party model
facts** and its update policy should be decided deliberately.

**OQ-19 — CLOSED by accepted review, applied 2026-09-07.** REQ-PROVIDER-018/063
and ADR-0029 now permit adjacent coordination locks. Completed operations remove
their own staging files and preserve overlapping operations' files. Enumeration
filters credential JSON. Regression coverage verifies a completed write beside
another operation's retained lock. The following paragraphs preserve the historical question.
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

**OQ-20 — CLOSED by accepted review, applied 2026-09-07.** REQ-PROVIDER-012/057
now explicitly preserve credentials and last-error state for REQ-PROVIDER-013's
pre-contact failure result. The unsupported-method implementation and regression
coverage follow that exception. The following text preserves the historical question.

**Historical OQ-20.** The 30-second
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

*Part AJ (2026-09-09), the first execution: unmeasured still, by design — wave 1 reports REQ-TRACE-104 rule 1 and 109/110 as `requires-parse` findings for the built-in convention and runs both checks fully for pattern-declared conventions. Spike 7's 1,000-file tree (`spikes/traceability-scale.md`) is the corpus for the measurement; the sweep itself is 244–391 ms, so the parse-requiring checks have about 600 ms of REQ-TRACE-088's budget if they are to share it, though no requirement says they must. AJ′ measures the TypeScript compiler API against it.*

*Part AJ′ (2026-09-10), the second execution: MEASURED, and the premise is falsified. The TypeScript compiler API (5.9.3) parses the spike's thousand-file tree in 202 ms warm and 255 ms cold, 0.202 ms a file, after a load of about half a second once per process. Inside a real sweep it never sees a thousand files: only those a pattern cannot decide are parsed, which was 200 files in 34 ms on the same tree. So a full syntax tree is NOT materially more expensive than a pattern pass at the stated scale, and `REQ-TRACE-104` rule 1 with `REQ-TRACE-109`/`110` fit inside `REQ-TRACE-088`'s one second beside the sweep rather than competing with it. What the entry asked for was a budget and what exists now is the cost; stating the budget is the owner's, and the open count is left untouched here for that reason. One residue is recorded rather than hidden: `typescript` is not a runtime dependency of the packaged desktop application, so in a packaged build both checks degrade to the `requires-parse` finding naming that cause (Part AJ′'s handoff, ruling request 2).*

*Part R″ (2026-09-11): closed, and the way it was measured is now honest.* Part AJ′ answered the
substance — the TypeScript compiler API decides `REQ-TRACE-104` rule 1 and `109`/`110` over spike 7's 1,000-file
tree in about 200 ms warm, after a one-time load of 0.3–0.6 s per service process. What wave 3 changed is the
assertion that guards it: the linear-growth ratio was a quotient of two single wall-clock readings, which is
load-sensitive by construction and had already gone red once at 3.06 against a 3.0 threshold. It is now the
quotient of the **minimum of three readings** on each side, with a **work-count ratio asserted unconditionally**
beside it and the timing ratio recorded rather than asserted below a 25 ms floor. **The threshold was not moved.**

**OQ-25 — Project-supplied regular expressions run unbounded.** *(ADR-0040.)* `REQ-TRACE-073` compiles
four patterns per project-declared convention and evaluates them against every claimed file;
`REQ-TRACE-154` states that the absence of any time or resource limit on the scan is "a deliberate
decision and not a gap", and `REQ-TRACE-225` places no wall-clock bound on the engine read. A pattern with
catastrophic backtracking therefore hangs the pass indefinitely, and the specification's own mitigations —
the board stays usable, the last good board stays on screen — cover the **symptom** but leave the pass
wedged. ADR-0002's worker-thread placement makes it terminable; **whether it should be terminated, and
what the user is told, is not specified.** The pattern arrives with a checked-out repository, not from the
user.

*Part AJ (2026-09-09), the first execution's decision: no bound on the pattern (REQ-TRACE-154/225 forbid one). The pass runs on a worker thread; a cancel raises a shared flag the pass observes at its next checkpoint, and a worker that has not answered 2 s after the cancel is terminated and respawned for the next job. Termination happens only on the user's cancel, never on the engine's initiative, and the user is told only "cancelled". Whether the engine should ever terminate on its own, and what it says when it does, stays open.*

*Part R″ (2026-09-11): the regex bound stands as Part AJ decided it. Recommended: close, with the
pattern-COST question — a catastrophic-backtracking guard — raised as its own item rather than carried here.*

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

**OQ-35 — Decision closed, 2026-09-07.** REQ-SANDBOX-079 now defines each
confined command as a fresh inner shell initialized from configured session
working directory/environment. Changes inside that invocation end with it.
Unconfined commands retain their persistent shell. REQ-TOOLS-123 cites that
lifetime, and tool help/observations must disclose the active mode.

**Historical question.** Foreground calls accumulate working directory,
exported variables and aliases in a persistent shell (`REQ-TOOLS-097`), but a confined command is rendered
as a nested shell invocation submitted into that shell (`REQ-SANDBOX-079`), so a directory change or an
export inside a confined command lives in the inner shell and dies with it. **Does shell state persist
across confined foreground calls?** The two requirements describe different behaviour for the unconfined
and confined modes and neither says so. This must be resolved before the terminal tool's description is
written, since the description is what tells the agent whether a directory change persists.

**OQ-37 — CLOSED by accepted review, applied 2026-09-07.** The fetch tool
uses explicit direct transport for every hop. Proxy environment variables,
system settings and global dispatchers have no effect. Tool help and failures
disclose this requirement. A local target/proxy regression verifies zero proxy
contacts for direct fetch and confirms the proxy receives the control request.
The following text preserves the historical question.

**Historical OQ-37.** Nothing says whether `fetch` honours system or
environment proxy settings. It matters: a proxy changes which host a connection is actually opened to, and
`REQ-SANDBOX-022` promises that a denied host observes zero connection attempts. The chosen client does
not honour proxy environment variables by default, which makes "no proxy" the de facto answer — the
fail-closed direction, but one that will surprise corporate users and **should be an explicit decision
rather than a library default**.

**OQ-39 — A presenter that is registered and never answers. *Premise stale on one side; the record's
answer is strengthened; the window is still unanchored. MEASURED 2026-09-02 AND EXPLICITLY NOT CLOSED.***
*(ADR-0019; not blocking. Constraints T-41, T-31.)*

***What spike 14 settled, and what it deliberately did not.*** `spikes/presenter-liveness-and-instance-claim.md`
**settled the mechanism**: a gap-based poll detected all nine blocked runs at **+386 to +468 ms** on a
500 ms threshold, with **zero false lapses in 258 s** of unblocked running and a maximum idle channel gap
of 303 ms. It also settled three things this entry did not ask. **(1) The check must be gap-based, not
reply-based** — while main was blocked the channel never closed, the process probed alive, every message
was accepted, and when the block ended **all 84 outstanding replies arrived**, the last at 7,885 ms round
trip, so a "did the reply arrive" check reports success eight seconds late and never fires. **(2) The
exposure is not the approval dialog**, which cost the poll nothing at a 266–267 ms maximum gap; it is
**every synchronous native dialog anywhere in the product**, during which no main-process JavaScript runs
at all — 0 timers, 0 handled renderer messages, 0 replies to the run host, over 6,489 ms and 7,339 ms.
That is now constraint **T-31**'s stated dependency and an application-wide prohibition in ADR-0019.
**(3) No platform signal for an unresponsive main is usable from the run host** — the operating-system
signals detect a busy loop and **never** a native modal, and reaching them from a Node utility process
needs a native addon and was not measured.

***What it did not settle is exactly the thing this question asks.*** **The window is still not sized.**
The spike's main process paints one heading: no renderer framework, no transcript pipeline, no session
writer, no workspace service, no version-control invocation. It does **not** reproduce the 22,777 ms of
event-loop lag `spikes/ipc-hop-latency.md` measured under frame load, which is the state the window has to
survive. **So the floor is narrower and it is still a floor.** ADR-0019's existing Revisit-if — that a
window which cannot be set wide enough turns this into an escalation — **stays live**, and the measurement
this entry needs is a liveness poll answered by a main process carrying product-shaped load.

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

***"What would close it" was wrong and is corrected, 2026-09-02.*** This entry named "a runtime API
exposing share-delete on open" as one of two closures. **That remedy does not exist because the problem
is not there.** `spikes/windows-writer-handle-compaction.md` §3.2 establishes the discriminator cleanly:
`fs.unlinkSync` and .NET `File.Delete` both **succeed** against a Node-held handle and both **fail**
against a .NET holder requesting only `FileShare.ReadWrite`, so the runtime's open **does** request
share-delete. What fails is `fs.renameSync`, which returned `EPERM` on every distinct open flag the
runtime exposes, and 20/20 even against a holder that explicitly permits delete. So the closer is a
**replace primitive**, not a share flag: `ReplaceFileW` succeeded 6/6 against a Node-held handle with no
torn or empty read, out of process at p50 767 ms and unmeasured in process. **The question is therefore
"who owns a native replace primitive", not "is a share flag available"** — and it is available at a
measured price rather than unavailable. ADR-0040 additionally declines to inherit the spike's own
verdict across domains: the spike prices the 767 ms spawn out of a *compaction* path, correctly, but
`REQ-TRACE-509` is a deliberate user action already spending about a second parsing the store under
`REQ-TRACE-501` and replacing at most five small files, and a second on the failure path of a user-asked
action is a different trade from a second on a per-event path. A reader may disagree; the reasoning is
on the page rather than folded into the conclusion.

*The other closure is unchanged:* `REQ-TRACE-061` gaining a bounded ladder. `REQ-TRACE-502` should also
be amended to say what "concurrent invocations" now means, since the only concurrency left is in-process
work plus `REQ-TRACE-182`'s test session — and `REQ-TRACE-182` itself presupposes an invocable toolchain
the product no longer has, which is its own amendment. C-11 records the narrowing and the residual
conflict, now **split into its two halves with their two owners**, and does **not** report the property
satisfied.

*Part AJ (2026-09-09) measured one replace: every regeneration and baseline update in the proof replaced its files at attempt 1 through REQ-TRACE-061's ladder (5 attempts, 0.05/0.1/0.2/0.4 s), with the writer the workspace service's owner thread and no reader in the product holding a descriptor. The contended case — a test session in the same checkout on Windows — was not staged and the residue stands as ADR-0040 specific 6 records it.*

*Part R″ (2026-09-11): still unstaged, and now one concurrent launch away rather than hypothetical.* The
board's `end-to-end` path writes into the requirement source THROUGH the workspace service while the engine holds
the same store open. Recommended: keep open, and name `requirements-proof`'s `end-to-end` profile as the place to
stage it. It is also why `REQ-TRACE-513`'s replacement ladder is listed as met in part in lane R's closing
statement.

**OQ-42 — CLOSED as a policy decision, 2026-09-06; implementation evidence updated 2026-09-07.**

Accepted review OQ-42 chooses controlled cancellation of affected runs, store-wide
admission closure, and a frozen durable transcript. Separate in-memory notices
identify the failure, last durable event ordinal and recovery instructions.
Terminal persistence failure produces an explicitly unconfirmed caller outcome.
Explicit reopening waits for cancellation and performs a rolled-back write probe
before admitting execution. Failed probes preserve quarantine. The engine's
shared-store and projection-failure regressions cover these paths; desktop
presentation verification remains tracked in the root resolution progress ledger.
The following text preserves the historical question and its former interim policy.

**Historical OQ-42 — After a sticky mid-run store failure, may publication continue unanchored? *Narrowed on one
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

**OQ-43 — Does the single-instance gate admit a benchmark iteration? *Unchanged in substance; the gate it
asks about is now OURS rather than the platform's (2026-09-02).*** *(ADR-0042, ADR-0053, ADR-0055;
constraints P-16, P-17, W-14.)*

***What changed and what did not.*** ADR-0055's claim moved from the platform's single-instance primitive
to our own record file, **on measurement** — the primitive blocked 20.0 s against `REQ-STARTUP-164`'s 5 s
interval, performed no reclaim, and dropped the hand-over (constraint P-16). **That makes the sentinel
branch entirely ours to define and the composition easier to state**, because the admission rule is now a
line in our own claim rather than a behaviour of a component we do not control. **It does not touch the
requirement-level ambiguity this question records**, which is the whole of the question: nothing in
`REQ-UIBENCH-037` to `REQ-UIBENCH-039` or in `REQ-STARTUP-161` says how the two compose, and W-14's marker
remains architecture-invented on a specification silence. ADR-0055 still cites this question for three
cases — the bundled code-intelligence server, the benchmark iteration child, and the update-restart
successor. `REQ-UIBENCH-037` to `REQ-UIBENCH-039` make a benchmark iteration a fresh
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

**OQ-44 — `REQ-TRACE-061` faces the one case a ladder is for, in the one domain that has none. *RESOLVED
2026-09-02 by amendment, at BOTH sites, in the platform-defect round.*** *(ADR-0004, ADR-0040; constraints
D-25, C-11, D-06. Successor to OQ-11 and to OQ-41's residue.)*

***The answer, and it is the one this entry asked for rather than a borrowing.*** `REQ-TRACE-061` **now
states a ladder of its own**: at most five attempts in total, delays of **0.05 / 0.1 / 0.2 / 0.4 s** before
the four retries, the last attempt beginning no more than **0.75 s** after the first, an attempt that
succeeds reporting nothing, and no attempt leaving a temporary artifact behind. It declares itself **the
only replacement ladder its domain states** and covers every whole-file replacement the domain performs —
the generated artifact, the three baselines of `REQ-TRACE-126`, the retired-identifier log of
`REQ-TRACE-137`, and the destination an export of `REQ-TRACE-514` writes to. Its constants are **this
domain's own and were deliberately not borrowed** from `REQ-SESSION-033`, which the entry below insisted
on; both requirements now say so in terms and neither may be cited in place of the other.

***The clause that makes it close the measured case rather than half of it.*** The retry **MUST NOT be
conditioned on this application being able to attribute the failure to another process holding the
target.** The measured 6.2 % first-attempt failure occurred **with no other opener present at all**, and a
build that retries only where it can identify a foreign handle absorbs none of it and does not satisfy the
requirement. That sentence is the difference between a ladder and a ladder that works, and it is the one an
implementer would otherwise have supplied from the wrong intuition.

***The second site is closed too, and by two requirements rather than one.*** `REQ-LIBRARY-176` **cites**
`REQ-TRACE-061`'s ladder rather than stating a third. And a hole this entry did not see was closed with it:
a ladder for a *replacement* hangs on there being a replacement, so `REQ-EVENTS-145`'s one-step-visibility
obligation was made the product's single statement of what an export write owes a user-chosen destination —
without it a build could truncate and write in place, never perform a replacement, satisfy every word of
the ladder, and still destroy a user's previous export. `REQ-SESSION-189` and `REQ-SESSION-199` cite it.

***What is NOT closed, stated so it is not absorbed:*** the three export destinations domain 20 itself
governs now carry the one-step obligation and **no ladder**, and whether that document should cite
`REQ-TRACE-061` or state its own is recorded as unsettled in
[`../spec/resolutions/20-event-history-replay-export.md`](../spec/resolutions/20-event-history-replay-export.md).
It is a narrower residue than this question, on the same shape, and minting a competing ladder owner would
be the wrong answer to it. **OQ-41's half (a) is also untouched** — a test session in the same checkout is a
`REQ-TRACE-502` conformance gap, not a ladder problem.

**The entry as it stood is kept below**, because it was right about what was owed and its measurement is
what the amendment was made against.

***The measurement, and why it changes what kind of question this is.*** This entry, and ADR-0004, and the
writer-handle report all derive the ladder from **local reader contention** — a foreign handle held for a
moment, rare, absorbed by belt and braces. `spikes/remote-and-synchronised-storage.md` §8 measured the same
call on ordinary shared storage and found it failing at **6.2 % — 37 of 600 first attempts — WITH NO OTHER
OPENER PRESENT AT ALL**, against **0 of 300** locally. So the ladder is not a defence against a rare case;
on the storage this requirement's artifacts actually live on, **it is the normal path for roughly one
document write in sixteen**, and its cause is not the one `REQ-SESSION-033` names. **The requirement's
failure policy is *re-raised*, so today that is a user-initiated regeneration failing for a reason the
user cannot act on, at that rate, on the platform the product mandates.**

***The measurement fixes the shape of the answer without supplying its numbers*** — the existing ladder
absorbed every failure, 29 of 30 on the second attempt and all 30 within two extra attempts, 0 of 600 gave
up — so what is owed is a requirement, not a research question. **Two qualifications this entry must
carry.** Every remote figure came from one client talking to a server on the same machine over loopback:
no latency, no packet loss, no reconnection, and an unknown protocol dialect, so **6.2 % is a floor**. And
the inversion is worth stating: the one target that **has** a ladder (`summary.md`) moved to machine-local
storage under ESC-15 and no longer needs it for this reason, while the targets that have **none** are
exactly the ones `REQ-SESSION-198` deliberately leaves on whatever storage the user chose.

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

***Widened 2026-09-02: the same gap now has a second site, and it is the one where a foreign handle is
likeliest of anywhere in the product.*** `REQ-SESSION-189`'s trajectory export, `REQ-SESSION-199`'s four
record exports, `REQ-LIBRARY-176`'s and `REQ-TRACE-514`'s new ones, and `REQ-EVENTS-145`'s trajectory
document all write to **a destination the user chooses through the platform's save dialog** — which over
an existing file is a whole-file replace in place, at a path the product does not own and may be on
removable media, a network share or a synchronised folder. `REQ-SESSION-033` scopes its ladder to "where
this domain replaces a whole file in place", names `summary.md` as "the one written **repeatedly**"
rather than as the only one, and then closes by declaring itself "the only replacement ladder this domain
states". **The text supports both readings and they differ in what a user observes** — a failed export
against a held file, or a successful one a second later. `REQ-EVENTS-145` states no ladder for the
trajectory document either. ADR-0004 consequence 9 records this as a specification question and does not
choose. *Same gap, two sites, and the second one is on a user-initiated action rather than a background
one.*

***A third closure now exists that this entry did not carry.*** OQ-41's correction applies here too: a
native replace primitive (`ReplaceFileW`, measured succeeding against a held reader) removes the need for
a ladder on the traceability path entirely, at a cost that is measured out of process and unmeasured in
process. That is a decision about who owns a native addon, not about constants.

**OQ-45 — Decision closed, 2026-09-11: ADR-0061 owns the store.** This entry had stopped being a question for the
owner when ESC-30 was ruled and applied on 2026-09-02; what remained was a record nobody had written, and
**ADR-0061 — The improvement artifact store's write path** is now it. It takes the second of the two horns this
entry names: the version write stays **outside** the artifact write's all-or-nothing boundary, as `REQ-LIBRARY-047`
requires, and the store carries a count of versions *allocated* as against retained so the export can tell a
version that was never recorded from one retention pruned. The first horn — bringing the version write inside the
transaction — is refused for the reason this entry gives: it would let a failed version write undo the review
decision it was recording, which is worse for a user than an imprecise export. Constraint **W-26** is satisfied by
the same counter shape ADR-0041 already obliges for transitions, and **ESC-3's ruling has an architectural home**
again. ADR-0041's scope note is amended to point at it.

**Historical question.** *Its product half was ESC-30, which is now RULED AND
APPLIED (2026-09-02); the storage half stays here and is what remains open.*** *(ADR-0003, ADR-0004, ADR-0041; ESC-3, ESC-18,
ESC-30; constraint C-10.)*

***What moved.*** `REQ-LIBRARY-052` now obliges the store to state how many versions pruning dropped and
`REQ-LIBRARY-176` forbids the export implying that figure accounts for every absence — so the *falsehood*
this entry produced is fixed. **What is not fixed and is not this register's to fix** is whether the
export must distinguish a version absent because `REQ-LIBRARY-047`'s best-effort write never recorded it
from one retention pruned: that was **ESC-30**, raised rather than taken, because bringing version
recording inside the write's all-or-nothing boundary makes the audit trail complete at the cost of review
actions failing in a workspace whose version store is unwritable. ***ESC-30 has since been RULED — make them
distinguishable — and applied on 2026-09-02***, and the ruling took neither horn whole: `REQ-LIBRARY-047`
records **inside** its all-or-nothing operation that a version was *due*, so a version the best-effort write
then failed to record is afterwards known to be absent and countable, while version recording itself stays
best-effort and a version that cannot be recorded still does not undo the artifact write; `REQ-LIBRARY-176`
then carries **two separate figures** per artifact. **The part that stays open here is the one nobody owns
either way, and it is now narrower rather than gone**: the write path that would maintain a count of versions *allocated* as
against retained (constraint W-26). ADR-0041 takes the export and names the fix; no record owns the write.
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

***Narrowed again, and sharpened, 2026-09-02.*** *Narrowed:* ADR-0041 now takes the improvement store's
**export** and only the export, because `REQ-LIBRARY-176` and `REQ-TRACE-514` were minted by one ruling
over one guarantee and splitting them across two records would produce a second, divergent
implementation of it by accident. That is stated as a scope note in ADR-0041's header rather than as an
adoption of the store, and the **write path is still the orphan**. *Sharpened, and this is the part that
makes the entry more owed rather than less:* ESC-18 removed ESC-3's ruling, so this entry can read as
having decayed into nothing. It has not. `REQ-LIBRARY-047`'s best-effort version write was **untouched by
that amendment**, and it now interacts with a requirement that did not exist when this question was
filed. `REQ-LIBRARY-176` requires the export to state where retention "has dropped intermediate versions
… and how many". Under `REQ-LIBRARY-047` a version can be absent because it was **never recorded** —
"when the artifact is stored but its version cannot be, the save MUST still report success … and the
failure MUST appear only in the application log" — and nothing in the corpus requires the store to retain
enough to tell that apart from a `REQ-LIBRARY-052` prune. The two mean different things to a user: one is
the product working as specified, the other is data they were told about only in a log.

**The resolution is a choice between two things and both belong to whoever takes this store**: bring the
version write inside the transaction, which `REQ-LIBRARY-047` currently forbids and which would make a
failed version undo the review decision it recorded; or keep it outside and give the store a count of
versions **allocated** as well as retained, so the export can distinguish the two causes. The second
costs nothing if it is taken alongside ADR-0041's transitions-ever-recorded counter, which is the same
shape of obligation for the same reason (constraints C-10, W-26). **Someone should own this store before
it is discovered from a user's export.**

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

**OQ-47 — Two concurrently open workspaces presenting one identifier. *NOT closed by ESC-26, and ADR-0058
now says so explicitly (2026-09-02).*** *(ADR-0058, ADR-0002; constraints W-19, W-01, W-27.)*

***Read this before assuming ESC-26 covered it.*** ESC-26 granted `REQ-SESSION-197` one exception and the
amendment has landed — but it is **confined to `REQ-SESSION-201`'s restore action** and the requirement
names, one by one, the paths that do *not* gain it. **A user who copies a workspace folder and wants the
copy to have an identity of its own still has no product action**, so this entry's first two paragraphs —
the concurrent two-copies-one-identifier behaviour, and the absence of any remedy for a copied folder or a
corrupt identifier file — **stay open exactly as they were**. What ESC-26 removed is only the *other*
route to the same dead end, the clone-then-restore recovery, which this entry's own text cited as evidence
that reaching one dead end twice by two independent routes was significant. **One of the two routes is now
closed and the other is not, which is a narrowing rather than a resolution.** *Related but distinct:* the
**store**-side hazard of one identifier reached two ways is now constraint **W-27** and is a correctness
rule with a measured, silent failure mode; this entry remains about the *workspace* side, where the hazard
is a resume in one window starting an agent that writes into the folder the user does not have open. `REQ-SESSION-197` fixes that a **copied** folder carries the
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

***That dead end is now reached by a second, independent route, and the coincidence is evidence
(2026-09-02).*** `REQ-SESSION-201`'s restore hits it from the opposite direction: a user who clones their
repository on a new machine, opens it once — which mints an identifier — and *then* restores their
backup has an artifact naming one identifier and a workspace carrying another, and the product may not
touch either. That is the common shape of disaster recovery, and its only remedy is the same hand edit.
Two independent routes to one hand edit is a stronger case for a narrow, explicit, user-confirmed
exception than either route alone. **It is escalated as ESC-26 and is not decided here.**

***The third paragraph of this entry is DISCHARGED, 2026-09-02, and is preserved as the mistake it was.***
It read: "**And two records disagree about what identifies a workspace.** ADR-0002 keys the workspace
service by **resolved path**; ADR-0058 keys the store claim by **identifier**. That is the minimum
consistent arrangement and not a settled one." **The framing was wrong and must not be cited.** The two
records key two *different objects*, and the specification fixes both keys separately and in terms —
`REQ-STARTUP-041`(a), `REQ-STARTUP-163`, `REQ-STARTUP-047`/`048` and `REQ-STARTUP-166` all key the open
workspace by its **resolved directory**, while `REQ-SESSION-001`, `REQ-SESSION-197`, `REQ-SESSION-198`
and `REQ-LIBRARY-042` all key the durable store by the **identifier**, and `REQ-SESSION-001` composes
both in one sentence. Neither collapse is available: keying the service by identifier gives one service
two roots, and every job it does — configuration against one `.rotaris/`, Git in one checkout, worktrees
under one root, `REQ-TRACE-073`'s scan over one repository, the delivery store against one set of
requirement documents — is directory-scoped; keying the store by path is the field's filed, painful,
most-complained-of defect (ESC-19's survey: one report of 63 sessions lost across 10 projects after a
reorganisation, and even a change of a folder name's *case* orphaning everything). ADR-0002 holds the
argument and constraint W-19 carries it. **The first two paragraphs of this entry are untouched and stay
open.**

**OQ-48 — Reclaiming a machine-local store whose workspace no longer exists. *MORE owed after ESC-26, and
the surface changes purpose (2026-09-02).*** *(ADR-0058; constraints W-17, W-22, W-24.)*

***ESC-26 adds a third producer and a third shape of leftover.*** A confirmed identifier establishment
leaves the **old** identifier's store intact and merely unreferenced — that is one of the five conditions
the exception is bound by, and it is what makes a one-way-looking operation safe to confirm. So there are
now three sources of a store nothing points at: the corruption ladder displaces a damaged store and keeps
it (W-17), a restore displaces the store it replaces and keeps it (W-24), and a confirmed establishment
orphans the workspace's previous one. **The surface's purpose changes with it.** It was the route to
*clearing* a store a user does not want; it is now also **the only route back to a store a user may well
want**, because after a confirmed establishment the previous history is reachable by nothing else in the
product. That makes "offer the exports first" a stronger obligation rather than a courtesy, and it makes
the absence of the surface a larger gap than it was. `REQ-SESSION-166` deletes one session. ESC-15 moved every session's
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

***Unchanged in substance and MORE owed, 2026-09-02.*** The surface still does not exist, and ESC-19 has
added a second and a third source of stores nothing points at: **a restore displaces the store it
replaces** and keeps it under a UTC-timestamped name rather than deleting it (constraint W-24), and the
corruption ladder displaces a damaged one (W-17). Both are deliberate and both are right — the user is
mid-recovery in each case and a deleted store is history that existed nowhere else. But it means **the
two operations a user in trouble is most likely to reach for are the two that produce leftovers only this
surface can clear**, and it is the one surface the record assumes and nothing owns.

***MEASURED 2026-09-02, and the count of leftover kinds went from three to FIVE while the consequence
that tracks them was not updated.*** `spikes/backup-restore-mechanism.md` ran the restore and left two
kinds of leftover nobody has named. **(4) The staging directory.** In every measured failure — 30 of 30 on
the record's literal reading, 30 of 30 with a file manager holding the store's own directory, 30 of 30 at
second-granularity stamp collision, and the timeout case — a **full copy of the artifact's store** was left
at `<identifier>.restoring-<n>`. ADR-0058's layout block calls it "transient" and **no step deletes it**. It
is the size of the store. **(5) The obstruction aside-name.** The corrected reversal is displace-then-rename
and its displace step renames an occupying `<identifier>` aside to `<identifier>.obstruction-<stamp>`, which
is kept and never deleted on the same reclamation argument as everything else here. **Neither is enumerated
in ADR-0058 consequence 5, which is the consequence that tracks them**, and both are inside this question's
surface rather than beside it. *The register's observation, which is the reason this is written here rather
than left to the ADR:* every mechanism this record has added that displaces something has added a leftover
kind, none has added a way to reclaim one, and the surface that would clear all five still exists nowhere.
**Whoever owns ADR-0058 consequence 5 should be told, and this question is now owed five shapes rather than
three.**

**OQ-49 — What makes two directory strings the same directory. *RESOLVED 2026-09-02 by amendment.***
*(ADR-0002; constraint W-25, and now constraint W-27 for the store side.)* `REQ-STARTUP-163` **now owns
this**: what is resolved, what is deliberately not reconciled, and the bounded cost of not reconciling it,
plus two additions ADR-0002 did not state — a trailing separator carries no meaning, and abbreviated
alternate spellings the filesystem itself resolves are resolved. It states in terms that it is **not** the
definition of workspace identity, which is `REQ-SESSION-197`'s and is never derived from a path.
**ADR-0002 should now cite rather than decide, and W-25 moves from a ruling to a requirement citation.**
***One thing this closure does NOT cover, and a reader will assume it does.*** The requirement settles
which *window* a launch reaches. It says nothing about the **store**, where the same hazard is a
correctness failure rather than a usability one: two spellings of one store path were measured losing up
to 95 % of committed rows with both writers reporting success and a clean integrity check. That is
constraint **W-27** — one store, one canonical spelling, resolved once — and it is architecture's, not the
specification's. The original entry follows. `REQ-STARTUP-163` decides window reuse on whether "a main window of that instance already has
that directory open" and `REQ-STARTUP-041`(a) requires the directory "resolved and persisted as the
remembered workspace". **Neither fixes what makes two directory strings the same directory.** Symlinks,
junctions, filesystem case sensitivity and UNC against mapped-drive spellings all bear on it, and the
answer is user-visible: it decides whether a launch surfaces the window the user already has or builds a
second one on the same folder.

**ADR-0002 has decided it, because the workspace service needed a key**, and the decision is filed here
rather than presented as settled. Absolute and normalised; symlinks and junctions resolved to the real
path; compared case-insensitively where the filesystem is; and **not** reconciled across UNC against
mapped-drive spellings, because there is no reliable cross-platform way to do that and a wrong answer
merges two workspaces silently — which is a worse failure than declining to merge them.

**This is low-stakes and is filed anyway, and the reason is the shape rather than the size.** Where two
spellings fail to canonicalise the outcome is bounded: two workspace services, one identifier, and
ADR-0058's per-instance claim gives the store to the first, which is W-19's stated behaviour rather than
a new one. But it is user-observable behaviour invented on a specification silence, which is exactly the
class this register exists to keep visible, and a requirement would supersede it at no cost.

---

**OQ-50 — Validation by discovery proves nothing against a public catalog.** *(ADR-0030; raised by the slice's
first execution, 2026-09-05.)* `REQ-PROVIDER-133` holds that a key-based provider's credential is persisted only
after successful discovery, "so a bad key is never stored silently", and `REQ-PROVIDER-052/054/108` make discovery
the validation. OpenRouter's `/models` answers **without** any key, so a value of another vendor's shape was
discovered against, stored as authenticated, and refused at the first model call. The requirement's guarantee
rests on a property of the endpoint it does not state. The build now repeats the catalog request without the key
after a successful discovery and, where that also succeeds, completes the sign-in but says the key could not be
validated and leaves the provider's health unchecked. What the specification should decide: whether an
OpenAI-compatible instance's validation may issue a minimal paid request (the only authenticated call every such
endpoint has), whether a public catalog is a warning or a refusal, and where the statement lives.

**OQ-51 — Does an UNSCOPED queued prompt still exist?** *(No ADR; raised against `REQ-CHAT-039` by the composer's
first execution, Part AB, 2026-09-07.)* `REQ-CHAT-038` gives a queued prompt "a session ownership field (empty =
unscoped)" and `REQ-CHAT-039` gives an unscoped prompt a behaviour of its own: it "MUST be consumable by any run
but invisible to session-scoped listings". **Two things in the record now disagree with that sentence.**

1. **The store cannot represent one, and has not been able to since v6.** `queued_prompts.session_id` is
   `TEXT NOT NULL REFERENCES sessions(session_id)` (`store/src/schema.ts`, the v6 migration), so every queued
   prompt is scoped by construction. Nothing has ever written an unscoped one and no route offers to.
2. **`REQ-CHAT-041` was amended on 2026-09-07 and 039 was not amended with it.** The amendment
   (`docs/spec/resolutions/2026-09-06-accepted-review.md`, OQ-1/7/9/16/35) replaced "every window and every run
   sharing the same process" with "eligible windows and runs for the **same session ID** across its processes",
   and added "one authoritative service owns the queue and atomic queued-to-triggered transitions". Its own
   summary line reads "REQ-CHAT-041 assigns **one session-scoped queue** to the application instance." A queue
   that is session-scoped per instance has no place to put a prompt belonging to no session; but 039 still says
   one exists, and a requirement is not amended by another requirement's summary.

**What the owner should decide.** Either (a) an unscoped prompt is withdrawn — 039's second sentence goes, 038's
"empty = unscoped" becomes "always scoped", and the schema is already right; or (b) it survives, in which case
`REQ-CHAT-041`'s "same session ID" needs a carve-out saying which runs may consume a prompt belonging to no
session, `REQ-CHAT-036`'s panel needs a rule for a prompt it must not show but a run may consume, and the store
needs a nullable owner and a second visibility path.

**What Part AB built, and what it did not.** The **scoped** half is built and measured — ownership comes from the
session the prompt was submitted to (the control channel's addressing IS the explicit session id) or from a
`session_id` key in the context snapshot, which v13 now stores; a snapshot naming another session is refused
rather than silently re-scoped; ownership is the primary key's first column, so edit and trigger cannot move it;
and `pnpm composer-proof` measures REQ-CHAT-038's exactly-once transition under two callers on two connections.
The **unscoped** half is not implemented in either reading. `resolveQueueOwnership` returns an explicit
`unscoped` verdict that every route refuses, naming this question, so a future route meets a stated refusal
rather than a foreign-key error.

**OQ-52 — May a delegated child ask the user a structured question?** *(No ADR; raised against `REQ-TOOLS-002` by
structured questions' first execution, Part AC, 2026-09-07, and entered here by the manager — Part AC recorded it
in `children/personas.ts` and ADR-0016's note but not in this register, which is where a question has to be to be
answered.)*

The mechanism supports it: the wait registry is per tool port, and a port is one conversation, so a child could
hold its own pending prompt without disturbing the run's. Two things stop it being a decision the implementation
may take. **No requirement says which personas may ask** — `ask_questions` is declared by the orchestrator alone
in this build, and that was chosen to satisfy REQ-CHAT-094's one-pending-prompt-per-conversation rule rather than
because a requirement named the orchestrator. And **REQ-CHAT-051 defines ONE question trailer**: "a single question
row" attributed to the agent that asked. Two children asking at once has no defined presentation, and inventing a
second trailer would extend a vocabulary REQ-CHAT-046 closes.

Until it is answered the tool stays on the orchestrator, which is the narrow reading and refuses nothing a
requirement grants.

**OQ-53 — Which event reports a compression, given a closed catalogue?** *(No ADR beyond ADR-0060, which ships an
interim; raised against `REQ-CONFIG-135` by context compression's first execution, Part AH, 2026-09-08.)*

`REQ-CONFIG-135` says that whenever a compression trigger is resolved, the four inputs that produced it and the
resulting token number are surfaced "in exactly two places", the first being: "emitted on the session's event
stream as part of **the event that reports the compression**, carrying the four inputs and the resulting token
number as **separate machine-readable fields** so a consumer never has to parse a sentence". The second is the
transcript entry's reason line, rendered from those fields, and the same figures go to the per-session debug log.

**There is no such event.** `REQ-EVENTS-041` closes the published catalogue at exactly 23 types and none of them
reports a compression; `REQ-EVENTS-017` requires every event to carry an `event` value drawn from that catalogue,
so no new kind may be added without amending it. The requirement names a venue the product has no way to reach.

Two readings, and they differ in what a consumer of the recorded stream sees. Either **"the session's event
stream" means the timeline**, and the interim below already satisfies the requirement — this is the reading Part Q
took for `model_exhausted` and `model_override`, which are recorded facts the closed catalogue also has no kind
for. Or **`REQ-EVENTS-041` is to be amended with a compression event**, in which case the catalogue's count and
`REQ-EVENTS-017`'s payload table both change and an external consumer gains a type it must decode.

Shipped meanwhile (ADR-0060 decision 7): a `context_compressed` **timeline entry** carrying `threshold_percentage`,
`capacity`, `advertised_input_limit`, `default_threshold` and `trigger_tokens` as separate metadata fields beside
`trigger`, `count_source`, `counted_tokens`, `before_tokens`, `after_tokens`, `before_messages`, `after_messages`
and `latency_ms`; one `system` transcript row rendered from those fields; and the log line. What the requirement
asks to be carried is carried, in a venue it did not name. If the second reading is ruled, the entry stays and an
event joins it — the interim is not repaired quietly.

**OQ-54 — The user-terminal audit entry's `decision` and `source` fall outside the closed permission vocabularies.** *(spec 12 Data & Formats, "Permission audit entries for user terminal actions"; REQ-TOOLS-012/028. Raised by the terminal stream's first execution, Part AL, 2026-09-09.)*

REQ-SHELL-107 says a user's terminal action is written to the permission audit with `decision: user-input`, `source: user`. `DECISIONS` is the closed set `{allow, ask, deny}` (REQ-TOOLS-012) and `DECISION_SOURCES` the closed twelve (REQ-TOOLS-028); neither holds `user-input` or `user`. Part AL writes the entry as spec 12 words it (the writer takes the strings), so a decision-log reader that enumerates the closed vocabularies will not recognise it. Whether spec 12 mints two new members, or the audit entry is a different record from a permission decision, is the owner's call. Recorded, written as spec 12 says, not resolved.

**OQ-55 — Decision closed, 2026-09-11.** `REQ-CONFIG-116` gives the key a range of **1–64**. The figure is
`REQ-TRACE-481`'s ceiling taken with its reason — an input needs some upper bound, and a figure no machine could
actually service is of no use to anyone — rather than a fresh invention. A value outside the range is rejected at
load and on assignment (`REQ-CONFIG-111`), never clamped; `REQ-TOOLS-108` keeps the effective limit and the message
on reaching it. With the ceiling in place the staleness law Part T″ measured has both of its terms: at the maximum,
`(20 agents + 64) × windows` stays under the thousand-stream crossing for any window count a user can produce, so
the worst case a **configuration** can reach is the flat regime bounded by the drain's own one-second period rather
than the `streams × windows ÷ 1,000` seconds that applies above it. **ADR-0021's "The cap is load-bearing"
obligation 2 is discharged by this**, and says so in place.

**OQ-56 — The adopted `--rt-text-disabled` misses `REQ-SHELL-145`'s 3:1 floor on every surface but the page ground.** *(`docs/design/README.md` §5 item 1, which named this token as the one specifically at risk; REQ-SHELL-145, REQ-SHELL-160 (a). Raised 2026-09-12, when `pnpm theme-proof` settled that acceptance item from rendered pixels for the first time.)*

`docs/design/system/tokens/colors.css` sets `--rt-text-disabled` to `oklch(52% 0 0)` and `packages/contracts/src/theme/themes.ts`
transcribes it without drift, which a test pins by name. Against the default palette's own surfaces that value clears
**3.22:1 on `--rt-bg`, 3.07:1 on `--rt-chrome`, 2.90:1 on `--rt-surface`, 2.56:1 on `--rt-surface-2` and 2.48:1 on
`--rt-hover`** — and REQ-SHELL-145 requires 3:1 **on every background the token is actually painted on**. The rendered
proof measures **2.898:1** on a card for "Cancel selection" (`disabled`) and for Mission's "Pause" (`aria-disabled`,
which wears the same colour) at 100 %, 125 %, 150 % and 200 %; `nocturne` (60%) and `high-contrast` (62%) clear every
surface and are not affected. **At 175 % the same pair measures 3.030:1 and passes** — one scale's device-pixel
rounding is the entire distance to the floor, which is the strongest argument that the value was never measured rather
than deliberately chosen. The matrix was run twice and both passes name the same strings, the same ratio and the same
four scale points. The static check in `static-contrast.ts` passed because it tests the ground alone, which is
**REQ-SHELL-160 (a)'s own sentence** — "a token pair that computes correctly but paints over a different surface fails".

**Two resolutions, and both belong to the owner.** Either the adopted token rises — `oklch(58% 0 0)` clears 3.18:1 at
the dimmest surface and stays at 4.14:1 on the ground, comfortably under half the enabled 14.86:1 the same requirement
caps it by, and leaves the default still dimmer than the other two themes — or REQ-SHELL-145's floor is amended to name
the ground it is measured against. **An agent may not choose between them**: the first changes approved design material
and the second changes an approved requirement. Until it is answered, `pnpm theme-proof`'s `contrast` section is red on
`rotaris-dim` at every scale **and on nothing else**, the two tests that pin the shortfall keep it from being lost, and
the narrow static check stays narrow so the conflict cannot be mistaken for an ordinary test failure.

**Historical question.** *(ADR-0021 "The cap is load-bearing", obligation 2; REQ-TOOLS-108; REQ-CONFIG-116. Raised by Part AL, 2026-09-09, on wiring the key into the terminal manager — defect fifty-two found it registered, validated and read by nothing.)*

The key is registered with default 20 and minimum 1. Each background session publishes its own `bg:<id>` stream at up to 50 frames/s (the 20 ms floor), so the produced aggregate is `(agents + background sessions) × 50 frames/s`, and only one of those two factors — agents, REQ-MONITOR-285's 20 — has a ceiling. Part AL reads the key into the manager and caps the *delivered* rate per window at 1,000 frames/s by merging (REQ-MONITOR-306, REQ-SHELL-103), so a user who configures 400 background sessions saturates the run-host → main pipe, not a renderer. A stated maximum on the key would let the produced rate be computed rather than absorbed. The owner's call; recorded, not resolved.

## Design-reference dependencies

The approved visual design reference was **not available** to the architects who produced the slice
proposals. Every proposal is therefore about *mechanism* — where state lives, what crosses a process
boundary, what paints a row, what a preference is written to. No mechanism above depends on the
reference, but **no screen can be built without it.**

> **Disposition, 2026-09-02 (owner ruling GD-1).** Both halves of that sentence are acted on rather than
> only the convenient one. The reference is **not a condition of the Architecture Gate**, because the gate
> is about mechanism and the independence stated above was established by the architects rather than
> assumed. It **is** a condition on building any screen, and that is recorded as IC-2 in
> `implementation-conditions.md` so it binds something rather than lapsing into nobody's. OQ-30 and the
> three items below it stay open and stay the reference's. OQ-31 was removed from this list and ruled
> without the reference; see its entry.

*Priced by Part T″, 2026-09-11 (`pnpm terminal-stream-proof`, the `obligation2` ladder).* At the licensed
rate of 50 frames/s per stream, with the delivered rate capped at `REQ-MONITOR-306`'s 1,000/s by merging: **twenty
background sessions alone offer exactly 1,000 deliveries a second, the whole aggregate**, before one of
`REQ-MONITOR-285`'s twenty agent streams is counted; the shipped ~40 offer 2,000/s and merge 2,960 frames over
three seconds; 400 streams offer 20,000/s, 1,000 streams 50,000/s, 3,000 streams 150,000/s. **Nothing is dropped at
any count** — the cap merges, as `REQ-SHELL-103` requires — so what the count buys is staleness, and the
staleness has a law: while `streams × windows ≤ 1,000` it is bounded by the drain's own one-second period (at
most 1,000 ms, about 500 ms in the median, whatever the count), and above that it is
`streams × windows ÷ 1,000` seconds (three thousand streams measured 3,000 ms worst and 1,500 ms median).
**So a stated maximum M would let the worst-case surface staleness be computed rather than absorbed:
`(agents + M) × windows ÷ 1,000` seconds.** That is what ADR-0021's "Revisit if" says a ceiling would buy.
The owner's call; recorded, not resolved.

**OQ-30 — Theme palettes and token values. CLOSED 2026-09-04 by the IC-2 implementation and rendered-pixel
proof.** *(ADR-0050; `spikes/theme-proof.md`.)* `REQ-SHELL-129` fixes the default theme's shell
metrics and token groups and `REQ-SHELL-133` fixes what each built-in theme's description must convey,
**but the palettes themselves are not specified anywhere in `docs/spec/`**. They come from the design
reference. ADR-0050's mechanism — themes as data, corrections computed, contrast asserted from rendered
pixels — is independent of the values. Nocturne now lowers every ground stop in the adopted hue system;
High Contrast uses near-black grounds, near-white text and strengthened boundaries. Those authored values
remain owner-replaceable through the same mechanism. All six acceptance items passed from built-app pixels in
three themes at five scale factors, and the two named counterfactuals failed at their asserted item.

**OQ-31 — Which Markdown dialect is rendered. CLOSED 2026-09-02 by owner ruling GD-1, and closed without
the design reference.** *(ADR-0051.)* `REQ-CHAT-056` named five treatments and required links to be
activatable; nothing said whether tables, task lists, block quotes, headings or images were supported. The
entry recorded this as "as much a visual question as a functional one" and therefore blocked on the
reference. **That framing was wrong, and the reason it was wrong is worth keeping**: the supported element
list fixes what the transcript renderer accepts from model output, which makes it a question about the
renderer's surface rather than about appearance, and the entry's own last sentence — that images interact
with the no-network-request rule — was the evidence for that sitting in plain sight.

Ruled: **GitHub Flavored Markdown, less raw HTML, less image loading.** Headings, block quotes, ordered and
unordered lists, task lists, tables, thematic breaks and strikethrough render, alongside the five
treatments already fixed, and bare URLs are linkified on `REQ-CHAT-076`'s terms. Raw HTML in Markdown
source is shown as text and never rendered as markup. **No image is ever loaded from a Markdown image
reference** — it renders as its alternative text carrying an activatable reference — and this holds for a
local path exactly as for a remote URL, because a transcript that reads locations named by model output
discloses whatever those locations hold, and because the same clause that forbids the network request also
requires rendering to complete synchronously. `REQ-CHAT-056` now carries all of it. Images the user
attaches and image bodies the product holds are untouched: the ruling governs what Markdown *syntax* may
cause to be loaded.

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
content (spikes 8 and 19), exactly as constraint D-28 is handled. **Twenty-two numbered, one withdrawn,
EIGHT discharged and one discharged for Windows only — TWELVE outstanding.**

### What is outstanding is not one kind of thing, and the gate depends on the difference

A list of twelve outstanding measurements reads as twelve equal debts. It is not. As of the
restore-measurement round of 2026-09-02 the outstanding spikes fall into three groups plus a set of
sub-cases, and the last two are the ones that bear on the gate.

**(a) Genuinely not started, and owed by this record.** Spikes 2 to 8, 11, 13, 15 and 18. Nine of the
twelve. None of them blocks a decision that has already been taken; each of them prices one that has.
**Two of these grew in the measurement round.** Spike 8 now also owes the cost of `REQ-EVENTS-179`'s write
probe on the startup path, and the store's behaviour against a **real schema** — every measurement so far
used three tables with two primary keys and one listing index, and every additional index on the transcript
table adds write-ahead-log frames per insert and therefore moves **both** the commit cost and the checkpoint
period. Spike 18 now also owes **two run hosts** contending, which `REQ-TOOLS-089` and `REQ-SANDBOX-038`
permit and which spike 21 did not measure: only run-host-against-workspace-service was.

**(b) Cannot be run on this machine at all, and no amount of care here changes that.** **Spike 12** (the
Linux image's runtime on an unmodified baseline installation) needs a Linux machine that has never had
the legacy FUSE library installed. **Spike 17's two remaining platform keys** need a macOS machine and a
Linux machine of their own keys, because `REQ-STARTUP-155` binds all four artifacts and
`packaged-first-paint.md` built only the Windows two. **ADR-0056's build-time load proof** (below, an
unnumbered sibling obligation) must run on all three release runners. These are **build-host**
obligations, not architecture ones: they need infrastructure, they will not be closed by anyone reasoning
harder, and stating them as merely "outstanding" understates what it takes to clear them. ESC-11's choice
between its options turns on spike 12 and will stay open until a Linux host exists. ***One of these grew
materially on 2026-09-02***: ADR-0055's instance claim moved off the platform primitive on measurement, so
the claim, the hand-over endpoint and the stale-record protocol are now **ours on three platforms and
measured on one**. The verification is relocated rather than discharged, and `REQ-STARTUP-156`'s release
gate does **not** require launching the entry point twice on one user account — which is
`REQ-STARTUP-152`'s release-checkable form of SR-1, and the check that would catch a failure there.

***(c) The group that held spike 22 is now EMPTY, and what it left behind is a different kind of debt.***
This group read: "an architecture-side gate item that has never been run in its load-bearing half — spike
22, `REQ-SESSION-201`'s backup and restore … its restore half has not been executed in any part". **It has
now been executed and the mechanism did not work.** What replaces the group is not a spike but **eleven
defects**, three of them corrected and eight not, all of them in the gate verdict in
[`README.md`](README.md) §6 rather than here, because a defect with an owner is not a measurement. *The
distinction this group existed to protect still holds and now points the other way: **an unmeasured
mechanism was the risk, and the risk was real** — it did not merely fail to be evidence, it concealed a
mechanism that could not complete.*

**(d) Sub-cases left unmeasured inside spikes that otherwise passed, listed rather than absorbed.** Now
**four**, and they are listed separately because a sub-case folded into a discharged spike is a gap nobody
can see afterwards. **`REQ-STARTUP-165`(c)'s "no usable preparation at all" branch and its notice**, not
attempted by spike 20 — it is the only part of that requirement left untouched, ADR-0054 wrote it from
scratch on 2026-09-02 against the amended text, and its failure mode is a **missing warning**, which is the
outcome the clause exists to prevent. **ESC-21's second premise** — whether two machines on one synchronised
folder can each succeed at exclusive create on the same lock name — which spike 19 stated precisely,
called one afternoon's work, and refused to fake. And two from spike 22: ***the re-run of the corrected
restore***, which is owed because all three corrections are at this moment exactly the paper reasoning that
the three-for-three finding says is not evidence; and ***the kill-in-the-gap case***, which is now the only
route to an absent store directory that those corrections do not close. **The re-run is the one of the four
that a product owner should weigh at the gate**, because it is a re-measurement of a mechanism already known
to have been wrong three times, and it is bounded: race a launch into the refusal window, and force the
install rename to fail on an occupied name.

### What has been measured, and what each report did not settle

Nine reports exist, in [`spikes/`](spikes/) — eight for live spikes and one for a withdrawn one — four
dated 2026-09-01 and five dated 2026-09-02. **They are the only real evidence this record has, and several
of them overturned something it asserted.** Where they did, the overturned claim is preserved beside its
replacement in the ADR that carried it, and the entries above say which. **In the four of 2026-09-02 that
answered questions, what was overturned was more often a *reason* than a *conclusion*: every owner ruling
survived, three platform facts this record asserted were disproved, and one ADR's own stated gate trigger
fired. THE FIFTH DOES NOT FIT THAT PATTERN AND MUST NOT BE READ INTO IT** — spike 22 overturned a
*mechanism*: `REQ-SESSION-201`'s restore, decided on paper and never run, could not complete at all.

| Report | Spike | Discharged | Explicitly **not** settled |
|---|---|---|---|
| `ipc-hop-latency.md` | **10 — discharged** | ADR-0002's double-hop Revisit-if; ADR-0044's structured-clone trigger and its channel-isolation claim; `REQ-MONITOR-222` (p95 1.133 / 1.291 ms vs 250 ms), `REQ-MONITOR-223` (ratio 1.14 vs 2), `REQ-ORCH-155` (p95 5.951 ms vs 100 ms as SR-8 reads it) | **the commit `REQ-MONITOR-221` requires before publication**, which the report states is outside its interval, so every figure is a lower bound; fan-out to several windows; concurrent runs; the reconcile path (`refused = 0` everywhere); a real renderer |
| `packaged-first-paint.md` | **17 — discharged for Windows only** | that the `onefile` portable fails `REQ-STARTUP-155` at 13,287–19,580 ms across four bundle weights **including a zero-payload build**, with no packaging setting closing the gap; that bundle weight is close to free (~10 ms across 327 MB) on the flavours that pass. **It triggered SR-7** | the macOS `.dmg` and the Linux AppImage — **neither was built**, and `REQ-STARTUP-155` binds both; the harness "contains no product" — no persistence, no native module, nothing ADR-0055 puts before first paint |
| `renderer-invariance-and-benchmark-cadence.md` | **1 — discharged** | both counting rules against a running window (OQ-28); the tail-phase memory tripwire; that the reachable viewport is not knowable at construction (OQ-40); that ADR-0053's paint settle does not work and that `invalidate()` is worse than the timeout | whether a rAF settle and a paint settle measure the **same interval** where both resolve; the real component rather than a mock shell — the element counts and timings are stated as a **floor** |
| `windows-writer-handle-compaction.md` | **9 — withdrawn** | historically: that deleted rule 3 was right (0 of 115 trims, no observable symptom, ~73× throughput collapse), and **three corrections that outlive its subject** — what actually blocks a replace, that share-delete *is* requested, and that a directory `fsync` works on a write-opened handle | whether a replace survives a **power cut**, on any platform. The report declined to claim the guarantee from a success return. **And its directory-`fsync` figure is qualified by spike 19**, which found the same call failing on every spelling including local; the reconciliation is handle mode and is *inferred* (OQ-12) |
| `commit-on-the-publish-path.md` | **21 — discharged** | ADR-0058's own open item on the commit; `REQ-MONITOR-221` (0.396 ms p50 / 0.700 ms p95, work not a wait), `REQ-MONITOR-222` (p95 1.774 / 1.723 ms vs 250 ms), `REQ-MONITOR-223` (ratio 0.971 vs 2), `REQ-ORCH-155` on both readings, `REQ-EVENTS-029` (marginal cost −4 to +31 µs), `REQ-SESSION-067`/`-068`/`-072`; that the checkpoint period is arithmetic (7.44 frames per commit → every 135–136 commits at 9–11 ms p50); **that `REQ-SESSION-070`'s readability clause does not need the stronger durability setting**; that ADR-0002, ADR-0008 and ADR-0010 are not reopened | **a real schema with declared indexes** (spike 8); **two run hosts** contending (spike 18); **any failure path at all** — no torn write, no corruption, no disk-full, no read-only volume; packaging, so the native module's asar-unpacking obligation is untested; **power loss**, which is now the sole ground for forcing the stronger setting; macOS and Linux; the trim's own latency and the ring displacement's own cost |
| `remote-and-synchronised-storage.md` | **19 — discharged on its own question; it could NOT decide ESC-21's strength and says so** | ESC-15 supported on stronger evidence **and its stated mechanism disproved in two of three links**; ADR-0058's journal read-back as necessary-but-**insufficient**; that a naive copy of a live store is not a backup (625/627 unopenable) and the engine snapshot is (8/8, median 1,077 ms per 41 MB); ESC-21 premise 1 (2,500 races, one winner in 2,500); `REQ-STARTUP-166`'s classification as implementable, precise and cheap; `REQ-GIT-124`'s ordering confirmed | **ESC-21 premise 2 — no second machine, and it declined to fake one**; no synchronisation client was written to; **no Electron**, host Node with a prebuilt binding; one store-engine version, one binding; loopback rather than a network, so the 12 ms rename and the 6.2 % failure rate are **floors**; exclusive create against a dehydrated cloud placeholder; no power loss |
| `cached-portable-launch.md` | **20 — discharged; SR-7's gate condition met** | the cached-launch figure (575.5–723.1 ms warm, 897.3–1,414.6 ms cold vs 5,000 ms); the fast-path check (0.14–0.49 ms, against 709.6–845.0 ms for the cheapest digest it rejects); cache invalidation across an update (**did not fail**); that `REQ-STARTUP-125` is **rescued** rather than merely preserved by SR-7; **two defects in ADR-0054's own mechanism** — the commit could not commit, and the completeness check returned a hit on a preparation that produced no window | **clause (c)'s "no usable preparation at all" branch and its notice — not attempted**; clause (d) independently verified (no network capture, no privilege trace); a real read-only volume rather than an access-control approximation; the commit's durability discipline, so a power loss could leave a torn tree behind a valid marker; a real download with the platform's reputation check; a larger bundle or fewer cores |
| `presenter-liveness-and-instance-claim.md` | **14 and 16 — 16 discharged and ADR-0055's own rule FIRED; 14 measured and OQ-39 NOT closed** | that the liveness poll works and **must be gap-based**; that the exposure is every **synchronous native dialog** and not the approval dialog; that the run host dies with main in 207–341 ms and never sees the channel close; that no platform signal for an unresponsive main is usable from a utility process; that the platform single-instance primitive **fails** `REQ-STARTUP-164` on Windows (20.0 s, no reclaim, no window) | **macOS and Linux — zero coverage, on both sides of the decision, and this is the largest single gap**; the decision path (no gate, no pending-approval map, no headless policy), so *never a silent allow* is **unexercised**; **sizing the lapse window under product-shaped load**; whether every native dialog has a non-blocking form on every platform; packaged builds; the cross-platform hand-over endpoint, which has **no measurement anywhere behind it** |
| `backup-restore-mechanism.md` | **22 — discharged; the mechanism it measured DID NOT WORK** | that ADR-0058's restore as written fails **0 of 30** at the install rename, because nothing closes the staging connection; that the liveness gate is evaluated before runs are refused and a run admitted in that window **is destroyed by the swap**, measured mid-write; that the reversal fails identically wherever the install failed on an occupied name; that all three refusal gates are correct including the older-schema case that must **not** refuse; that ADR-0005 consequence 11 is vindicated **against its own counterfactual**; ESC-26's three identifier cases and all five unreadable shapes; the one-rename installation (20 of 20 gap observations, absent and never mixed); the whole cost curve — store unavailable 64 ms / 144 ms / **1.45 s** across 68 KB / 11.8 MB / 313 MB, renames flat at 3–5 ms; ADR-0056's owed Electron-ABI figure, whose answer is that **no rebuild is needed for this binding** | **the corrected mechanism — none of the three fixes has been run**; **the kill-in-the-gap case**, which is now the only route to an absent store directory the fixes do not close; a restore of an artifact read from a network destination; **two concurrent restores of one identifier**, so the instance claim is unmodelled; packaging, so the asar-unpack obligation is **still** untested; any user interface, so every "the product must convey" clause was tested by showing the *values* exist and never by rendering; and **eight defects it found and did not fix** — see [`README.md`](README.md) §6 |

**A note a reader should not have to work out.** Two of the nine measured a design that no longer
exists — the file-based journal and compaction that SR-4 removed, and the packaging target SR-7 replaced.
Neither is therefore wasted: what generalises from the writer-handle report is a **diagnosis** (an
append-and-compact file whose writer holds it open is a silent cap-enforcement failure) and three factual
corrections, and what generalises from the first-paint report is that the packaging *mechanism*, not the
bundle weight, was the cost. Both are cited above and in constraints D-27, D-28 and B-03.

### What is new

***Spikes 20, 21 AND 22 have been run and all three are discharged. No new spike is owed that was owed
before, and the sentence "spike 22 has not been run at all and is now the only new one still owed" is
withdrawn.*** Spike 20 was required before the gate by SR-7's own words and its condition is met. Spike 21
was required because the whole persist-before-publish design rested on a number nobody had taken, and that
number exists. Spike 19's question changed with ESC-15 and it keeps its number.

**Spike 22 — `spikes/backup-restore-mechanism.md`, 2026-09-02. Discharged, and it is the one that
found the most.** It was required because `REQ-SESSION-201`'s backup and restore is the largest mechanism
the record has ever added on one pass and its restore half had never been executed in any part.
**The headline is that the restore as ADR-0058 wrote it fails on this platform in 30 of 30 attempts** — the
staging store is opened read-write, no step closes it, and the rename of that directory is refused
`EPERM`; closing it first passes 30 of 30. Two further defects matter as much: the liveness gate was
evaluated **before** the run host was told to refuse runs and nothing re-checked, so a run launched in that
window took the lock, wrote at twenty rows a second, was asked to close mid-write, complied, **and had its
session and every row destroyed by the swap**; and the reversal **fails in the case it exists for**, with
the identical error, leaving a store directory holding no database and the real store under a timestamped
name. **All three are corrected** — in ADR-0058, in an amended `REQ-SESSION-201` and in a new
`REQ-SESSION-202` — and **eight further defects the spike found are not**, which is why the spike is
discharged and the mechanism is not clean. The eight are enumerated in [`README.md`](README.md) §6.

**What it confirmed is as load-bearing as what it broke**, and is recorded so no later pass disturbs it:
all three of ESC-26's identifier cases including the confirmed establishment, and all five unreadable
identifier shapes left byte-unchanged; all three refusal gates, including the older-schema case that must
**not** refuse; ADR-0005 consequence 11's lock-row correction against its own measured counterfactual —
without it, sessions live at backup time arrive **permanently** locked; the one-rename installation, with
20 of 20 gap observations seeing an absent store directory and never a mixed one; and the displaced store
retained, openable, with its bodies intact. It also priced the mechanism: the store is unavailable for
64 ms at 68 KB, 144 ms at 11.8 MB and **1.45 s at 313 MB**, while the two renames themselves are flat at
3–5 ms at every size, and the whole thing runs under Electron 44.1.0 in real utility processes with a
window painting at a main-process event-loop lag of 6 ms p50 and 13 ms max.

***Two sub-cases it could not reach, listed here rather than absorbed into the discharge.*** **(1) A
re-run of the corrected mechanism.** All three fixes are, right now, exactly the paper reasoning that
consequence 17 says is not evidence. The re-run must race a launch into the window between the refusal of
new runs and the run host's acknowledgement and confirm the second liveness evaluation catches it, and must
force the install rename to fail with the target name occupied and confirm the displace-then-rename
reversal leaves the store byte-identical. **(2) The kill-in-the-gap case.** What a restore interrupted
between the two renames leaves behind, with no process left to reverse anything. It is now the only route
to an absent store directory that the corrections do not close, and no power-loss or kill test was
performed. *A third, adjacent and not owed by the spike:* a restore of an artifact read from a network
destination, and two concurrent restores of one identifier, neither of which the instance claim was
modelled against.

***A methodological finding worth carrying, because it is evidence for the design rather than against
it.*** An earlier in-process version of the spike's own gap observer broke the displace rename with its own
transient handle. That is ADR-0004 rule 1 appearing unbidden inside a measurement harness, on a platform
where a single held handle anywhere inside a directory is fatal from any process.

**Two measurements are owed and are deliberately not numbered.** A **power-loss test**, which is now
larger than it was: it is OQ-12's outstanding half, and since 2026-09-02 it is also the **sole stated
ground** for forcing the stronger durability setting on a terminal save, because the readability clause
that used to carry that decision was tested and does not need it. And a **rebuilt-for-Electron
confirmation run of the storage measurements**: spike 19 ran host Node with a prebuilt binding, spike 21
rebuilt against the Electron runtime but measured different questions, and neither exercised the store
under a packaged build — so the first-statement failure `REQ-EVENTS-179` now governs was measured on one
binding on one machine.

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
3. ***Taken 2026-09-05 — `spikes/mcp-negotiation.md`.*** **Tool-server protocol version negotiation over
   our own transport.** *(ADR-0033, ESC-12.)* The sibling-probe policy is documented for the SDK's
   **standard** stdio transport, which ADR-0033 replaces with `OwnedStdioTransport`; establish what
   negotiation does over the custom transport before assuming a pin is needed there at all, then confirm
   that pinning to a mode which spawns no sibling probe process does not break servers speaking only the
   newer negotiation, against at least one modern and one legacy server. If the answer is that
   `REQ-MCP-067` is satisfied without pinning, ESC-12's balance changes. **Answered: no sibling is spawned
   over our transport under any mode; `REQ-MCP-067` holds without a pin; `'auto'` reaches every era; a
   strict legacy server that exits on the probe takes one sequential retry under `'legacy'`; ESC-12's
   balance changed as the entry predicted and option (a) was taken.**
4. ***Taken 2026-09-05 — `spikes/mcp-console-suppression.md`.*** **Console-window suppression verified on a
   packaged build spawning a console application** — that no window appears at any point. *(ADR-0033,
   `REQ-MCP-113`.)* **Answered:** on the packaged build, every process started after the launch (cmd, node, headless conhost) had window handle 0 and title N/A at every sample while the echo call succeeded; the reserved token's child fails at spawn (ENOENT), not with a window.
5. ***Taken 2026-09-06 — `spikes/code-intelligence-branch.md` (and `spikes/code-intelligence-bundle.md` beside it).***
   **The packaged binary's reserved-token branch** producing clean protocol output on standard output,
   nothing else on standard output, no window, and the correct exit status. *(ADR-0035.)* **Answered:** Electron's
   own main entry with the token first and `--` second (a scheme-looking positional followed by another positional
   exits the binary −1 before any JavaScript, measured on the development and the packaged binary); the runtime's
   JSON-RPC and nothing else after one CR LF Electron itself writes ~50 ms after start (tolerated by the transport as
   a blank line, not a message); no window handle on any process at any sample; the runtime's own exit status (0 on
   stdin's end, 2 from its argument parser, 1 when it is killed) observed by the parent every time. Re-run through the
   proof's own client on the development entry (`pnpm code-intel-proof` launch 1) and on the packaged artifact under
   `ROTARIS_CODE_INTEL_PACKAGED=1`.
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
   anywhere in the product is **the session's log** (`REQ-SESSION-142`), and nothing compacts it — **so no
   file in the product is now replaced by rename over a handle its own writer holds.** *(Path corrected
   2026-09-02: this named `evidence/debug.log`, which is withdrawn with the session-directory layout
   domain 18 carried; `REQ-SESSION-002` fixes three kinds of per-session file and no filenames. The fact
   is unchanged — only the name was wrong.)* The number is
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
14. ***Measured 2026-09-02 — `spikes/presenter-liveness-and-instance-claim.md`. The mechanism is
    discharged; the window this spike exists to size is NOT, and OQ-39 stays open.*** The poll detected
    all nine blocked runs at **+386 to +468 ms** on a 500 ms threshold with **zero false lapses in 258 s**
    of unblocked running. Three findings it was not asked for and which are now in ADR-0019 and constraint
    T-31: the check **must be gap-based**, because a blocked main queues rather than drops and all 84
    outstanding replies arrived when the block ended, the last at **7,885 ms**; the exposure is **every
    synchronous native dialog**, not the approval dialog, which cost the poll nothing at a 266–267 ms
    maximum gap; and **no platform signal for an unresponsive main is usable from the run host**, the
    operating-system signals detecting a busy loop and never a native modal. **It also falsified an
    ADR-0019 mechanism**: the run host dies with main in **207–341 ms** and never observes the channel
    close, so the channel-close revocation is not what operates. **Why the window is still unsized is
    stated in the *Not discharged* paragraph below and has not changed.**
    **A presenter liveness lapse window that survives ordinary main-process load.** *(ADR-0019, OQ-39,
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
16. ***Discharged for Windows 2026-09-02 — `spikes/presenter-liveness-and-instance-claim.md` — AND THE
    STATED RULE FIRED. Observation 2 does not hold: the platform primitive is refused and the claim is
    ours on every platform.*** Against a primary running but not pumping messages,
    `app.requestSingleInstanceLock()` blocked **20,004.6 / 20,010.9 ms** against a 5-second interval,
    returned false, performed **no reclaim and no retry**, and the hand-over never reached the primary —
    not even in the 25 s after it recovered, so it was **dropped rather than queued** — and the launch
    ended with **no window on screen**. It cannot be wrapped: the call is synchronous on the launching
    process's own main thread and takes no timeout. **Observations 1 and 3 passed and are carried forward
    as measured obligations on the replacement** — first-attempt reclaim at **+187 ms** after a force-kill
    with the window shown at +345/+373 ms and the release bracketed to a 67–69 ms window, and 69 probes
    with no observable effect — as is declared-field delivery, because `argv` really was mangled. The
    JS-blocked-but-pumping sub-case passed at 4.07/4.82 ms, and it passed in a way the record would not
    have chosen: the hand-over callback ran inside the dialog's nested message pump while the primary's own
    timers were dead, so a hand-over can be delivered into a process that is otherwise entirely stopped.
    ***Two thirds of the obligation is now UNMET RATHER THAN INHERITED, and this is the part that grew.***
    macOS and Linux were not measurable on this host, and adopting our own record **relocates** the
    verification rather than discharging it: a hand-over endpoint and a stale-record protocol we write
    ourselves must be verified on both, and on macOS must additionally compose with the convention that a
    second launch of a bundle produces no second process. **The cross-platform endpoint is the piece with
    no measurement anywhere behind it**, it sits on the critical path of every launch, and its failure mode
    is the same one that failed under the primitive — a launch that ends with no window.
    **The single-instance record's probe and reclaim, on all three platform keys.** *(ADR-0055, which
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
19. ***Discharged on its own question 2026-09-02 — `spikes/remote-and-synchronised-storage.md`. It could
    NOT decide ESC-21's strength, and it said so rather than inventing a result.*** **What it settled:**
    exclusive create is a genuine primitive over a network share — 2,500 races across five pairings
    including two that mix I/O stacks, **exactly one winner in 2,500, more than one in 0, none in 0**; the
    atomic document primitive holds on a share **only with the retry ladder**, 6.2 % of first attempts
    failing with no other opener present (OQ-44); `REQ-STARTUP-166`'s direct classification is real,
    precise and cheap, correct at every depth inside a live third-party sync root and correctly negative
    one level above it, p50 0.10–1.83 ms; and `REQ-GIT-124`'s ordering of the storage check ahead of the
    lock check is confirmed by measurement, both halves independently. **What it disproved:** ESC-15's
    stated mechanism, in two of its three links (constraint W-04) — the conclusion survives on three worse
    measured failures. **What it exposed:** the `REQ-EVENTS-084`/`REQ-EVENTS-088` gap, now closed by
    `REQ-EVENTS-179`; and a same-machine two-spellings hazard now carried as constraint W-27.
    ***What it could not do, and this is the part that stays owed:*** ESC-21's **second** premise needs a
    second machine and a synchronisation account. The report states the closing experiment precisely — two
    machines, one synced folder, an exclusive-create race against the same lock name with a wall-clock
    barrier — and calls it one afternoon's work; **the single number that matters is races in which both
    machines' exclusive create returned success.** Until it is taken, the refusal-versus-warning strength
    of ESC-21 rests on reasoning rather than on measurement. **Also unmeasured and worth naming:** the
    classification's blind spot is any client that registers no platform sync root, and the most widely
    deployed such client was present on the measuring machine and registered **none**; exclusive create
    against a **dehydrated cloud placeholder** was not exercised; and the replace path was tested against
    only one of the four destinations ADR-0004 names — the spike declined to write into the machine's live
    sync roots because they hold the user's own material, which was the right call.
    **What ELSE the product writes into `.rotaris/` on synchronised storage.** *(Same number, **new
    question**, changed by ESC-15 exactly as that ruling said it would be. ADR-0058, ADR-0005;
    constraints D-29, W-20, W-04, W-27, B-24; ESC-21.)*

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
20. ***Discharged 2026-09-02 — `spikes/cached-portable-launch.md`. SR-7's gate condition is met and the
    remaining options SR-7 held in reserve are not needed.*** **The three figures it was raised for.**
    Cached first paint **575.5–624.2 ms warm and 897.3–1,242.5 ms cold** (n = 6 each), replicated
    independently at 581.3–723.1 / 964.0–1,414.6 ms, against 5,000 ms; the exempt **preparing** run lands
    inside the bound it is exempt from at **1,634.7–2,091.3 ms** warm and 3,798.8–3,909.8 ms
    single-threaded. The **fast-path check** costs **0.14–0.49 ms warm, 0.37 ms on a cold first touch**,
    against 709.6–845.0 ms for the fastest launch-time digest of the artifact, 1.48–1.95 s for a
    pure-Rust one, and 4.43–5.50 s for a digest of the prepared tree. **Cache invalidation across an
    update did not fail** — a one-line change produced a different token and prepared afresh, the previous
    version's preparation stayed intact and was still used at 591.3 ms, and two token-named directories
    coexisted, each with its own marker. **Two defects were found in ADR-0054's own mechanism, both fixed
    there, and neither is visible in a build that never meets a damaged preparation**: the commit step
    could not commit (a directory cannot be renamed onto an existing directory on Windows), and the
    completeness check returned a **hit** on a preparation that launched and produced **no window**.
    **One correction the record must carry:** `REQ-STARTUP-125` is not merely preserved by SR-7's ruling,
    it is **rescued** by it — under the packaging tool's portable target the artifact was locked for the
    entire run, 79 consecutive failures with the first rename succeeding only at 16,837 ms as its own
    process exited, so "the replacement SHALL succeed while the application being replaced is still
    running" **was not satisfiable on that target at all**; under the preparation the rename succeeded on
    the first attempt at 189 ms with the application alive. **And one figure this register mis-attributed:
    the 13,287–19,580 ms is the packaging tool's extraction cost, not this mechanism's** — the launcher
    writes the same tree in 410.7–565.7 ms, so anywhere the price of a preparing run is quoted in tens of
    seconds it is the wrong number.
    ***What it did not do, and one item is a listed gap rather than a footnote:*** clause (c)'s **no
    usable preparation at all** branch and its notice were **not attempted**, and clause (d)'s "issues no
    network request and raises no elevation prompt" is true only by construction of the spike's own
    launcher — no network capture, no privilege trace. Also unmeasured: a real read-only volume rather than
    an access-control approximation; the commit's durability discipline, so a power loss could leave a torn
    tree behind a valid marker, which is the one damage class the per-file manifest does **not** catch; a
    real download carrying the platform's mark-of-the-web, which lands exactly where the release gate now
    looks; and a materially larger bundle or fewer cores, which is the figure that stops being comfortable
    first.
    **The prepared portable's steady-state launch. *`owner-decisions.md` SR-7 named this as required
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
    obligation as well as an architecture one.
    ***Corrected 2026-09-02: this entry said "One case has no stated outcome and should be exercised
    here". The outcome is now stated and the case should still be exercised — as specified behaviour to
    verify rather than as a gap to characterise.*** `REQ-STARTUP-165`(c)'s third paragraph covers a run
    that can produce **no** usable preparation at all: it "SHALL still start the artifact", is exempt
    from the first-paint bound, and — uniquely among the five preparation outcomes — **is reported**,
    once per such run, after the window is painted, on the persistent notice surface at warning severity,
    conveying that the artifact could not prepare itself, which storage it could not prepare into, and
    that every launch will cost what this one cost until that storage accepts a preparation. So the
    silent 13–19 s degradation this entry described is no longer the specified behaviour. What to
    exercise: that the notice actually fires, that it names the per-user data location and never the
    placement within it, and that the four silent outcomes stay silent — ADR-0054 names
    "implementing four-silent-one-loud from a habit of *the-preparation-is-silent*" as the specific error
    to prevent.
    **One reading question rides on this and should be settled before, not after** (see the specification
    defects the gate verdict lists): clause (c) requires such a run to start the artifact and clause (d)
    requires preparing to "write nothing outside the per-user directories of `REQ-STARTUP-145`", and the
    payload cannot run without existing as files — so where that root refuses **every** write the two
    clauses are jointly unsatisfiable on the conservative reading. ADR-0054 designs for the conservative
    reading, covers the reachable failures by placing an ephemeral tree under the same root, and records
    the residue.
    ***Also on this spike's harness, and cheap there:*** the cost of the store open after the show, which
    ADR-0055 keeps off the critical path by construction and nothing has measured. `PRAGMA quick_check`
    on a large store is bounded rather than fast, and the post-show pipeline is where the window becomes
    *useful*.
21. ***Discharged 2026-09-02 — `spikes/commit-on-the-publish-path.md`. The lower bound is gone and the
    margin survives at two thirds of its old size.*** Commit **then** publish, end to end over the relay:
    **p95 1.774 ms at 0 rows and 1.723 ms at 10,000**, against 250 ms — the quoted margin falls from ~221×
    to **~141×**. `REQ-MONITOR-223`'s ratio is **0.971** against a ceiling of 2; zero of 20,000
    publications exceeded 250 ms; the commit alone is **0.28 %** of the budget and the whole interval
    **0.71 %**. Persist-before-publish costs **0.396 ms p50 / 0.700 ms p95** and it is work, not a wait.
    Making each event durable individually is **free** — marginal cost −4 to +31 µs at p50 — so
    `REQ-EVENTS-029` is not a cost the design absorbs. **ADR-0058's own open item is closed** and its
    commit-cost Revisit-if is **not triggered, on evidence**.
    ***Three things it changed that were not the question.*** **(a) The shape of the distribution matters
    more than the percentile**: the automatic checkpoint fires every **135–136 commits** — arithmetic, from
    7.44 log frames per publish-path commit against a threshold of 1,000 — at **9–11 ms p50, worst observed
    53 ms**, while the other 99.27 % cost 179–220 µs. Nothing threatens 250 ms, but any threshold built on
    "about a millisecond" will see routine fifty-fold excursions on a fixed period, and **the checkpoint
    period is a design input**: widening the publish-path transaction shortens it proportionally.
    **(b) ADR-0058's stated ground for forcing the stronger durability setting on a terminal save is
    false** — a separate process using a different binding read a terminal status back immediately at the
    weaker setting — and the decision is re-grounded on power loss, which nothing has tested (constraint
    W-06, OQ-12). **(c) `REQ-MONITOR-218`'s no-delay-floor rule can be broken from outside this record**:
    a second process holding a 200 ms write transaction produced a **205.4 ms** commit, and held back to
    back the writer starved indefinitely, which makes constraint W-05 a conformance obligation with a
    number attached rather than hygiene.
    ***What it did not measure*** is listed in the group (a) note above and in the table: a real schema, two
    run hosts, any failure path at all, packaging, power loss, and any machine but one.
    **The commit on the publish path.** *(ADR-0058, ADR-0008, ADR-0009, ADR-0010;
    constraints D-16, U-03, U-04, W-05, W-06, W-21, W-28.)* `spikes/ipc-hop-latency.md` states in its own
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
22. **The whole-store backup and its restore, end to end. *DISCHARGED 2026-09-02 —
    `spikes/backup-restore-mechanism.md`. BOTH halves are now measured and the restore as ADR-0058 wrote
    it FAILED 0 of 30.*** *(ADR-0058, ADR-0005, ADR-0002, ADR-0056; constraints W-24, W-29, W-30, W-31;
    `REQ-SESSION-201`, `REQ-SESSION-202`.)*

    ***What discharged it, and what a reader must not take from the discharge.*** The restore was built
    and run — three real processes, an Electron confirmation run, a fault injector at every point the
    record names a failure, thirty repetitions per verdict on a fresh world each time. **It found three
    defects, all three now corrected, and eight more it did not fix.** The three: the staging connection
    that no step closed, so the install rename was refused `EPERM` in 30 of 30; the liveness gate evaluated
    before runs were refused, which destroyed a live session and every row it had written; and the reversal
    that fails identically to the step it exists to undo. **The eight uncorrected are enumerated in the gate
    verdict in [`README.md`](README.md) §6 and are defects with owners rather than measurements owed.**
    **A spike is discharged when its question is answered, not when the answer is comfortable** — and this
    one's answer is that the mechanism did not work. *Two sub-cases it could not reach are carried in group
    (d) above: the re-run of the corrected mechanism, and the kill-in-the-gap case.* **Everything below that
    the measurement did not reach is marked in place rather than deleted, because what a spike leaves owed
    is as much a part of its result as what it settled.**

    ***What spike 19 settled incidentally, on 2026-09-02, and it settled the alternative rather than the
    mechanism.*** A **naive file copy of a live store is unopenable 625 times in 627** — 150 of 152 under
    write-ahead logging and **475 of 475** under a rollback journal, so the rollback case is worse rather
    than a safe fallback — while `VACUUM INTO` produced **8 valid snapshots out of 8** during 108,525
    concurrent commits, integrity-clean, checksum-clean and monotonic, at a **median 1,077 ms per 41 MB**
    on local storage. That is the mechanism `REQ-SESSION-201`'s "valid while runs are live" needs and it
    now has a number. **And the trap is recorded so nobody falls into it twice:** the gentle version of the
    same experiment — a realistic 20 commits per second against a small store — returns **0 bad copies in
    40**, so the obvious test gives a false all-clear and makes the choice look arbitrary to whoever runs
    it next.

    ***"Everything below is still owed. Every step of the restore is individually justified from the
    requirement; nothing has been run" — WITHDRAWN 2026-09-02.*** It has been run. What follows is kept
    with each item marked, because four of the five things this entry asked for are answered and one is
    not, and collapsing them would hide which.

    **A documentation check comes first, costs nothing, and decides one alternative against another on
    its own.** ADR-0058 chooses `VACUUM INTO` over the engine's stepped online-backup API on a
    *documented* property — that the stepped API restarts the copy when the source is written through a
    connection other than the one driving it — and says explicitly that it read this rather than measured
    it. ADR-0002 puts **two** writer processes on this store, and `REQ-SESSION-201` forbids refusing a
    backup because a session is live, so under `REQ-MONITOR-219`'s tick every run-host commit is an
    external write and termination is not obvious. **Confirm the property against the binding's own
    documentation before measuring anything.** If it does not hold as stated, the stepped API is the
    better mechanism and `VACUUM INTO` should be dropped. A reader skimming ADR-0058's *Decision* could
    take this as established; it is not. ***STILL OWED after spike 22.*** The spike modelled ADR-0058's
    chosen mechanism and states in terms that **alternative U is untouched**, so this check is exactly as
    open as it was and it is still the cheapest thing on this list.

    **Then four figures, in the order of what they decide.** (1) `VACUUM INTO` cost on a live store —
    time, destination space, and the one that is not obvious: **how much the write-ahead log grows while
    the read transaction pins it**, on a store large enough to matter, with a run committing at
    `REQ-MONITOR-219`'s tick. ***Half of this is now answered and half is not, and the split is the whole
    point.*** The **correctness** is settled — 8 valid snapshots in 8 under concurrent load — and the
    **time** has a figure at one size, a median 1,077 ms per 41 MB. **The log growth is not measured**, and
    it is the only input the mid-copy-checkpoint question and the progress-reporting question turn on. So
    the question is now "at what size does this stop being comfortable", not "seconds or minutes". This
    decides whether progress reporting, cancellation and a mid-copy checkpoint strategy are needed at all. ESC-19's own survey cites a comparable product's session logs
    reaching 700 MB to 2 GB, and ESC-9 leaves retention unbounded, so "large enough to matter" is not
    hypothetical. ***STILL OWED: spike 22 measured the restore, not the backup's log growth.*** (2) **The
    restore's connection-close handshake**, which had no timing figure anywhere. ***ANSWERED.*** The
    handshake itself is **1.2–1.5 ms** at every store size with the run host answering at once; the
    workspace service's own close is **1.0 ms**; each re-open is **3.4–5 ms**; and the figure this item was
    really about — **how long a user stares at a workspace whose store is deliberately absent** — is
    **64 ms at 68 KB, 144 ms at 11.8 MB and 1.45 s at 313 MB**, with the whole action reaching 2.67 s at
    that size. *Two things the measurement added that this item did not anticipate: the wait has **no bound
    at all** and does not terminate against a run host that never answers, which is now a defect rather than
    a figure; and the state the user sees during the gap is no longer only an empty list, because
    `REQ-SESSION-202` reclassifies the durable form of it as a store that could not be opened.* (3) The two
    renames, which ADR-0058 does **not** claim atomic, on the filesystems the writer-handle spike did not
    cover — network shares, ReFS, removable media and cloud-sync folders, all of which the destination
    may be. ***STILL OWED.*** Spike 22 ran on `C:` NTFS on local NVMe only, and states so. What it did add
    is the **local** semantics in full, which nothing had: a rename onto a name that does not exist succeeds
    30 of 30; onto an existing directory it fails **even when that directory is empty**, so there is no
    "replace if empty" on this platform; onto an existing **file** it succeeds and destroys the file; and a
    single held handle anywhere inside the directory is fatal from **any** process. (4) Whether an export
    holding a long read transaction can delay a transition commit, which `REQ-EVENTS-098` forbids
    **outright** rather than budgeting for; ADR-0024's and ADR-0041's export mechanisms both infer from the
    journal mode that it cannot, and inference is not what that requirement asks for. ***STILL OWED, and
    partly reframed rather than answered:*** spike 21 measured a *compliant* reader costing the writer
    163.6 → 345.9 µs p50 with zero lock contention, and `REQ-EVENTS-098` has since been amended into three
    clauses in which a measurable scheduling cost is expressly not a violation — so what is left to measure
    is the export's own reader, not the requirement's meaning.

    ***"This deserves running before the Architecture Gate rather than after" — DISCHARGED. It was run
    before the gate, and it was right that it should be.*** The requirement it implements is one of the two
    the owner minted in this pass, the mechanism is entirely architecture's, and running it found three
    defects that no reading of the record had caught in the months it stood.

**Not a numbered spike, and deliberately so: a build-host obligation ADR-0056 creates.** Rule 4 of that
record requires a **build-time proof that each native binding loads under the shipped Electron binary,
from the packaged tree**, failing the build if it does not. It is the only check anywhere in the record
that catches an unloadable store binding, and the reason is an asymmetry worth stating once:
`REQ-STARTUP-156`'s release gate observes **first paint**, first paint does not open a store (ADR-0055
keeps the workspace read off the critical path, ADR-0058 opens after show), so **an artifact with an
unloadable store binding passes the release gate** — the property that makes the failure graceful is the
same property that makes the gate blind to it. The proof must run against the packaged tree under the
Electron binary that tree carries: run against `node_modules` in the checkout it proves nothing about
asar unpacking, and run under the host Node it passes on exactly the artifact that fails. **A proof
written the easy way is worse than none, because it reads as verified.** Somebody must establish that it
is constructible on all three release runners before it is relied on as the only defence.
