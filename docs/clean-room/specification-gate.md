# Specification Gate

**Status: CLOSED 2026-08-31 — the specification is approved as sufficient, and architecture design is
authorized. Implementation remains unauthorized until the Architecture Gate closes.**
**The [Architecture Gate](architecture-gate.md) CLOSED on 2026-09-03. Implementation is authorized within
the bounds recorded there.**

This gate asks one question: *is the behavioral specification good enough to begin architecture
design?* It is not asking whether the specification is finished. Specifications are never finished;
the question is whether the remaining unknowns are small enough that architecture work will not be
built on sand.

Architecture design may not begin until the user closes this gate. Implementation may not begin
until the Architecture Gate is also closed.

## What exists

Twenty-one behavioral specifications in [`../spec/`](../spec/), covering the product's observable
surface: run orchestration, monitoring and steering, conversation, model providers, tooling and
permissions, git and worktrees, session persistence, requirements traceability, lifecycle hooks,
sandboxing and egress, startup and updates, the desktop shell, workspace handling, the library,
settings, MCP integration, the terminal UI, command-line entry points, notifications and recovery,
the event stream, and the performance benchmark.

Behavioral target: `ROTARIS-CRW-001` — see [`reference-record.md`](reference-record.md).
Total: **3,930 requirement identifiers** across the nineteen shipping domains, of which **237** are
withdrawn in place, leaving **3,693** that state live behavior. The two retired domains, the
terminal UI and the command-line entry points, hold a further **444** identifiers, **10** of them
withdrawn in place; those are counted separately and are not part of the shipping total, giving
**4,374** identifiers in all, **247** of them withdrawn. Every count is a count of identifiers, not
of behaviors: an identifier is never removed, so a withdrawn requirement keeps its number and keeps
being counted, and a total that grew while the graphical-only decision was removing surface grew
because resolution minted new identifiers to carry the rescued capabilities. These totals were
re-taken from the requirement definitions in each file after the sixth and last of the
post-resolution reconciliation rounds described in [`provenance.md`](provenance.md). The first four
rounds left every total where it stood: naming an owner for a contested vocabulary and turning the
other statements of it into citations removes duplicated content without minting or retiring an
identifier. The fifth moved one domain's, because it did more than deduplicate — domain 11 withdrew
three identifiers that specified a different product and minted two, REQ-STARTUP-158 and
REQ-STARTUP-159, to carry the behavior underneath them, taking the recorded figures from 3,923 and
233 to 3,925 and 236. The sixth moved three domains', for the opposite reason: it was looking for
obligations no requirement carried, and every one it found had to be written. Domain 11 withdrew
REQ-STARTUP-144, whose subject was a public marketing website rather than this product, and minted
REQ-STARTUP-160 to carry as application behavior the network disclosure that requirement had placed
on a page; domain 12 minted REQ-SHELL-168 for the plan-gate and run surfaces domain 01's resolution
record had assigned it and no round had executed; and domain 15 minted REQ-CONFIG-474 through
REQ-CONFIG-476 for three configuration keys the same record had said the settings domain would need.
That is the whole of the change from 3,925 and 236. The per-domain figures,
with the withdrawn count beside each, are in [`../spec/README.md`](../spec/README.md). Process and
audit history: [`provenance.md`](provenance.md).

## Clean-room audit status

Every specification was adjudicated by an independent read-only judge with reference access, after
clean-side remediation. Final state:

| Verdict | Domains | Meaning |
|---------|--------:|---------|
| Clean | 6 | The judge found no material leakage and would defend the file. |
| Minor concerns | 15 | A small number of borderline items a reviewer should look at; none disqualifying. |
| Contaminated | 0 | — |

No file was found to have been over-corrected: numeric limits, formats, and the compatibility
surface survived remediation intact.

**What "minor concerns" means here, stated plainly.** In the remaining fifteen files the judges
found short verbatim runs — typically six to fourteen words — that are not part of the product's
public surface, along with a handful of requirements that still describe internal mechanism or carry
inherited terminology. The judges' consistent position is that none of this transfers design
knowledge an independent implementer could not derive from the observable contract, but that they
would want the specific items reworded before defending the files to an adversarial reviewer. Each
judge recorded the affected requirement IDs.

This is a genuine residual risk, not a formality. If the rewrite is intended for public release or
carries commercial exposure, a human reviewer — ideally with counsel — should read the flagged
requirements before implementation begins. The behavioral target is licensed GPL-3.0, so the cost of
being wrong is not symmetric.

## How to read the evidence

Every specification carries an Open Questions section. Those are not disclaimers: they record
behavior that could not be determined, values that conflict and need a canonical choice, and scope
decisions that belong to the product owner rather than to an analyst. They are the honest part of
the document and the main input to this gate.

## Decisions this gate should settle

These are choices no agent should make silently, because they change what the product *is* rather
than how it is built.

### 1. Compatibility ambition

How compatible must the rewrite be with the behavioral target?

- **Drop-in behavioral compatibility** — same on-disk formats, same command surface, same exit
  codes, same event vocabulary; existing sessions and scripts keep working. Maximum constraint on
  architecture, maximum interoperability.
- **Interface compatibility, free internals** — same user-facing surface, no promise that stored
  data or event streams interchange. Moderate constraint.
- **Behavioral inspiration** — the specification defines intent, and the rewrite is free to improve
  the surface where it is weak. Least constraint, no interoperability.

This decision propagates into almost every architecture decision that follows, so it should be
settled first.

### 2. Known defects and internal inconsistencies

The analysis surfaced places where the behavioral target does something that looks unintended, and
places where two of its own values disagree. Reproducing a defect is a legitimate compatibility
choice; so is fixing it. Each such case is recorded as an Open Question in its domain. The gate
should establish the default policy — reproduce, fix, or decide case by case — even if individual
cases are deferred.

### 3. Unbuilt and partially built behavior

Some specified behavior exists as intent rather than as working functionality in the target. The
gate should decide whether such behavior is in scope for the rewrite, deferred, or dropped.

### 4. Scope and sequencing

Twenty-one domains is a large surface for a first release. The gate should establish which domains
are in scope for the first milestone. This is a product decision, not an architecture one, and it
strongly affects how much architecture needs designing up front.

### 5. User-visible message text

Specifications state the information a message must convey rather than reproducing exact wording,
except where a string is part of a machine-readable contract. The gate should confirm this is the
intended policy.

## Exit criteria

The gate closes when the user records a decision on each item above and states that the
specification is sufficient to begin architecture design. Partial approval is acceptable — for
example, approving a subset of domains for architecture work while further analysis continues on the
rest.

## Record of decision

Recorded 2026-08-30 from the product owner.

| Item | Decision | Date |
|------|----------|------|
| Compatibility ambition | **Behavioral inspiration only.** The stated preference is no compatibility obligation at all: build to these specifications, not toward the behavioral target. No promise of interchangeable formats, command surface, exit codes, or event vocabulary. | 2026-08-30 |
| Defect policy | **Omit what conflicts.** Resolve internal contradictions as far as they can be resolved. Where sources disagree, a more recent specification wins over an older specification, and a specification wins over observed implementation behavior. What cannot be resolved is dropped rather than reproduced. | 2026-08-30 |
| Unbuilt behavior | **In scope.** Behavior that exists as intent rather than as working functionality is part of the rewrite. | 2026-08-30 |
| First-milestone scope | **Revised 2026-08-30: one Electron desktop application, and nothing else.** There is no command-line interface and no terminal user interface — not deferred, removed. Domains 17 and 18 are retired and their identifiers withdrawn; every capability they carried that a user needs is restated as desktop-reachable behavior in the domain that owns it. A surface in another domain is withdrawn on the same terms and reaches exactly as far: what goes is a way for a **user to drive this product** from a shell. The product *running* programs on the user's behalf is untouched. The rule is stated in full under *What these decisions change*. | 2026-08-30 |
| Message text policy | **Confirmed.** Specifications state what a message must convey; exact wording is fixed only where a string is part of a machine-readable contract. | 2026-08-30 |
| **Gate** | **CLOSED — approved 2026-08-31.** The product owner reviewed the converged specification and directed that architecture design begin. | 2026-08-31 |

## Gate closed

The specification is approved as sufficient to begin architecture design. Implementation remains
unauthorized: the Architecture Gate must be approved separately before any production code is
written. That gate is [`architecture-gate.md`](architecture-gate.md); it **closed on 2026-09-03**, and
implementation is authorized from that date within the bounds it records.

State at closure: 3,693 live shipping requirements across nineteen domains (3,930 identifiers
including 237 withdrawn in place), plus 444 identifiers in the two retired domains. This sentence
previously read 3,697 and 233, which was a stale copy of the figures as they stood *before* the sixth
reconciliation round; that round minted five identifiers and withdrew one more, taking 3,925 and 236 to
3,930 and 237, and the "What exists" section above already carried the corrected pair. Every open
question raised in the draft is disposed of, with the decision recorded in
[`../spec/resolutions/`](../spec/resolutions/). An independent read-only audit judged the set fit to
build from, on the grounds that nothing remaining requires re-deciding what the product is, what any
vocabulary contains, or what any requirement means.

### Amendments after closure

**The figures above are the state at closure and are now superseded.** The specification has been
amended since, under the standing direction recorded in
[`../architecture/owner-decisions.md`](../architecture/owner-decisions.md), which extends the
divergence latitude this gate granted for *behavioural* conflicts to *structural* ones: a requirement
that exists because of a process model this product does not have is a candidate for amendment rather
than a constraint to design around.

This gate's approval is **not** withdrawn or re-opened by those amendments. What it approved was that
the specification was sufficient to design from; that judgment stands. But a reader must not treat the
closure figures, or the phrase "approved as sufficient", as describing the corpus as it exists today.
`../spec/README.md` carries the current counts and is the authority for them.

Amendments made under the standing direction so far, in **ten** rounds. The **structural-ruling round**
applied SR-1 to SR-3; the **storage-ruling round** applied SR-4 to SR-8 and ESC-11, ESC-13, ESC-15,
ESC-16 and ESC-18; the **ruling-application round** of 2026-09-01 applied everything that was ruled and
never made — ESC-1, ESC-2, ESC-5, ESC-6, ESC-7, ESC-8, ESC-13's withheld half, ESC-19, ESC-20, ESC-21
and SR-9 — and swept all thirty rulings against the corpus so the same class of defect is detectable
rather than remembered. The **defect-correction round** of 2026-09-02 answered the twelve defects an
architecture pass returned after reading the amended corpus closely enough to implement it. The
**measurement round** of 2026-09-02 applied **ESC-26** and closed one gap that four architectural
measurements exposed. The **platform-defect round** of 2026-09-02 answered a second architecture pass —
eight measurements against the target platform — which named **three defects that would each cause a
conformant implementation to be built wrong and that no test would find**, and applied the seven owner
rulings of that date: **ESC-22, ESC-24 and ESC-27 to ESC-31**. The **restore-measurement round** of
2026-09-02 answered the first execution of `REQ-SESSION-201`'s restore, which found **two defects in the
requirement itself** and one state no requirement described. The **owner-ruling round** of 2026-09-02 applied
**GD-1** and **GD-4**, the two of the four Architecture Gate owner decisions that land in requirements.
The **notice-measurement round** of 2026-09-06 answered the two questions the notice pipeline's first
execution could not build past — one figure restated across domains, one closed vocabulary outgrown by two
requirements outside it. The **requirement-shape sweep** of 2026-09-02 was
not prompted by a defect report: it looked for the two *shapes* the previous two rounds' defects had, and
found four more, one of them in the requirement the eighth round's own correction cited as its authority.
**The first six are recorded in detail in
[`provenance.md`](provenance.md); the seventh, eighth, ninth and tenth are recorded here and not yet there**,
together with the count changes they produced, and that file is not this document's to edit.

