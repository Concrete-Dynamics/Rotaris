## A crashed improvement collector reads as an analysis that found nothing

A retrospective whose collector crashed — in the live scenario run at `ce5f952`, on the 401 of
[`fixed/a-retrospective-sends-its-model-request-with-no-credential-when-no-run-has-leased-one.md`](fixed/a-retrospective-sends-its-model-request-with-no-credential-when-no-run-has-leased-one.md)
(finding F3) — stores REQ-LIBRARY-023's empty artifact with `notes` "collector crashed: Unauthorized…", and main reads any artifact
with zero proposals as the zero-proposal outcome: the info notice "The retrospective found nothing to propose", detail "Nothing was
proposed in impart_dL3YK5Xd.". The person is told the pass ran and found nothing when it never reached the model. The post-run pass
has the same shape ("Improvement analysis complete — no proposals"); only its timed-out case says what happened (PD-CONFIG-003
revision 2's detail). Noticed 2026-10-14 by the orchestrator's reading of the `ce5f952` pack; recorded by fin43
(`fin43-live-findings`) and raised as [OQ-285](../architecture/open-questions.md#oq-285). **Not repaired:** which notice a crashed
collector's artifact owes is not named by the specification or the directive, and is the ruling's.

## Specs

REQ-LIBRARY-023: a crash yields an empty artifact with `notes` = `collector crashed: <exc>`. REQ-LIBRARY-124: "a result with zero
proposals publishes an info notice … with no action", and the failure warning is for "a job that ended without producing an
artifact". `PD-LIBRARY-002` revision 2 (c) mirrors those three cases for the retrospective ("With zero proposals … 'The
retrospective found nothing to propose'"; "A failure posts the warning 'The retrospective could not be completed' … and the
reason") and does not name an artifact whose collector crashed. REQ-NOTIFY-100's truthfulness, and the timed-out precedent
(OQ-223, `PD-CONFIG-003` revision 2), read against the letter.

## Relevant files

- `apps/desktop/src/main/index.ts` — the improvement coordinator's `stored` (the zero-proposal notice) and `failed` (the warning).
- `apps/desktop/src/main/improvement-notice.ts` — `zeroProposalDetail`, which reads only the timed-out note, and only for a post-run pass.
- `packages/engine/src/improvements/analyst.ts` — `analyzeImprovement`'s `recovery(job, 'collector crashed: …')`.
