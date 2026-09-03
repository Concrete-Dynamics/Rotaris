# Architecture Gate

**Status: OPEN — held 2026-09-03, awaiting the product owner's decision. Implementation remains
unauthorized until this gate closes.**

This gate asks one question: *is the architecture good enough to begin building the product?* It is not
asking whether the architecture is finished, and it is not asking whether every measurement has been taken.
The question is whether what remains unknown is small enough, and bounded well enough, that a conformant
implementation built from these records would not be built wrong.

The [Specification Gate](specification-gate.md) closed on 2026-08-31 and authorized architecture design.
It stated in terms that implementation stays unauthorized until this gate is approved separately. Nothing
in this repository may become production code before that.

## What exists

- **Fifty-eight architecture decision records** in [`../architecture/adr/`](../architecture/adr/), plus the
  system architecture in [`../architecture/README.md`](../architecture/README.md), whose **section 6 is the
  gate verdict** and is the evidence this gate turns on.
- **Thirty-one constraints** (W-1 to W-31) in [`../architecture/constraints.md`](../architecture/constraints.md).
- **Forty-three owner rulings** in [`../architecture/owner-decisions.md`](../architecture/owner-decisions.md):
  **twenty-nine escalations ruled** of thirty-one raised, the other two answered by the specification
  itself; **nine structural rulings** SR-1 to SR-9; **five gate decisions** GD-1 to GD-5.
- **Ten spike reports** in [`../architecture/spikes/`](../architecture/spikes/), six of them landed in the
  three measurement rounds of 2026-09-02 and 2026-09-03.
- **Three implementation conditions**, IC-1 to IC-3, in
  [`../architecture/implementation-conditions.md`](../architecture/implementation-conditions.md). IC-1 is
  discharged; IC-2 and IC-3 bind work that has not started.
- **1,214 requirement citations** across the ADRs, re-checked mechanically against a corpus of **4,397**
  identifiers, with **zero dangling**.
- **Forty-nine open questions** raised, nine closed with their reasons, forty open.

## The verdict this gate is asked to accept or reject

Stated in full in [`../architecture/README.md`](../architecture/README.md) section 6, in four categories
with nothing moved between them. In summary:

