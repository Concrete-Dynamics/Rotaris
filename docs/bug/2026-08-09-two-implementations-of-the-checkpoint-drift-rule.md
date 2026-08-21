# Two implementations of the "what counts as user drift" rule

> Found: 2026-08-09, during integration of wave 1 of the Phase 2 work.
> Status: **confirmed duplication; the two currently agree.** No user-visible defect today.
> Severity: low now, medium later — this is a divergence waiting to happen in a safety check.

## What exists

The rule that decides whether a rollback is refused — *which paths would this restore
overwrite that no recorded checkpoint holds a copy of* — is now implemented twice:

| | Session rollback | Improvement rollback |
| --- | --- | --- |
| File | `src/rotaris_core/session/checkpoint_restore.py` | `src/rotaris_core/improvement/rollback.py` |
| Requirement | SWR-2437 | SWR-1641 |
| Keys on | checkpoint `sequence` | artifact id + `CheckpointRef.commit` |
| Members | `_dirty_paths`, `_drift_baseline`, `_DRIFT_BASELINE_LOOKBACK` | same three names |

The second was adapted from the first, not reinvented: same algorithm, same lookback cap,
same "a checkpoint the tree matches exactly means nothing has drifted" rule, same reasoning
in the docstrings. **They agree today.** Both also correctly avoid using `HEAD` as the
baseline, which would block every restore in a checkpointed tree.

## Why it is worth recording anyway

This is a *safety* rule: it decides when the product refuses to destroy work. Two copies of
a safety rule drift, and a drift here is silent — the failure mode is "one rollback path
stopped warning" and no test compares the two. The improvement copy's own code review
already found a real bug in this exact logic (the drift baseline was counting the
improvement run's *own* edits as user drift, which would have blocked every ordinary
rollback). If the same class of bug is fixed in one file and not the other, nothing notices.

## How it came about

My own file-ownership split forced it: the unit implementing SWR-1641 was told not to touch
`session/checkpoint*` so it could run in parallel with its siblings. That was the right call
for the wave — a shared edit would have serialised two units — but the duplication is the
bill for it, and it falls due now rather than on the agent that wrote it.

## Fix sketch

Extract the drift computation into one helper parameterised over the two things that
actually differ: how to enumerate recorded points, and how to resolve one to a
`CheckpointRef`. Both call sites already hold an engine and a list; the shape is close to
`drift_baseline(points, resolve, known_key, known_entries, lookback)`.

Worth one small unit with a test that drives **both** call sites through the same scenario
table, which is the part that actually prevents divergence — a shared helper with two
separate test suites would re-open the same gap more quietly.