**Current figures, superseding the closure figures above:** **3,953** identifiers across the nineteen
shipping domains, **258** withdrawn in place, **3,695** stating live behaviour; plus **444** identifiers
in the two retired domains, **10** of them withdrawn — **4,397** identifiers in all, **268** of them
withdrawn. The ruling-application round minted seven identifiers and withdrew none; the
defect-correction round minted one (`REQ-CONFIG-478`) and withdrew none; the measurement round minted one
(`REQ-EVENTS-179`) and withdrew none; the platform-defect round minted two (`REQ-MONITOR-306`,
`REQ-SHELL-169`) and withdrew none; the restore-measurement round minted one (`REQ-SESSION-202`) and
withdrew none. **No requirement's strength was reduced in the defect-correction, measurement, platform-defect or
restore-measurement rounds**, and live
behaviour grew by one, one, two and one respectively.

***One record-hygiene item is outstanding and is stated here rather than left to be discovered.***
[`../spec/README.md`](../spec/README.md) carries the per-domain breakdown and remains the authority for
it, and **it is one requirement behind**: its header still reads 3,952 / 3,694 / 4,396 and its domain-07
row still reads **201** where the domain now holds **202**. The delta is exactly `REQ-SESSION-202` and
nothing else — a new live requirement, not a withdrawal, minted contiguously after `REQ-SESSION-201`, so
the withdrawn counts (258 / 10 / 268) are unchanged and the README's "contiguously from 1 to its total, no
gap, no duplicate" invariant holds. The file was left alone deliberately: it is shared across the working
fleet and a concurrent edit to it would have collided. **The figures in this paragraph are the corpus as it
stands; the spec README's are the corpus before this round.**

**All three build-wrong defects the architecture named are closed, and this round created none.**
(1) `REQ-STARTUP-145` now states which per-user location is meant, once and at the definition, and states
that it governs over the platform's own default. (2) `REQ-TRACE-061` now states a bounded replacement
retry ladder — five attempts, 0.05 / 0.1 / 0.2 / 0.4 s, the last within 0.75 s of the first — with the
clause that stops the wrong build: the retry may **not** be conditioned on the product being able to
attribute the failure to another process holding the target. (3) `REQ-EVENTS-098`'s single unsatisfiable
sentence is now three separately citable clauses, in which blocking is absolutely forbidden, durably
recorded events must eventually be observable, and a measurable scheduling cost is expressly not a
violation. Two of the three were closed at the **definition** rather than at the dependents, which is
what makes them stay closed.

**The restore-measurement round, and it is the first round a specification defect was found by RUNNING
something.** `REQ-SESSION-201`'s restore had been decided on paper and never executed. On 2026-09-02 it was
built and measured (`../architecture/spikes/backup-restore-mechanism.md`), and **two of the three defects
that surfaced were defects in the requirement rather than in the architecture that implemented it.** That
distinction is the whole reason this round is recorded separately: an architecture record can be wrong
about a mechanism without the specification being wrong about the behaviour, and here the specification was
wrong too.

***Defect 1 — `REQ-SESSION-201`'s refusal-while-live was satisfiable by a conformant implementation that
destroys a session.*** The clause read "a restore MUST be refused while any session in the target store is
live". That attaches *refused* to the **decision to begin**, and one evaluation at the request discharges
it. Nothing re-checked and nothing forbade proceeding once begun. **The predicate itself was correct in 30
of 30** — it refuses a live lock, admits one the machine proves dead, refuses one naming another machine —
and a session was destroyed anyway: a run launched after the answer took the lock, wrote at twenty rows a
second, and was replaced whole. The neighbouring clauses do not close it. "Leave the store exactly as it
was" governs a restore that **fails**, and this one succeeded. "No partly restored store" governs the
installation, which was whole. "Never silently merges" comes closest, and an implementer can still say the
session arrived after "the target store" was evaluated — which is precisely the defect. **Fixed:** the
requirement now states that *the refusal holds for the whole of the restore and not only at the moment it is
asked for* — from the answer until the restore completes or is abandoned, no session in the target may
become live, and where one has, the restore MUST be refused rather than carried through. **Which end of the
window is closed is deliberately left to the implementation**; what is fixed is that there is no window into
which a run may be admitted. The requirement states the observable and does not decide architecture.

***Defect 2 — the same clause did not forbid the step that PRECEDES the loss, so it was testable only
after data was lost.*** Every step of the measured sequence but the last was permitted by the requirement
as written: the gate passes, the run host is told to refuse and close, the live run complies, and the swap
destroys it. **Fixed:** *a restore never disturbs a live session* — it MUST NOT stop, cancel, interrupt or
require a run that is under way to give up the store it is recording into. That is the restore-side
counterpart of the backup's existing not-pause, not-delay, not-throttle, not-disturb obligation, and it
makes the remedy on finding a live session **refusal**, never clearing it out of the way. *A run that is
asked to stand aside and whose record is then replaced has been destroyed by the restore whether or not it
complied.*

***Defect 3 — `REQ-SESSION-043` answered by listing cases, and the list was incomplete.*** It named two
states, answered both with an empty list, and left a third answered by nothing: a place for a workspace's
durable session store exists and **no store is in it** — reachable, durably, in 20 of 20 of the measured
failures. **`REQ-SESSION-202` is minted** and decides it: that condition reads as **a store that could not
be opened**, not as "no store". It resolves into `REQ-EVENTS-084`'s refusal by the route domain 07 already
owns, so domain 20 needed no edit. It fixes four things. **(a)** The product MUST NOT put a new store there
and MUST NOT report the workspace as holding no sessions. **(b)** It is reported and refused as any other
unopenable store is, and the report MUST say what was actually **found** — because no store is present to
give a reason of its own, `REQ-SESSION-089`'s "the store's own reason, unaltered" has **no referent here and
a reason MUST NOT be invented** to fill the slot. **(c)** The product MUST NOT resolve it by itself: an
action that establishes a new store there is one the user takes deliberately, told what was found and that
it recovers nothing — never automatic, never a default, never a side effect of starting a run or of opening
or preparing a workspace. **(d)** Its boundaries are stated: nothing kept at all stays `REQ-SESSION-043`'s
ordinary empty state; a place that is itself absent is an absence and not this condition, **including
mid-restore**; and a present store holding no sessions still lists empty. `REQ-SESSION-043` gained the
matching boundary sentence, on the same pattern `REQ-EVENTS-084` and `REQ-EVENTS-179` already use: its
empty answer is owed only where nothing is kept for the workspace at all, because an empty list asserts
that this workspace has no sessions here when what is true is that the product cannot tell.

***A finding about the specification's own strongest check, recorded because it is not visible from that
check's text.*** `REQ-EVENTS-179` is this corpus's statement that a store must be **proved** rather than
trusted, and **it passes cleanly against a store that is not there.** Its remedy is an operation that reads
and writes the store's own contents, and that operation is answered perfectly by the empty store the
attempt itself brought into being. The pair yields a rule worth stating once: **what must be established
before a store is used is not only that it works, but that it is the store this machine already had.**
`REQ-SESSION-202` states the limit and covers the case from the sessions side; **a reciprocal boundary
sentence in `REQ-EVENTS-179` would make the pair self-evident and was not written**, so if domain 20's
owner tightens 179 without knowing about 202, or a reader takes 179 as the complete answer to "is this store
usable", the gap reopens.

**One silence was confirmed and written down rather than only confirmed.** Nothing bounds how long a
restore takes, and that is a decision rather than an omission — the premise being that the restore is
refused while anything is live, which defect 1's fix makes firmer. It is now recorded in the requirement in
those terms, because a later reader meeting the backup's timing obligations and no restore counterpart would
otherwise either invent a budget or, worse, conclude that a restore may run alongside a live session because
nothing says it may not. The measured store-unavailable window is **64 ms to 1.45 s** over 68 KB to 313 MB
and exceeds no budget the specification states, because the specification states none.

**One requirement was amended, one was minted, one gained a boundary sentence, and nothing was withdrawn.**
Amended: `REQ-SESSION-201`. Minted: `REQ-SESSION-202`. Boundary sentence: `REQ-SESSION-043`. The round is
recorded in [`../spec/resolutions/07-sessions-persistence.md`](../spec/resolutions/07-sessions-persistence.md)
as a dated amendment, and **no prior disposition was reversed.**

***Three things this round did not close, stated so none of them is absorbed.*** **(1)** A lock row naming
another machine makes the target store **permanently unrestorable**, and it is a real domain-07 gap with no
owner: `REQ-SESSION-056` makes a foreign-host lock live by construction, `REQ-SESSION-047` never reaps it,
`REQ-SESSION-201` refuses while any session is live, and `REQ-SESSION-183`'s explicit per-session release is
the only clearing action — while foreign-host rows are dropped on the way **in** from the artifact and never
from the **target**. A machine rename creates the condition for every session at once, and defect 1's
durative fix makes it bite harder rather than less. **It needs an assigned decision.** **(2)** The transient
empty list during a restore is preserved **by decision, not oversight**: while the store's place is
momentarily absent, `REQ-SESSION-043` still answers "empty list", so a reader refreshing in that window sees
an empty list for a workspace with history. The architecture relies on that answer; `REQ-SESSION-202` names
it as an explicit boundary so nobody closes it by accident, and covering the window is a separate decision
that is not free. **(3)** Whether domains 12 and 19 have anywhere to **report** `REQ-SESSION-202`'s
condition was not verified. It routes through existing obligations, but a store-level condition is not a
session-level one and the session browser's error vocabulary may have no shape for "the place exists and the
store is not in it".

***What this round says about how the remaining defects are likely to be found, and it is narrower and more
useful than "mechanisms have bugs".*** **Neither gap closed here was in what a requirement SAYS.** One was
in **when** an obligation is evaluated — `REQ-SESSION-201` read as a test rather than as a condition — and
the other in **which states** a requirement enumerates — `REQ-SESSION-043` listing cases and leaving the
residue undefined. **Both are invisible to review of the words, and both appeared on first execution.** If
that generalises, the corpus's remaining exposure is concentrated in two shapes: requirements phrased as
"*X is refused while Y*", which should be read for whether the condition is durative or a single test; and
requirements phrased as **a list of cases**, which are only as good as the list and should be read for
whether they partition their subject or merely enumerate part of it. **A deliberate sweep for those two
shapes would cost less than waiting for each mechanism's first run to find them one at a time**, and it is
recommended rather than performed here.

**The measurement round, and what it turned on.** Four architectural measurements were taken on the
target platform on 2026-09-02 — a store on remote and synchronised storage, the transaction commit on the
publish path, the prepared portable's launch, and presenter liveness with the single-instance claim.
**Every owner ruling survived.** What the round did to the specification is two things and no more.