| | State |
|---|---|
| **A. Defects a builder would inherit** | **The build-wrong class is empty.** Five were found and all five are closed. Open and not build-wrong: **D5** (nothing deletes or knows about the leftover staging copy, now two leftover kinds), **D8** (the liveness gate creates `-shm`/`-wal` in a target the record calls untouched), **D11** (the `.displaced-` suffix against the store engine's path thresholds, not reachable at the shipped location), and two carried-over architecture rules — W-27's canonical path spelling, which needs a conformance test, and ADR-0055's stand-down rule, which has no measurement behind it. |
| **B. Measurements owed** | **No remaining measurement is a stated gate condition**, and every measurement any record named as one has been taken. Eleven numbered spikes have never been started; four sub-cases are owed, one of which — the re-run of the corrected restore — was taken and discharged as IC-1. A power-loss test is owed and no spike has performed one. |
| **C. Build-host obligations** | **Four, deferred to hardware by GD-5 on 2026-09-02, owed and not waived**, bound as IC-3: spike 12 on a Linux host that never had the legacy FUSE library; spike 17's macOS and Linux platform keys; ADR-0056's build-time load proof on all three release runners; the instance claim on macOS and Linux. |
| **D. Owner decisions** | **Empty.** All four were ruled on 2026-09-02 as GD-1 to GD-4, and GD-5 ruled the deferral in C. Nothing in the record waits on a person. |

**The one question the verdict turns on — is there anything left that would cause a conformant
implementation to be built wrong? — is answered NO**, and that answer replaced a *yes* the same record gave
on 2026-09-02, with the four things it named kept in place beside their closures.

### What the closures rest on, which is not uniform and is the gate's business

Five defects were in the build-wrong class. **Two are measured against the defect they close**: the close
handshake's bound and lease (IC-1 experiments E3a and E3b), and the displaced-store name's counter (E4,
which had to force the collision, because at millisecond granularity the correction was never exercised).
**One was exercised without being aimed at**: the artifact-layout conversion and the `origin.txt` write ran
on every successful path of IC-1 and neither failed, which is weaker than a test of either. **Two rest on
argument alone**: the foreign-host lock row's fix at both ends, and the build rule that replaced
`electron-rebuild`'s exit status with the artifact.

That distinction matters here because of the finding below, and because *closed* is doing different work in
each row.

### The four-for-four finding

**Four mechanisms in this record have been decided on paper, implemented for the first time, and every one
held a defect no reading had caught.** ADR-0054's commit step could not commit; ADR-0054's completeness
check returned a cache hit on a preparation that could not run; ADR-0058's restore could not complete in 30
of 30 attempts and two of its remaining steps each destroyed something. The fourth was **the IC-1 harness
itself** — three defects on its first run, one of which would have reported a pass while testing nothing it
claimed to test.

It licenses no universal measurement obligation and blocks nothing by itself. **It is the best available
estimate of what the unmeasured remainder holds**, and the remainder is eleven unstarted spikes, four
sub-cases, a power-loss test and four build-host obligations. The record has no basis for saying the rate is
lower there and four data points saying it is not. **It prices the difference between authorizing
implementation and authorizing it as if the record were verified. It is not verified. It is argued, and
four times out of four where argument met execution, execution won.**

## Decisions this gate should settle

These are choices no agent should make silently. Each states the options and this record's recommendation;
the recommendation is not a decision.

### 1. Authorization, and what it covers

Does implementation begin, and over what?

- **Approve, bounded** — implementation is authorized for everything not blocked by an implementation
  condition. IC-2 keeps every screen shut until the approved visual design reference exists; IC-3 keeps the
  Linux and macOS artifacts shut until the hosts exist. What that leaves is the mechanism: process topology,
  the store, the run flow, the event stream, settings, permissions, the restore.
- **Approve, unbounded** — authorize everything and treat IC-2 and IC-3 as advice.
- **Approve a first slice only** — name a smaller set of domains and hold the rest.
- **Do not approve** — name what must change first.

***Recommended: approve, bounded.*** The gate's own question is answered no, and the two things that would
narrow a build further are already written as conditions that bind the work rather than the gate. A first
slice smaller than "the mechanism" would have to be drawn somewhere, and the record has no seam to draw it
on: the store, the topology and the run flow are one decision in three files.

### 2. The three closures that rest on argument rather than measurement

Two build-wrong closures (the foreign-host lock row; the build rule) and one exercised-but-not-targeted
closure (the artifact-layout conversion) have never been run against the defect they close.

- **Bind them as implementation conditions** — IC-4, IC-5, IC-6, each naming what must be shown and where
  the result goes, discharged before the mechanism it names is signed off.
- **Accept them as closed** — the reasoning is on the record and the defects are stated.
- **Hold the gate** until they are measured.

***Recommended: bind them.*** This is exactly the shape GD-3 chose for IC-1, and IC-1 was set and
discharged on the same day; the mechanism that survived first execution is the one that had already had it.
Holding the gate for them repeats what GD-3 declined to do for a stronger case. Accepting them without a
condition is the option the four-for-four finding argues against, and it is the option that is
indistinguishable from doing nothing.

### 3. When the eleven unstarted spikes and the four sub-cases get taken

None is a stated gate condition and this record does not invent one.

- **Bound to the work each prices** — a spike is taken as the first act of building the thing it measures,
  and its result goes in the record whether or not it passes.
- **Taken up front**, before implementation begins.
- **Left to judgement** as the build reaches them.

***Recommended: bound to the work.*** Taking eleven spikes up front prices decisions already taken and
delays every one of them; leaving it to judgement is how a measurement becomes a paragraph nobody owns.
Two are worth naming as the ones a build reaches first and cannot proceed past honestly: **spike 8** (store
query latency against declared indexes, plus store open, log recovery and the integrity check on the
startup path) and **spike 18** (two run hosts on one store, which two requirements permit and which spike
21 did not measure). The power-loss test belongs with them.

### 4. The ratification standard for an ADR carrying an open defect

ADR-0058 is currently unratifiable, and not for want of a measurement: its mechanism has been run and of
the eleven defects that run exposed, three are corrected and eight are not. **Three remain open — D5, D8,
D11 — and the ADR does not state them in its own text**; consequence 5, which tracks leftovers, was never
updated for the second leftover kind the corrected reversal produces.

- **A defect that is stated in the ADR and is not build-wrong does not block implementing against it** —
  and the ADRs are updated to state their own open defects before any code cites them.
- **Ratification requires every defect closed.**
- **Ratification is not a precondition of implementation at all.**

***Recommended: the first.*** An ADR that has been run and knows what is wrong with it is a better record
than one that has never been run and knows nothing, and it should not be the one that is blocked. The cost
is one editing pass: ADR-0058 states D5, D8 and D11 in its own text, and consequence 5 gains the second
leftover kind.

### 5. The first-execution recording rule, as standing policy

The record's practice has been to keep a falsified claim beside its replacement rather than repair it
quietly, on the ground that a record whose conclusions are right and whose reasons are false gets
"simplified" back into the defect by the next reader.

- **Standing policy** — every mechanism's first execution records what it found back into the record it
  came from, in place, including when it found nothing.
- **Case by case.**
- **Not policy** — code is the record once code exists.

***Recommended: standing policy.*** It is what caught four of four, it costs a paragraph each time, and the
alternative surfaces at exactly the moment the record stops being read — which is the moment implementation
begins.

## Exit criteria

The gate closes when the product owner records a decision on each item above and states whether the
architecture is sufficient to begin implementation. Partial approval is acceptable: authorizing a subset of
the mechanism while further design continues on the rest is a legitimate outcome, and so is approval
conditioned on new entries in `implementation-conditions.md`.

**What closing the gate does not do.** It does not waive IC-2, IC-3, or any condition added by this gate's
own rulings; it does not ratify any ADR; and it does not make the record verified. It authorizes production
code to be written against records that are argued, measured in the five places named above, and honest
about which is which.

## Record of decision

*Not yet recorded. The gate is open.*

| Item | Decision | Date |
|------|----------|------|
| 1. Authorization and scope | — | — |
| 2. The argued closures | — | — |
| 3. The unstarted spikes | — | — |
| 4. ADR ratification standard | — | — |
| 5. First-execution recording rule | — | — |
| **Gate** | **OPEN** | — |
