## The directive register's count is prose with no checker

`docs/product/directives.md` opens with a count of its own entries, written in words ("Thirteen",
"Fourteen"). Nothing verifies it. It was found stale while writing `PD-ORCH-003` on 2026-09-17: the
register said **Thirteen** and held **fourteen** entries, because the commit that added `PD-LIBRARY-002`
(`d79d9f7`) added the entry without moving the count. The value is corrected to **Fifteen** in the commit
that records this note, but the gap that let it drift is not closed.

This is the same failure the request log already suffered and already fixed. `docs/product/requests.md`
carried seventeen rows under the heading "Sixteen" until
[`tools/check-request-log.mjs`](../../tools/check-request-log.mjs) was written for it, and that checker
now runs in `pnpm lint` and refuses a duplicate, a gap, an anchor disagreeing with its number, and a
declared count that is not the count. The directive register has the identical shape — contiguous
per-domain identifiers, anchors cited from other documents, a declared total — and none of that
enforcement.

The generated artifact is **not** the missing check. `DIRECTIVE_COUNT` in
`packages/kernel/src/generated/requirements.ts` is written by the generator from the register it just
parsed, and the test beside it compares that number to the `PD` symbols the same run emitted. Both sides
come from the same read, so the pair agrees with itself whatever the prose says.

Two things a checker would have to read that the request-log one does not, and they are why this is
recorded rather than fixed in passing:

- the count is spelled in **words**, not digits, so the check either carries a number-word table or the
  register's line changes to a form a machine can read (`R-001 to R-020` is what made the request log's
  own count checkable);
- a **revised** directive keeps its number and does not add to the total (`PD-CHAT-004` is at revision 3),
  so the count is the number of headings and never the highest identifier — the shortcut the request log
  is allowed to take does not hold here.

## Specs

None. This is a repository-process defect, not a product one: no `REQ` or `PD` governs the register's own
bookkeeping. `docs/product/README.md` states the obligation the drift breaks — "**Maintain after
building.** A commit that adds, revises or withdraws a directive updates `directives.md` … in the same
commit" — and its intake section states in terms why a count written in prose is the thing that goes
stale, recording the seventeen-rows-under-"Sixteen" case as the reason the request log was gated.

## Relevant files

- `docs/product/directives.md` — the `## Count` heading and the line beneath it; the stale value, corrected
  to Fifteen in the commit that records this note.
- `docs/product/README.md` — "What binds a change" (the maintain-after obligation) and "Intake" (the
  argument for gating a declared count rather than trusting it).
- `tools/check-request-log.mjs` — the checker for the sibling register, and the model a directive-register
  checker would follow; it runs from `pnpm lint`.
- `tools/symbol-artifact/generate.mjs` — writes `DIRECTIVE_COUNT` from its own parse, which is why the
  generated artifact cannot catch this.
- `packages/kernel/src/generated/requirements.ts` — the generated artifact; never hand-written.
