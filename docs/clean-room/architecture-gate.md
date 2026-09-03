# Architecture Gate

**Status: CLOSED 2026-09-03 — the architecture is approved as sufficient to begin implementation, and
implementation is authorized within the bounds recorded below. This is the first authorization of
production code in this repository.**

> **CORRECTION, 2026-09-03, made after closure and material to what closure means.** This document, and
> the record of decision below, stated that **IC-2 keeps every screen shut until the approved visual
> design reference exists**. **The reference exists and has been in this repository since 2026-09-01** —
> `docs/design/`, commit `1ad8fee`: the tokens, type ramp, spacing, radii, elevation, motion, iconography,
> motif, copy voice, 27 components with typed signatures, twenty specimen cards, the fonts, the mark and a
> mockup, together with an adoption rule and a full reconciliation against `REQ-SHELL-023`. **The owner
> pointed this out; no measurement found it.** IC-2 is rewritten in
> [`../architecture/implementation-conditions.md`](../architecture/implementation-conditions.md) and is now
> narrow: `nocturne` and `high-contrast` have no palette and the token set declares no theme metadata or
> native-surface mapping, so `REQ-SHELL-128`'s three-theme obligation cannot yet be met. **Screens are not
> blocked.** The gate's verdict and every other ruling are unaffected — this was the widest bound the gate
> imposed and it was imposed on a false premise, which is worth more visible than tidied away.

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
  discharged; IC-2 and IC-3 bind work that has not started. *IC-2 was largely discharged on 2026-09-03 —
  see the correction above — and the gate added IC-4 to IC-6.*
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

***All five were ruled on 2026-09-03 and the record of decision is at the end of this file. The options and
recommendations are kept as written, because a decision is only readable against what it chose between.***

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

Recorded 2026-09-03 from the product owner, who accepted this record's recommendation on all five items.

| Item | Decision | Date |
|------|----------|------|
| 1. Authorization and scope | **APPROVED, BOUNDED.** Implementation is authorized for everything not blocked by an implementation condition. **IC-3** keeps the Linux and macOS artifacts shut until the hosts exist. *This cell also read "**IC-2** keeps every screen shut until the approved visual design reference exists" — see the correction at the head of this file: the reference exists, screens are not blocked, and IC-2 now bounds only `REQ-SHELL-128`'s three-theme obligation.* What is authorized is the mechanism: process topology, the store, the run flow, the event stream, settings, permissions, the backup and the restore. | 2026-09-03 |
| 2. The argued closures | **BOUND AS CONDITIONS.** The three closures that rest on argument rather than on measurement against the defect they close are now **IC-4** (the foreign-host lock row's fix, both halves), **IC-5** (the artifact-layout conversion and `origin.txt`, which IC-1 exercised without aiming at), and **IC-6** (the build rule that replaced `electron-rebuild`'s exit status with the artifact). Each names what must be shown and where the result goes. | 2026-09-03 |
| 3. The unstarted spikes | **BOUND TO THE WORK EACH PRICES.** A spike is taken as the first act of building the thing it measures, and its result goes into the record that made the decision whether or not it passes. Spike 8, spike 18 and the power-loss test are named as the ones a build reaches first. Recorded at the end of `implementation-conditions.md`. | 2026-09-03 |
| 4. ADR ratification standard | **A DEFECT STATED IN THE RECORD, AND NOT BUILD-WRONG, DOES NOT BLOCK IMPLEMENTING AGAINST THAT RECORD.** The standard is worthless unless the statement exists, so ADR-0058 now carries **consequence 18**, naming D5, D8 and D11 with what each costs, and **consequence 5** now tabulates all five leftover shapes with whether anything deletes each — it had been tracking three while the mechanism produced five. | 2026-09-03 |
| 5. First-execution recording rule | **STANDING POLICY.** A mechanism's first execution reports back into the record that decided it, in place, including when it found nothing. Recorded as a discipline in `../architecture/README.md` section 5. | 2026-09-03 |
| **Gate** | **CLOSED — approved 2026-09-03.** The product owner reviewed the verdict and authorized implementation within the bounds above. | 2026-09-03 |

## Gate closed

**The architecture is approved as sufficient to begin implementation.** Production code may be written
against these records, for the mechanism, subject to every condition in
[`../architecture/implementation-conditions.md`](../architecture/implementation-conditions.md).

**State at closure.** Fifty-eight ADRs; thirty-one constraints; forty-three owner rulings with no escalation
open; ten spike reports; forty open questions of forty-nine raised; 1,214 requirement citations against a
corpus of 4,397 with zero dangling. **The build-wrong defect class is empty.** Open and not build-wrong:
D5, D8 and D11, all three now stated in ADR-0058's own consequence 18, plus two architecture rules owed
evidence rather than a fix — rule 6's canonical path spelling, which needs a conformance test, and
ADR-0055's stand-down rule, which has no measurement behind it.

**What closing this gate does not do.** It does not waive IC-2 or IC-3. It does not ratify any ADR. It does
not make the record verified. **Of the five defects that were in the build-wrong class, two were measured
against the defect they close, one was exercised without being aimed at, and two rest on argument alone**;
decision 2 binds the latter three rather than pretending the difference away. Four mechanisms in this record
have been decided on paper and then built for the first time, and every one held a defect no reading had
caught. **The remainder — eleven unstarted spikes, four sub-cases, a power-loss test and four build-host
obligations — has no basis for a lower rate, and four data points against it.**

**What the first implementation owes, before anything else it does.** Nothing here is a reason to delay
starting. Every one of these binds a specific piece of work at the moment that work is done, and each is
written where the work will find it:

| When the build reaches | It owes |
|---|---|
| the restore, and the machine identifier | **IC-4**, **IC-5** — and IC-1's harness is already in `spikes/` |
| the build toolchain | **IC-6**, then **IC-3** item 3 when the runners exist |
| the store's read paths | **spike 8**, against declared indexes |
| two run hosts on one store | **spike 18** |
| a terminal save's durability | **the power-loss test**, which is now its sole stated ground |
| any screen at all | the adopted language in `docs/design/` plus the structure in `docs/spec/` — **not blocked** |
| `REQ-SHELL-128`'s three built-in themes | **IC-2**, now narrow: two palettes and the theme metadata |
| a Linux or macOS artifact | **IC-3**, deferred to hardware by GD-5, owed and not waived |
