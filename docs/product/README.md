# Product directives — the layer that governs over the specification

`docs/spec/` states behaviour that was **derived**: an isolated agent read a reference, a gateway
converted its sealed findings into requirements, and every round since has corrected, narrowed or
minted against that origin. Its authority comes from that derivation, and so does its value as
clean-room evidence.

This directory holds behaviour that was **decided**. A product directive is the owner saying what
this product does, for reasons of their own, with no reference behind it. It is not a correction to
the specification and it does not claim the specification was wrong.

## The precedence rule

**A directive governs over every requirement it names.** Where a `PD-<DOMAIN>-<NNN>` and a
`REQ-<DOMAIN>-<NNN>` disagree, the directive is what gets built, without exception and without
argument from the implementer. Nothing else in this repository moves that line: not the design
material (`docs/design/README.md` §2 places it under the specification, and this layer sits above
both), not an ADR, and not a convenience found while building.

The order, top to bottom:

```text
docs/product/       directives   — decided by the owner, govern where they reach
docs/spec/          requirements — derived behaviour, governs everywhere else
docs/architecture/  decisions    — how the two above are built
docs/design/        the language the result is drawn in
```

A requirement no directive names is untouched and governs exactly as it did. Precedence is per
identifier, never wholesale: there is no directive that means "ignore the specification".

## Why the specification is not edited in place for these

Two reasons, and the second is the one that will matter to a reader in six months.

**The evidence.** The specification's worth in a clean-room argument is that it is a record of what
was *derived* from observable behaviour. Writing an owner's invention into it as though it had been
derived is not a bookkeeping shortcut; it destroys the only distinction that makes the record worth
producing. This layer keeps every divergence in files with no reference provenance at all, which is
a **stronger** independence claim than the specification alone makes, not a weaker one.

**The trace.** What is new must be readable from the identifier, not reconstructed by diffing a
changelog against a corpus of four thousand requirements. `PD-` means someone chose this. `REQ-`
means it came from the behavioural target. A reader who wants to know what this product does that
its target never did reads one directory.

## What is a directive, and what is not

The registers that already exist all conclude that **the specification failed at the job it was
doing** — it was silent, it contradicted itself, or it described something that could not be built.
A directive concludes something different: the specification is right, and we want **something
else**.

| The request is… | It goes to | Because |
|---|---|---|
| already covered by a live requirement | nowhere — build it, cite the `REQ` ids | there is nothing to decide |
| behaviour the specification is silent or under-determined about | an **OQ-NN** in [`../architecture/open-questions.md`](../architecture/open-questions.md) | a gap in the derivation is a question against it |
| a disagreement about what the specification *means*, or two requirements that cannot both hold | an **ESC-NN** in [`../architecture/owner-decisions.md`](../architecture/owner-decisions.md), then an amendment round | the corpus is wrong, and is corrected in place |
| a defect found by building or measuring the thing | an amendment round, and a row in [`../architecture/first-executions.md`](../architecture/first-executions.md) | the same — the corpus is wrong |
| behaviour the owner wants **instead of**, or **as well as**, what a live requirement states | a **`PD`** in [`directives.md`](directives.md) | the corpus is not wrong; the product is changing |

The boundary case is worth stating plainly, because it is the one that will be got wrong: a request
that *contradicts* a requirement is a directive, not an escalation, **whenever the requirement is a
faithful statement of the behavioural target**. An escalation is for when the corpus disagrees with
itself. If in doubt, log it as a request (below) and let the classification be made in writing.

## Identifiers

`PD-<DOMAIN>-<NNN>`, where `<DOMAIN>` is the prefix of the specification domain that owns the
behaviour — `PD-CHAT-001` belongs beside `REQ-CHAT-*`, in domain 03. The rules are the
specification's own, deliberately:

