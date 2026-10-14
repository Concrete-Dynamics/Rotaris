## A packaged build answers a `provider: scripted` entry with the scripted client

A shipped build still carries the scripted model client and answers any `models:` entry naming the `scripted` provider with
it. `apps/desktop/src/run-host/configuration.ts` tests the provider bare (`=== SCRIPTED_PROVIDER`) in `modelRefOf` (line 158,
a reference with no endpoint), in both empty-key branches of `credentialFactory` (lines 189 and 195, an empty credential) and
in `prepareRun`'s `isScripted` (line 640, which hands the run `deps.scriptedClient()` and no credential), with no build-time
flag; `host.ts` builds the client in every build, and `scripted-client.ts` keeps a packaged branch whose orchestrator takes
`PACKAGED_SCRIPT` (line 82: one `git status` terminal call, then a fixed reply). So a person's own `agents.yaml` naming
`provider: scripted` gets, in a shipped build, a model that asks for no credential and runs a terminal command it did not
choose, where every other provider the build knows no endpoint for is refused.

The consortium ruled [OQ-312](../../architecture/open-questions.md#oq-312) on 2026-10-14 under R-072, with no directive: a packaged
build answers no `provider: scripted` entry; the client is compiled out with the other verification seams; a `scripted` entry
with no `base_url` gets the no-endpoint refusal; ADR-0056 rule 4 (b) is re-based on a loopback OpenAI-compatible stub that
`scripts/package.mjs` starts itself. Found unbuilt on origin/main `7533685` by the final acceptance round (finding B2);
recorded 2026-10-14 by fin46 (`fin46-accept1-11`) before its repair.

## Specs

REQ-CONFIG-082 and REQ-CONFIG-478 (a run's model is the configured model), ADR-0029/0030 (authenticated as configured),
REQ-EVENTS-021 and REQ-EVENTS-019 ("No usable model is configured for the entry role" for a provider the build knows no
endpoint for). The specification names no `scripted` provider. ADR-0056 (the packaged build carries no verification seam).
[OQ-312](../../architecture/open-questions.md#oq-312) as ruled.

## Relevant files

- `apps/desktop/src/run-host/configuration.ts` — `modelRefOf`, `credentialFactory`, `prepareRun`'s `isScripted`.
- `apps/desktop/src/run-host/host.ts` — the `scriptedClient` dependency built in every build.
- `apps/desktop/src/run-host/scripted-client.ts` — `PACKAGED_SCRIPT` and its packaged branch.
- `apps/desktop/scripts/package.mjs` — rule 4 (b)'s launch, which reaches the client through `provider: scripted`.
- `apps/desktop/scripts/lib/seam-check.mjs` — the forbidden list, which names nothing of the client itself.

## Outcome — repaired 2026-10-14 (fin46, `fin46-accept1-11`)

**What changed**, as OQ-312's ruling set it out:

- `apps/desktop/src/run-host/configuration.ts` — `isScriptedProvider(p)` is `__ROTARIS_SEAMS__ && p === 'scripted'`, and replaces
  every bare test: `modelRefOf`, both empty-key branches of `credentialFactory`, `prepareRun`'s `isScripted`. With the flag false a
  `scripted` entry with no `base_url` gets no reference and so the existing no-endpoint refusal; with a `base_url` it is an
  OpenAI-compatible provider name, authenticated as configured.
- `apps/desktop/src/run-host/host.ts` — the scripted client is built only behind the flag; off it the dependency is a function that
  throws, which nothing reaches. Rollup then leaves `scripted-client.ts` out of the packaged `run-host.js`.
- `apps/desktop/src/run-host/scripted-client.ts` — `PACKAGED_SCRIPT` and its packaged branch removed; the header says the client
  does not ship.
- `apps/desktop/scripts/lib/stub-model-endpoint.mjs` (new) — a loopback OpenAI-compatible chat-completions server: a structured
  rung gets a fixed valid classification, a tools request offering `terminal` whose last message is not a tool result gets one
  streamed `git status` call, anything else a short reply; it counts what it served.
- `apps/desktop/scripts/package.mjs` — rule 4 (b)'s launch starts the stub, writes `provider: openai` at its `base_url` with a
  placeholder key (same tiers, mode and strategy), keeps the store assertions and adds one: the stub served a tools request and
  sent its terminal call; the stub is closed in a `finally`.
- `apps/desktop/scripts/lib/seam-check.mjs` — `FORBIDDEN` names `scripted model call:`, the client's own log line.

**Pinned** by `apps/desktop/src/run-host/configuration.test.ts`'s OQ-312 block (the flag stubbed false: the no-endpoint refusal
with the client never asked for; a `base_url` entry authenticated with its key; a `scripted` slot or child under a real entry with
no reference and no empty-key credential — three red before) and the control case with the seams in; `launch.test.ts` (refused
`session.no-model` before any lease, no session started — red before); `apps/desktop/scripts/lib/seam-check.test.ts` (the check
refuses a run host carrying the client's log line; `package.mjs`'s launch names no `provider: scripted` and asserts the stub's
counts — both red before); `apps/desktop/scripts/lib/stub-model-endpoint.test.ts` (the stub read through `AiSdkModelClient`).

**Shown** on Linux (2026-10-14, load 3 to 5): `ROTARIS_BUILD=package pnpm exec electron-vite build` in `apps/desktop`, then
`grep -c "scripted model call:" out/main/run-host.js` (0) and `node scripts/lib/seam-check.mjs out/main` (PASS); the same build of
the unrepaired source carries the line once and the check reads FAIL (`scripted model call: (run-host.js)`). Rule 4 (b)'s launch
shape against the repaired `out/main/index.js` under `xvfb-run`: one session `completed`, one `terminal` call `ok`, the window
photographed, the stub serving five requests (three classifications, two tools requests, one terminal call), no scripted model
call logged. The old `provider: scripted` configuration against the same build: no session, and "No usable model is configured for
the entry role, so the run was refused before it started: model 'scripted' (provider scripted) has no base_url and this build knows
no endpoint for that provider." **Not run:** `pnpm package` itself, owed to the next Windows package (a Windows x64 host, deferred
with the release pipeline under R-071; IC-3 binds Linux and macOS artifacts).
