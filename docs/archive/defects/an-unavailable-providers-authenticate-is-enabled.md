## An unavailable provider's Authenticate is enabled

Found on 2026-11-11 while redrawing the provider rows for
[`PD-CONFIG-009`](../../product/directives/pd-config-009.md#pd-config-009); not repaired there, since that change is about
how a row's controls are drawn and not about when they are enabled.

The row of a provider that is not available (`available: false`; in this build the managed-cloud provider, whose
status word reads "Coming soon") draws its Authenticate enabled. `Row` in `packages/ui/src/settings/Providers.tsx`
disables the control only while an operation of that row is in flight (`disabled={busy !== null}`) and never reads
`row.available`. Measured on the built application at `ab29f51b` and after the change (`pnpm app:drive`, 1400×900 and
1000×680): the `concrete-cloud` row's Authenticate has `disabled === false`. What the press then does was not driven.

**Repaired 2026-11-17 ([R-102](../../product/requests.md#r-102)).** `Row` disables Authenticate while the provider is not available as well as while an operation is in flight, and the disabled control's tooltip is the provider's detail — its health detail, or its status word ("Coming soon") where it reports none. `packages/ui/src/settings/Providers.test.ts` holds both. What a press did before was never driven and can no longer be made.

## Specs

REQ-CONFIG-371: "**Authenticate**/**Re-authenticate** is enabled when the provider has an authentication flow and is
actionable", where *actionable* "means the provider is available and not busy". The same requirement gives the tooltip
an unavailable provider's control shows: "the provider's own detail while the provider is unavailable". Neither is built
for the row's Authenticate.

## Relevant files

- `packages/ui/src/settings/Providers.tsx` — `Row`, the Authenticate control.
- `packages/contracts/src/providers.ts` — `ProviderRowSchema`'s `available`.
