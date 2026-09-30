## A review decision taken through the launch disclosure leaves the pane saying nothing was recorded

Re-run and send-back start a run (`moveStartsRun`), so when the launch disclosure is due, the review pane's decision
comes back from the host as a refusal: `DISCLOSURE_PENDING` ("Nothing has been recorded for REQ-… yet: … The
disclosure is on screen …"). The pane draws it as an error alert and keeps offering the six decisions. Accepting the
disclosure then takes the decision (`acceptLaunch` → `perform`), but the pane is never told. It keeps the alert saying
nothing was recorded, offers the decisions again on a payload the decision has made out of date, and shows no notice
offering the reload.

Found by reading the code while repairing live-run finding L12
([`fixed/the-review-pane-shows-a-refusal-after-a-successful-accept.md`](fixed/the-review-pane-shows-a-refusal-after-a-successful-accept.md)). It has not been observed in the built app:
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
