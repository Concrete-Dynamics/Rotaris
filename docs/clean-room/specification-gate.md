# Specification Gate

**Status: CLOSED 2026-08-31 — the specification is approved as sufficient, and architecture design is
authorized. Implementation remains unauthorized until the Architecture Gate closes.**

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
written.

State at closure: 3,697 live shipping requirements across nineteen domains (3,930 identifiers
including 233 withdrawn in place), plus 444 identifiers in the two retired domains. Every open
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

Amendments made under the standing direction so far, in two rounds. The **structural-ruling round**
applied SR-1 to SR-3; the **storage-ruling round** applied SR-4 to SR-8 and ESC-11, ESC-13, ESC-15,
ESC-16 and ESC-18. Both are recorded in detail in [`provenance.md`](provenance.md).

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
| ESC-13 — the benchmark invariant against screen-reader access | **Conditional, deliberately not applied** | The canvas is refused outright, which needs no amendment. The relaxation of REQ-UIBENCH-054 is contingent on OQ-28 resolving to the framework-neutral reading; the amendment is drafted and withheld until it does. Recorded in `../spec/resolutions/21-ui-performance-benchmark.md` |
| ESC-14 — corrections to SR-4's own reasoning | Applied | The withdrawn OQ-41 claim is not relied on anywhere. REQ-TRACE-513 states positively that no store's concurrency properties reach the four traceability artifacts, so the withdrawn reasoning cannot be re-derived |
| ESC-15 — the store is machine-local | Applied | REQ-SESSION-197 (the workspace identifier) and REQ-SESSION-198 (the machine-local store) minted. The store is **not** at `<workspace>/.rotaris/workspace.db`; it is located by a stable identifier that travels with the workspace. A workspace on a share or in a sync folder is fully usable |
| ESC-16 — a store that will not open means no run | Applied | REQ-SESSION-089 and REQ-EVENTS-084 both amended, and they agree: the session refuses to start, on REQ-EVENTS-021's terms, with the store's own reported reason carried unaltered |
| ESC-18 — ESC-3 has been overtaken | Applied | REQ-LIBRARY-042's read-modify-write takes effect as one indivisible step; the closing concession records the accepted defect as withdrawn *as unreachable, not as unimportant*, and states that no guarantee has been relaxed. ESC-3's last-writer-wins semantics on the same proposal are untouched |
| ESC-1 — the composer's permission-mode write path | **Ruled and unmade** | REQ-CONFIG-288 still states the shared save path. Not in scope for either round |
| ESC-2 — preserve comments on configuration write-back | **Ruled and unmade** | REQ-CONFIG-252 still states that comments and formatting are lost. Not in scope for either round |

**Where the specification and the architecture record still disagree.** SR-4's amendments are no
longer outstanding, but agreement has not been reached, because the amendments moved the specification
and the architecture record has not yet caught up. Three disagreements are known and are consequences
of this round rather than defects in it:

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

Neither the Architecture Gate nor any implementation authorization can be granted until the two
records agree. The specification side of that work is now complete; the architecture side is not.

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
