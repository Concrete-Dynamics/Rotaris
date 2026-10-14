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
