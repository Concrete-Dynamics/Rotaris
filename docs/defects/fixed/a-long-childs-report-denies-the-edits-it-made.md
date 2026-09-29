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
the first event (the task as given, itself cut to 2,000 characters) and the most recent part. The two are separated
by `… [N characters omitted] …`, where N is the count left out. The whole, marker included, is held to REQ-ORCH-110's
12,000 characters. A transcript within the cap is given whole and unmarked, as before. The request also carries a
`Facts:` block, `reportFacts`. It holds the edited files and every command with its exit code (or "no exit code"),
derived from the whole transcript by the functions that fill the report's own `edited_files` and `commands`. The ask
tells the pass that its summary must agree with the facts, and that a middle marked omitted is not evidence that
nothing happened there. Each command in the block is cut to 2,000 characters and the block to 12,000, REQ-ORCH-110's
two figures, so the pass stays bounded. The ruling gives the facts no bound of its own; this bound is the build's.
`transcriptText` keeps its head-only cut for its other reader, the compressor
([`the-compressor-reads-only-the-head-of-what-it-compresses`](../the-compressor-reads-only-the-head-of-what-it-compresses.md)).

Evidence: `packages/engine/src/children/report.test.ts`, "OQ-111: the pass reads the start and the most recent part,
beside the facts". Its five cases run over the duress transcript's shape: the task as given with its write scopes
and sibling index, 34 reads of over 3,000 characters each, then two `haet_edit` calls, `node --test`, and the final
answer. The first case reproduces the finding: the head-only cut holds the task and no edit. The second checks that
the new cut keeps the task, both edits, the check and the final answer, and that it fits the cap. It also checks the
marker's count exactly. The third checks that a short transcript is given whole. The fourth checks the facts block,
for edits, for none, and for a command with no exit code. The fifth runs the request through `produceReport`. It
carries the facts and the new transcript, and it fails when `produceReport` is given back the head-only cut.
