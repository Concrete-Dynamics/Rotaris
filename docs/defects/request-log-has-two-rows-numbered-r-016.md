## The request log carries two different requests both numbered R-016

`docs/product/requests.md` holds **two** rows bearing the identifier `R-016`, recording two different
requests made on the same day:

- one in a stray single-row table above the main log (the continue-run credential lease — "Yes i
  want the user to be able to just continue with the new model…"), classified `defect`;
- one at the foot of the main log (the Models section overhaul — "take a look at the models
  section…"), classified `covered, with one escalation raised`.

Both anchors are `<a id="r-016"></a>`, so the second is unreachable by link: any `#r-016` reference
resolves to whichever the renderer finds first. `PD`-level "Raised by" lines cite request rows by
that anchor, which is the mechanism this breaks.

The heading above them says **"Sixteen. The count is the number of rows below."** There are
seventeen rows below it. The count and the identifiers disagree, and the log cannot say which of the
two is R-016.

The first of the two also sits in a **second table of its own** (its own `| # | Date | … |` header
and separator at lines 27–29) rather than in the log table that follows, which is how the collision
survived review: the two rows are never adjacent and never sorted together.

## Specs

None — this is a **process record**, not product behaviour, so no `REQ` or `PD` is contradicted.
What it contradicts is `docs/product/requests.md`'s own stated rules and `docs/product/README.md`'s:

- "Identifiers: `R-NNN`, **contiguous from 1, never renumbered and never reused**."
- "A row is **appended and never rewritten**."
- `README.md` §Identifiers, which the request log inherits: numbering runs contiguously with **no gap
  and no duplicate**.

The repair is constrained by the second rule: the rows may not be rewritten, so the collision is
resolved by *appending* a correcting row that renumbers neither, or by an explicit owner ruling on
which row keeps `R-016`. That choice is not made here.

## Relevant files

*Line numbers below are the file as it stood when this was written; the repair moved every row.*

- `docs/product/requests.md` — lines 21–29 (the count, and the stray one-row table holding the first
  `R-016`) and line 49 (the second `R-016`, at the foot of the main table).
- `tools/check-request-log.mjs` — the gate written for the repair, and where the reason it exists is kept.
- `docs/product/README.md` — §Intake and §Identifiers, the rules this breaks.
- `docs/product/directives.md` — every "Raised by … logged as [R-NNN](requests.md#r-nnn)" line
  depends on the anchors being unique; none currently cites `#r-016`, so nothing is mis-linking yet.

## The cause, confirmed the same day

**The log has no allocator.** An identifier is unique only against the `main` the session that wrote it
last read, and the repository's own workflow puts every change on a temporary branch in a temporary
worktree — which is exactly the case where that is not the `main` the row will land on.

It happened again within hours: two sessions working in parallel worktrees on 2026-09-15 each appended an
`R-018`, neither able to see the other's. That one was **caught at the merge and repaired**, because
neither row had reached `main` yet: the row that landed first kept the number, and the second was
renumbered to `R-019` along with the two documents citing it, before the merge commit was made. The
`R-016` pair below was not caught, and by the rule that a row is never rewritten it can no longer be
repaired the same way.

Two things follow for anyone appending here. **Re-read `main`'s log immediately before committing**, not
when the work began — the agent workflow already says to re-read `main` before merging, and this is one of
the things that reading is for. And **a collision found before the row reaches `main` is renumbered, not
logged as a second defect**: the never-rewritten rule protects the published record, and an unpublished
row on a topic branch is not yet part of it.

*Noticed 2026-09-15 while logging [R-017](../product/requests.md#r-017). The `R-016` pair is recorded, not
repaired — resolving it needs a decision about which row keeps the number.*

**Repaired 2026-09-15**, on the owner's instruction to repair it. Three things were done, and the middle
one is the only one that stops it happening again.

**The collision.** The decision the note above declined to make did not need the owner's taste, because the
log had already settled the same question for the `R-018` pair the day before: *the row that reaches `main`
first keeps the number*. Git answers which that was — `c0a283c` merged the Settings Models overhaul at
23:25, `e4f48bc` merged the continue-run credential lease at 00:13, **forty-seven minutes** later. The
Models overhaul keeps `R-016`, which is also the row `owner-decisions.md` already cites in prose as the
origin of **ESC-36**. The continue-run row becomes [`R-020`](../product/requests.md#r-020): its date, the
owner's words, its classification and its disposition are the bytes that were there, and only the
identifier and the anchor moved. The row says so in its own cell.

That renumbering is permitted by a rule the log did not previously state precisely enough to be followed.
"Never renumbered and never reused" protects the *published* record — a reader who cited a number must
still reach what they cited. Nothing had cited either `R-016` by anchor, and one of the two was
unreachable by link in any case, so the rule was already broken in the direction it exists to prevent.
`requests.md` now states the rule with its one exception (settled at the merge, never afterwards) and
states what the never-rewritten rule actually protects: the request, not the row's position in a table.

**The cause — the log has no allocator — is now a gate.** [`tools/check-request-log.mjs`](../../tools/check-request-log.mjs)
runs in `pnpm lint` and refuses a duplicate identifier, a gap, an anchor that disagrees with the number
printed beside it, a Count section whose declared range is not the range that is there, and a
`requests.md#r-nnn` citation anywhere in `docs/` that reaches no row. It cannot prevent two worktrees
choosing the same number — nothing short of a lock can — but the second one now **fails the merge**
instead of landing beside the first, which is the whole difference between the two collisions: one was
caught by a person who happened to look, and the other was not.

**The concealment is gone too.** The twenty rows sat in three separate tables in merge order; the two
`R-016`s were twenty lines apart and were never once read side by side, which is how the collision
survived review. They are now one table sorted by identifier. One row — `R-015` — was also missing its
closing pipe; that is a table terminator, not a word of the request.

*Found by running the new gate for the first time:* it reported `R-001`, `R-002` and `R-003` as duplicates.
They are the example rows in the `Row shape:` block at the foot of `requests.md` — real-looking anchors
inside an **HTML comment**, which does not render and therefore holds no anchor at all. The gate strips
comments before it reads anything now. A checker whose first act is to be confidently wrong about its own
document's template is a checker somebody switches off, so the reason is kept in the file beside the fix.
