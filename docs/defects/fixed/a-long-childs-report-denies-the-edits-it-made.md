## A long child's report denies the edits it made

The child-report summariser is given the transcript cut to 12,000 characters from its head. For a long child that is
the task and its first reads, and the edits come after the cut; the summary then says no write happened, directly above
the report's own deterministic "Edited Files". Parents consume the report in place of the transcript (REQ-ORCH-108),
the artifact carries it, and the sibling index hands it to every later child.

Live-run finding: D1 (live runs of 2026-09-29)

**Ruled 2026-09-29 — [OQ-111](../../architecture/open-questions.md), [R-067](../../product/requests.md#r-067).** Within REQ-ORCH-110's 12,000-character cap
the transcript the summariser reads keeps its start (the task as given) and its most recent part, with the omission
marked between them, and the pass is also given the report's deterministic facts (edited files, commands run and their
outcomes), so a report never denies work the record shows. That is this note's repair.

## Specs

- `REQ-ORCH-108` (the report stands in for the transcript; the pass condenses what happened) and `REQ-ORCH-110` (the
  cap, and now OQ-111's selection).

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`: `d`'s summariser request (traffic #160, 12,388 characters) ends `… [63288 characters
  omitted]` before `d`'s first edit. Five of seven stored reports contradict their own `edited_files` (`json_extract(report,
  '$.summary')` against `'$.edited_files'`): `a` "did not write the documentation file"; `c2` "does not show the creation
  of docs/overview.md"; `d` "shows no edits to the documents"; `e` "No write to docs/decisions.md was observed"; `d2` "shows
  no document writes". `d`'s artifact `art_KuqenqoM` reads "No write or edit tool calls … are shown" directly above
  "## Edited Files: docs/api.md, docs/overview.md", and it was the first thing the continuation `d2` read.

## Relevant files

- `packages/engine/src/children/report.ts:66-68` — `cut`, which keeps the head; `:71-80` — `transcriptText`, cut to
  `TRANSCRIPT_CAP` at `:79`.
- `packages/engine/src/artifacts/store.ts` — `materialiseChildReport`, which carries the summary into the artifact.

## Repaired — 2026-09-29

Repaired 2026-09-29 under [R-067](../../product/requests.md#r-067), as [OQ-111](../../architecture/open-questions.md) rules.
`produceReport` no longer hands the pass `transcriptText`'s head-only cut. It reads `reportTranscript`, which keeps
the child's task as given and the most recent part. The task is the ledger row's own, carried on `ReportInput.task`.
The child's first event is its REQ-TOOLS-154 payload, which puts the workspace root, the write scopes, the sibling
index, the attached artifacts and the inherited reports ahead of the task. Where that event is recognised, the blocks
ahead of the task are replaced by `… [N characters omitted] …`, so the start reads `user: … [N characters omitted] …
<the task>`. Where the conversation was replaced by a compression, the task is put ahead of the events. The start is
one event, cut to REQ-ORCH-110's 2,000 characters; whether a longer task may be kept whole is asked as OQ-118. Between
the start and the most recent part stands `… [N characters omitted] …`, where N is the count left out. The whole,
markers included, is held to REQ-ORCH-110's 12,000 characters. A transcript within the cap is given whole, its start
being the task in the same way. The request also carries a `Facts:` block, `reportFacts`. It holds the edited files
and every command with its exit code (or "no exit code"), derived from the whole transcript by the functions that fill
the report's own `edited_files` and `commands`. The ask tells the pass that its summary must agree with the facts, and
that a middle marked omitted is not evidence that nothing happened there. Each command in the block is cut to 2,000
characters and the block to 12,000, REQ-ORCH-110's two figures, so the pass stays bounded. The ruling gives the facts
no bound of its own; this bound is the build's, asked as OQ-119. `transcriptText` keeps its head-only cut for its other
reader, the compressor
([`the-compressor-reads-only-the-head-of-what-it-compresses`](../the-compressor-reads-only-the-head-of-what-it-compresses.md)).

*The first repair's start, falsified by the branch's verification and kept beside its replacement:* it kept "the first
event (the task as given, itself cut to 2,000 characters)". The first event is the whole payload, and the task comes
last in it. The live run below showed it: every one of the six summarising requests began `user: Workspace root: …` and
was cut inside the task, with 297 to 3,017 of its characters omitted. The last request (traffic #140) lost the task's
`EXPECTED OUTCOME` and `MUST DO`. A payload with a sibling index and inherited reports ahead of the task lost the task
entirely. This note first said "All six summariser requests read the task as given", which was false.

Evidence: `packages/engine/src/children/report.test.ts`, "OQ-111: the pass reads the start and the most recent part,
beside the facts". Its cases run over the duress transcript's shape. The first event is a real `childPayload`: the
workspace root, the write scopes, a five-entry sibling index and an inherited report ahead of a four-section task,
over 2,000 characters in all. Then come 34 reads of over 3,000 characters each, two `haet_edit` calls, `node --test`
and the final answer. Two cases reproduce the findings: the head-only cut holds no edit, and the first repair's start
holds no task. The main case checks that the start is the whole task with the blocks ahead of it marked, that both
edits, the check and the final answer are kept within the cap, and that the marker's count is exact. Others cover a
task over 2,000 characters (its head kept, as OQ-118's reading states), a first event that is not the payload, a
transcript within the cap, and the facts block. The last runs the request through `produceReport` and checks that it
carries the whole task and the facts. In `children.test.ts`, "OQ-111 (live-run finding D1)" runs a delegated child
end to end and checks that the summariser's transcript starts with the task, the workspace-root line marked omitted.
Each of these fails with the start taken back to the first event, or with `task` left off `ReportInput`.

Live, 2026-09-29: `pnpm live-run --confirm --only=duress` against the unmetered `katalyst` endpoint, built from the
first repair. Pack `.live-run/runs/2026-09-29T07-18-48-658Z` (this branch's worktree; git-ignored), session `b4a768a2`.
All six summariser requests kept a start, then a marker, then the child's most recent part ending in its final answer.
The start was the payload's head, as described above, not the task. Each transcript was exactly 12,000 characters,
with between 13,219 and 57,547 characters omitted. Each request carried the `Facts:` block. The reconciling child
`wave2-d` (`bg_d2b9ae67`, 53 calls) is the one the earlier run's `d` denied. Its request (traffic #114) left 57,547
characters out, and its facts read `Edited files: docs/overview.md, docs/api.md`. None of the six stored reports
contradicts its own `edited_files`, where the earlier run had five of seven. `wave2-d`'s summary begins "The agent
reconciled docs/api.md and docs/overview.md … and editing both docs".

Live again, 2026-09-29, built from the repair of the start: `pnpm live-run --confirm --only=duress`, pack
`.live-run/runs/2026-09-29T08-18-41-076Z` (this branch's worktree; git-ignored), session `059ae1d7`, 2,093 s, six
children. All six summarising requests (traffic #34, #46, #49, #88, #121, #177) start with the child's task, whole and
uncut: `user: … [N characters omitted] … <the task>`, where N is 313 to 1,653 characters of payload blocks ahead of it.
Each start is 138 to 320 characters. Each transcript is 11,999 or 12,000 characters, with 9,541 to 112,198 omitted
before the most recent part. Each request carries its facts. None of the six summaries denies the files its facts list.
The reconciling child's request (#121) omitted 57,739 characters, and its summary begins "The agent reconciled
docs/api.md and docs/overview.md". This run's tasks were shorter than the earlier run's, so no start was cut to
2,000 (OQ-118).