*First, it applied ESC-26.* `REQ-SESSION-197`'s absolute rule gains **one narrow exception**: the restore
of `REQ-SESSION-201` MAY establish this workspace's identifier as the artifact's, and no other action ever
may. The whole exception — all five conditions and the reason it is confined — is stated in
`REQ-SESSION-197`, because that is where the absolute rule lives and where a later reader looking to widen
it will be standing; `REQ-SESSION-201` carries a pointer, which is not decorative, because a reader of the
restore action would otherwise not know the confirmation exists. That follows the rule the
defect-correction round was run on: **a contract has exactly one home.** The requirement additionally
names the specific paths that do **not** gain the exception rather than only saying "no other path", says
it is unavailable unless every one of the five conditions holds so it cannot be adopted in part, and
closes with why it is confined — the rule it excepts protects against a folder moved, renamed, copied or
merely spelled differently, which is constant, while the recovery arises once in a workspace's life if at
all. **An implementation that finds this exception useful anywhere else has drawn the wrong lesson from
it.** `REQ-SESSION-089` was amended in step on the run-lifecycle side.

*Second, it closed a gap measurement exposed rather than argued.* `REQ-EVENTS-084` governed a store that
could not be **opened**; `REQ-EVENTS-088` governed a write failing **during** a run. The storage
measurement found that in every failing configuration the store **opened successfully**, reported itself
writable, and threw on the first statement after — 30 times out of 30 — a case belonging to neither as
written, which the measurement's own verdict row recorded as "INCONCLUSIVE, and a gap is exposed".
**`REQ-EVENTS-179` is minted**: a store that reports itself open is not yet known to be usable and must be
**established as usable** before the run starts; nothing the store reports about itself is sufficient
evidence; the check must be an operation that reads and writes the store's own contents — a write made and
then undone, so nothing is added — and must not be a reading back of what the store says about its state;
it sits where `REQ-EVENTS-035` puts establishing the store and runs before `REQ-EVENTS-087` creates the
history; where it fails the store counts as one that could not be opened and `REQ-EVENTS-084` governs
unaltered; and **the failure must not be retried into success, swallowed or reduced to a warning —
exactly one attempt, its outcome decides, and a store that fails and then works still refuses the run.**
`REQ-EVENTS-084` and `REQ-EVENTS-088` each gained the boundary sentence that routes to it, and
`REQ-SESSION-089` gained the matching clause. *That last clause is the one an implementer will soften,
because retrying makes the symptom disappear; it is the only clause in the amendment whose violation looks
like success, and it should have a conformance test.*

**Five requirements were amended in place and one was minted. No identifier was withdrawn.** Amended:
`REQ-SESSION-197`, `REQ-SESSION-201`, `REQ-SESSION-089`, `REQ-EVENTS-084`, `REQ-EVENTS-088`. Minted:
`REQ-EVENTS-179`.

**One thing the round deliberately did not do, and it is recorded because the instruction was
conditional.** `REQ-SESSION-070` was checked against a measurement that read a terminal status back at the
weaker durability setting, across two operating-system processes and two different bindings. **The
requirement needed no change and none was made**: it is already stated purely as readability, it names no
durability level, no sync setting and no power-loss survival, and its trailing "durable" is this
specification's own sense, fixed by `REQ-SESSION-067` and by `REQ-SESSION-034`'s crash-loss budget, which
is explicitly about a killed process and a half-written record rather than a power cut. **The false reason
is not in the specification** — it is in an architecture record, and it has been corrected there.

**The defect-correction round, and what it turned on.** The architecture pass reported twelve defects;
ten belonged to the specification, and four of those were named as items that would each cause a
conformant implementation to be built wrong or an owner-minted feature to be incomplete, with no test
catching any of them. **Three of those four were closed by that round. The fourth was ESC-26, and it is
now closed too**: the owner ruled it on 2026-09-01 and the measurement round applied it on 2026-09-02.
**All four build-wrong items are closed.**

Of the twelve entries overall: **seven are closed outright** (entries 1, 2, 3, 4, 5, 9, 11 — entry 2 is
ESC-26, closed by the measurement round); three are closed as defects with the product decision inside
each raised rather than taken (entries 6, 7, 8, giving ESC-30, ESC-31 and ESC-28/ESC-29); one is half
closed (entry 10 — the directory-identity half is closed and the per-user-storage half is not); and the
entry the architecture itself filed as minor (entry 12) is partly open — the `secrets.yaml` file mode is
raised as ESC-27, and the repair notice stated in the singular, the residual file language in the
improvement store, and the silence about cancelling a backup in progress are each left as recorded,
because each is a surface choice a user would see rather than a reading a builder could get wrong.
*(One item of entry 12 has since been closed by measurement rather than by amendment: the cancellation
silence is now a priced silence rather than an unbounded one, because the snapshot mechanism measured a
median 1,077 ms per 41 MB. The silence itself stands.)*

**The five product decisions this round raised are ESC-27 to ESC-31.** *Status corrected 2026-09-02:
**all five were ruled on that date and all five are now applied**, together with ESC-22 and ESC-24, by
the platform-defect round. This paragraph previously read "NONE of them has been ruled" and the five
bullets below stated each as open; each bullet now carries its ruling and where it landed. ESC-31's
architecture consequence — ADR-0024's choice of what identifies a permission-audit entry — is
discharged: the identifier is a field of the entry, and the reason is `REQ-EVENTS-056`'s obligation that
a locator resolve through the export.*

The four build-wrong items:

| Defect | Status | What was done |
|---|---|---|
| Two literal strings for one refusal (`REQ-GIT-124` / `REQ-GIT-128`) | Closed | `REQ-GIT-128` is now the single definition of both integration-lock refusal texts; `REQ-GIT-124` cites it and states the busy string nowhere. `A worktree integration is already running.` occurs nowhere in the corpus; `Another worktree integration is already running.` occurs once |
| Two key inventories for the batch trajectory document | Closed | `REQ-EVENTS-144` is the single definition — `trajectory_version`, `count`, `trajectories`, closed at three. `REQ-SESSION-189`'s two-key inventory is withdrawn in place with the reason and the literal quoted; `REQ-SESSION-193` states the wrapper is not one of its three documents; the Data & Formats statements in domains 07, 18 and 20 all now cite or record withdrawal |
| `REQ-STARTUP-165`(c) and (d) jointly unsatisfiable | Closed | (c) names a run-scoped placement and fixes a closed set of two locations for it; (d) states that placement as its single exception and licenses nothing further. The conservative reading was taken and the permissive one explicitly refused |
| ESC-26 — the workspace identifier cannot be re-established | **CLOSED 2026-09-02** *(was: open, with the owner)* | Ruled 2026-09-01 and applied by the measurement round. `REQ-SESSION-197` gains one narrow exception bound by five conditions, available only inside `REQ-SESSION-201`'s restore and on explicit confirmation naming both identifiers; `REQ-SESSION-201` carries the pointer; `REQ-SESSION-089` amended in step. The absent-identifier case is explicitly **not** the exception, an unreadable identifier is still reported and never overwritten, and the displaced store is moved aside and kept |

The remaining six specification-side defects: the traceability index against the read-path purity rules
is closed by a bounded, observably-inert carve-out owned by `REQ-TRACE-089`; the two exports that asked
for a statement no store was obliged to make are closed by putting the obligation on the retention
requirements (`REQ-TRACE-405`, `REQ-LIBRARY-052`) rather than on the exports, with the sharper
never-recorded-versus-pruned case escalated and the falsehood it produced fixed meanwhile; the denial's
evidence reference is closed by making `REQ-EVENTS-056` the single definition of the locator, fixing its
three record-kind tokens, and obliging `REQ-TOOLS-079` to give an audit entry an identifier; the
withdrawn-key dead end is closed by `REQ-CONFIG-478`; the bearer tokens are out of the workspace; and
`REQ-CHAT-055`'s two readings are resolved to the one the corpus measures everywhere else.
`REQ-STARTUP-163` now owns what makes two directory strings the same directory, which closes OQ-49 and
the first half of the tenth defect. **The second half is closed too, as of the platform-defect round of
2026-09-02.** *This paragraph previously read "the second half of that defect is not closed — nothing yet
says which per-user data location is meant on a platform that offers both a roaming and a machine-local
one", and that is superseded.* `REQ-STARTUP-145` now states the selection once and at the definition,
states that it governs over the platform's own default, and states that conformance is decided by the
directories the product actually writes to. The four requirements that each said so for themselves now
cite it; `REQ-STARTUP-161`'s instance record **gained** the property it had never stated; and
`REQ-SHELL-006`'s desktop preference store, which is not one of `REQ-STARTUP-145`'s directories and so
inherited nothing, gained the same selection with its own reason.

**Five product decisions were raised rather than taken in this round**, each because it changes what a
user sees and the specification had no answer to reason from. They are recorded here because the
architecture record is not this round's to edit; they are numbered on from the escalations already in
[`../architecture/open-questions.md`](../architecture/open-questions.md).

- **ESC-27 — `secrets.yaml` has no file mode.** `REQ-CONFIG-216` fixes the write as atomic and
  directory-creating and states no mode, so the one configuration file that holds credentials by design
  inherits the process mask. `0600` plus the explicit access-control list `REQ-PROVIDER-016` requires
  treats it by what it holds; `0644` treats it by what it is, matching every other configuration file.
  Recommended: the former. One clause in `REQ-CONFIG-216` once ruled.
  **RULED AND APPLIED 2026-09-02: `0600`.** `REQ-CONFIG-216` now requires every write to leave the file
  at mode `0600` with no group or other bit, applied **explicitly on every write** rather than inherited
  from the mask or the parent directory; on a platform with no POSIX mode the protection is the explicit
  owner-only access control `REQ-PROVIDER-016` fixes, cited and not restated; and `REQ-CONFIG-444`'s
  "leave the platform's own default in place" fallback is **explicitly denied** to this file, since
  inheriting the platform default is the outcome the escalation was raised about. Where the protection
  cannot be applied the write does not happen. `REQ-MCP-082` and domain 16's secrets appendix, which
  restated the write without a mode, now cite `REQ-CONFIG-216` instead. **OQ-14 is closed by amendment**
  and its entry should be marked closed, pointing at `REQ-CONFIG-216`; the "(OQ-14, unclosed.)" above is
  superseded, and ADR-0004's table entry reading "no mode at all (OQ-14)" is now false.
- **ESC-28 — should the product do more than tell a user about a withdrawn configuration key?**
  `REQ-CONFIG-478` fixes the honest minimum and grants no licence to edit a user's file. Opening the
  offending file for editing from the failure report, or offering a confirmed one-click removal, are
  both further options and both are user-visible. The second sits against the rule that the product
  does not repair a user's configuration and would need that rule narrowed explicitly.
  **RULED AND APPLIED 2026-09-02: report and carry on.** `REQ-CONFIG-183` now owns both outcomes. A key
  this specification defined and withdrew, and a key it names as not a configuration key of this domain,
  are **reported and ignored**: they contribute nothing to the merge, every other key loads as though
  they were absent, and the workspace opens. The hard load failure for a genuinely unknown key is
  restated as **unweakened**, with its ground stated, and the carve-out is bounded in terms to exactly
  those two kinds of key. The second half of ESC-28 — a confirmed one-click removal — was **not** taken:
  the ruling was "report and carry on", and a removal action would need the no-repair rule narrowed,
  which nobody has ruled. The report's content moved from `REQ-CONFIG-478` into `REQ-CONFIG-183`, marked
  in the former as relocated rather than withdrawn.
