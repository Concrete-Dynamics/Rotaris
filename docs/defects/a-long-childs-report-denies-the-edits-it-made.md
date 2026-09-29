## A long child's report denies the edits it made

The child-report summariser is given the transcript cut to 12,000 characters from its head. For a long child that is
the task and its first reads, and the edits come after the cut; the summary then says no write happened, directly above
the report's own deterministic "Edited Files". Parents consume the report in place of the transcript (REQ-ORCH-108),
the artifact carries it, and the sibling index hands it to every later child.

Live-run finding: D1 (live runs of 2026-09-29)

**Ruled 2026-09-29 — [OQ-111](../architecture/open-questions.md), [R-067](../product/requests.md#r-067).** Within REQ-ORCH-110's 12,000-character cap
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
