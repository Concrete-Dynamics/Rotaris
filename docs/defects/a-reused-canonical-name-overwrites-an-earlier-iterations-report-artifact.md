## A reused canonical name overwrites an earlier iteration's report artifact

`materialiseChildReport` finds the artifact to update by the child's task id and, failing that, by its canonical
name. A child of a later iteration whose task reuses an earlier child's canonical name (a second `build`, say) finds
the earlier child's report artifact by name and re-materialises it in place: the earlier report's summary, findings
and status are replaced by the later child's, while the record keeps the earlier child's `source_task_id` and its
creation time. The earlier report survives only in `children.report`; the artifact now names a task that did not
write it, and it does not move to the top of the session's listing. Noticed by phase 6's review of `PD-ORCH-005`
(2026-09-27), reproduced by the reviewer with a probe; not repaired.

## Specs

`REQ-LIBRARY-092` (every terminal child report is materialised as an artifact, and a re-materialisation of the same
report updates in place): the fallback to the canonical name treats two children's reports as one. It also meets
`REQ-SESSION-115`'s "latest orchestrator artifact" as read in OQ-72, which cannot see the later report as the latest.

## Relevant files

- `packages/engine/src/artifacts/store.ts` — `materialiseChildReport`, the lookup by task id then canonical name.
- `packages/store/src/dal.ts` — `artifactByCanonical` and `rematerialiseArtifact`, which leaves `source_task_id` and
  `created_at` as they were.
- `packages/engine/src/sessions.ts` — `latestArtifactText`, which reads the listing's order.
