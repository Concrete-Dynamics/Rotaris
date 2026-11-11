## An unavailable provider's Authenticate is enabled

Found on 2026-11-11 while redrawing the provider rows for
[`PD-CONFIG-009`](../product/directives/pd-config-009.md#pd-config-009); not repaired there, since that change is about
how a row's controls are drawn and not about when they are enabled.

The row of a provider that is not available (`available: false`; in this build the managed-cloud provider, whose
status word reads "Coming soon") draws its Authenticate enabled. `Row` in `packages/ui/src/settings/Providers.tsx`
disables the control only while an operation of that row is in flight (`disabled={busy !== null}`) and never reads
`row.available`. Measured on the built application at `ab29f51b` and after the change (`pnpm app:drive`, 1400×900 and
1000×680): the `concrete-cloud` row's Authenticate has `disabled === false`. What the press then does was not driven.

## Specs

REQ-CONFIG-371: "**Authenticate**/**Re-authenticate** is enabled when the provider has an authentication flow and is
actionable", where *actionable* "means the provider is available and not busy". The same requirement gives the tooltip
an unavailable provider's control shows: "the provider's own detail while the provider is unavailable". Neither is built
for the row's Authenticate.

## Relevant files

- `packages/ui/src/settings/Providers.tsx` — `Row`, the Authenticate control.
- `packages/contracts/src/providers.ts` — `ProviderRowSchema`'s `available`.
