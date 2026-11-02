## slice-proof names the model slots as native selects

`apps/desktop/scripts/slice-proof.mjs`, scenario 2 (the three tier slots set to the proof's model and saved), drove
`select[aria-label="Model for small_model"]` and its two siblings. The Models page draws each slot's model control as
the design system's `SearchableSelect` (`packages/ui/src/settings/ConfigSettings.tsx`, `DesignSearchableSelect` with
`ariaLabel="Model for <slot>"`): a button and a listbox, no `<select>` element. The capture seam therefore logged
`capture: select select[aria-label="Model for small_model"] = … → no such control` for all three, no edit was made, the
save bar never appeared (`capture: no "Save" control on screen`), and the proof failed at its next assertion,
"the slot small_model was not saved", on an `agents.yaml` whose slots were still `null`. `config-proof` had met the same
change and was repaired when the seam learned the `SearchableSelect` (`apps/desktop/src/main/capture/seams.ts`,
`ROTARIS_CAPTURE_SELECT`'s comment); `slice-proof` was not run at the time and kept the native-select selector.

Found by the first run of `slice-proof` against the registered self-hosted endpoint (R-068), 2026-10-02.

## Specs

- None contradicted by the product: the slot editor is REQ-CONFIG's, and the product draws and saves it correctly when
  driven (`config-proof`). The proof named a control the product no longer draws.

## Relevant files

- `apps/desktop/scripts/slice-proof.mjs` — scenario 2's `ROTARIS_CAPTURE_SELECT`.
- `packages/ui/src/settings/ConfigSettings.tsx` — the slot's `DesignSearchableSelect`.
- `apps/desktop/src/main/capture/seams.ts` — `ROTARIS_CAPTURE_SELECT`, which drives a native select and a
  `SearchableSelect` alike when the selector names the control by its label.

## Outcome — repaired 2026-10-02 (branch `fin6-slice-proof-endpoint`)

Confirmed by the run that found it: `.proof/slice-proof/slots.log` of the first run carried the three `no such control`
lines and the proof stopped at "the slot small_model was not saved".

- Scenario 2 names each slot by its label alone (`[aria-label="Model for <slot>"]`), which the seam drives as the
  `SearchableSelect` it is, and the scenario now fails at once, naming the step, when any select step logs
  `no such control` or `no such option`, rather than at an assertion on the file afterwards.
- Pinned in `apps/desktop/scripts/lib/endpoint-registry.test.ts` ("slice-proof drives the controls the product draws"),
  which fails on the unrepaired script; shown end to end by the resumed run recorded in
  [`first-executions.md`](../../architecture/first-executions.md) (2026-10-02, slice-proof against a self-hosted endpoint).
