## The loop supervisor's deterministic message anchors on an escaped tab

`REQ-ORCH-104`'s deterministic message names the circled tool and a path anchor. `pathAnchor` searches the call's serialised arguments with `(?:[A-Za-z]:[\\/]|\.{0,2}[\\/])[^"'\s,}]+`, which accepts zero dots followed by a backslash, so it matches the JSON escape `\t`. When `old_string` precedes `path` in the serialised arguments, the anchor becomes `\tconst` and the message reads "Pause and reassess haet_edit around \tconst", naming no file.

Seen in the live run pack of 2026-10-14 04:30 (`Rotaris-crw-wt-live/.live-run/runs/2026-10-14T04-30-51-088Z`, session `dc1f4f1f`, `loop_supervisor_activation` at 05:07:45.885); the code is unchanged at `cb6d1d5`. The pack lives in an ephemeral cloud container and may be gone.

## Specs

`REQ-ORCH-104` (the message names a path anchor).

## Relevant files

- `packages/engine/src/run/supervisor.ts` — `pathAnchor` (about line 83) and `deterministicMessage`.
