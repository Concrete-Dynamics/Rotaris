## The traffic recorder's body cap drops a response's usage, and two duress figures disagree with the store

Observed 2026-10-03 by the orchestrator's duress live run at origin/main `1763f7f` (pack `2026-10-03T06-15-52-273Z` of the
`wt-live` worktree, git-ignored; finding U6 of its autopsy). The recording proxy keeps at most 1,000,000 bytes of a body and
appends "…[truncated: N bytes total]". Two complete responses were longer — `duress/model-traffic.jsonl` lines 77 (1,047,354
bytes) and 234 (1,009,144 bytes) — and lost their closing `usage` chunk with the cut. The product recorded both responses'
usage (257 `usage.update` events for 257 complete requests), but the harness reads usage from the recorded body, so:

- the compression NOTE says "the largest prompt of the 255 calls that carried usage (8 did not)", where 2 of the 8 did;
- the time-split PASS says "340,393 output tokens of which 268,941 reasoning", where the store and the same console's spend
  line say 361,180 output tokens — 20,787 tokens and two calls short.

The conclusions those lines support still hold (the autopsy's NOTE table checks them); the figures are wrong.

## Specs

- None (harness).

## Relevant files

- `apps/desktop/scripts/lib/model-traffic.mjs` — `BODY_CAP` and `cap` (lines 30 and 41 at `1763f7f`), which truncate the
  recorded body before anything reads it.
- `apps/desktop/scripts/lib/duress-checks.mjs` — `usageOf` (reads the last usage figures in `responseBody`), `trafficCall`,
  `compressionNote` (line 122 at `1763f7f`) and `deadlineReading` (line 221).
- `apps/desktop/scripts/live-run.mjs` — the duress scenario's time split and compression NOTE (around line 2132 at
  `1763f7f`), which sum `trafficCall`'s figures.

Noticed 2026-10-03 by the autopsy of the duress live run at `1763f7f`.