- **ESC-29 — a withdrawn key in the *global* scope stops every workspace opening.** `REQ-CONFIG-478`
  names the consequence and makes it recoverable by requiring the scope to be reported, but no
  in-product surface is reachable from that state, including the settings screen that would edit the
  global file. Worth ruling together with ESC-28.
  **RULED AND APPLIED 2026-09-02: the same rule.** `REQ-CONFIG-183` carries the global-scope reasoning
  in terms — one line in one file would stop *every* workspace opening at once, with no surface of the
  product reachable to repair it, the settings screen that edits that very file included — as the ground
  for the carve-out rather than as an exception to be tidied away later.
- **ESC-30 — a version missing because it was never recorded is not distinguishable from one retention
  pruned.** `REQ-LIBRARY-052` now obliges the store to state how many versions pruning dropped, and
  `REQ-LIBRARY-176` now forbids the export from implying that figure accounts for every absence.
  Whether the export must tell the two causes apart is the owner's: bringing version recording inside
  the write's all-or-nothing boundary makes the audit trail complete at the cost of review actions
  failing in a workspace whose version store is unwritable, and disclosing both causes keeps the write
  path as it is at the cost of the product formally accepting a history with holes. A conformant export
  can be built today under either ruling and widened later without rework.
  **RULED AND APPLIED 2026-09-02: make them distinguishable.** `REQ-LIBRARY-047` gains the store
  obligation — each artifact write records, inside its own all-or-nothing operation, that a version was
  due, so a version the best-effort recording then failed to write is afterwards known to be absent and
  countable — with guards so it does not overreach: recording that a version was *due* is not recording
  the version, version recording stays best-effort, and a version that cannot be recorded still does not
  undo the artifact write. `REQ-LIBRARY-176` carries **two separate figures** per artifact, each
  identified as which of the two it is, each stated as zero rather than omitted where neither has
  occurred. `REQ-TRACE-514` carries the distinction from the other side by stating that in the delivery
  store retention is the only cause there is, because `REQ-TRACE-405` makes writing the record a
  condition of the state-changing action completing. Both exports are forbidden from carrying an absence
  figure in a shape shared with the other.
- **ESC-31 — where the permission-audit entry's identifier lives.** `REQ-EVENTS-056` fixes the locator's
  form and its `permission_audit` token, and `REQ-TOOLS-079` is now obliged to give an audit entry an
  identifier. Whether that identifier is a further field of the entry, or is not a field at all and
  travels beside the entry wherever the audit is rendered and exported, is left open in
  `REQ-TOOLS-079` and in `REQ-SESSION-199` because the two are observably different in the exported
  audit file. Whichever is chosen, `REQ-TOOLS-079`'s no-argument-values property must survive
  untouched: it is what makes the audit exportable at all under `REQ-TOOLS-190`.
  **RULED AND APPLIED 2026-09-02: in the entry.** `REQ-TOOLS-079` now states that the identifier is a
  field of the entry, names it in the field set so the enumeration and the ruling do not contradict each
  other, and carries the reason — `REQ-EVENTS-056` requires the locator to resolve **through the
  export**, on a machine carrying none of this product's code, and an identifier not part of the entry
  does not survive the entry being exported. The no-argument-values property is preserved and restated
  as a standing prohibition: the identifier may not be derived from, and may not disclose, any argument
  of the call. `REQ-EVENTS-056` was narrowed in step so that a kind holding entries of more than one
  shape stays nameable while its unidentified entries are not — without which `permission_audit` would
  have become unnameable and `REQ-TOOLS-081`'s evidence reference impossible to write.
  `REQ-SESSION-137`'s field-set restatement, which named no identifier, is withdrawn in place and
  replaced by a citation, and `REQ-SESSION-199`'s export clause now reads on entries that have an
  identifier. **What is still not fixed is the field's *token*** — the ruling settled where the
  identifier lives, not what it is called, and minting a name would have been a decision the ruling did
  not make. `REQ-TOOLS-079` fixes the property instead: the same field in every entry and in every
  export, locatable as the identifier.

**Why this round existed, recorded so the lesson is not lost.** Several rulings in the table below were
recorded as decisions and then never applied to a requirement, because no workflow was ever scoped to
apply them and nothing checked. ESC-5's pooled terminal backend was still fully specified; ESC-7's
plugin file extension was still fixed in four places across two domains; ESC-1 and ESC-2 still stated in
the present tense the behaviour the owner had refused. A ruling recorded is not a ruling applied, and
the table below now records **status against the corpus**, not status against the decision record.

