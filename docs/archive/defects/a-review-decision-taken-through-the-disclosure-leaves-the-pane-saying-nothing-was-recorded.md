## A review decision taken through the launch disclosure leaves the pane saying nothing was recorded

Re-run and send-back start a run (`moveStartsRun`), so when the launch disclosure is due, the review pane's decision
comes back from the host as a refusal: `DISCLOSURE_PENDING` ("Nothing has been recorded for REQ-… yet: … The
disclosure is on screen …"). The pane draws it as an error alert and keeps offering the six decisions. Accepting the
disclosure then takes the decision (`acceptLaunch` → `perform`), but the pane is never told. It keeps the alert saying
nothing was recorded, offers the decisions again on a payload the decision has made out of date, and shows no notice
offering the reload.

Found by reading the code while repairing live-run finding L12
([`the-review-pane-shows-a-refusal-after-a-successful-accept.md`](the-review-pane-shows-a-refusal-after-a-successful-accept.md)). It has not been observed in the built app:
`requirements-proof` takes only an accept from the review pane, and an accept starts no run.

## Specs

- `REQ-TRACE-426`: after a decision, the notice offers exactly one action, the reload. Any decision makes the payload
  it was taken against out of date. A decision taken through the disclosure shows no notice, and the pane still offers
  the decisions.
- `REQ-TRACE-472`: accepting the disclosure takes the decision. After that, the pane's standing "Nothing has been
  recorded" is false.

## Relevant files

- `packages/ui/src/requirements/RequirementsView.tsx`: `perform` returns `DISCLOSURE_PENDING` as `{ ok: false }` when
  the disclosure is due, and `acceptLaunch` performs the decision without telling the pane.
- `packages/ui/src/requirements/panes/ReviewPane.tsx`: `decide` draws any `ok: false` as the error alert
  (`req-pane-review-refused`), and sets the decided notice only on `ok: true`.
- `packages/ui/src/requirements/panes-host.ts`: `disclosurePending`, the sentence.

## Outcome

**Repaired 2026-09-29 under R-067** (acceptance round 1, finding A34; built 2026-10-01).

**Confirmed first, in the built app.** `requirements-proof` gained a `review-rerun` stage: a release accepted with
"Start the run", the run carried to review, the review pane opened and its Rerun taken. The disclosure is due again,
because only "Start, and do not show this again" suppresses it for later launches (REQ-TRACE-472). Against the
unrepaired build (origin/main `eeb0b3f`), the pane read the same at 36.8 s, with the disclosure on screen, and at
39.4 s, after "Start the run" had taken the re-run. Both reads had no notice, the error alert "Nothing has been
recorded for REQ-101 yet: …", and all six decisions enabled.

**What changed.** The host's answer now carries the outcome still to come. `heldLaunch` (`panes-host.ts`) answers the
asking surface with `DISCLOSURE_PENDING` as before, plus `afterDisclosure`, a promise of what the disclosure came to.
`RequirementsView` keeps the held launch beside the launch on screen. `acceptLaunch` settles it with the act's own
result; `abandonLaunch` settles it with `LAUNCH_ABANDONED`. A launch replaced by another is settled as abandoned, and a
held launch settles once. The review pane follows the decision there (`followDecision`, `presentation.ts`). While the
disclosure stands it says that nothing has been recorded yet, as a status (`req-pane-review-waiting`) and not as a
refusal, with the decisions disabled. Once the disclosure is accepted, the pane shows REQ-TRACE-426's notice ("Rerun
recorded for REQ-101. The review you were reading is out of date.") with the reload as its one action, and withdraws
the decisions. When the disclosure is abandoned, the pane quotes the abandonment and offers the decisions again,
because nothing changed. The type `PerformResult` is now `DecisionResult`. Every other caller of the write path reads
it as before.

**Pinned by** the case "a review decision held behind the launch disclosure (REQ-TRACE-426/472)" in
`packages/ui/src/requirements/requirements.test.ts` (five tests: accept, abandon, a refusal after acceptance, settle
once, no disclosure). These hold the pure halves only, because the repository runs vitest without a DOM. The
behaviour is pinned by `requirements-proof`'s `review-rerun` stage against the built app. After the repair it
passed: the pane read the waiting sentence and no alert while the disclosure stood. After the accept it read the notice,
the actions exactly `["Reload the review"]`, no alert, and no decisions. The store's history held one `rerun`
(`release, run-started, run-ended, rerun, run-started, run-ended`). The whole proof passed (131 tests, every stage).
No live-run scenario takes a run-starting review decision (`requirements` takes an accept only), so none was run for
this repair.

Noticed while repairing it: the blockers pane's resume has the same shape and was not changed. See
[`a-blocker-resumed-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md`](a-blocker-resumed-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md).
