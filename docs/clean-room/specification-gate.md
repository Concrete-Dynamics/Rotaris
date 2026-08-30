# Specification Gate

**Status: OPEN — awaiting the user's decision.**

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
Total: 4,182 requirements. Process and audit history: [`provenance.md`](provenance.md).

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

*(To be completed by the user.)*

| Item | Decision | Date |
|------|----------|------|
| Compatibility ambition | | |
| Defect policy | | |
| Unbuilt behavior | | |
| First-milestone scope | | |
| Message text policy | | |
| **Gate** | | |