| Ruling | Status | Effect on the specification |
|---|---|---|
| SR-1 — one running instance | Applied | Four identifiers minted in domain 11 for single-instance launch behaviour |
| SR-2 — a run this application does not own cannot be viewed | Applied | The live tail-following protocol withdrawn across domains 02, 07 and 20 |
| SR-3 — no polling | Applied | Both poll cadences withdrawn, replaced by sequence-numbered updates with gap detection. REQ-SESSION-071's no-polling rule now has no exception, and the new exports are explicitly forbidden from becoming one |
| SR-4 — a database for what only the application reads | Applied | The fixed session-directory layout is withdrawn (REQ-SESSION-003, REQ-SESSION-004, REQ-SESSION-010) together with the fixed event-history paths (REQ-EVENTS-079, REQ-EVENTS-093) and the legacy-snapshot restatement (REQ-MONITOR-236). Sessions, event history, timeline, evidence, the permission audit, the checkpoint index, delivery records and the improvement library become records; configuration, personas, model slots, the requirement documents, the baselines, the generated symbol artifact, the tombstone log, the session log, the session summary and provider credentials stay files; artifact, attachment, image and check-output **bodies** stay files referenced by record. The ten-second persistence debounce is withdrawn outright, which is what makes REQ-MONITOR-218 and REQ-MONITOR-221 simultaneously satisfiable. Two new requirements state the file/store boundary so it cannot be eroded later: REQ-CONFIG-477 and REQ-TRACE-513 |
| SR-5 — a workspace held by another machine is refused | Applied | REQ-SESSION-048 becomes the single definition of what a lock refusal must convey, and must say the workspace is open on another machine rather than report a lock conflict. Refinement 2 is minted as REQ-STARTUP-166: shared or synchronised storage is detected **directly** and warned about, on every path that opens a workspace, refusing nothing |
| SR-6 — the export obligation covers every record a user could previously read | Applied | REQ-EVENTS-166 becomes the single definition of what an export must guarantee. REQ-SESSION-199 is minted for the timeline, the issues record, the metrics document and the permission audit; REQ-SESSION-189 and REQ-EVENTS-172 carry the event history. REQ-SESSION-191's reveal action survives for the log, the summary and artifact bodies. Each export is explicitly **not a channel** onto a live run |
| SR-7 — the onefile portable extracts once to a cache | Applied | REQ-STARTUP-165 minted for the launch preparation. REQ-STARTUP-013 and REQ-STARTUP-031 are unchanged; REQ-STARTUP-155 gains a first-run exemption defined as the first run of a given artifact **version**. REQ-STARTUP-106, REQ-STARTUP-115 and REQ-STARTUP-125 now take both the flavour classification and the update target from the artifact the launch started from, never from the running image |
| SR-8 — REQ-ORCH-155's 100 ms is a percentile | Applied | Stated as a 95th percentile, with the rule that a single update beyond 100 ms is not by itself non-conformant, and the percentile written out so this figure and REQ-MONITOR-222's are read the same way |
| ESC-11 — the release gate tests the wrong machine | Applied | REQ-STARTUP-156 now requires four conditions to be established before a pass may be recorded, widens from one artifact per platform key to every published artifact of that key, and requires two observed runs for a self-preparing artifact. A check that cannot establish the conditions is recorded not-performed and **fails** the gate |
| ESC-13 — the benchmark invariant against screen-reader access | Applied | The canvas is refused outright, which needed no amendment. The withheld half is now applied: **OQ-28 is resolved to the framework-neutral reading**, stated as operative in REQ-UIBENCH-050, and REQ-UIBENCH-054's element-count invariant is relaxed to a bound on the count's variation — carried by a new `widgets_samples` field at the 11 indices the tail phase already samples, because a comparison between phase records alone would have deleted the no-accumulation guarantee rather than relaxed it. REQ-UIBENCH-085 is rewritten to report the relaxed rule and its summary key renamed accordingly |
| ESC-14 — corrections to SR-4's own reasoning | Applied | The withdrawn OQ-41 claim is not relied on anywhere. REQ-TRACE-513 states positively that no store's concurrency properties reach the four traceability artifacts, so the withdrawn reasoning cannot be re-derived |
| ESC-15 — the store is machine-local | Applied | REQ-SESSION-197 (the workspace identifier) and REQ-SESSION-198 (the machine-local store) minted. The store is **not** at `<workspace>/.rotaris/workspace.db`; it is located by a stable identifier that travels with the workspace. A workspace on a share or in a sync folder is fully usable |
| ESC-16 — a store that will not open means no run | Applied | REQ-SESSION-089 and REQ-EVENTS-084 both amended, and they agree: the session refuses to start, on REQ-EVENTS-021's terms, with the store's own reported reason carried unaltered |
| ESC-18 — ESC-3 has been overtaken | Applied | REQ-LIBRARY-042's read-modify-write takes effect as one indivisible step; the closing concession records the accepted defect as withdrawn *as unreachable, not as unimportant*, and states that no guarantee has been relaxed. ESC-3's last-writer-wins semantics on the same proposal are untouched |
| ESC-1 — the composer's permission-mode write path | Applied | REQ-CONFIG-288 no longer states the coupling; it records the decision against it. The composer's control writes its single key through the scoped per-field writer (REQ-CONFIG-441) and commits nothing else, so pending Settings edits stay pending, stay dirty, and are still undone by Discard. REQ-CONFIG-423's guarantee is preserved by amending its antecedent rather than the guarantee, and REQ-CONFIG-418 needed no change — both were named by the ruling as not to be broken. REQ-TOOLS-077 stated the same refused coupling from domain 05 and is amended with it |
| ESC-2 — preserve comments on configuration write-back | Applied | REQ-CONFIG-252 now states that comments, formatting and layout are **preserved**, the write being a targeted edit of the existing document rather than a re-emission of the whole of it, including the comment header the first-run bootstrap wrote (REQ-CONFIG-025). It is now the single statement of that discipline for every writer of `agents.yaml`. REQ-CONFIG-248's key order preserved and never alphabetised is unaffected, as the ruling said |
| ESC-3 — silent loss of a review decision | Applied as ruled, then overtaken | The ruling was "match the specification". **ESC-18 overtook it** and is itself applied: REQ-LIBRARY-042's read-modify-write is indivisible and the accepted defect is withdrawn as unreachable. ESC-3's last-writer-wins semantics on the *same* proposal are untouched |
| ESC-4 — a workspace with no repository has no undo | Applied — no amendment authorised | The gap is accepted as specified. REQ-GIT-044 and REQ-LIBRARY-163 already state it and are unchanged |
| ESC-5 — the pooled terminal backend | Applied | One terminal backend ships. `tmux-pool` and the `kill_status` values `pane_replaced` and `replace_failed` are withdrawn as vocabulary, recorded in place inside REQ-TOOLS-099 and REQ-TOOLS-100 rather than deleted silently; the `backend` **field** is kept for forward compatibility with the consumer rule made explicit. REQ-TOOLS-103's pooled-recovery ladder is withdrawn and its well-formed-observation guarantee generalised off the backend; REQ-TOOLS-187's two-backend parity clause is restated as a forward-compatibility guarantee. The sweep found and fixed two further sites: REQ-TOOLS-111's teardown wording and a limits-table row restating the withdrawn figure |
| ESC-6 — Windows users get no confinement | Applied | The specification is accepted for the first release and the state is now **disclosed** rather than only resolvable. REQ-SANDBOX-130 is minted: one fact, required on two surfaces — beside REQ-SANDBOX-116's availability label without the user having to select a mode first, and on REQ-SANDBOX-119's launch dialog before the run begins, for attended and unattended sessions alike and also when REQ-SANDBOX-107's advisory is empty. REQ-SANDBOX-065's closed platform set, REQ-SANDBOX-048's refusal of an opportunistic mode and REQ-SANDBOX-095's refusal to start are all unchanged; the requirement adds no capability and moves no verdict |
| ESC-7 — the plugin language | Applied | The `*.py` extension is withdrawn from all four sites it occupied: REQ-TOOLS-165, the domain 05 workspace layout, REQ-CONFIG-277 and the domain 15 workspace layout. REQ-TOOLS-161 now **owns** what a plugin file is — a module the host process can load and call directly — and states that no language, runtime, packaging form or file extension is fixed anywhere in this specification. The extension's one real job, deciding what the settings inventory lists, is replaced by a stronger technology-neutral rule: the tab lists exactly the set `custom_tools:` can load |
| ESC-8 — what the update path establishes | Applied | The release publishes a detached signature over the checksum manifest's exact published bytes. REQ-STARTUP-167 is minted as the single definition of publisher authenticity for updates — keys ship inside the artifact, the trusted set is fixed at build time and unreachable at run time, and there is no override by which an unverified update installs. REQ-STARTUP-168 is minted for key rotation stated behaviourally. Nine requirements are amended in ripple, including REQ-STARTUP-122's ordering (verify before parse, so an unattributable manifest costs no download) and REQ-STARTUP-123, whose closing sentence had stated the very defect the ruling names. The transfer-integrity guarantee and the four hash-failure sentences REQ-STARTUP-120 consumes are preserved exactly |
| ESC-9 — session retention | Applied — no amendment authorised | Purely an architecture decision. Retention stays unbounded; the derived read index is ADR-0003's |
| ESC-10 — controlling a run owned by a second instance | Applied, then dissolved | REQ-MONITOR-013 states the boundary as one between processes of the **one** running instance, never between two instances and never to a run this application does not own. REQ-SESSION-159 states the two conditions. The refusal survives as a defence against a state that should not arise |
| ESC-12 — the tool-server protocol era floor | Applied — no amendment authorised | The ruling chooses an SDK line, which is a technology decision. No requirement states a protocol era, and REQ-MCP-067 and REQ-MCP-048 are unchanged and unaffected |
| ESC-19 — the backup disclosure | Applied | Option 1 *and* half of option 2. REQ-SESSION-200 is minted for the disclosure and may not be delivered only inside a failure message; REQ-SESSION-201 is minted for a whole-store backup and restore, consistent while runs are live, explicit, never silently merging, refused while any session in the target store is live, and carrying the workspace identifier. The configurable store location is **refused**, so ADR-0058's location decision does not reopen. Both requirements state why a backup is not a duplicate export, and REQ-SESSION-199 gained the matching clause from the export side |
| ESC-20 — the export list, and where SR-6's reasoning stops | Applied | REQ-TOOLS-190's *readership* argument is withdrawn as the wrong test and replaced by the **redaction-safety** test, which that requirement now owns: a record gains an export when it carries no unredacted user or tool content. Under it the verification-gate record gains an export and REQ-SESSION-136's tool-call evidence never does — stated as an absolute that a later widening must be refused rather than reconciled. SR-9(a)'s two exports are minted as REQ-LIBRARY-176 and REQ-TRACE-514. REQ-EVENTS-163, which read as granting the tool-call evidence record an export, is narrowed |
| ESC-21 — the integration lock on synchronised storage | Applied in direction; **strength still pending, and spike 19 has run without deciding it** | *Status corrected 2026-09-02: spike 19 measured ESC-21's first premise — exclusive create is a genuine primitive over a network share, 2,500 races, exactly one winner in 2,500 — and could not measure the second, which needs two machines and a synchronisation account. It stated the closing experiment precisely and declined to invent a result. The requirement's "the strength of the response is under review" therefore stands unchanged.* REQ-GIT-128 keeps every word of its case for the lock staying a file beside the workspace and gains the boundary within which that guarantee is true: exclusive create is not a primitive inside a file-synchronisation agent's tree, so the integration is **refused before anything is attempted** and the lock is not created at all. The classification is REQ-STARTUP-166's and is not made a second time; only the replicated classification refuses, and an inconclusive answer stays a silent negative. REQ-GIT-124, REQ-GIT-145, REQ-GIT-150 and REQ-GIT-151 are amended in step. The requirement states in terms that the strength of the response is under review |
| SR-9(a) — the export list was too short by SR-6's own reasoning | Applied | REQ-LIBRARY-176 (the improvement store, including the recorded version history REQ-LIBRARY-168 calls "the audit trail the write path keeps") and REQ-TRACE-514 (the delivery store, including each transition's acting party, time and stated reason). Both cite REQ-EVENTS-166 for the guarantee and apply it on REQ-SESSION-199's terms rather than restating either |
| SR-9(b) — a machine-local store changes what a backup protects | Applied | Discharged by REQ-SESSION-200 together with ESC-19's REQ-SESSION-201. The ruling recorded itself as the minimum honest fix and deliberately not the only option; ESC-19 then took the larger option's better half |
| ESC-26 — a restore may establish the workspace identifier, on explicit confirmation, and only there | **Applied 2026-09-02** | REQ-SESSION-197 gains one narrow exception and REQ-SESSION-201 gains a pointer to it, because a contract has exactly one home. Five conditions bind it and it is unavailable unless every one holds: only inside the restore, with the requirement **naming the paths that do not gain it** — workspace open or preparation, REQ-SESSION-060's repair, a migration, an update, a later convenience; explicit confirmation naming **both** identifiers and stating that this workspace's own sessions become unreachable from it, never automatic and never the default, with report-and-do-nothing kept as a correct outcome; the **absent**-identifier case unchanged and explicitly not this exception; a present-but-**unreadable** identifier still reported and never overwritten; and the displaced store moved aside and kept, with the confirmation saying where it went. REQ-SESSION-089 amended in step. The requirement closes with why the exception is confined, so a later reader looking to widen it meets the argument rather than the silence |
| ESC-22 — no requirement bounds the aggregate terminal-frame rate | **Applied 2026-09-02** | `REQ-MONITOR-306` minted: live terminal output reaching surfaces is bounded **in aggregate** — across every live stream, of every session, delivered to every window — at 1,000 frames per second, counted per delivery so a stream shown in two windows counts twice. It cites `REQ-TOOLS-126` for the per-stream period and `REQ-TOOLS-127` for what a frame is and copies neither; what it adds is that the number of live streams is not a multiplier on the per-stream period. Bounded on **frames and deliberately not on volume**, because a byte bound could be honoured only by discarding output, which `REQ-SHELL-103` and `REQ-MONITOR-294` both forbid. Stated as a condition of `REQ-MONITOR-222`, not a smoothness concern: it may not be widened, made configurable or raised by any per-stream setting unless `REQ-MONITOR-222` is re-measured at the new rate, and conformance is the delivered aggregate rate, never the appearance of a terminal grid. `REQ-MONITOR-287` and `REQ-SHELL-103` cite it and hold no copy of the figure |
| ESC-24 — a launch arriving inside the force-exit allowance | **Applied 2026-09-02** | `REQ-SHELL-169` minted: such a launch is **refused rather than admitted** and honoured once the shutdown has finished. Through that interval the instance builds no window, opens no workspace and writes nothing on the launch's behalf, the window `REQ-STARTUP-162` would otherwise have a window-less instance build included. The refusal is **answered, never silent**, because an unanswered launch is the path `REQ-STARTUP-164` keeps for a process that *cannot* answer, and taking it for one that can would produce the two simultaneous processes the refusal exists to avoid. Domain 11 amended in step so the two documents agree: `REQ-STARTUP-164` clause (3) now states that an answered refusal stops the 5-second reclaim running at all — without which the launch would reclaim the record four seconds into a thirty-second allowance and become exactly the second instance ESC-24 forbids — `REQ-STARTUP-162` gains the shutting-down exception to its build-a-window clause and states what a waiting launch shows, and `REQ-STARTUP-161` states that waiting is not a third outcome |
| ESC-27 — `secrets.yaml` has no file mode | **Applied 2026-09-02** | `0600`, applied explicitly on every write; see the ESC-27 bullet above. OQ-14 closes by amendment |
| ESC-28 / ESC-29 — a withdrawn configuration key fails the load | **Applied 2026-09-02** | Report and carry on; `REQ-CONFIG-183` owns both outcomes and the unknown-key rule is restated as unweakened. See the bullets above. The corpus was swept for every other site at which a configuration key causes a load to fail: `REQ-CONFIG-233`'s severity table routes the withdrawn case to warn-and-continue while keeping the never-defined case fatal, and `REQ-GIT-074` and domain 06's configuration appendix — which still said such a key "is rejected as an unknown key" while citing the requirement whose terms now say otherwise — are corrected |
| ESC-30 — a version never recorded is indistinguishable from one pruned | **Applied 2026-09-02** | Made distinguishable; two figures with two owners. See the bullet above |
| ESC-31 — where the permission-audit entry's identifier lives | **Applied 2026-09-02** | In the entry. See the bullet above. `REQ-EVENTS-056` was narrowed in step to keep `permission_audit` nameable, which the ruling would otherwise have turned into a flat contradiction with `REQ-TOOLS-081` |

**Where the specification and the architecture record still disagree.** *Status re-taken 2026-09-02, after
the measurement round. **The list below was accurate when it was written and most of it is not now**, so
each entry carries its current status rather than being deleted — a reader arriving from an ADR needs to
know whether the disagreement they are looking at was real and is fixed, or was never real.*

**Closed on the architecture side, verified against the records rather than reported:** items 1, 2, 8 and
9. ADR-0058 is now machine-local, keyed by the workspace identifier, and carries ESC-19's backup and
restore together with ESC-20's and ESC-21's consequences; ADR-0003 keeps "files are the system of record;
there is no database anywhere" only as the withdrawn alternative it now is, with all five of its
objections preserved so a reader can see why the record changed its mind; and `REQ-SESSION-201` has an
architecture home. **Still open and confirmed still open:** item 4 — `proposals/runtime.md` constraint
C3.6 is still the only place in the repository that mandates `REQ-SESSION-069`'s withdrawn log line
verbatim, as a HARD constraint, and the requirement has since withdrawn that line in place with the
instruction that no conformance test may look for it. **Item 6 is closed on the constraints side as of
this round**: `constraints.md` rows G-13, G-19, I-10 and T-39 have each been re-derived against the
applied ruling, with the falsified sentence quoted and marked withdrawn rather than deleted.