- Identifiers are **stable and permanent**. Once assigned, never renumbered and never reused.
- Numbering runs **contiguously from 1 within each domain**, with no gap and no duplicate.
- A changed directive gets a **new revision**, not a new number. Written in place: a line under the
  heading naming the current revision, its date and the `R-NNN` that asked for it; the clause it
  changes marked `— revision N`; and the text it replaces **quoted beside it** in a blockquote reading
  *"Revision N−1 said, and no longer governs: …"*, which is the same discipline as a falsified reason
  kept beside its replacement. `PD-CHAT-004` is the first and is the worked example. The back-pointer
  at the requirement is **amended in place** rather than a second note added. A revision is for a change
  to the directive's **own case**; a disjoint case on a requirement another directive already narrows may
  be a directive of its own (below, "Two directives on one requirement"; [OQ-237](../architecture/open-questions.md),
  ruled under [R-072](requests.md#r-072)). The reason this bullet gave until 2026-10-13 **no longer governs
  (GV1)**: *"the reason is also why this is a revision rather than a new directive beside the old one: the
  symbol generator refuses two directives narrowing one requirement, because precedence must be
  unambiguous."* That holds for Supersedes alone.
- A directive that no longer applies is **withdrawn in place** — it keeps its number, carries no
  behaviour, and states what replaced it. Withdrawing a directive does **not** silently restore the
  requirement it superseded; the withdrawal says explicitly whether that requirement governs again.
- The two retired domains (`TUI`, `CLI`) are closed here as they are there. No `PD-TUI` or `PD-CLI`
  may be minted.

## The shape of an entry

Every directive carries five things. The fourth is parsed by the symbol generator and must be
written exactly as shown.

1. **A heading** — `### PD-<DOMAIN>-<NNN> — <what it decides>`.
2. **The directive itself**, in the specification's own normative voice (`MUST`, `MUST NOT`,
   `SHALL`), stating observable behaviour and nothing about how it is built.
3. **Why, and what it costs** — the reasoning, and what was given up. A directive with no stated
   reason is a defect: the whole point of this layer is that the reason is not derivable from
   anywhere else.
4. **The disposition block** — one or more of these four lines, each naming requirement identifiers,
   comma-separated:

   ```markdown
   > **Supersedes:** REQ-CHAT-004, REQ-CHAT-005
   > **Narrows:** REQ-CHAT-001
   > **Extends:** REQ-SHELL-023
   > **New:** no live requirement covers this.
   ```

   - **Supersedes** — the named requirement no longer governs. The directive governs in its place.
   - **Narrows** — the named requirement still governs, except in the case the directive names. The
     directive states that case exhaustively, so a reader can tell which side of the line they are on.
   - **Extends** — the named requirement is untouched and still governs in full. The directive adds
     behaviour beside it.
   - **New** — nothing is displaced. Used alone, and it names no identifier.

   A directive with no disposition block does not build. The generator refuses an identifier it
   cannot find in the specification, which is what makes a typo a failed `pnpm check` rather than a
   disposition that quietly governs nothing.

   **Two directives on one requirement** ([OQ-237](../architecture/open-questions.md), ruled under
   [R-072](requests.md#r-072)). **Supersedes is single**: one directive per requirement, and a superseded
   requirement is neither narrowed nor extended, since a requirement that no longer governs cannot keep
   governing outside a case or in full. **Narrowings state disjoint cases**: two directives may narrow one
   requirement, each stating its own case exhaustively, and the requirement governs outside all of them. A
   case that **overlaps** an earlier narrowing is a **revision** of that directive, never a second one beside
   it. The later directive **names the earlier** in its own entry, and the generator refuses a pair of which
   neither names the other (its order in this register follows the domain, not the date, so either direction
   satisfies it); it cannot tell whether the cases truly stay apart, which is the writer's to state and the
   reviewer's to check. **Extends may repeat freely**: two extensions displace nothing and need no citation.
   `NARROWED_BY` and `EXTENDED_BY` in the generated artifact hold a sorted list per requirement;
   `SUPERSEDED_BY` holds one directive.
5. **Raised by** — who asked, when, and where. For a request made in conversation:
   `*Raised by the owner, <YYYY-MM-DD>; logged as [R-NNN](requests.md#r-nnn).*`

## The back-pointer, in place

A directive that supersedes, narrows or extends a requirement writes a note **at that requirement**,
in `docs/spec/`, in the same commit. The requirement's own text is **never rewritten and never
deleted** — this repository already keeps a falsified reason beside its replacement rather than
repairing it quietly, and the same discipline applies here:

```markdown
- **REQ-CHAT-004** — The composer placeholder MUST be one of exactly these four strings …
  > **Superseded by [`PD-CHAT-001`](../product/directives.md#pd-chat-001), 2026-09-12.** The text
  > above states the behavioural target and is kept for that reason; it no longer states what this
  > product does.
```

Use `Superseded by`, `Narrowed by` or `Extended by` to match the disposition. The note is a
blockquote so that it can never be mistaken for part of the requirement. A requirement carries **one labelled note per
directive** that reaches it. A new narrowing that qualifies an earlier note's "governs in full" **appends a line** to that
note, dated and naming the new directive, rather than rewriting it (REQ-SHELL-021's note on `PD-SHELL-001`, beside its
note on `PD-SHELL-009`, OQ-237).

The three labels are reserved for a disposition the register holds. A note that names a directive where the register
holds no disposition of that directive for that requirement is a **cross-reference** written in its own words and never
takes one of the three labels: a domain's introduction, which names no requirement. *(Until 2026-10-13 this named a
second case, "a requirement whose reach the register records elsewhere (REQ-CONFIG-464's note on `PD-WORKSPACE-002`)",
which existed only because the generator held one narrowing per requirement; that note is now labelled, OQ-237.)* The
reverse holds too: every requirement a
disposition block names carries its labelled note. [`tools/symbol-artifact/back-pointers.test.ts`](../../tools/symbol-artifact/back-pointers.test.ts)
reads both directions and fails `pnpm check` on either gap (OQ-222, ruled under [R-072](requests.md#r-072)).

This is the half a reader actually relies on. A person who opens a specification file must not be
able to read a superseded requirement and believe it, and a person who opens a directive must be
able to reach the text it displaced. Both directions, or neither is trustworthy.

## Intake — every request leaves a mark

[`requests.md`](requests.md) is the log. **A request is logged when it is made, before it is
classified and before any code is written**, because the failure this whole mechanism exists to
prevent is a request arriving in conversation and landing in the product as unsourced behaviour with
no identifier against it.

A request that is **declined** or **deferred** stays in the log with the reason. That is the point
of logging refusals: without it the same request can be asked again in three weeks and get a
different answer, and nobody can see that it ever happened.

**The log has no allocator, and that is now gated rather than hoped about.** An `R-NNN` is unique only
against the `main` the session that chose it last read, and `CLAUDE.md` puts every change in a temporary
worktree — precisely the case where that is not the `main` the row lands on. It collided twice on
consecutive days. The second time it was caught at the merge by an agent who happened to re-read `main`;
the first time two rows numbered `R-016` both merged and sat in the log for a day, in two different
tables, never once adjacent. [`tools/check-request-log.mjs`](../../tools/check-request-log.mjs) runs in
`pnpm lint` and refuses a duplicate, a gap, an anchor disagreeing with the number printed beside it, a
declared count that is not the count, and a `requests.md#r-nnn` citation reaching no row. The rule the
gate leaves to people is the one it cannot decide: **the row that reaches `main` first keeps the number**,
and the other takes the next free one at the merge, keeping every word and saying in its own cell that it
moved. Recorded as
a defect note (removed once repaired),
repaired 2026-09-15.

Two things about that gate belong here rather than only in the defect note. It measures **identifiers, not
prose** — the count declares a range (`R-001 to R-020`) the gate can read, because the version written in
words is what let seventeen rows sit under the heading "Sixteen". And on its first run it reported three
duplicates that were not duplicates: the `Row shape:` examples at the foot of the log carry real-looking
anchors inside an HTML comment, which renders nothing and therefore defines no anchor. A checker that is
confidently wrong about its own document's template is a checker somebody switches off, so it strips
comments before reading and keeps the reason beside the fix.

**The register is gated on the same terms, since 2026-09-22.** It drifted the same way and for the same
reason: `directives.md` said **Thirteen** above fourteen entries from the commit that added `PD-LIBRARY-002`
until somebody noticed while writing `PD-ORCH-003`.
[`tools/check-directive-register.mjs`](../../tools/check-directive-register.mjs) runs in `pnpm lint` beside
its sibling and refuses a duplicate, a heading with no anchor above it, an anchor disagreeing with the
identifier its heading prints, a `directives.md#pd-…` citation reaching no entry, and a declared total that
is not the total. Two rules are this register's own rather than the request log's, and the gate reads both:
identifiers are contiguous from 001 **within each domain**, not across one sequence; and the total is the
number of **headings**, because a revision keeps its number and adds no entry. The count stays written in
words — that is the register's voice, and the gate carries the number table rather than asking the document
to change form for a machine.

## What binds a change

- **Consult before building.** A request is classified against the table above *before* code is
  written. Work that implements a directive cites its `PD` ids the way other work cites `REQ` ids.
- **Maintain after building.** A commit that adds, revises or withdraws a directive updates
  [`directives.md`](directives.md), the back-pointer in `docs/spec/`, and the row in
  [`requests.md`](requests.md) **in the same commit**. A directive whose back-pointer is missing is a
  defect of the change that wrote it, on the same terms as a stale architecture view.
- **`pnpm check` enforces what it can.** `pnpm symbols` regenerates
  `packages/kernel/src/generated/requirements.ts`, which carries `PD` as typed symbols beside `REQ`,
  refuses a disposition naming an identifier the specification does not define, and marks every
  superseded requirement `@deprecated` so that citing one in code warns at the editor. Prose is not
  the enforcement; this is. A change that adds, revises or withdraws a directive also runs
  `pnpm vitest run tools/symbol-artifact/` before it is handed over: `back-pointers.test.ts` holds every
  back-pointer in `docs/spec/` to the register's dispositions, and the tests beside the code a change touched do not reach it
  (fin44's builder that minted `PD-SHELL-010` ran only those, and its reviewer found the gap; noted by fin45).
  `pnpm check` runs it with every other test.
- **First execution still reports back.** A directive is a mechanism decided on paper like any other.
  The first time one is built, `CLAUDE.md`'s standing policy applies: report back into this record,
  in place, including when it found nothing, and append a row to
  [`../architecture/first-executions.md`](../architecture/first-executions.md).

## First execution, 2026-09-12 — the check refused a directive that displaces nothing

`pnpm directive-proof` ran this mechanism's enforcement for the first time on the day it was written,
and **it held a defect**: the generator decided whether a directive had stated a disposition by
counting the requirement identifiers it named, and `New` names none. Every directive that displaces
nothing — the ordinary case for behaviour the product simply did not have before — was refused with
the message reserved for a directive that had said nothing at all.

Nine of the ten counterfactuals passed on the first run, so the check was not weak; it was **wrong in
exactly one direction, and it was the permissive-looking direction that turned out to be strict**.
The fix separates *stated a disposition* from *named an identifier*, which is the distinction the
prose above already drew and the code had collapsed. The generator now carries that reason beside the
flag, so a later reader is told why the two are not the same thing.

The proof runs 25 checks: the register as committed, a well-formed directive reaching the corpus in
all three dispositions, nine refusals each paired with what would have passed without it, and `New`
alone. It edits the register in place and restores it in a `finally` block, ending by regenerating the
artifact so the committed symbols always match the committed register.

## Second execution, 2026-09-12 — the register's own proof assumed it would stay empty

The first two directives (`PD-SHELL-001`, `PD-WORKSPACE-001`) were written the day after this layer, and
writing them took `pnpm directive-proof` from 25/25 to **21/25**. Nothing was wrong with the generator or with
the directives: the proof appended each fixture to the *committed* register and then asserted absolutes about
the result — `DIRECTIVE_COUNT = 1`, and each precedence map anchored at its first line. Those are claims about
an empty register, and this register is not for staying empty.

Three of the four failures were that arithmetic. **The fourth was a check that had stopped checking.** The
counterfactual for "a disposition with no directive above it" injects a bare disposition and expects the
refusal; appended below two real directives there was always a directive above it, so the generator was right
to accept it and the counterfactual could no longer arise. It would have gone on reporting a pass for a
refusal it was no longer exercising — the failure "a check that has never refused anything is
indistinguishable from no check" exists to prevent, reached by a route that wording did not anticipate: not a
check that never refused, but one whose precondition the register's own growth destroyed.

The fixture register is written in full now rather than appended to, so every case stays exact however many
directives are committed, and what the committed register claims is checked separately against the artifact by
a test that needs to know neither count: `DIRECTIVE_COUNT` must equal the number of `PD` symbols beside it.
25/25 again. Recorded as the eighty-seventh defect in `codebase.md`'s ledger, which is where a proof defect
belongs — `first-executions.md` excludes them by its own terms.

## Third execution, 2026-09-12 — a directive that did not name everything it had to govern

Both directives were built the day after they were written, and the behaviour in each held. What did not hold
was the **disposition list**, and it failed in the one way this layer is least able to absorb.

`PD-WORKSPACE-001` asks for a transient notice carrying one action. `REQ-NOTIFY-013` is the product's single
definition of that surface and its structure carries no action at all; `REQ-NOTIFY-003` says an outcome carrying
a recovery action is *additionally* published as a persistent notice, which this offer deliberately is not. The
directive named `REQ-WORKSPACE-010` and `REQ-SHELL-021` and neither of those two. By this layer's own rule — a
directive governs over the requirements it names, per identifier and never wholesale — building it as written
would have been an ungoverned deviation from two live requirements, dressed as compliance with a third.

The fix is bookkeeping, not behaviour: the dispositions now name both, and each carries its back-pointer. Two
things are worth keeping beside it.

**The specification named its own remedy.** `REQ-NOTIFY-013` ends *"A surface that needs different behaviour
extends this requirement rather than adding a second acknowledgement surface beside it."* The corpus had already
been asked this question and had answered it; what was missing was not a decision but a reading.

**The cheap widening was the wrong one, and it was one line away.** The persistent banner already carries
actions, so adding `start-session` to `NoticeActionSchema` would have compiled and worked. It would also have
extended `REQ-SHELL-115`'s **closed** list of thirteen operations a banner action may perform — a product
statement no directive asked for. The transient's action is a closed one-member type of its own instead, and
`notices.test.ts` now asserts the banner union still refuses `start-session`, so the shortcut fails a test rather
than passing review.

**What this changes about writing directives.** A directive's dispositions are written by reading the
requirements the *mechanism* touches, not the ones the request mentions. The request here was about workspaces;
two of the four requirements it governs belong to notifications. Neither the owner's words nor the domain the
directive is numbered in would have led anyone to them — only asking "which requirement defines the surface this
behaviour lands on" does. Recorded as the **eighty-ninth** entry in `codebase.md`'s ledger alongside the seam
defect found the same hour, and as a row in `first-executions.md`, because this is the directive layer's first
execution and the rule is that a mechanism's first execution reports back into the record that decided it.

## Several directives on one requirement, 2026-10-13 — first execution (OQ-237)

The rule above was built and run the day it was ruled (fin34, `fin34-record-and-cancels`), and **it found what the defect
note said it would, and one disposition the note had not named**. `tools/symbol-artifact/generate.mjs` holds Narrows and
Extends as lists, refuses Supersedes beside Extends, and refuses two narrowings of which neither entry names the other;
`pnpm directive-proof` pairs each new refusal with its passing form (42 checks; 29 of them pass on the old generator,
every new case and the two map shapes failing). Read under the verbs' definitions and the exact-enumeration test of
acceptance finding F15, the fifteen requirements two directives reached gave six corrections: `PD-TOOLS-013` narrows
REQ-TOOLS-112 and REQ-SESSION-136, as its ruling named them; `PD-SHELL-009` narrows REQ-SHELL-021, as OQ-206's ruling
named it; `PD-WORKSPACE-002` narrows REQ-CONFIG-464, REQ-CONFIG-256 and REQ-CONFIG-417; **`PD-ORCH-004` narrows REQ-TOOLS-152**,
whose "whole of the `delegate` contract" its `continuation_of` widens, recorded as *Extends* in R-058 because "the symbol
artifact holds one narrowing directive per requirement" — the bent verb the note did not list; and `PD-LIBRARY-001`
narrows REQ-LIBRARY-099 and REQ-TOOLS-148, whose closed section sets gain `commands`. **Found nothing** at REQ-CHAT-057,
REQ-CHAT-069, REQ-ORCH-075, REQ-SESSION-115, REQ-SHELL-119, REQ-STARTUP-161 and REQ-WORKSPACE-041: each extension adds
beside a requirement whose stated set it leaves whole. Every pair of narrowings the register now holds on one requirement
names each other, so the new refusal fires on nothing committed. Outside the bounded re-read, `PD-LIBRARY-001`'s Extends
on REQ-LIBRARY-088 (a field inventory the requirement calls closed) and REQ-LIBRARY-090 (a fixed section order) are the
same shape and are recorded, not corrected
([`pd-library-001-extends-two-requirements-whose-closed-sets-it-changes.md`](../defects/fixed/pd-library-001-extends-two-requirements-whose-closed-sets-it-changes.md)); corrected the same day by fin36, both now under Narrows with their notes relabelled.
The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
