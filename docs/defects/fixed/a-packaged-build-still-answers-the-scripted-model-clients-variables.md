## A packaged build still answers the scripted model client's variables

The scripted client (`apps/desktop/src/run-host/scripted-client.ts`) is the step-driven stand-in every proof runs against: no
provider, no key, no network. A `ROTARIS_BUILD=package` build (`pnpm exec electron-vite build` in `apps/desktop`) of
`fin44-hang-and-seams`, after the packaged probe's neighbours and the children's home seams were put behind
`__ROTARIS_SEAMS__`
([`a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md`](a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md)),
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

## Outcome — repaired 2026-10-14 (fin45, `fin45-seams-ui-and-live`)

**What the repair established.** The scripted client ships; its variables do not. `scripts/package.mjs`'s packaged launch (ADR-0056
rule 4 (b), "the packaged app opens a store and runs a terminal call") needs a model that makes one terminal call with no
provider, key or network, and it already named the `scripted` provider in the scratch workspace's `agents.yaml` beside the two
variables. So the configuration path is what the packaged binary's own proof runs on, and the variables were redundant to it
(the dialect switch) or replaceable by a fixed script (`ROTARIS_SCRIPT=git`). Whether a person's own configuration may select
the stand-in in a shipped build is a product question no requirement answers: raised as
[OQ-312](../../architecture/open-questions.md#oq-312) (raised as OQ-311, renumbered at landing), with the build proceeding under the configuration path as it was.

**What changed**, in the shape fin42 to fin44 used — each read behind `__ROTARIS_SEAMS__` on the read's own line:

- `apps/desktop/src/run-host/configuration.ts` — the dialect switch is read once, by `scriptedDialect(env)`, behind the flag;
  `prepareRun` and `restingCatalogueOf` call it. A packaged build answers a model with the scripted client only where an entry
  names the `scripted` provider.
- `apps/desktop/src/run-host/scripted-client.ts` — every script variable (`ROTARIS_SCRIPT` and its `loop:` form,
  `_CHILD_SCRIPT`, `_INTENT_SCRIPT`, `_LOOP_SCRIPT`, `_COMPRESSOR_SCRIPT`, `_IMPROVEMENT_SCRIPT`, `_SCRIPT_QUESTIONS` and the
  `_SCRIPT_*_ARGS` family) behind the flag. Without it the orchestrator takes `PACKAGED_SCRIPT` (`git`: one `git status` terminal
  call, then a reply) and a child none; the classifier, loop classifier, compressor and analyst take their defaults. The block
  comments here and in `host.ts`, `index.ts` and `dispatch.ts` name the variables by suffix or not at all, and the tool step's log
  line no longer spells its variable: a block comment and a string literal survive into the bundle.
- `apps/desktop/scripts/package.mjs` — the packaged launch sets neither `ROTARIS_MODEL_DIALECT` nor `ROTARIS_SCRIPT`.
- `apps/desktop/scripts/lib/seam-check.mjs` — `FORBIDDEN` names `ROTARIS_MODEL_DIALECT`, `ROTARIS_SCRIPT` (which covers the
  `_SCRIPT_*` family), `_CHILD_SCRIPT`, `_LOOP_SCRIPT`, `_INTENT_SCRIPT`, `_COMPRESSOR_SCRIPT` and `_IMPROVEMENT_SCRIPT`.

**Pinned** by `apps/desktop/scripts/lib/seam-check.test.ts`, "a packaged build answers none of the scripted model client's
variables": every `ROTARIS_*` read — through `process.env` or an `env` handed in — off the flag in a module a packaged build keeps
is a product variable (ADR-0059's switch, the log level, the configuration directory, the preference root, the hooks settings
path, the search key, the portable artifact) or one of the probe's three (red before, naming the fifteen reads); no block comment
there names a scripted-client variable (red before, nine lines); the list names all thirteen and the check finds them in a chunk
(red before); and `package.mjs`'s packaged launch names none of them (red before).

**Shown** by the seam-free build grep (2026-10-14, Linux, load 1.1 to 2.1): `ROTARIS_BUILD=package pnpm exec electron-vite build` in
`apps/desktop`, then `grep -rhoE "ROTARIS_[A-Z0-9_]+" out/main` and `node scripts/lib/seam-check.mjs out/main`. Before: `run-host.js`
carried `ROTARIS_MODEL_DIALECT` (five times), `ROTARIS_SCRIPT` and the eleven other script variables, and the check read PASS; the new list over the
unrepaired source reads FAIL, naming seven entries. After: `out/main` carries the probe's three and the product's seven alone, and
the check reads PASS. Rule 4 (b)'s launch itself, run against that seam-free `out/main/index.js` under `xvfb-run` with the
packaged launch's configuration and capture variables (`package.mjs` is Windows-only, IC-3): one session `completed`, one
`terminal` call `git status` settled `ok`, the window photographed; the same with `ROTARIS_SCRIPT=push,rm` set: the same single
`git status` call; and with `ROTARIS_MODEL_DIALECT=scripted` over a configuration whose model is an `openai` entry at an
unreachable `base_url`: no scripted model call at all, the orchestrator's request retried against `openai/gpt-x` ("fetch failed
(bad port)"). The seamed build still drives the variables: `pnpm edits-proof` and `pnpm questions-proof` (both scripted through
`_SCRIPT_TOOL_ARGS` and `_SCRIPT_QUESTIONS`) exit 0. `pnpm package` itself was not run: it produces a release artifact, which this
Linux host may not (IC-3).

**Outcome addendum — 2026-10-14 (fin46, `fin46-accept1-11`; [OQ-312](../../architecture/open-questions.md#oq-312) ruled under
R-072).** The client itself does not ship any more. The repair above left it in every build so that rule 4 (b)'s launch could reach
it through a `provider: scripted` configuration, and a packaged build answered such an entry with the fixed `PACKAGED_SCRIPT`.
OQ-312's ruling removed that path: `host.ts` builds the client only behind `__ROTARIS_SEAMS__`, so the packaged `run-host.js`
carries none of it; a packaged build refuses a `scripted` entry with no `base_url` as a provider it knows no endpoint for; and rule
4 (b) runs against a loopback OpenAI-compatible stub through the shipped model client
([`a-packaged-build-answers-a-scripted-provider-entry-with-the-scripted-client.md`](a-packaged-build-answers-a-scripted-provider-entry-with-the-scripted-client.md)).
