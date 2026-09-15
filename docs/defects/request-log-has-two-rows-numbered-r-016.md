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

- `docs/product/requests.md` — lines 21–29 (the count, and the stray one-row table holding the first
  `R-016`) and line 49 (the second `R-016`, at the foot of the main table).
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
