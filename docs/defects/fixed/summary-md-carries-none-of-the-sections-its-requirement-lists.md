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

## Outcome

Repaired 2026-10-06 by fin22 (bundle `fin22-summary-and-counts`). `renderSummary` (`packages/engine/src/run/summary.ts`) now
renders from `SummaryFacts`, read in one read transaction by `summaryFactsOf`: the heading; status, workspace, created and
updated in that order; `- Task:` with the session's first submitted prompt (`StoreDal.firstPromptRow`, resident or released)
cut to 240 characters under REQ-SESSION-194, `—` where none was submitted; `- Stop reason:` only where one is recorded;
OQ-60's Outcome block, kept as ruled, after it; Metrics, in which tokens of a session with no usage and a cost whose price was
not established read `n/a`; Warnings, one line per kind REQ-SESSION-140 lists (a denial names the permission audit;
stale-input drops and report downgrades read `n/a` for the records this store does not keep, and mostly-elided artifacts read
`n/a` under [OQ-206](../../architecture/open-questions.md), which asks what the requirement means by one — that one kind is
**not** built, and stays open in
[`summary-md-counts-no-mostly-elided-artifacts-until-oq-206-is-ruled.md`](../summary-md-counts-no-mostly-elided-artifacts-until-oq-206-is-ruled.md)
until the question is ruled); Agents (each
iteration's root, each plan cycle's root, each child, and any name only the tool-call record carries, with its counted calls,
`n/a` where none is held); Slowest Tools, the top five by `elapsed_ms`; and the closing inspection note naming Export records…
and `session.log`. The counts are `sessionMetrics` (`packages/engine/src/export.ts`), the metrics document's own figures, read
without the records' serialised entries (`StoreDal.toolCallDigestOf`, `auditDigestOf`) because every save rebuilds the file.

Repaired with it, the fin20 verifier's findings in the same files: `SummaryWriter.rebuild` now makes every read (the
correction entry's included) inside its guard, so a throw is a warning and the chain never rejects — the repair's
`void rebuilt.finally(...)` and `closeAll`'s `Promise.all` no longer meet an unhandled rejection; a rebuild a newer one is
queued behind is skipped. `summariesSettled` stands above `closeAll`'s JSDoc, which attaches to `closeAll` again.

Pinned by `packages/engine/src/run/summary.test.ts` (the order, the omitted stop reason, the cut task, `n/a` for tokens and
cost, the Warnings lines, the Agents lines, `summaryFactsOf` over a real store, the writer's guard and skip), red on the code
before, and by `packages/store/src/store.test.ts` (the digest and the first prompt). `pnpm sessions-proof` reads the seeded
session's `summary.md` for the sections in order, the stop-reason line, `n/a` and a slowest call, and keeps it as
`seed-summary.md` beside `repaired-summary.md`.

**Repair round 1 (fin22's verifier).** The Warnings line for mostly-elided artifacts was split out into its own open note,
linked above, citing OQ-206 and the `n/a` reading, since the requirement is not met for that kind until the question is
ruled. The same round names the permission audit on the denials line whatever its count, labels the metrics document's
`timeouts` as every tool call that timed out (`- Timeouts:`, not `- Terminal timeouts:`, since it counts more than the
terminal's), and reads a non-string `outcome_kind` or `failure_kind` as NULL in `toolCallDigestOf` (`json_type`), as
`toolCallFactsOf` does. A plan cycle root's Agents line read from the capped record is recorded in
[`summary-md-reads-a-plan-cycle-roots-calls-from-the-capped-tool-call-record.md`](summary-md-reads-a-plan-cycle-roots-calls-from-the-capped-tool-call-record.md), and repaired in repair round 2: a plan cycle's root reads its own count, store v33's
`plan_roots.tool_calls`, and a line with no count kept reads `n/a` once the ring has dropped any.
