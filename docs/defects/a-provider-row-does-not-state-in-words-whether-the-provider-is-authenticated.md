## A provider row does not state in words whether the provider is authenticated

Found on 2026-11-11 by the two critiques of the providers card (UIR-406,
[the Settings brief](../design/briefs/settings.md), "Critique 2026-11-11, of the providers card"); not repaired, since
which words the row takes, and where, is a row's anatomy and wants its own pass.

A row of Settings › Models shows a stored credential only indirectly: its action reads "Re-authenticate" where it would
read "Authenticate", "Sign out" is enabled, and a masked key stands under the row where a key is stored. The status
word and the indicator beside the name are drawn from the provider's health (`stateWord` in
`packages/ui/src/settings/Providers.tsx`), not from its credential: measured on the built application with no health
check run (`pnpm app:drive`, 1400×900 and 1000×680), all six rows read "Not checked" under a grey indicator, and a row
with a stored credential would read the same (read in the source; the scratch profile holds no credential). Until
[`PD-CONFIG-009`](../product/directives/pd-config-009.md#pd-config-009) the unauthenticated row's action was also drawn
filled, which marked the missing credential by a fill alone; that mark is gone, and the directive counts it as a cost.

## Specs

REQ-PROVIDER-140: "Each row shows: the display name and the id; the sign-in method label …; whether the provider is
authenticated; the masked form of the stored key … when a key is stored and nothing at all when none is; … and the
provider health status of REQ-PROVIDER-118". Whether the provider is authenticated and its health are two items of
that list, and the row draws one word for both.

## Relevant files

- `packages/ui/src/settings/Providers.tsx` — `Row`, `stateWord`.
- `packages/contracts/src/providers.ts` — `ProviderRowSchema`'s `authenticated` and `status`.
