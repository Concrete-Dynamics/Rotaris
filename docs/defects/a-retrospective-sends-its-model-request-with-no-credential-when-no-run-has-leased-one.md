## A retrospective sends its model request with no credential when no run has leased one

The Library's retrospective (`PD-LIBRARY-002`) sent its one `/chat/completions` request with no `Authorization` header and got
`401 {"error":"Unauthorized"}` when no run had started in the launch (the live scenario run at `ce5f952`, `ask-retrospective`,
finding F2; the artifact's notes read "collector crashed: Unauthorized…"). The run host's `retrospective.capture` resolved the
workspace's setup with `configuredFor` **before** it leased the bearers (`leaseForWorkspace`), and `improvement.analyze` reused
that cached setup. A `ConfiguredRun` completes over the bearer map it is handed (`PreparedRun.complete(bearers)`), and the lease
publishes a **new** map under the workspace root, so the cached setup kept reading the empty one it was built with. A run never
meets this: `launchSession` leases first and completes the setup over the bearers it leased. Noticed 2026-10-14 by the
orchestrator's reading of the `ce5f952` pack; recorded and repaired by fin43 (`fin43-live-findings`).

## Specs

ADR-0030 and REQ-PROVIDER-066: a model call is authenticated with the bearer main leases for its provider. `PD-LIBRARY-002`
(ADR-0065 decision 5): the retrospective resolves its model and credential by the run-free paths the run host owns. The
retrospective must authenticate exactly as a run does.

## Relevant files

- `apps/desktop/src/run-host/dispatch.ts` — `retrospective.capture` and `improvement.analyze` for a retrospective.
- `apps/desktop/src/run-host/host.ts` — `configuredFor` (cached by workspace root), `leaseForWorkspace`, `leased`.
- `apps/desktop/src/run-host/configuration.ts` — `prepareRun` / `PreparedRun.complete(bearers)`, `credentialFactory`.
- `apps/desktop/src/run-host/launch.ts` — `launchSession`'s lease-then-complete order, `leaseForContinuation`.
