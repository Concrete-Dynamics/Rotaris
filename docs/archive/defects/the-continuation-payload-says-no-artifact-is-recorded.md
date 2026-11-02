## The continuation payload says no artifact is recorded

`buildContinuationPayload` writes the fixed line `Artifacts: (no orchestrator artifact is recorded in this build)`
into every continued run's handoff, although the session's artifact store holds the child reports and the sibling
artifacts it has published. The next run's root is told there is nothing to read.

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

`REQ-SESSION-115`: the continuation handoff carries the artifact, the todo and the progress. The artifact part is a
placeholder that asserts the opposite of the store's contents.

## Relevant files

- `packages/engine/src/sessions.ts` — `buildContinuationPayload`.

## Repaired — 2026-09-27

By `PD-ORCH-005`'s phase 6, beside PD-ORCH-004 revision 3. `buildContinuationPayload` now states REQ-SESSION-115's
artifact from the session's own store (`latestArtifactText`): the latest artifact nothing has superseded, with its
title, kind, status and id, its summary and its key findings, cut to the requirement's 6,000 characters. A session with
none says so ("Artifact: (none recorded in this session)"). Which artifact "the latest orchestrator artifact" means is
read in OQ-99.

Evidence: `session-resume.test.ts`, "REQ-SESSION-115's artifact is the latest one the session holds…". It covers the
empty store, the latest record, a superseded record never chosen, and the 6,000-character budget.
