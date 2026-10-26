# Product-owner decisions on the architecture record — The Architecture Gate — CLOSED 2026-09-03

Part 8 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## The Architecture Gate — CLOSED 2026-09-03

The gate itself is [`../clean-room/architecture-gate.md`](../../clean-room/architecture-gate.md); it holds the
verdict, the options each decision chose between, and the record of decision. The five rulings are recorded
here as **GD-6 to GD-10** because this file is where a reader looks for what the owner decided, and a
decision that lives only in the document that asked for it is a decision the next reader has to go looking
for.

**The owner accepted this record's recommendation on all five items.** That is stated plainly rather than
elided: the recommendations were written by the same record the gate was judging, so a reader is entitled
to know that the alternatives were put and not taken, and each ruling below keeps what it chose between.

### GD-6 — implementation is authorized, bounded

**Ruled: approved, bounded.** Production code may be written against these records for **the mechanism** —
process topology, the store, the run flow, the event stream, settings, permissions, the backup and the
restore. **IC-2 and IC-3 are not advice**: no screen before the approved visual design reference exists, no
Linux or macOS artifact before the build hosts do.

> **Amended 2026-10-26 by the owner ([R-087](../../product/requests.md#r-087)), and the ruling stands for macOS.** "No
> Linux or macOS artifact before the build hosts do" now reads **no macOS artifact before its build host does**: IC-3
> was narrowed to macOS and the Linux artifact may be built, accepted against
> [ADR-0066](../adr/0066-the-linux-artifact-is-built-on-a-developer-host.md)'s criteria (GD-5's amendment). IC-3 is still
> not advice.

> **Corrected 2026-09-03, hours after the ruling, and the ruling stands.** The sentence above says *no
> screen before the approved visual design reference exists*. **It exists**, and it has been in this
> repository since 2026-09-01 — `docs/design/`, commit `1ad8fee`. The owner said so; nothing in this record
> caught it. **What GD-6 authorises is unchanged**, because it authorises the mechanism and bounds it by
> whatever the conditions actually say; what changed is that IC-2 now says something much narrower —
> `nocturne` and `high-contrast` have no palette and the token set declares no theme metadata or
> native-surface mapping, so `REQ-SHELL-128`'s three-theme obligation is not yet meetable. **Screens are
> not blocked**, and the design material's own adoption rule governs how they are drawn: the **language**
> is adopted and authoritative, the **information architecture** is not, and structure comes from
> `docs/spec/` with `REQ-SHELL-023` canonical. The paragraph below says "one is material nobody has" and
> that clause is false; the refusal of the unbounded option does not rest on it.

*The alternatives were: approve unbounded, treating IC-2 and IC-3 as advice; approve a smaller first slice;
or decline and name what must change.* Unbounded was refused because both conditions exist for reasons that
do not weaken by being ignored — one is material nobody has, the other is hardware nobody has. A smaller
slice was refused for a reason worth keeping: **the record has no seam to cut it on.** The store, the
topology and the run flow are one decision spread across three files, and a slice drawn through them would
be drawn by the person doing the cutting rather than by the architecture.

**What this does not authorize.** It does not ratify any ADR, does not waive a condition, and does not make
the record verified. It is the first authorization of production code in this repository.

### GD-7 — the three closures resting on argument are bound as conditions

**Ruled: bind them.** Of the five defects that were in the build-wrong class, **two were measured against
the defect they close** (the close handshake's bound and lease; the displaced-store name's counter), **one
was exercised without being aimed at** (the artifact-layout conversion and `origin.txt`, which ran on every
successful IC-1 path and never failed), and **two rest on argument alone** (the foreign-host lock row's fix
at both ends; the build rule that replaced `electron-rebuild`'s exit status). The latter three become
**IC-4**, **IC-5** and **IC-6**.

*The alternatives were: accept them as closed, or hold the gate until they are measured.* Holding the gate
was refused because GD-3 declined to do exactly that for a stronger case — IC-1 was a whole mechanism with
three unrun corrections — and it worked: the condition was set and discharged the same day, and that
mechanism is the only one in this record to survive first execution, because it was not its first execution.
Accepting them without a condition was refused because it is **indistinguishable from doing nothing**, which
is the same reason GD-3 had to create the register before it could use it.

### GD-8 — a spike is taken as the first act of building the thing it prices

**Ruled: bound to the work.** No unstarted spike is a condition of anything by itself and none is a gate
condition. Each prices a decision already taken. A spike is taken when the build reaches the thing it
measures, and **its result goes into the record that made the decision whether or not it passes, and whether
or not it found anything**. Recorded at the end of `implementation-conditions.md`.

**Three are named** because a build reaches them first and cannot honestly proceed past them, and naming
them does not promote them to conditions: **spike 8** (store query latency against *declared* indexes, plus
store open, log recovery, the startup integrity check and `REQ-EVENTS-179`'s write probe), **spike 18** (two
run hosts on one store, which two requirements permit and no spike has measured), and **the power-loss
test**, which is now the sole stated ground for forcing the stronger durability setting on a terminal save.

*The alternatives were: take all eleven up front, or leave it to judgement.* Up front measures nothing that
is being built yet and delays every decision it prices. Judgement is how a measurement becomes a paragraph
nobody owns.

### GD-9 — a stated, non-build-wrong defect does not block implementing against a record

**Ruled: the first option.** An ADR that has been run and knows what is wrong with it is a better record
than one that has never been run and knows nothing, and it must not be the one that is blocked.

**The standard is worth nothing unless the statement exists**, and it did not. ADR-0058 was carrying three
open defects and naming none of them, so the ruling came with an editing pass rather than only a principle:

- **Consequence 18 is new** and states **D5**, **D8** and **D11** with what each costs, plus the two rules
  that are owed evidence rather than a fix — rule 6's canonical path spelling, which needs a conformance
  test because its violation is silent, and ADR-0055's stand-down rule, which has no measurement at all.
- **Consequence 5 was tracking three leftover shapes while the mechanism produced five.** It now tabulates
  all five with whether anything deletes each, which makes D5 visible as what it is: the two nobody keeps on
  purpose, each the size of a store.

*The alternatives were: require every defect closed before ratification, or drop ratification as a
precondition entirely.* The first blocks the records that have been run in favour of the ones that have not.
The second removes the reason to state a defect at all.

### GD-10 — the first-execution recording rule is standing policy

**Ruled: standing policy.** A mechanism's first execution reports back into the record that decided it, in
place, **including when it found nothing** — because "nobody recorded a problem" and "somebody ran it and
there was no problem" are different states and only one is evidence. A falsified reason is kept beside its
replacement rather than overwritten. A defect found this way is not repaired quietly in the code that meets
it: the code is the fix, the record is where the reason lives, and the reason is the only thing that stops
the fix being removed. Recorded as a discipline in [`README.md`](../README.md) section 5.

*The alternatives were: case by case, or no policy on the ground that code becomes the record once code
exists.* This is what caught four of four. It costs a paragraph per mechanism, and its value arrives at the
moment the record stops being read — which is the moment implementation begins.