**Three further disagreements are recorded by the measurement round and are of a different kind — they are
not staleness, they are reasons a measurement disproved.** `owner-decisions.md` **cannot be edited by the
architecture record**, and two rulings carry a mechanism the measurements falsified: **ESC-15**'s "write-ahead
logging is unsupported on network filesystems, so the store opens read-only", which was measured false in
both clauses (the store never opened read-only in any network configuration, and logging worked over a UNC
path while failing on a mapped drive letter to the same share — the behaviour depends on the path
spelling); and **SR-7**'s "the artifact is identified by the packaging tool's own portable-executable
environment variable", which was set in **0 of 157** launches through the product's own launcher, because
it belongs to the packaging tool SR-7 exists to move off. **Both rulings survive** — ESC-15 on three worse
measured failures, SR-7 on the product's own declared variable, which carried the correct absolute artifact
path in 149 of 149 painted launches against `REQ-STARTUP-147`'s existing wording. **The corrections are made
in the ADRs and cannot be made in the rulings.** Whether the rulings should carry them is the owner's.
Third: **ADR-0019's header** describes a residual tension with `REQ-SANDBOX-101` that is materially
narrower than the record still says, because that requirement has since been amended to state the
capability test in terms.

The original three, as recorded by the storage-ruling round:

1. **ADR-0058 places the workspace store at `<workspace>/.rotaris/workspace.db`.** ESC-15 reverses
   that. REQ-SESSION-198 requires the store to be machine-local always, located by REQ-SESSION-197's
   workspace identifier and never by path. The ADR's consequence 3 — "a workspace on a network share
   is degraded, not merely slow" — is now **false**, and it is the most user-visible thing the ADR
   still gets wrong. The ruling itself says the ADR must be rewritten.
2. **ADR-0003 states that files are the system of record and there is no database anywhere in the
   product.** SR-4 reverses that in part. The ADR also needs a row for the workspace identifier, which
   is the one file whose loss orphans a user's history, and its worked example 3 needs to say where
   the session log and summary now live.
3. **ADR-0004's per-store policy table, ADR-0008 and ADR-0009** each cite a mechanism this round
   dissolved: the retry-schedule field, REQ-SESSION-132's create-if-missing initialization, and the
   claim that REQ-EVENTS-084's attach failure "becomes unreachable" — the amended requirement gives it
   a definite, user-visible outcome instead.

**Six more, added by the ruling-application round.** The first three are stale statements the
architecture record now carries against an amended specification; the last three are work the
architecture record does not yet contain at all.

4. **`proposals/runtime.md` constraint C3.6 mandates REQ-SESSION-069's withdrawn log line verbatim, as
   a HARD constraint.** It is the only place in the repository that still requires the string. Until it
   is corrected an implementer working from the proposal will produce a message the specification now
   forbids, and the disagreement is invisible unless both documents are read. `constraints.md` row D-10,
   `README.md` and ADR-0008 all record the same defect as open; it is closed on the specification side.
   This is the highest-value single correction outstanding.
5. **ADR-0020 and `proposals/exec.md` still carry ESC-5 as an open escalation**, and constraint C-74
   still states the four-value `kill_status` set and the two-name backend vocabulary. Both are decided,
   not open, and C-74 is now stale against REQ-TOOLS-099 and REQ-TOOLS-100.
6. **`constraints.md` G-13, G-19, I-10 and T-39 are each falsified by an applied ruling.** G-13 says
   comments are lost on the round-trip paths (ESC-2 reverses it); G-19 escalates the shared save path
   (ESC-1 removes it); I-10 states the element-count invariant as absolute across six phases (ESC-13
   relaxes it); T-39 states custom tool plugins as `*.py` files (ESC-7 withdraws the extension).
   ADR-0045's consequence 3 and ADR-0051's consequence 3 both resolve now that OQ-28 is answered.
7. **ESC-8 obligates ADR-0054 and ADR-0056 and neither has been written.** A release signing key must be
   held somewhere with custody rules, and a release is not publishable without a signature because the
   product refuses to install one. The verification keys must be embedded in the artifact by the build,
   because REQ-STARTUP-159 requires them to resolve from within what was installed with all network
   access blocked — a build that read them from the host trust store would satisfy nothing
   REQ-STARTUP-167 requires. REQ-STARTUP-168(b) also creates a release-time obligation no ADR owns: the
   pipeline must know which keys the already-published artifacts carry, before it publishes.
8. **REQ-SESSION-201 has no architecture home.** ADR-0058 says nothing about backup or restore, and the
   hardest part is not the store but the per-session **files** held with it, which no store engine's
   online-backup facility covers and which REQ-SESSION-200 names as outside a workspace backup. The
   restore's refusal while any session in the target store is live also interacts with the session lock
   and with SR-5's cross-machine case, where liveness cannot be established at all.
9. **The architecture record has not caught up with ESC-19, ESC-20 or ESC-21 at all.** Those three were
   ruled on 2026-09-01 against comparative evidence, after the architecture record was last revised.
   This is expected and is a separate pass; it is listed here so it is counted rather than assumed. It
   also carries one item the comparison surfaced directly against ADR-0058 — a native store module
   failing silently under an Electron runtime through an ABI mismatch, which must fail **loudly** on
   REQ-SESSION-089's terms.

**Ten more, added by the defect-correction round.** These are consequences of correcting the ten
defects, and none is the specification's to fix. They are recorded here so the Architecture Gate counts
them rather than rediscovering them. (a) ADR-0005 and the architecture `README.md` both carry the
two-spellings standoff for the busy integration-lock string as an open question the specification had
not settled; it is settled and both should be rewritten, keeping the surrounding observation that the
integration lock's texts are fixed while the session lock's wording is left to the implementation.
(b) ADR-0054's block headed as a specification defect it designs around is discharged, but by the
**conservative** reading rather than the permissive one its closing sentence predicted; its ephemeral
placement is now the requirement's first choice and gains a second, closed fallback. (c) ADR-0002's
canonicalisation rule is now specification (`REQ-STARTUP-163`) and should cite rather than decide, with
two additions it did not state — a trailing separator carries no meaning, and abbreviated alternate
spellings the filesystem itself resolves are resolved. Constraint W-25 moves from a ruling to a
requirement citation and OQ-49 closes. (d) ADR-0058 orders the workspace-store open on
`REQ-STARTUP-043`'s post-show activation; that list is now stated to be closed at four and the store
open is not a member, so the ordering must be re-pointed. **No requirement anywhere places the
workspace-store open after the window is shown**, and whether one should exist is domain 07's to decide.
(e) ADR-0024's shared record-kind token enumeration must adopt `issues`, `permission_audit` and
`tool_call_evidence` verbatim, and its never-dereference rule is now a requirement rather than an
architecture preference. Its choice that the audit entry's record id is the export ordinal is still
permitted and still unblessed, and depends on how the open escalation on that identifier is ruled.
(f) ADR-0040's hedge that the index reading "is arguable, and if it is wrong the index is not available
at all" is spent; the specification takes that reading, and adds two obligations the ADR does not state
— index maintenance emits no notice, log entry or statistic, and a failure to maintain one never
reports, never fails an operation and never makes one invocation wait for another. (g) ADR-0041 should
cite `REQ-TRACE-405` and `REQ-LIBRARY-052` rather than derive its counters, and must not treat its
counter-minus-retained-rows subtraction as universally valid: for an improvement artifact whose version
1 is synthesised rather than recorded it goes negative, which is why the requirements state an outcome
rather than a counter. (h) ADR-0004's consequence that the gateway staging directory "cannot be
relocated because consumers are pointed at it by an environment variable" runs backwards and is now
false in its conclusion; the specification has relocated it, and the ADR's atomic-write table still
carries the workspace path. ADR-0029 and `proposals/model.md` place the same directory in the workspace.
(i) ADR-0045's reservation that it "does not claim the requirement is met on the strict reading" of
`REQ-CHAT-055` is discharged: the specification answers to-paint. (j) `constraints.md` needs four rows
re-derived — D-21 has a second stated exception, Y-02's "nowhere an index could legally live" clause is
false, M-06 should record that a file's protection does not survive replication so the location is part
of the protection, and E-03 describes a stale cross-reference in `REQ-EVENTS-029` that the corpus no
longer carries.

Neither the Architecture Gate nor any implementation authorization can be granted until the two
records agree. The specification side of that work is now complete; the architecture side is not.

