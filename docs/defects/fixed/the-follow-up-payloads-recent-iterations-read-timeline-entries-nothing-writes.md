## The follow-up payload's "Recent iterations" read timeline entries nothing writes

When a new top-level task enters an existing session, REQ-SESSION-115's payload carries "the last 5 outer-loop iterations".
`buildContinuationPayload` (`packages/engine/src/sessions.ts`) fills its `Recent iterations:` block from the session's
`timeline` entries named `iteration_end`, but no code writes such an entry: the run records an iteration's end as the
`events` record's `iteration.end` (`SessionWriter.endIteration`) and fires the `iteration_end` lifecycle hook
(REQ-HOOKS-001), and neither is a timeline entry. So the block always reads `- (none recorded)`, and a person's follow-up
never tells the root how the last iterations ended: the account live-run finding P1's fresh root also lacked.

Live-run finding: P4 of the final default live run at origin/main `a68f121` (2026-10-07), read from the code; that pack sent
no follow-up into an existing session, and its store's 19 timeline names, over 10 sessions and 11 iterations, include no
`iteration_end`.

## Specs

- `REQ-SESSION-115`: the follow-up payload's budgets include "the last 5 outer-loop iterations" and "at most 700 characters
  per structured item". The block is required and always empty.
- `REQ-ORCH-139` with the timeline event vocabulary of `docs/spec/01-run-orchestration.md` (Data & Formats): `iteration_start`
  and `iteration_end` are words of the session diagnostics' timeline; a run records timeline events named only from it.
- `REQ-ORCH-067`: "Iteration boundaries MUST be visible in session state and transcript via iteration-start and iteration-end
  events carrying iteration number, task id/name, outcome, and summary."

## Relevant files

- `packages/engine/src/sessions.ts` — `buildContinuationPayload`, the reader of `iteration_end` timeline entries.
- `packages/engine/src/run/run.ts` — `iterate()`'s close: `writer.endIteration(...)` and the `iteration_end` hook, where the
  iteration's number, task, outcome and summary are all in hand.
- `packages/engine/src/session-writer.ts` — `endIteration` (the `iteration.end` event) and `appendTimeline`.

## Repaired (2026-10-07, fin31)

REQ-ORCH-139's vocabulary and REQ-ORCH-067's fields decide where the account comes from: `iteration_end` is a word of the
session diagnostics' timeline, and an iteration's end carries its number, task, outcome and summary. So the run now writes
that entry rather than the payload reading another record: `Run.iterate` (`packages/engine/src/run/run.ts`) appends
`iteration_end` after `writer.endIteration`, with the message "Iteration <n> (<task title, cut to 80>): <outcome> — <summary>"
and the same facts as metadata (`iteration`, `task_id`, `task`, `outcome`, `summary`). `buildContinuationPayload` is
unchanged: it reads the last five, each cut to 700 characters. An iteration a rest leaves open has not ended and writes none.
A re-queue for an open plan (`PD-ORCH-015`) carries `partial` and the open items in its summary, so the payload says why the
iteration did not complete its task.

Pinned by `packages/engine/src/session-resume.test.ts`: a follow-up after two iterations reads "- Iteration 1 (write the
parser): succeeded — First done." and the second iteration's line (red on `a68f121`: no entry, "- (none recorded)"), and a
guard that the block keeps the last five, each at most 700 characters; `run.test.ts`'s happy path now expects the entry
between `run_start` and `run_end`; `coordinator-plan.test.ts` reads the `partial` entry a held iteration writes. Shown in the
built app by `pnpm part-h-proof`'s resume launches: each closed iteration of the continued session has its entry,
"Iteration 1 (finish the first run): succeeded — …" first. The payload's text itself is not read by any proof (the scripted
client records no user message).

Not written, and not repaired here: the vocabulary's `iteration_start` timeline entry. No requirement reads it, and an
iteration's start is in the `events` record (`iteration.start`).
