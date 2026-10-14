## A packaged build answers a `provider: scripted` entry with the scripted client

A shipped build still carries the scripted model client and answers any `models:` entry naming the `scripted` provider with
it. `apps/desktop/src/run-host/configuration.ts` tests the provider bare (`=== SCRIPTED_PROVIDER`) in `modelRefOf` (line 158,
a reference with no endpoint), in both empty-key branches of `credentialFactory` (lines 189 and 195, an empty credential) and
in `prepareRun`'s `isScripted` (line 640, which hands the run `deps.scriptedClient()` and no credential), with no build-time
flag; `host.ts` builds the client in every build, and `scripted-client.ts` keeps a packaged branch whose orchestrator takes
`PACKAGED_SCRIPT` (line 82: one `git status` terminal call, then a fixed reply). So a person's own `agents.yaml` naming
`provider: scripted` gets, in a shipped build, a model that asks for no credential and runs a terminal command it did not
choose, where every other provider the build knows no endpoint for is refused.

The consortium ruled [OQ-312](../architecture/open-questions.md#oq-312) on 2026-10-14 under R-072, with no directive: a packaged
build answers no `provider: scripted` entry; the client is compiled out with the other verification seams; a `scripted` entry
with no `base_url` gets the no-endpoint refusal; ADR-0056 rule 4 (b) is re-based on a loopback OpenAI-compatible stub that
`scripts/package.mjs` starts itself. Found unbuilt on origin/main `7533685` by the final acceptance round (finding B2);
recorded 2026-10-14 by fin46 (`fin46-accept1-11`) before its repair.

## Specs

REQ-CONFIG-082 and REQ-CONFIG-478 (a run's model is the configured model), ADR-0029/0030 (authenticated as configured),
REQ-EVENTS-021 and REQ-EVENTS-019 ("No usable model is configured for the entry role" for a provider the build knows no
endpoint for). The specification names no `scripted` provider. ADR-0056 (the packaged build carries no verification seam).
[OQ-312](../architecture/open-questions.md#oq-312) as ruled.

## Relevant files

- `apps/desktop/src/run-host/configuration.ts` — `modelRefOf`, `credentialFactory`, `prepareRun`'s `isScripted`.
- `apps/desktop/src/run-host/host.ts` — the `scriptedClient` dependency built in every build.
- `apps/desktop/src/run-host/scripted-client.ts` — `PACKAGED_SCRIPT` and its packaged branch.
- `apps/desktop/scripts/package.mjs` — rule 4 (b)'s launch, which reaches the client through `provider: scripted`.
- `apps/desktop/scripts/lib/seam-check.mjs` — the forbidden list, which names nothing of the client itself.
