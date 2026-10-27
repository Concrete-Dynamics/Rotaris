# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model — Revisit if

Part 5 of 11 of [ADR-0036](../0036-configuration-loading.md), which indexes every part.

## Revisit if

`REQ-CONFIG-477` is amended — which is now the only route by which alternative D reopens, and is
deliberately a harder route than reversing this ADR. A requirement makes absent and null equivalent
everywhere, removing the tri-state; or a sixth layer or a per-key precedence inversion appears, both of
which `REQ-CONFIG-031` and `REQ-CONFIG-449` currently forbid; or a validation library models tri-state
optionality natively without normalising, which would collapse alternatives A and B into one; or
`REQ-CONFIG-252` is reversed and comments are again to be discarded, which would make the document API
optional rather than required.

Two contingencies turn on measurements this record does not have and must not guess at. **The
document-API write path has not been timed on a real `agents.yaml`** — the DATA spike established that
a targeted edit *preserves* comments, layout and key order, not what it costs. If a measurement shows
the in-place edit is materially slower than parse-and-stringify at the sizes users actually write, that
is a cost to record, not a reason to reverse: `REQ-CONFIG-252` fixes the observable and the alternative
does not produce it. **The no-cache rule has not been timed against `REQ-SHELL-150`'s 100 ms gesture
budget** on the paths that re-read and re-merge on every settings-screen open. Consequence 2 asserts
microseconds; that is an estimate from file sizes and not a figure. If it turns out to be wrong the
answer is still not a cache — `REQ-CONFIG-014` forbids one — but the settings screen's own
sequencing would then belong in a decision record rather than in an assumption here.