***Progress on that, stated so the gate is not misread in either direction (2026-09-02).*** The
architecture record has since caught up on most of the list above, and the ten specification defects it
raised are closed with each closure verified against the requirement text. **What still stands between the
two records is smaller and sharper than it was, and it is enumerable**: the four items listed as still
open above; the five product decisions ESC-27 to ESC-31, **none of which has been ruled**; two owner
rulings that carry a disproved reason and which only the owner can amend; the second half of the tenth
defect — nothing says which per-user data location is meant on a platform offering both a roaming and a
machine-local one, which the architecture record now names as a build-wrong item because three separate
mechanisms depend on the answer; and, on the architecture's own side, one mechanism that has never been
run (`REQ-SESSION-201`'s restore) and two sub-cases that went unmeasured inside spikes that otherwise
passed. **None of that is the specification's to fix except the per-user-location clause and ESC-27 to
ESC-31.**

Five minor defects remain open and are recorded in [`provenance.md`](provenance.md). All are pointer
defects — a citation naming the wrong requirement, or an owner missing its single-definition
sentence — where the behavior is unambiguous and only the signpost is wrong.

Two questions were answered in opposite directions by two resolution passes and are deliberately
left to the product owner rather than averaged, because each answer is coherent within its own
domain: whether a truncation marker counts inside or outside a character cap, and whether the
run-type vocabulary holds two values or three.

The clean-room residual recorded above stands: fifteen files carry short verbatim runs flagged as
minor concerns. The behavioral-inspiration-only decision reduces the exposure, because no
interoperability argument now requires reference-shaped detail to be preserved. It does not
eliminate it.

**Seven more, added by the platform-defect round of 2026-09-02.** These are architecture consequences of
this round's amendments, recorded here because the architecture record is not this round's to edit.

10. **`docs/architecture/README.md`'s gate verdict names three things that "would cause a conformant
    implementation to be built wrong today". All three are now closed** — `REQ-STARTUP-145`'s per-user
    location, `REQ-TRACE-061`'s absent ladder, and `REQ-EVENTS-098`'s literal reading — and list-A item 1
    and item 4 close with them.
11. **Constraint W-01 changes classification.** It reads "what stays RULING here is the choice of the
    LOCAL rather than the roaming tree, which `REQ-STARTUP-145` does not distinguish". The requirement now
    distinguishes, so that half moves from a ruling to a requirement citation, exactly as W-25 moved when
    `REQ-STARTUP-163` took ownership of directory identity. **Constraint B-23** restates
    `REQ-STARTUP-165`(a)'s machine-local bound, which is no longer in the requirement it summarises, and
    should cite `REQ-STARTUP-145`. **Constraint T-42** ("the aggregate terminal-frame rate is bounded by
    no requirement, and one conformance budget now depends on it") is discharged on the specification
    side by `REQ-MONITOR-306`. **Constraint X-19**'s first two obligations are now carried by the
    specification; its third — that the measured margin is a floor because the harness stored bytes in a
    ring rather than driving an emulator and a grid paint — is **not** discharged and stays
    architecture's. **Constraint W-21** should move from a ruling to a citation of `REQ-EVENTS-098`(a) to
    (c), keeping its measurement as the evidence for (c). **Constraint C-11** may now assert the property
    it was holding back on, and **constraint W-26**'s second half stops being derived.
12. **ADR-0004 is factually stale in two places**: its atomic-document table says `secrets.yaml` has "no
    mode at all (OQ-14)" and it cites `secrets.yaml` having no mode as "a requirement's silence (OQ-14)".
    `REQ-CONFIG-216` now fixes `0600`. **OQ-14 is closed by amendment** and its entry should say so.
    ADR-0004's "this record still declines to invent the constants" can be retired for domain 08, and its
    ladder field now has a second value; its consequence 9 is answered for two of the five export sites.
13. **ADR-0058 no longer has to defend its choice of the local rather than the roaming tree** — it is a
    requirement it can cite. ADR-0054 and ADR-0055 cite "the per-user data directories of
    `REQ-STARTUP-145`" and pick the property up automatically; each is worth a pass to confirm none still
    argues the point independently.
14. **ADR-0009 consequence 12 and ADR-0024's defensive paragraph** each name `REQ-EVENTS-098`'s intended
    reading *as a reading*. It is now the requirement's own text and both can shrink to a citation of
    (a) and (c). ADR-0058's three assertions of the non-blocking property map onto (a) and must not be
    read as covering (c); its "never observed the other writer's commits" finding is specifically (b).
    The architecture record cites `REQ-EVENTS-098` in more than forty places and several currently
    cannot say which half they mean; the clauses are lettered so they can.
15. **ADR-0055's and ADR-0014's ESC-24 gap is now a requirement rather than an argument**, and it carries
    one lifetime ordering the record does not state: **the hand-over listener must outlive the ordered
    teardown of `REQ-MONITOR-131` and survive until the process ends, force-exit allowance included**,
    because `REQ-SHELL-169` requires the shutting-down instance to *answer*. That is the one thing an
    implementation could get wrong while passing every other requirement.
16. **ADR-0041's shared export mechanism gains a constraint it did not have**: it may not emit one
    undifferentiated absent-entries figure across the two stores, and the two exports' shapes must
    differ. The improvement store needs a second, differently named figure alongside the pruned one.
    Separately, ADR-0041 now has four export destinations citing `REQ-TRACE-061`'s ladder and three that
    have the one-step obligation without one; a competing ladder owner minted for those three would give
    the corpus two owners for one concept.

**One coupling worth recording before it is discovered.** `REQ-TRACE-514`'s "retention is the only cause
there is" is true only while `REQ-TRACE-405` keeps writing the record a condition of the state-changing
action completing. Relax `REQ-TRACE-405` and `REQ-TRACE-514`'s statement becomes false silently.

### The owner-ruling round, 2026-09-02

The eighth round applied the two of the four Architecture Gate owner decisions that land in requirements.
The other two — GD-2, which corrects two rulings' reasoning in `owner-decisions.md`, and GD-3, which binds
a measurement to an implementation rather than to a gate — change no requirement and are recorded there
and in `../architecture/implementation-conditions.md`.

**This round is the first in which the specification was amended by a decision that had been deferred to a
document nobody had yet produced.** GD-1 turned on a question about the visual design reference, and GD-3
turned on whether a register of implementation-time conditions existed. It did not. That was checked rather
than assumed, and the register was created, because an obligation classed as binding-at-implementation with
nowhere to be written is not a lighter obligation than a gate condition — it is none.

**GD-1 — `REQ-CHAT-056` gains the Markdown dialect, and OQ-31 closes without the design reference.**

1. The requirement named five treatments and required links to be activatable, and said nothing about
   headings, block quotes, lists, task lists, tables or images. It now fixes the dialect: **GitHub Flavored
   Markdown, less raw HTML, less image loading.**
2. **Raw HTML in Markdown source is shown as text and never rendered as markup.** The reason is recorded in
   the requirement rather than left to the reader: rendering agent output as markup would let every model
   response introduce elements into the surface the user reads their workspace through.
3. **No image is ever loaded from a Markdown image reference**, whether it names a remote location or one
   on this machine. The remote half already followed from the existing prohibition on network requests
   during rendering. The local half did not follow from anything, and leaving it to be inferred would have
   invited the conclusion that a local path is therefore fine — which is wrong twice over, because a
   transcript that reads locations named by model output discloses whatever those locations hold, and
   because a filesystem read is not accommodated by the same clause's synchronous-completion rule.
4. **The architecture record's reason for deferring this was wrong and is recorded as wrong.** OQ-31 was
   held on the design reference as "as much a visual question as a functional one". The supported element
   list does not decide how a transcript looks; it decides what the renderer accepts from model output. The
   entry's own closing sentence, that images interact with the no-network-request rule, was the evidence
   for that and sat unread in the entry for as long as the entry existed.

**GD-4 — `REQ-SESSION-201` gains two clauses, both about states the first end-to-end measurement made
visible.**

5. **A restore under way is acknowledged and visible, and that obligation is separated from the duration
   silence it had been folded into.** The requirement records, deliberately, that nothing bounds how long a
   restore takes, because nothing is live for its duration to disturb. That reasoning is sound and stands.
   It answers a question about **runs** and had been standing in for the answer to a question about
   **people**, which is a different question. The request is now acknowledged on the shell's ordinary
   gesture terms and the user is told the workspace's sessions are unavailable while the restore runs.
6. **What is required is acknowledgement and not progress reporting**, stated as a ceiling rather than a
   floor. No proportion, no stage list, no estimate. The reason is structural: reporting stages means
   reporting from inside a sequence whose value is that it is indivisible, so a requirement asking for it
   would create standing pressure to subdivide the one part of the mechanism that must not be subdivided.
7. **The obligation exists because the interval is unbounded, not because it is long.** Measured at 64 ms,
   144 ms and 1.45 s over the sizes tested, with the whole action at 2.67 s at the top of that range — and
   nothing in this product caps how much a store holds, so those are a floor. A workspace silent for
   several seconds is a state the requirement permits, and it must not resemble a product that has stopped.
8. **A backup in progress may be abandoned, and abandoning it costs nothing** — the partial artifact is
   discarded, the store is untouched, and nothing partial or unreadable is left at the destination the user
   chose. Most of this records a property the mechanism already has. The destination clause does not, and
   it is the one that matters: a file that exists at the user's chosen path and cannot be restored is worse
   than no file, because its owner believes they have a backup.
9. **The same defect shape as `REQ-SESSION-043`'s, found the same day, in the same requirement family.**
   `REQ-SESSION-201` fixed what a backup covers, that it may run while sessions are live, that it must not
   disturb them, and where it is written — and left "the user stops it" answered by nothing. A requirement
   that answers by enumerating cases is only as good as its list. **This is the second instance in one day
   and the second in this domain**, and it is direct support for the sweep this record recommended and has
   not performed: requirements shaped as a list of cases, and requirements shaped "X is refused while Y".

**What this round did not close.** GD-1 leaves **OQ-30** open and leaves it the design reference's, along
with the information architecture of the seven primary views, the benchmark and diagnostics layouts, and
`REQ-SHELL-149`'s glyph vocabulary. Those are now IC-2 in the architecture record rather than gate items.
Nothing in this round touches the four defects that would cause a conformant implementation to be built
wrong, one of which — the foreign-host lock row making a store permanently unrestorable — is the
specification's and is still unowned.

**Count change: none.** Both GD-4 obligations are clauses of `REQ-SESSION-201` and GD-1's is a clause of
`REQ-CHAT-056`; no identifier was minted, renumbered or withdrawn. The corpus figures recorded for the
seventh round stand: **3,953** identifiers across the nineteen shipping domains, **258** withdrawn in
place, **3,695** carrying live behaviour, and **4,397** in all with **268** withdrawn. `../spec/README.md`
was one requirement behind after the seventh round and **was brought current in this one**, including
domain 07's row moving from 201 to 202.

### The requirement-shape sweep, 2026-09-02

The ninth round is the sweep the previous round recommended and did not perform. It looked for two shapes
rather than for defects, on the reasoning that both specification defects found by execution were invisible
to review of the words and both had a nameable form: one in **when** an obligation is evaluated, one in
**which states** a requirement enumerates.

**Method, recorded so the result can be judged.** Every requirement body in `docs/spec/` was parsed — 4,397
identifiers, matching the mechanical count exactly — and filtered mechanically. Shape A: a refusal or
prohibition governed by a temporal condition (*while*, *until*, *during*, *as long as*) where the guarded
operation is one that takes time, minus those already carrying durative language. Shape B: an answer given
by enumerating cases, minus those already carrying a boundary sentence. That produced 20 and 29 candidates
respectively, of which 6 were in the retired domains and excluded, and every survivor was read.

**Four defects found, and the first of them is the finding that justifies the sweep.**

1. **`REQ-SESSION-164` had exactly the defect `REQ-SESSION-201` was corrected for, and `REQ-SESSION-201`
   cites it as its own precedent.** The whole-store restore's refusal was corrected earlier the same day to
   hold for the whole of the restore, and the sentence that justified it reads "for the same reason
   `REQ-SESSION-164` refuses a checkpoint restore on a session that claims to be running". The model was
   never checked. Its refusal was evaluated once, at the request, with nothing re-checking and nothing
   forbidding the restore from proceeding once begun.

   **It is the worse of the two.** What a checkpoint restore replaces is the user's own working tree, not a
   record this product keeps, so a run admitted during it has the files it is reading and writing changed
   beneath it — and unlike a store the product owns, nothing about the working tree is this product's to
   put back. `REQ-SESSION-164` now carries the durative clause, the prohibition on asking a live run to
   stand aside, the obligation to undo a restore already begun, and the statement that it and
   `REQ-SESSION-201` are one rule with neither an exception to the other.

2. **`REQ-SHELL-155` restated the same refusal and inherited the same defect.** Corrected by citation
   rather than by a second statement: it now names `REQ-SESSION-164` as the owner of the condition, holds
   no copy of the window, and states only what the shell owes — that a restore refused because a session
   became live *after* the question was answered is reported in the same terms as one refused at the moment
   it was asked, so the user does not meet a different kind of failure according to when the refusal was
   reached.

3. **`REQ-SESSION-048` enumerated two cases keyed on what the lock says, and a lock may say nothing.** It
   declares itself "the single statement of what such a refusal must convey" and then distinguishes exactly
   two: the lock names this machine, the lock names another. **A lock that is present and cannot be read
   has no `host` to name.** That case is not obscure — `REQ-SESSION-056` and `REQ-SESSION-183` both name it
   explicitly, and `REQ-SESSION-056` makes it live by construction — so the single statement had nothing to
   say about a condition its own neighbours describe. It now covers it, and requires the report not to name
   a machine or a pid it does not have.

4. **`REQ-CONFIG-028` wrote the starter configuration on a determination it had not made.** Two conditions
   caused a write (absent, empty after trimming) and two caused a decline (a directory, bytes that will not
   decode). A target that exists and **cannot be read at all** — refused by the operating system, or failing
   for any other reason — is in neither set. Under the enumeration as written, an implementer reaching for
   the obvious construction treats an unreadable file as one it could not find and writes the starter file
   over the user's configuration. It now declines, and the three cases share a stated rule that survives a
   later edit to any of the lists: **the starter file is written only where the product has established
   that nothing is there, and never where it has failed to establish anything. Not being able to read a
   file is not evidence that the file is empty.**

**Three lesser findings, recorded and not fixed, because each is a surface choice rather than a reading a
builder could get wrong.** `REQ-STARTUP-114` admits one update operation in flight and refuses a second,
without saying when the in-flight state is established, which is a check-then-set shape rather than a
defect on a single-threaded surface. `REQ-TOOLS-160` declines a gate write in three cases and says nothing
about an otherwise-valid write that fails for a reason none of them names. `REQ-CHAT-159` fixes the outcome
for a catalogue command invoked with no argument and with an unrecognised one, and not for one invoked with
more arguments than it takes.

**What the sweep also establishes, which is worth as much as the defects.** The corpus is mostly *good* at
both shapes, and several requirements are models of them: `REQ-STARTUP-164` enumerates four launch outcomes
and states in terms that waiting is not a fifth; `REQ-SANDBOX-078` exists **only** to say what happens when
the check of the requirement before it races a filesystem change; `REQ-SANDBOX-077` partitions its space on
two axes rather than listing likely cases; `REQ-EVENTS-106` walks a decode-parse-shape-field ladder and
covers each rung; `REQ-MCP-055` enumerates five grant cases and closes them. **Both shapes were already
understood in this corpus.** What the sweep found is not a habit of writing them badly but four places
where a requirement was written before its neighbours existed and never revisited — which is why a sweep
finds them and a review of any one document does not.

**Cost, for whoever decides whether to repeat this.** One pass, mechanical filtering plus reading 43
requirement bodies, four defects, one of them in the requirement that the last round's own correction cited
as its authority. Against that: the two defects this shape produced before were each found by building the
mechanism and running it.

**Count change: none.** All four corrections amend requirements in place. No identifier was minted,
renumbered or withdrawn, and the figures recorded for the seventh round stand.

### The notice-measurement round, 2026-09-06

**The second round in which a specification defect was found by RUNNING something, and the first found by
running a mechanism this corpus had already resolved.** ADR-0049's notice pipeline had been decided on
paper in full and executed in part. On 2026-09-06 it was built whole (Part V) and measured, and the two
things it could not build without a ruling were both defects in the requirements rather than in the
architecture. Neither was a hard reading: each is visible the moment two documents are held side by side,
and neither had been, because nothing before this needed both at once.

***ESC-33 — a figure one domain owned, restated by another.*** `REQ-MCP-044` gave its construction warning
"a UI toast of severity 'warning' with an 8-second auto-dismiss". `REQ-NOTIFY-011` fixes the acknowledgement
lifetime at 4200 ms and says, in its second sentence, that it is the product's single definition of one and
that no surface declares a lifetime of its own. **A conformant build could satisfy neither pair of
sentences.** The shape is one this corpus already understands — it is why `REQ-NOTIFY-044` cites
`REQ-SHELL-023`, `REQ-CONFIG-269` and `REQ-LIBRARY-103` rather than holding lists of its own, and it is what
the ESC-27 follow-through fixed in `REQ-MCP-082` over `secrets.yaml` — but the sweep that found those
looked at *lists*, and this is a *scalar*. **Fixed:** `REQ-MCP-044` names the channel as a transient
acknowledgement held for the lifetime `REQ-NOTIFY-011` fixes, states that it declares none of its own, and
states that the durable half of its two-channel delivery is the session issue record. The 8 s is preserved
nowhere, and the amendment says where a longer-lived warning goes instead: `REQ-NOTIFY-040`'s persistent
notice, which is a severity decision and not a second lifetime.

***ESC-34 — a closed vocabulary that two other requirements had outgrown.*** `REQ-NOTIFY-044` enumerated
eleven notice actions and closed itself with "an action naming a value outside the owning domain's
vocabulary is not dispatched". Two requirements oblige a notice to offer an action the eleven could not
express: `REQ-NOTIFY-224`, in this same domain, whose unreviewed-hooks notice "offers an action opening the
review" — the modal dialog of `REQ-HOOKS-106`, not a settings category — and `REQ-WORKSPACE-152` (3), whose
first-launch notice carries "an action that starts the flow", a clause that requirement deliberately writes
stronger than its own clause (2), where the refusals get an action merely "leading to that same Settings
surface". **Fixed:** both members added, both carrying their object as every other member does — the review
parameterised by workspace, the setup by provider where one is named. **The precedent was already in the
domain's own record:** resolution 12 had faced this exact disagreement and ruled that "the action vocabulary
was corrected to match rather than the other way round".

***What this round says about where the remaining defects are.*** The restore-measurement round named two
shapes — a requirement phrased as "*X refused while Y*", and a requirement phrased as *a list of cases*.
This round names a third, and it is cheaper to sweep for than either: **a figure or a vocabulary that one
domain owns and another restates.** Both defects here are that shape. The corpus already has the remedy
written down in a dozen places — cite the owner, hold no copy — so a sweep is mechanical: every number and
every enumeration that appears in two documents is either a citation or a defect. Neither of this round's
defects was found by reading domain 16 or domain 19; both were found by a build that had to satisfy the two
at once.

***A finding about the first-execution policy itself, recorded because it is the first of its kind.***
GD-10 requires a mechanism's first execution to report back into the record that decided it. Every prior
application of it returned a defect in the *code* or in the *architecture record*. This is the first time
it returned defects in the **specification** from a mechanism the specification pass had fully resolved —
domain 19 closed with thirty-seven of thirty-seven questions RESOLVED and no escalations. **A closed
resolution record is evidence that every question asked was answered, and not that every question was
asked.**

**Count change: none.** Both corrections amend requirements in place. No identifier was minted, renumbered
or withdrawn, so the figures recorded above stand unchanged. **One requirement's observable was reduced**
and it is stated here rather than left to be noticed: `REQ-MCP-044`'s warning is now readable on screen for
4200 ms where the text said 8 s. Nothing that depended on it was weakened — the requirement's other channel,
the persisted `mcp_config` issue record, is what carries the warning after it leaves — but this round does
not claim, as the four before it could, that no requirement's strength was reduced. The round is recorded
in [`../spec/resolutions/16-mcp-integration.md`](../spec/resolutions/16-mcp-integration.md) and
[`../spec/resolutions/19-notifications-errors-recovery.md`](../spec/resolutions/19-notifications-errors-recovery.md)
as dated amendments; the rulings are ESC-33 and ESC-34 in
[`../architecture/owner-decisions.md`](../architecture/owner-decisions.md). **No prior disposition is
reversed.**

## What these decisions change

**The compatibility surface stops being an obligation.** Every requirement that exists only so the
rewrite would interoperate with the behavioral target is now optional. Where a name, format, exit
code, or event vocabulary is weak, the rewrite may improve it; where it is fine, keeping it is a
convenience, not a contract. This also shrinks the residual clean-room risk recorded above, because
the strongest reason to preserve reference-shaped detail no longer applies.

**Open questions become design decisions rather than research.** The specifications carry 743 open
questions across the 21 domains. Most ask what the behavioral target does in an under-determined
case. Under a behavioral-inspiration mandate that question no longer needs an answer: the product
owner's decision is that the rewrite chooses. These are therefore resolved on the clean side, with
no further reference access, by picking the behavior that is most coherent with the surrounding
requirements — and by omitting behavior whose conflicts cannot be resolved coherently.

**Scope is one desktop application.** The first release is the Electron desktop application and it is
the only way a user drives this product. The terminal UI and the command-line and headless entry
points are removed from the product entirely. Unbuilt-but-intended behavior in the remaining domains
is in scope. Removing an entry point must never remove a capability: where a behavior was reachable
only from a shell, it is restated as desktop behavior rather than dropped.

**The rule is about who is driving, not about text on a screen.** What the decision removes is a way
for a *user* to drive this product from outside its window: a command-line entry point to the
application, the argument vocabulary and subcommands behind it, the process exit codes it would set,
the script-oriented output streams it would write for another program to parse, and a full-screen
text-mode frontend standing in for the desktop window. Nothing else is removed by it.

What the product does *on the user's behalf* is fully in scope, and is a large part of what the
product is for. The agent's terminal execution and the commands it runs, lifecycle hooks (domain 09),
tool servers on the stdio transport (domain 16), version-control invocations (domain 06), child
processes the application starts for itself, and the maintainer-side build and release pipeline —
automation reporting to automation, not a surface the shipped product exposes to anyone who installs
it — all remain. So does the terminal surface the desktop window itself carries: the live terminal
preview embedded in a transcript row, the terminal pop-out window, its character grid, take-control
input, and stream state and audit (REQ-SHELL-079 to REQ-SHELL-111 and REQ-SHELL-166). That surface is
the application showing a user what it ran and letting the user intervene in it; it is not a way to
drive the application from a shell. An earlier reading took the decision to withdraw it. That reading
was wrong and has been corrected.

A domain applies this rule by asking one question of a requirement: does it exist so that a user can
operate the product from outside the window? If not, it stays.

**Packaging and distribution technology is an architecture decision, not a behavioral requirement.**
How the product is built, bundled, signed, and published — which runtime it embeds, how many
artifacts a release produces, which ecosystem's package index serves it — is not behavior a user
observes, and is settled at the Architecture Gate rather than here. What a specification may fix is
the observable consequence: that a release carries exactly one product version and every artifact of
that release declares and reports it, that what the user installs is self-contained and starts on a
supported machine with nothing else installed and all outbound network blocked, and that the About
surface reports the true release version. Domain 11 was rewritten on that basis in the fifth
reconciliation round; three of its requirements had stated the publication model, and the
self-containment claim resting on it, in terms of one language ecosystem's interpreter and packages,
which describes a different product. They are withdrawn, and the behavior underneath two of them is
carried technology-neutrally by REQ-STARTUP-158 and REQ-STARTUP-159.

The same boundary reached one requirement further in the sixth round. REQ-STARTUP-144 bound the
content, translation, operability and link structure of a public marketing download page, and
gated a release on that page having been reviewed. A website is not this product, and a behavioral
specification for an application cannot bind one; the requirement is withdrawn. What it was
protecting is a real obligation and is now stated as behavior of the application: REQ-STARTUP-160
requires the product to disclose, on a surface readable with all outbound network access blocked and
never behind a dismissal, what it contacts, when, and what those requests never carry.

## Open-question resolution pass

Required by the defect policy above and running before the gate closes. Clean-side agents with no
reference access resolve each domain's open questions, amend the affected requirements to state the
chosen behavior, and record every decision in `../spec/resolutions/`. Items that genuinely need a
product decision rather than a design decision are escalated rather than guessed.

## Escalations answered

Open-question resolution escalated three product decisions. All three were answered on 2026-08-30,
and the resolution records carry each answer against the open question it disposes of: OQ 44 in
[`../spec/resolutions/15-settings-configuration.md`](../spec/resolutions/15-settings-configuration.md),
OQ 1 in [`../spec/resolutions/17-terminal-ui.md`](../spec/resolutions/17-terminal-ui.md), and OQ 2 in
[`../spec/resolutions/03-conversation-composer-transcript.md`](../spec/resolutions/03-conversation-composer-transcript.md).
No open question raised against any specification remains escalated.

| Escalation | Decision |
|---|---|
| Default tool servers — which services fill `web_search`, `browser` and `code_intelligence`, and do they ship enabled? | All three are **declared**; only `code_intelligence` is **enabled** by default, being the only one that neither leaves the machine nor needs a credential. The other two are declared with `enabled: false`. Which third-party services fill the roles is left to the implementation. Recorded as REQ-CONFIG-181 and new REQ-CONFIG-465. |
| Sending a session to the background — detach a live run, or save-and-notify? | **Not specified for the terminal UI.** REQ-TUI-152 states stop-persist-and-notify and nothing more, and the terminal UI domain is itself retired, so nothing further is owed against a `REQ-TUI` identifier. The question does not lapse for the product: detaching a live run is a desktop behavior and is stated by REQ-SESSION-190. |
| Conversation composer — does it accept image attachments? | **Yes, gated on model capability.** Drag-and-drop and file picker; enabled only for models that announce image input, with the model selection surface refusing a silent selection that would discard attachments. Recorded as REQ-CHAT-169 to REQ-CHAT-174. |
