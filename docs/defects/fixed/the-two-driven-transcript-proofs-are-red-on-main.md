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

## Repaired — 2026-09-22

Both reds were reproduced on `main` at `fc2ceb4` before anything was changed (`pnpm rows-proof` red at
line 557, `pnpm transcript-proof` red at line 315), and the note's split turned out to be the right one:
one red was input not landing, the other was an assertion about a shape the product has never drawn.

**The pointer steps.** The `rows-proof` page draws **six** surfaces; `.rows-proof` declared
`grid-template-rows: auto minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)` — from when it drew three. Every
surface added since took an implicit auto row, and their content squeezed the three fractional rows flat.
Measured in the running window at the instant of the click:

```
{"boxes":[{"id":"proof-workspace","y":40,"h":1},{"id":"proof-persona","y":40,"h":1},
          {"id":"proof-groups","y":40,"h":33},{"id":"proof-activity","y":40,"h":143}, …]}
{"cx":686,"cy":41,"hit":"DIV|rows-proof__surface transcript|proof-activity","isRow":false}
```

The Workspace surface was **one pixel tall** with a neighbour painted over it, so a click aimed at a row's
centre landed on `proof-activity` and the log still said `capture: clicked …`. That is the whole of "the
input did not land", and it explains both moving assertions — the bare URL's open (REQ-CHAT-076) and the
pointer making a row current (REQ-CHAT-077) — as one cause, along with why they alternated between runs of
one binary: which surface covered which pixel depended on how the earlier steps had scrolled the page.

The fix is the template: each surface keeps a floor (`grid-auto-rows: minmax(320px, auto)`) and the page
scrolls to whatever a step reaches for. Nothing about the product's own surfaces changed — `.rows-proof` is
verification-only styling.

**The silence is gone too.** `targetProbe` in `apps/desktop/src/main/capture/host.ts` now asks
`document.elementFromPoint` what is actually drawn at the point a click is about to press, and the seam logs
`capture: "<selector>" is not under the pointer at x,y — "<intruder>" is` when the element named is covered.
The click is still delivered, so no existing proof changes behaviour; what changes is that the next proof to
suffer this reads its own cause out of its log instead of looking like a product regression. A grammar case
in `host.test.ts` holds the probe's two halves.

**The group expansion was never the product.** `transcript-proof` counted the revealed members as pooled
slots bound to a member key. A folded group occupies **one** slot and expanding it adds none: the members
are drawn inside the group's own row (`row__members` / `[data-testid="group-members"]`, REQ-CHAT-065 and
PD-CHAT-004), which is also what keeps the pool's slot count invariant across an expansion — an invariant
the same script asserts a few lines above. Measured in the built app before the change:

```
{"nested":4,"nestedKeys":["tool:call-400","tool:call-401","tool:call-402","tool:call-403"],"toolSlots":[]}
```

So the assertion was structurally zero and had stopped being about REQ-CHAT-067's grouping. It now counts
the members where they are drawn, checks they are the group's own four by key, and asserts the pool gained
**no** slots — the reading the old form was reaching for.

While here: the two focus readings pointed at `${W} .rowlist`, the container the *other* surface draws.
The Workspace transcript is Part Z's pooled pane, so that selector matched nothing and the readings rested
on `active` alone; they now name `.transcript__pool`.

Evidence: `pnpm rows-proof` and `pnpm transcript-proof` both green, twice — in the branch worktree and again
on merged `main`. `rows.log` carries **no** `is not under the pointer` line, and the 8100 ms reading shows
`active` as the row article rather than `body`.
