## The bounded projection reads runs on rows hygiene drops

ADR-0046 step 4's bounded form (`projectDisplay(o, { previous, from })`) decided where a run could be cut on the RAW
rows, while `foldRuns` forms runs from the rows hygiene KEEPS. The two disagree wherever hygiene removes or changes a row
that decides a run, and the bounded form then drew something the whole-state form does not — on a pure append, the
shape the pane has taken the bounded form for since R-062 (`projector.ts`). Two paths, both found by R-062's independent
verifier in fix round 2:

- **REQ-CHAT-048's dropped reasoning splits a run.** A live streamed reasoning row (`streamId`, not settled, no
  duration) never folds raw (REQ-CHAT-066), so `cleanCut` read it as closing its agent's run and kept the cut above it.
  When its body repeats that agent's previous thinking row, REQ-CHAT-048 projects it to zero rows and the fold joins the
  rows on either side of it. At `[user 0; thinking Y 1 (5 ms, "same"); tool Y 2; thinking Y 3 (live, "same")]` with
  `tool Y 4` appended, the pane drew `[row 0, group 1,2, row 4]` where the whole projection draws `[row 0, group 1,2,4]`,
  and every later append reused the stale split until something forced a whole projection. With the session not
  running, REQ-CHAT-049's settle changes foldability the same way and was read raw too.
- **REQ-CHAT-050's dropped diff lets the reused prefix pass `from`.** A repeated edit diff re-sent at its own index with
  the rows behind it removed (the replica's `projectIncrement`) leaves nothing at or after `from` in the deduplicated
  rows; the cut landed past the end, the boundary read `+Infinity`, and the whole previous display was reused — the
  removed rows included.

Reachability: the engine settles reasoning before it appends a turn's tool rows (`turn.ts`), so the first path needs a
recorded or crashed session's unsettled duplicate reasoning; the second needs an increment that re-sends a repeated diff
and removes what follows it. Both are inside the `TranscriptRow` contract. Fix round 1's walk passed because it ran one
seed with `running` true and grouping on, and never generated a diff row or a reasoning duration.

## Specs

ADR-0046 step 4 ("re-projecting from a clean cut reproduces every displayed row from it onward, and no displayed row
before it"); REQ-CHAT-048 (duplicate reasoning projects to zero rows) and PD-CHAT-004 / REQ-CHAT-067 (the activity line
folds one agent's run, which the split broke in two); REQ-CHAT-050 (a diff displayed at most once) and REQ-CHAT-052 (the
transcript never shows rows that disagree with the session record — the removed rows were shown); REQ-CHAT-154 (a
bounded form earns its place only by projecting what the whole form projects).

## Relevant files

- `packages/ui/src/transcript/project.ts` — `cleanCut` and `projectDisplay`'s bounded branch; `hygiene`, split into
  `repeatsReasoning`, `settle` and the caps.
- `packages/ui/src/transcript/projector.ts` — the pane's caller of the bounded form since R-062.
- `packages/ui/src/transcript/projector.test.ts` — the two reproductions and the seeded walks.

## Repaired — 2026-09-28 under R-062

`cleanCut` now reads both of its passes over the rows as `foldRuns` will see them: a row REQ-CHAT-048 drops is skipped,
and every row is settled (REQ-CHAT-049, REQ-CHAT-062) before `runnable` asks whether it may fold — `hygiene` was split
so the settle is shared and the caps, which no run reads, are not paid for twice. The prefix boundary is now
`min(cut row's index, from)`, so no display row at or after the changed index is ever reused. Pinned by
`projector.test.ts`'s "an append after a duplicate live reasoning row joins the run that row no longer interrupts" and
"a repeated diff replaced at its own index, with the rows behind it removed, reuses none of them", and by the seeded
walks, which now generate reasoning with and without a duration and repeating its body, and edit diffs repeating their
call, and run over seven seeds and all eight values of `running`, `groupTools` and `showReasoning` (56 walks of 300
steps plus fix round 1's 600-step walk, each step compared to the whole-state projection). Reverting the boundary bound
fails the diff case and the seven-seed walk; reverting the cleaned view fails the reasoning case and the seven-seed walk
(seed `5eed`, not running, step 78). A throwaway sweep of 60 further seeds × 8 configurations × 800 steps (384,000
compared projections) found no divergence; it is not kept in the suite for its three minutes.
