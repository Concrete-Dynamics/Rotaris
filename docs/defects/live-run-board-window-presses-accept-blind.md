## The live run's board scenario presses accept whether or not the card reached review

The `requirements` scenario gives the board-started run a fixed window — `LIVE_RUN_BOARD_MS`,
240 000 ms by default — and then clicks through the review decision at offsets computed from the
*end of that window* rather than from the card actually arriving in `review`:

```js
const review = RUN_MS;                                       // live-run.mjs:676
`[data-testid="req-detail-review"]@${review + 6_000}`,       // :685
`[data-testid="req-pane-review-decisions"] .btn-primary@${review + 9_000}`,
`[data-testid="req-pane-review-confirm"] .btn-primary@${review + 11_500}`,
```

When the model is slower than the window, one timing failure becomes three, and two of the three
name **product** symptoms that are not true:

```
FAIL  the run reached review inside the 240 s the board was given
        — backlog → running → running → running → running → running → → running
FAIL  the review's accept left the card resting in done     — it rests in running
FAIL  the delivery history carries both the release and the accept
        — release by ganga: Backlog → Ready (current)
```

Read without the first line, the second and third say the board fails to advance a card on accept
and fails to journal the decision. Neither happened. The accept was pressed at a card that was
still `running`, the product correctly declined to move it, and the history correctly holds only
the release. `AGENTS.md` says a live-run failure is a defect of the product until the harness is
shown to be wrong, which is the right default — and it is exactly why a harness that manufactures
false product symptoms is expensive.

Observed 2026-09-13 against `qwen3.8-flash-next`, the model the endpoint now serves. Every other
check in the same scenario passed, including the ones that read the work itself: `completedCount`
exported from the worktree's `src/todos.js`, the worktree's own suite present, `node --test` green
inside the worktree, 15 distinct tool names all settled, the run confined to
`rotaris-req-req-104-u1`. The run was doing the work correctly; it had not finished doing it.
`iterations_completed` read `0` with 125 157 input tokens spent, which is the same fact from the
store's side: mid-iteration, not stalled.

Confirmed the same day by re-running the one scenario with `LIVE_RUN_BOARD_MS=900000` and nothing
else changed: **`live-run PASSED`**, every check green, including the three that had failed —
"the run reached review inside the 900 s the board was given", "the review's accept left the card
resting in done — it rests in done", and the history carrying both entries. The board-started run
spent 291 170 input tokens against the 125 157 it had reached when the 240 s window closed, so it
was a little over half-way through. Nothing about the product was different between the two runs.

The repair is to make the three clicks wait for the state they act on, the way the rest of the
script already waits on a selector rather than on a clock (`ROTARIS_CAPTURE_WAIT`), and to report
"the window expired with the card in `running`" as **one** failure rather than three. A raised
`LIVE_RUN_BOARD_MS` is a workaround for one endpoint, not a fix.

## Repaired, 2026-09-13

Nothing this scenario presses is pressed on a clock any more.

The `selector@~ms` deadline that clicks already carried — act when it matches, give up at `ms` —
was extended to the two seams that lacked it, and one wait form was added:

- `ROTARIS_CAPTURE_KEYS` gained `keyCode>>selector@~ms`. The board needs it: Enter opens the
  *focused* card (REQ-TRACE-484), so the press is meaningless until the click before it has landed.
- `ROTARIS_CAPTURE_EVAL_AT` gained `<expression>>>selector@~ms`. The plain form stays, and the poll
  trail keeps using it: a reading taken at an appointment is the right shape for watching a value
  **change** and the wrong shape for reading what something left behind when it was ready.
- `ROTARIS_CAPTURE_WAIT` gained `js:<expression>`, beside `result` and `file:`. A throw or a falsy
  answer is "not yet", never "satisfied" — a broken expression must not end a capture early and
  silently. The board scenario ends on the accept landing, so the deadline became a **bound a quick
  model does not pay**, where the old shape always cost `window + 17 s`.

In the scenario itself the four presses after the release each name their precondition — the card
once the run puts it in `review`, the Review control once the detail is open, the decision once the
pane is, the confirmation once the dialog is — with `LIVE_RUN_BOARD_MS` as the single deadline for
all of them, raised to 900 s now that it costs nothing. The reveal and the resting read became one
expression, because two coroutines waiting on the same selector have no order between them.
`reachedReview` reads `settleAt`'s own log line rather than inferring from a 30 s poll, an expiry is
**one** failure, and the presses never made are `NOTE`d with what each wait did — `matched`,
`expired`, `not reached` — instead of being reported as faults of the board.

**The first attempt at this repair was wrong, and the live run caught it.** Enter was gated on
`[data-req-card="REQ-104"]:focus`, which matched **63 ms into the run** — the opening click focuses
the card. So Enter opened the detail at 3 s, the Review control appeared, and the press waiting for
that control opened a review pane over a card that had not been released. The decisions never came
and the card rested in `review`:

```
capture: clicked "[data-req-card="REQ-104"]"
capture: [data-req-card="REQ-104"]:focus matched with 896934 ms to spare
capture: key Return
capture: [data-testid="req-detail-review"] matched with 896871 ms to spare
capture: clicked "[data-testid="req-detail-review"]"
…
capture: [data-testid="req-pane-review-decisions"] .btn-primary never matched within 900000 ms
```

Kept here rather than quietly corrected, because it sharpens the original finding: **a state-driven
press aimed at a state that is also true before the thing it waits for is no better than a clock,
and is harder to see** — the clock at least fails visibly. The gate became
`[data-req-card="REQ-104"][data-column="review"]:focus`, which cannot be true before the release,
and the Review control was scoped to the open detail for this card. One gate; the chain falls in
behind it.

## Specs

None. This is the verification harness, not the product. No requirement is contradicted — the
product behaved correctly at every point the harness misreported.

Adjacent, and the reason this matters beyond the one scenario: `docs/architecture/codebase.md`'s
live-run section records the eighty-first defect and the REQ-TRACE-022/474 traps as findings that
"read as product failures" until they were traced to the harness. This is the same class again.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — the `requirements` scenario. Before the repair: `:667` the
  `LIVE_RUN_BOARD_MS` default, `:676` `review`, `:685`–`:687` the three clicks at clock offsets,
  `:708` the check whose failure did not stop them.
- `apps/desktop/src/main/index.ts` — the capture seam: `steps`/`settleAt` and the `@~ms` deadline,
  the `ROTARIS_CAPTURE_KEYS` and `ROTARIS_CAPTURE_EVAL_AT` loops that now take it, and the
  `ROTARIS_CAPTURE_WAIT` poll that gained `js:`.
- `AGENTS.md` — "A live-run failure is a **defect of the product**, not of the harness, until the
  harness is shown to be wrong"; the standing rule this note discharges for one case.
- `.live-run/results.json`, `.live-run/requirements.log`, `.live-run/requirements.png` — the
  evidence of the 2026-09-13 run (gitignored; regenerated by the next live run).
