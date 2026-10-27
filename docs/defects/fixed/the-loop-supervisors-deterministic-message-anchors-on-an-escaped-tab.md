## The loop supervisor's deterministic message anchors on an escaped tab

**Outcome: repaired 2026-10-20 by `loc1-supervisor`.** `pathAnchor` in `packages/engine/src/run/supervisor.ts` now reads the anchor
from the call's argument **values** (`pathIn`): the arguments are parsed, and the anchor is the first string, in written order
and depth first, under a path- or file-named argument (`path`, `file_path`, an element of `paths`), else the first
path-shaped string anywhere (one word, within 512 characters, holding a separator or ending in a file extension). It is never
read from the JSON text, so an escape cannot be one, and the key order [OQ-364](../../architecture/open-questions/66-spikes-and-later-questions-33.md#oq-364)
made irrelevant to sameness is irrelevant to the anchor too. Arguments that do not parse, or hold no path, fall back to
"<tool> with <the first 80 characters>" as before. Also found while repairing it: a Windows path anchored in its escaped form
(`C:\\x\\y.ts` for `C:\x\y.ts`), and the old expression's second limb backtracked quadratically over a long run of path characters, so
200,000 of them held `check()` for 157 s. Pinned by `supervisor.test.ts`'s block "REQ-ORCH-104: the deterministic message's
path anchor is read from the argument values" (six cases red on the build before: the tab ahead of `path`, one value in two key
orders, a Windows path, relative paths after escaped strings, the no-path fallback with escapes, the 200,000-character text; a
glob-shaped value under another name green before and after) and by the OQ-364 block's PD-ORCH-016 case, which now requires
"haet_edit around crlf-live/greet.js". Recorded in [ADR-0059](../../architecture/adr/0059-the-loop-supervisor-as-an-in-turn-observer.md)
(decision 5 and its 2026-10-20 section on the anchor). **Measured live** in the default live run's `crlf` scenario on this branch (2026-10-20, pack `2026-10-20T15-45-32-700Z`, endpoint `katalyst`, unmetered, R-068; Windows 11 ARM64, Node 24.18.0 arm64, beside three other trees' 18 Electron processes): the activation's message read
"Pause and reassess haet_edit around crlf-live/greet.js. …" over calls written with `path` last.

`REQ-ORCH-104`'s deterministic message names the circled tool and a path anchor. `pathAnchor` searches the call's serialised arguments with `(?:[A-Za-z]:[\\/]|\.{0,2}[\\/])[^"'\s,}]+`, which accepts zero dots followed by a backslash, so it matches the JSON escape `\t`. When `old_string` precedes `path` in the serialised arguments, the anchor becomes `\tconst` and the message reads "Pause and reassess haet_edit around \tconst", naming no file.

Seen in the live run pack of 2026-10-14 04:30 (`Rotaris-crw-wt-live/.live-run/runs/2026-10-14T04-30-51-088Z`, session `dc1f4f1f`, `loop_supervisor_activation` at 05:07:45.885); the code is unchanged at `cb6d1d5`. The pack lives in an ephemeral cloud container and may be gone.

## Specs

`REQ-ORCH-104` (the message names a path anchor).

## Relevant files

- `packages/engine/src/run/supervisor.ts` — `pathAnchor` (about line 83) and `deterministicMessage`.
