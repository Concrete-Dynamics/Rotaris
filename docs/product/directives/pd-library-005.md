[Product directives](../directives.md) › PD-LIBRARY-005

<a id="pd-library-005"></a>

### PD-LIBRARY-005 — an improvement pass whose collector failed reads as the failure it is

**The case, stated exhaustively.** An improvement analysis job of either pass — the post-run analyst (REQ-LIBRARY-015) or the
retrospective ([`PD-LIBRARY-002`](pd-library-002.md#pd-library-002)) — ends with an empty artifact stored, and that artifact's `notes`:

1. begin "collector crashed: " (REQ-LIBRARY-023, a crash other than the timeout) or "collector parse failed: "
   (REQ-LIBRARY-022, the retry failed too). The pass SHALL then post its own failure warning in place of the zero-proposal info
   notice, with no action: "The completed run could not be reviewed for improvements" for the post-run pass, "The retrospective
   could not be completed" for the retrospective. Its detail SHALL read, for the post-run pass,
   "Session <sid> was not reviewed for improvements: <reason>. <artifact id> holds no proposals." and, for the retrospective,
   "This workspace's own history was not reviewed: <reason>. <artifact id> holds no proposals.", where <reason> is "the analysis
   call failed (<exc>)" for a crash and "the model's answer could not be read (<err>)" for a parse failure, <exc> and <err>
   being the text the stored notes carry after their prefix;
2. begin "collector timed out after <t> seconds" (REQ-LIBRARY-023). The pass SHALL post its zero-proposal info notice, with no
   action, as before. The post-run pass's detail is `PD-CONFIG-003` revision 2's, unchanged. A timed-out retrospective's detail
   SHALL read "The retrospective reached its <t>-second limit before it proposed anything." and SHALL name no control: its bound,
   `retrospective_timeout`, has none (`PD-LIBRARY-002`).

In both cases the artifact is stored and the proposal list re-read exactly as for any artifact (REQ-LIBRARY-124's first
sentence, REQ-LIBRARY-035(e)). Every other empty artifact — notes absent, or REQ-LIBRARY-046's duplicate-suppression note — keeps
its pass's zero-proposal info notice and its detail. A job that ended without an artifact keeps REQ-LIBRARY-124's warning
(`PD-LIBRARY-002` (c)'s for a retrospective), with the reason the job carried.

**Disjoint from the other narrowing of REQ-LIBRARY-124.** `PD-LIBRARY-002` revision 2 (c) decides **the retrospective's three
notices** — the titles a retrospective's proposals, its zero-proposal result and its failure carry. This directive decides
**which notice an empty artifact of a failed collector posts**, for both passes, and the timed-out retrospective's detail; its
revision 4 adds to (c) the one sentence that hands those cases here. Neither restates the other.

**Why, and what it costs.** REQ-LIBRARY-023 stores an empty artifact for a crashed collector, and REQ-LIBRARY-124 reads every
artifact with zero proposals as "a result with zero proposals", its warning reserved for "a job that ended without producing an
artifact". So a pass that never reached the model — the retrospective's 401 in the live run at `ce5f952`, the analyst's answer
twice unreadable — was told to the person as one that looked and found nothing ("The retrospective found nothing to propose",
"Nothing was proposed in impart_dL3YK5Xd."), which REQ-NOTIFY-100's truthfulness and REQ-NOTIFY-254 ("No failure is reported by
silence") read against ([OQ-285](../../architecture/open-questions/60-spikes-and-later-questions-27.md#oq-285);
[`a-crashed-improvement-collector-reads-as-an-analysis-that-found-nothing`](../../defects/fixed/a-crashed-improvement-collector-reads-as-an-analysis-that-found-nothing.md)).
The warning tells the person the review did not happen and why, the same notice a job with no artifact already earns; naming
the artifact says where the notes are kept. A timeout is different in kind: the pass ran and was cut at a bound the person can
read, so it keeps the info notice, with `PD-CONFIG-003` revision 2's precedent (OQ-223) extended to the retrospective without a
control, since none exists. What it costs: a stored artifact now reports as a failure, so the Library holds an artifact the
notice called a failed review; the post-run warning's title is REQ-LIBRARY-124's failure wording on a result the requirement
counts as a success; and the product departs from an implementation built from the specification alone, which posts the info
notice for every empty artifact. REQ-LIBRARY-022, REQ-LIBRARY-023, REQ-LIBRARY-024, REQ-LIBRARY-035, REQ-NOTIFY-100,
REQ-NOTIFY-254, `PD-CONFIG-003` revision 2 and OQ-223 are cited and not changed.

> **Narrows:** REQ-LIBRARY-124

*Ruled under the owner's delegation, 2026-10-14 ([OQ-285](../../architecture/open-questions/60-spikes-and-later-questions-27.md#oq-285); dated 2026-10-13 until fin46
corrected it from the consortium's ruling record); logged as
[R-072](../requests.md#r-072). Narrows REQ-LIBRARY-124 for both passes. Comes with `PD-LIBRARY-002` revision 4, ruled with it, which
names this directive in its clause (c). `PD-CONFIG-003` revision 2 is unchanged. The build's reading, kept as the falsified one:
an empty artifact whose collector crashed or could not be parsed posts the zero-proposal info notice and "Nothing was proposed in
<id>.".*

> **First execution, 2026-10-14, built under [R-072](../requests.md#r-072) (fin44, `fin44-improvement-failures`), with
> `PD-LIBRARY-002` revision 4:** the rule held as written. `@rotaris/contracts` exports `COLLECTOR_CRASHED_PREFIX`,
> `COLLECTOR_PARSE_FAILED_PREFIX` and `COLLECTOR_TIMED_OUT_PREFIX`, and `analyzeImprovement`
> (`packages/engine/src/improvements/analyst.ts`) writes its three notes with them. `emptyArtifactNotice`
> (`apps/desktop/src/main/improvement-notice.ts`) replaces `zeroProposalDetail`: it returns the level, title and detail for every
> empty artifact. The coordinator's `stored` in `apps/desktop/src/main/index.ts` raises that notice with no action and, for a
> failed collector, writes a warning line to the application log. `failed` shares `passFailureTitle` and `passFailureDetail`.
> **What was measured.** `improvement-notice.test.ts` covers crash, parse failure, timeout and a clean empty result for each
> pass (red before the change: the old module gave "Nothing was proposed in <id>." for all but the post-run timeout).
> `analyst.test.ts` pins the prefixes the notes begin with, and `scripted-client.test.ts` pins the proof's new `crash` (an HTTP
> 401) and `garbage` (no JSON, twice) analyst scripts. In the built app, `pnpm retrospective-proof` read 61 of 61 in each of two
> runs, at a load average of 1.0 to 2.1 on four CPUs. Its launch 9 stored "collector crashed: Unauthorized" and showed the
> warning "The retrospective could not be completed", with "This workspace's own history was not reviewed: the analysis call
> failed (Unauthorized). impart_… holds no proposals.", no action and a `warning` log line. The parse-failure launch did the same
> with "the model's answer could not be read (collector output is invalid JSON: …)". Launch 5 read "The retrospective reached its
> 5-second limit before it proposed anything." On a build with the old `index.ts` and `improvement-notice.ts` the same proof read
> 56 of 61: both launches showed "The retrospective found nothing to propose" at `info` with "Nothing was proposed in <id>.", and
> no log line was written. **Found:** nothing beyond the defect the ruling repaired. **What was not measured.** The post-run
> pass's warning in the built app (no proof drives a run whose analyst fails; the unit cases carry it), and a live run: the
> orchestrator's `ask-retrospective` with the analyst's key withheld. Repairs
> [`a-crashed-improvement-collector-reads-as-an-analysis-that-found-nothing`](../../defects/fixed/a-crashed-improvement-collector-reads-as-an-analysis-that-found-nothing.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
