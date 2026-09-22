## `rows-proof` and `transcript-proof` are red on `main`, on assertions that depend on driven input

Observed 2026-09-22 on `main` at `1caf6a6`, built clean in the primary checkout (`pnpm build`, exit 0) and
run twice:

- `pnpm rows-proof`, run 1: `Error: the BARE url in a plain row did not open: ["https://rows-proof.invalid/spec"]`
  (`rows-proof.mjs:517`, REQ-CHAT-076 — the authored link opened, the bare one did not).
- `pnpm rows-proof`, run 2, same binary: `Error: the pointer did not make a row current: {"tag":"body","id":null,"className":"","label":null,"testId":null}`
  (`rows-proof.mjs:557`, REQ-CHAT-077 — the hover at t=8100 ms left `document.body` focused).
- `pnpm transcript-proof`, both runs: `Error: expanding the group revealed 0 members beneath it, not four`
  (`transcript-proof.mjs:315`).

The same three reds appear in a worktree built from `main` plus an unrelated change, at the same lines, so
they are the state of `main` rather than anyone's edit. What they have in common is that each assertion
rests on input the driver delivered — a click that opens a link, a pointer move that makes a row current,
a click that expands a group — and the first two **move between runs of one build**, which reads as input
not landing rather than as a product regression. The third repeated identically on every run, so it may be
either.

The cost is that the two proofs standing behind the transcript surface currently answer "red" to every
change, and an agent that touches `packages/ui/src/transcript/` cannot tell its own regression from this.
A repair should separate the two: whether the driver's synthetic input is reaching the window at the
instants these scripts assert at, and whether group expansion still reveals its members.

## Specs

No requirement contradicted by the proofs themselves. What the three assertions stand for is REQ-CHAT-076
(a link opens through the platform), REQ-CHAT-077 (the arrow keys move the current row, the current row
being the focused one) and REQ-CHAT-067's grouping, whose expansion is what `transcript-proof` asserts.
Whether any of those three is actually broken in the product is exactly what these reds no longer say.

## Relevant files

- `apps/desktop/scripts/rows-proof.mjs` — lines 517 and 557, the two moving assertions.
- `apps/desktop/scripts/transcript-proof.mjs` — line 315, the group expansion.
- `apps/desktop/scripts/lib/driver.mjs` — the driver that delivers the clicks, hovers and key presses
  these scripts schedule against a wall clock.

Noticed 2026-09-22 while gathering built-app evidence for
`docs/defects/fixed/the-in-projection-scope-filter-is-never-reached.md`; the reds were compared against
`main` before being believed, and `main` held them.
