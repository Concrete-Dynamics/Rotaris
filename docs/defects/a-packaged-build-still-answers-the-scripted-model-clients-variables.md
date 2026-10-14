## A packaged build still answers the scripted model client's variables

The scripted client (`apps/desktop/src/run-host/scripted-client.ts`) is the step-driven stand-in every proof runs against: no
provider, no key, no network. A `ROTARIS_BUILD=package` build (`pnpm exec electron-vite build` in `apps/desktop`) of
`fin44-hang-and-seams`, after the packaged probe's neighbours and the children's home seams were put behind
`__ROTARIS_SEAMS__`
([`fixed/a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md`](fixed/a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md)),
carries no `ROTARIS_CAPTURE_*` name but the probe's three, and the seam check passes over it; but
`grep -rhoE "ROTARIS_[A-Z0-9_]+" out/main` still finds, in `run-host.js`:

- `ROTARIS_MODEL_DIALECT` (`apps/desktop/src/run-host/configuration.ts`): set to `scripted`, every model of every run is
  answered by the scripted client instead of its provider, and no credential is asked for. `docs/architecture/codebase.md`
  calls it "verification only" and "the last environment stopgap"; it is read with no flag.
- the scripted client's own script variables (`scripted-client.ts`): `ROTARIS_SCRIPT` (including its `loop:<tool>:<n>` form),
  `ROTARIS_CHILD_SCRIPT`, `ROTARIS_LOOP_SCRIPT`, `ROTARIS_INTENT_SCRIPT`, `ROTARIS_COMPRESSOR_SCRIPT`,
  `ROTARIS_IMPROVEMENT_SCRIPT`, `ROTARIS_SCRIPT_QUESTIONS` and the `ROTARIS_SCRIPT_*_ARGS` family (`ARTIFACT`, `DELEGATE`, `MCP`,
  `TERMINAL`, `TOOL`), which choose the tool calls the stand-in makes — a `terminal:<key>` or `tool:<key>` step runs a real
  tool with arguments the environment supplies, through the run's own permission gate.

None of them is named by the seam check's `FORBIDDEN` list (`apps/desktop/scripts/lib/seam-check.mjs`), whose test holds only
reads written behind the flag, and none is a `ROTARIS_CAPTURE_*` name, so `seam-check.test.ts`'s off-the-flag rule does not reach
them. A `models:` entry whose provider is `scripted` selects the same client from a configuration file; whether that
configuration path is product or verification, and so whether the client itself may ship, is for the repair to establish.

Noticed 2026-10-14 by fin44's reviewer, reading the seam-free build of the capture-variable repair; recorded, not repaired:
outside that bundle's tasks. Not measured in a packaged binary (`pnpm package` produces a release artifact, which a Linux host
may not, IC-3).

## Specs

- ADR-0056's seam check and the process view's main row: the build compiles the verification seams out of a packaged build
  behind `__ROTARIS_SEAMS__` ("the driver and every scriptable capture seam leave the bundle", `docs/architecture/codebase.md`),
  and `scripts/package.mjs` refuses a build in which one survives. The scripted client and its variables are verification
  seams by the record's own words, and survive.
- REQ-CONFIG-478 and the provider rules (ADR-0029/0030): a run's model is the configured model, authenticated as configured; an
  environment variable outside the configuration replaces every model of a shipped build with a stand-in.

## Relevant files

- `apps/desktop/src/run-host/configuration.ts` — `ROTARIS_MODEL_DIALECT` read from the run host's environment, with no flag.
- `apps/desktop/src/run-host/scripted-client.ts` — the script variables, read with no flag.
- `apps/desktop/src/run-host/host.ts` — builds the scripted client the configuration hands a run.
- `apps/desktop/scripts/lib/seam-check.mjs`, `apps/desktop/scripts/lib/seam-check.test.ts` — the lists and the rule that name
  none of them.
