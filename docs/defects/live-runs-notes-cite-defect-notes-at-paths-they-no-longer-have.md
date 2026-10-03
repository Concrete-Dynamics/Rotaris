## live-run's notes cite defect notes at paths they no longer have

Two `NOTE` lines every live run prints from its frictions scenario point at defect notes that have been repaired and moved
to `docs/defects/fixed/`: "the stream-stall abort is not covered here" cites
`docs/defects/single-retry-stream-stall-aborted-a-76-minute-run.md`, and "the exit-trace gap is not covered here" cites
`docs/defects/process-exit-left-no-diagnosable-trace.md`. Both now live in `docs/defects/fixed/`, so every console log of a
live run carries two dead pointers. The frictions scenario's header comment cites two more the same way
(`a-first-use-schema-guess-failed-without-an-example.md`, `win32-terminal-edge-cases-bounced-to-the-agent.md`, both in
`fixed/` too). Nothing catches it: `tools/check-record-links.mjs` reads the record's Markdown links, never a script.

Seen in the console log of the orchestrator's default live run at origin/main 1763f7f (2026-10-03 05:56 to 06:15 UTC;
the autopsy's "ten NOTE lines", 3 and 4, finding D7); recorded 2026-10-03 by plan fin12, before any repair.

## Specs

None: a harness's pointers into the record. `CLAUDE.md` ("Defects noticed along the way") moves a repaired note to
`docs/defects/fixed/`, and `docs/defects/README.md` has every link to its old path move with it; these are not Markdown
links, so the move left them behind.

## Relevant files

- `apps/desktop/scripts/live-run.mjs`: the frictions scenario's two `noted(…)` lines and its header comment.
- `tools/check-record-links.mjs`: the record's link check, which reads no script.
