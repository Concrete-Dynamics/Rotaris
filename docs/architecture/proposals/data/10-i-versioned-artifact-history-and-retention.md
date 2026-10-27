# Architecture proposals — DATA slice — I. Versioned artifact history and retention

Part 10 of 25 of [the data proposal](../data.md), which indexes every part.

## I. Versioned artifact history and retention

**I1 — Every artifact mutation appends a version; the cause vocabulary is closed. (hard)**
`REQ-LIBRARY-049`: `<workspace>/.rotaris/improvement_artifacts/history/<artifact_id>/<version>.json`,
version zero-padded to 6 digits, containing `{version (≥ 1, monotonically increasing), recorded_at
(UTC), cause, artifact (full copy)}`, written atomically.
`REQ-LIBRARY-050`: cause is exactly `collected`, `status_change`, `edit`, `delete`, `checkpoint`,
`rollback`, `unknown`.
`REQ-LIBRARY-162`: **every** mutation — status change, edit, deletion, recorded checkpoint,
rollback — goes through the same write path and leaves a version naming its cause.
`REQ-LIBRARY-048` fixes the default attribution: with neither an existing file nor recorded history,
`collected`; any other implicit write, `edit`.

**I2 — Retention rules are fixed constants and explicitly not configurable. (hard)**
`REQ-LIBRARY-052`: at most **25** versions per artifact; for keep count N ≥ 2 the retained set is
version 1 together with the newest N−1, "so the state as first recorded is never what pruning gives
up"; N = 1 keeps only the newest; N ≤ 0 keeps none; pruning removes the oldest **droppable** version
first, a droppable version being any that is neither version 1 nor the newest. "N is fixed at 25 by
this document and MUST NOT be exposed as a configuration key."
`REQ-LIBRARY-071`: at most **10** checkpoints per artifact, oldest dropped first with their refs, the
newest `pre_improvement` never dropped; fixed and not configurable.
`REQ-LIBRARY-139`: prompt history capped at **200**, stash at **100**, enforced on both load and
save with silent truncation of the oldest; fixed and not configurable.
`REQ-LIBRARY-165`: the analyst evidence bounds — 200 transcript events, 2,000 chars per event,
40,000 chars total transcript, 100 progress entries, 200 todos, 20 child reports at 4,000 chars each
and 60,000 total, 8,000 chars of gate evidence, 5 prior artifacts at 4,000 chars each — are constants
and must not be exposed as configuration. "Because the bounds are constants, two runs over the same
session produce the same evidence regardless of how large the session grew."
`REQ-LIBRARY-462` (Data & Formats): the domain's configuration surface is **exactly** three keys.
By contrast `REQ-GIT-049`/`REQ-GIT-071` make session checkpoint retention **configurable** at
`checkpoints.max_per_session`, default 50, minimum 1 enforced at load. Two retention policies, two
different treatments, deliberately.

**I3 — Pre-history state must be seeded, not lost, and reading must never write. (hard)**
`REQ-LIBRARY-051`: reading the history of a pre-history artifact synthesises a version 1 from the
current file with cause `unknown` and `recorded_at` equal to the artifact's `generated_at`,
**writing nothing** — "opening a workspace never rewrites untouched files". The first history-aware
overwrite must **first** seed the pre-existing on-disk state as version 1 so it is preserved rather
than lost.
`REQ-LIBRARY-053`: history enumeration is defensive — unreadable or corrupt version files are
skipped with a warning, listing is newest-first, a missing version fails with a fixed message, and
an unknown artifact yields an empty history.

**I4 — A legacy import runs on first store access. (hard)**
`REQ-LIBRARY-044`: on first store access (list, load, or save), artifacts at the legacy per-session
location `.rotaris/sessions/<session_id>/improvement_artifacts/*.json` are imported into the
workspace store **when absent there**; malformed legacy files are skipped with a logged warning and
are never fatal. This is a read path that writes, and it is the only one in the domain.
