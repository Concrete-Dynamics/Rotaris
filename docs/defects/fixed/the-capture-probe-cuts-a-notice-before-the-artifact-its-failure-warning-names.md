## The capture probe cuts a notice before the artifact its failure warning names

The capture's probe (`ROTARIS_CAPTURE_PROBE`, `installFinish` in `apps/desktop/src/main/capture/probe.ts`) logs each matched
element's text cut to its first 400 characters. PD-LIBRARY-005's failure warning carries the pass's reason in its detail and
ends by naming the artifact that holds no proposals ("… `<artifact id>` holds no proposals."). When the reason is a parse
failure (REQ-LIBRARY-022), the detail quotes the validator's issues as JSON, and the artifact id lands past the cut. The live
run's reading (`passOutcome` in `apps/desktop/scripts/lib/analysis-reading.mjs`) needs `<artifact id> holds no proposals` in the
probed text, so it fails a notice the product drew correctly.

Seen in the default live run at `b9e3005` (pack `2026-10-14T13-37-17-899Z`, `ask-retrospective/app.log`): the notice store's log
line 63 ends "`impart_47kGY2xb` holds no proposals.", while the probe at line 65 ends "`impart_47kGY2xb` holds no proposa". The
check "the notice on screen is the one the retrospective's outcome owes (PD-LIBRARY-002 revision 2 (c), PD-LIBRARY-005)" went red
on it (acceptance round 1 of fin46, finding L5).

## Specs

None contradicted by the product: the notice is PD-LIBRARY-005's, title and artifact id both. The harness measures a cut of the
notice rather than the notice, so its check contradicts its own reading of PD-LIBRARY-005.

## Relevant files

- `apps/desktop/src/main/capture/probe.ts` — the probe's injected script, `(el.textContent || '').trim().slice(0, 400)`.
- `apps/desktop/scripts/lib/analysis-reading.mjs` — `passOutcome`, whose failure branch looks for the artifact id at the end of
  the detail.
- `apps/desktop/scripts/live-run.mjs` — the `ask` and `ask-retrospective` scenarios, which probe `[data-testid="notice"]`.

## Outcome

Repaired 2026-10-14 by fin46 (acceptance round 1, bundle `fin46-accept1-1`). The probe's injected script now passes each
text through `PROBE_TEXT` (`apps/desktop/src/main/capture/probe.ts`). It keeps the whole text up to 2,000 characters. Past
that it keeps the first 1,600 and the last 400, with " … " between. The head still holds the 400 characters every earlier
reading took, and the end of a long text, where PD-LIBRARY-005's warning names its artifact, now survives. `passOutcome`
is unchanged and says why the tail matters.

The scripted-step probe (`seams.ts`, `ROTARIS_CAPTURE_PROBE_AT`) and `app:drive inspect` (`driver.ts`) keep their own
400-character cut. Neither read this notice, and changing them is outside this repair.

Pinned by:

- `apps/desktop/src/main/capture/probe.test.ts`, "a probe keeps the end of a long text, where a notice names its artifact".
  It runs the probe's own script over a stand-in document. With the b9e3005 warning the text is now logged whole. With a
  5,000-character text the head and the tail are both kept. Both cases were red on the code before.
- `apps/desktop/scripts/lib/analysis-reading.test.ts`, "a parse failure's long detail is read from the probe's head and
  tail". The old 400-character cut matches nothing, and both the whole text and the elided form match.

Shown live: `live-run.mjs --confirm --skip-build --only=ask` on this branch (pack `2026-10-14T17-58-59-663Z`, load about 1.6).
The `ask` scenario's post-run analysis was a parse failure again (REQ-LIBRARY-022, a NOTE). Its warning's probed text ran to
717 characters and ended "impart_w0pBH0L6 holds no proposals.", and the check "the notice on screen is the one the analysis
outcome owes" PASSED. The retrospective in that run proposed nothing, so its own failure warning was not asked. Its check
PASSED on "The retrospective found nothing to propose", and the run ended "live-run PASSED".
