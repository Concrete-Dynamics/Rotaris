## A crashed improvement collector reads as an analysis that found nothing

A retrospective whose collector crashed — in the live scenario run at `ce5f952`, on the 401 of
[`fixed/a-retrospective-sends-its-model-request-with-no-credential-when-no-run-has-leased-one.md`](a-retrospective-sends-its-model-request-with-no-credential-when-no-run-has-leased-one.md)
(finding F3) — stores REQ-LIBRARY-023's empty artifact with `notes` "collector crashed: Unauthorized…", and main reads any artifact
with zero proposals as the zero-proposal outcome: the info notice "The retrospective found nothing to propose", detail "Nothing was
proposed in impart_dL3YK5Xd.". The person is told the pass ran and found nothing when it never reached the model. The post-run pass
has the same shape ("Improvement analysis complete — no proposals"); only its timed-out case says what happened (PD-CONFIG-003
revision 2's detail). Noticed 2026-10-14 by the orchestrator's reading of the `ce5f952` pack; recorded by fin43
(`fin43-live-findings`) and raised as [OQ-285](../../architecture/open-questions/60-spikes-and-later-questions-27.md#oq-285). **Not repaired:** which notice a crashed
collector's artifact owes is not named by the specification or the directive, and is the ruling's. *(As written 2026-10-14;
repaired the same day, below.)*

**Outcome: repaired 2026-10-14 by fin44 (`fin44-improvement-failures`), under OQ-285's ruling (R-072).** The ruling minted
[`PD-LIBRARY-005`](../../product/directives/pd-library-005.md#pd-library-005), with `PD-LIBRARY-002` revision 4. `@rotaris/contracts` exports the
three note prefixes and the analyst writes its notes with them. Main's `emptyArtifactNotice`
(`apps/desktop/src/main/improvement-notice.ts`) replaces `zeroProposalDetail`. For a crashed or unparseable collector it returns the
pass's failure warning, with the reason and "<artifact id> holds no proposals.". It gives a timed-out retrospective its limit
sentence, and every other empty artifact keeps its info notice. The coordinator's `stored` raises it with no action and logs a
warning; `failed` shares the title and detail helpers. **Pinned by** `improvement-notice.test.ts`: crash, parse failure, timeout
and a clean empty result for each pass, red before the change. `analyst.test.ts` pins the prefixes, and `scripted-client.test.ts`
pins the new `crash` and `garbage` analyst scripts. **Shown by** `pnpm retrospective-proof` launch 9 (`crash`, `garbage`) and
launch 5's limit detail: 61 of 61 in each of two runs, at a load average of 1.0 to 2.1 on four CPUs. On a build with the old `index.ts` and
`improvement-notice.ts` the same proof read 56 of 61: the crash and the garbage launches showed "The retrospective found nothing
to propose" with "Nothing was proposed in <id>." at `info`, no warning line was logged, and the timed-out detail was the same
"Nothing was proposed" text. The live harness reads the warning as the notice a crashed retrospective owes
(`lib/analysis-reading.mjs`'s `passOutcome`), and its artifact check still fails on a crashed collector.

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
