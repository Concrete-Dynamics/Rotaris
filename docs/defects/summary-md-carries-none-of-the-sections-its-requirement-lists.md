## summary.md carries none of the sections its requirement lists

`summary.md`, the human-readable summary rebuilt by every save, is written by `renderSummary`: a `# Session <id>`
heading, one line each for workspace, status, created, updated, iterations completed, stop reason, tokens and cost, an
Outcome block where the session has one, and a closing line saying nothing reads the file. REQ-SESSION-140 asks for a
different file: the status, workspace, created and updated lines in that order, a `- Task:` line (the first user event cut
to 240 characters), a `- Stop reason:` line only when a stop reason is recorded (the build always writes one, `—` when
none), a Metrics section in which an unavailable value reads `n/a` or `—` and never `0` (the build writes `0` tokens and
cost `0` for a session that made no request), a Warnings section (stale-input drops, mostly-elided artifacts, report
downgrades, permission denials naming the permission audit, tool errors, terminal failures, suspicious successes and
timeouts), an Agents section, a Slowest Tools section (the top 5 by `elapsed_ms`), and a closing inspection note saying
where the rest of the record is obtained (the export of REQ-SESSION-199 and the session log). None of the sections is
written.

Noticed 2026-10-06 by fin20 while building OQ-60's ruling (R-071), which has a recovered session's `summary.md` carry
REQ-SESSION-062's correction entry as its Outcome block. The Outcome block itself is the build's own: REQ-SESSION-140
names no outcome section, and the ruling's reader is built into the block that exists. Not repaired here.

## Specs

REQ-SESSION-140 (the file's contents and order), REQ-SESSION-006 and REQ-SESSION-028 (rebuilt from state by every save).
Nothing in the application reads the file (REQ-SESSION-006), so no surface shows the gap; a person who opens the file does.

## Relevant files

- `packages/engine/src/run/summary.ts` — `renderSummary`, the whole of what is written.
- `packages/engine/src/sessions.ts` — the `SummaryWriter`s a run, a continuation and a repair rebuild through.
