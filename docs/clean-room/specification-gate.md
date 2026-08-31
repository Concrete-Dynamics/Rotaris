# Specification Gate

**Status: DECISIONS RECORDED — all five items answered 2026-08-30. Closes on the sufficiency statement once open questions are resolved.**

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
Total: **3,925 requirement identifiers** across the nineteen shipping domains, of which **236** are
withdrawn in place, leaving **3,689** that state live behavior. The two retired domains, the
terminal UI and the command-line entry points, hold a further **444** identifiers, **10** of them
withdrawn in place; those are counted separately and are not part of the shipping total, giving
**4,369** identifiers in all, **246** of them withdrawn. Every count is a count of identifiers, not
of behaviors: an identifier is never removed, so a withdrawn requirement keeps its number and keeps
being counted, and a total that grew while the graphical-only decision was removing surface grew
because resolution minted new identifiers to carry the rescued capabilities. These totals were
re-taken from the requirement definitions in each file after the fifth and last of the
post-resolution reconciliation rounds described in [`provenance.md`](provenance.md). The first four
rounds left every total where it stood: naming an owner for a contested vocabulary and turning the
other statements of it into citations removes duplicated content without minting or retiring an
identifier. The fifth moved one domain's, because it did more than deduplicate — domain 11 withdrew
three identifiers that specified a different product and minted two, REQ-STARTUP-158 and
REQ-STARTUP-159, to carry the behavior underneath them. That is the whole of the change from the
previously recorded 3,923 and 233. The per-domain figures,
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
| **Gate** | Open pending the sufficiency statement, after open-question resolution. | |

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
