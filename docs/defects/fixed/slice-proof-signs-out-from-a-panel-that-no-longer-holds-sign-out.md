## slice-proof signs out from a panel that no longer holds Sign out

`apps/desktop/scripts/slice-proof.mjs`, scenario 5 (sign-out from the providers card), clicked the provider row's
link button to open its settings panel and then `[data-provider-settings="<id>"] .btn-secondary>>Sign out`. Since the
Models overhaul of R-016 (2026-09-18), the row itself carries the sign-out action (REQ-CONFIG-371's "Log out", drawn as
**Sign out** in the row's action group, `packages/ui/src/settings/Providers.tsx`) and asks first through a confirmation
dialog whose confirm button is also **Sign out**; the settings panel holds Save, Validate, Check health and, for a
user-defined instance, Delete. The capture seam therefore logged `capture: no "Sign out" control on screen`, nothing was
signed out, and the proof failed at "the sign-out was not logged" with the credential file still in place.

Found by the first run of `slice-proof` against the registered self-hosted endpoint (R-068), 2026-10-02.

## Specs

- None contradicted by the product as the proof meets it: REQ-CONFIG-371 places the action in the row, and
  REQ-PROVIDER-143's sign-out applies REQ-PROVIDER-102 and reports the outcome, which the product logs
  (`providers: Signed out of <label>.`). The proof drove a control the product no longer draws.

## Relevant files

- `apps/desktop/scripts/slice-proof.mjs` — scenario 5's `ROTARIS_CAPTURE_CLICKS`.
- `packages/ui/src/settings/Providers.tsx` — the row's Sign out and its `ConfirmDialog`.

## Outcome — repaired 2026-10-02 (branch `fin6-slice-proof-endpoint`)

Confirmed by the run that found it: `.proof/slice-proof/sign-out.log` carried `capture: clicked "[data-provider=…] .btn-link"`
then `capture: no "Sign out" control on screen`.

- Scenario 5 presses the row's own **Sign out** (`[data-provider="<id>"] .provider-row__actions button>>Sign out`) and
  then the confirmation's (`[role="dialog"] .dialog-actions button>>Sign out`), and fails at once, naming the step, when
  any click logs `no "…" control on screen`.
- Pinned in `apps/desktop/scripts/lib/endpoint-registry.test.ts` ("slice-proof drives the controls the product draws");
  shown end to end by the run recorded in [`first-executions.md`](../../architecture/first-executions.md) (2026-10-02,
  slice-proof against a self-hosted endpoint).
