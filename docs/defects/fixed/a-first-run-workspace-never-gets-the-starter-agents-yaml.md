## A first-run workspace never gets the starter agents.yaml

A workspace opened for the first time never receives the starter `<workspace>/.rotaris/agents.yaml` of REQ-CONFIG-025:
no comment header, no `default_persona: orchestrator`, none of the twelve explicit nulls.

Two writers meet the file, in this order, and neither bootstraps where the specification needs it:

1. **Initialization records first.** At the open, main starts ADR-0064's background resolution
   (`InitializationCoordinator.open`, then `resolve` 800 ms later). Code-intelligence setup now succeeds before anyone
   signs in, and its outcome is recorded into `initialization:` through the scoped per-field writer (`config.setField`,
   REQ-CONFIG-441). With no file present that writer starts from an empty document (REQ-CONFIG-030 forbids it to
   bootstrap), so the file is created holding `initialization:` alone.
2. **The only bootstrap comes after a provider change.** `afterProviderChange` in `apps/desktop/src/main/index.ts` is
   the one place `config.bootstrap` is requested. By the time a sign-in reaches it the file is non-blank, so
   `bootstrapConfigFile` correctly reports `exists` and writes nothing (REQ-CONFIG-026, never clobber).

A workspace opened after the first sign-in is never bootstrapped at all, since nothing asks for `config.bootstrap`
until the next provider change. Runtime defaults are unaffected (REQ-CONFIG-063 ships `orchestrator`, and ADR-0037
reads a written null as unstated); what the user loses is the starter content itself, ~~including the header that tells
them the file overrides the built-in roles and that models are wired up by authenticating a provider.~~ including the
header that tells them the file overrides the built-in roles, models and tool servers. *(Corrected 2026-10-03, the third
repair round's verifier: the shipped header has never said that models are wired up by authenticating a provider, the
clause REQ-WORKSPACE-038 asks of it; that gap has its own note, repaired the same day,
[the-starter-agents-yaml-header-never-says-models-are-wired-up-by-authenticating-a-provider.md](the-starter-agents-yaml-header-never-says-models-are-wired-up-by-authenticating-a-provider.md).)*

Observed by acceptance round 1 on merged main (`1763f7f`): `pnpm slice-proof` red twice at scenario 1 (load 0.37 and
0.40), throwing "the starter agents.yaml was not bootstrapped after sign-in" at `slice-proof.mjs:234`. The first launch's
log has `initialization: code-intelligence-setup → success` at 04:58:42.757, `providers: Added Katalyst; discovered 1
model.` at 04:58:45.124, and `workspace service: configuration bootstrap for …/workspace: exists` at 04:58:45.126; the
file on disk held only `initialization:` (`completed: [code-intelligence-setup]`, `classification: non-code`). Earlier
passing runs hid it because setup failed (exit 127) before the sign-in, so the bootstrap still found no file and logged
`written`. `pnpm live-run`'s sign-in scenario checks only that the file exists, which the initialization record alone
satisfies, so it passed over the same defect.

Scenarios 2 to 7 of `slice-proof` (the real run on the model, the intents, spike 6, the sign-out and the refusal) never
executed on that head, so it had no live-model slice evidence (acceptance finding F2). The proof's assertion was right
and the cause was this defect; F2 is recorded here rather than as a note of its own, because the proof has nothing to
repair.

## Specs

- **REQ-CONFIG-025**: "When `<workspace>/.rotaris/agents.yaml` is absent, a minimal starter file is written on first
  run." On a first run with code-intelligence setup succeeding, it never is.
- **REQ-CONFIG-028**: a target absent or blank "needs bootstrap"; nothing asks for one at the open, where the file is
  still absent.
- **REQ-WORKSPACE-038**: the starter's content (the three header lines, `default_persona: orchestrator`, the twelve
  nulls); none of it reaches the file.
- **REQ-WORKSPACE-135**: the guided provider setup writes the bootstrap only when no `agents.yaml` exists, so it cannot
  repair a file initialization already created. Not contradicted: it behaves as written.
- **REQ-CONFIG-030**: names the desktop save and the per-field path as writers that do not bootstrap. *The reading at
  recording time, superseded by the repair:* "The marker writer is the per-field path, so having it bootstrap a missing
  file would contradict this requirement. The reading the repair takes is REQ-CONFIG-025's own: the bootstrap happens at
  the open, before anything else writes the file." *Superseded because* the marker writer is not the per-field path
  itself but a writer of the persisted initialization state, which REQ-WORKSPACE-040 has write the minimal bootstrap
  first when no `agents.yaml` exists. The repair therefore has the marker writer ask `config.bootstrap` before its
  record (`serviceMarkerWriter`, commit `f9365cd`), while the per-field path it then calls (`config.setField`,
  REQ-CONFIG-441) still never bootstraps, so REQ-CONFIG-030 holds. The bootstrap at the open (REQ-CONFIG-025) stays the
  first of the two; see the Outcome.
- **REQ-WORKSPACE-078 / REQ-WORKSPACE-079**: the starter carries no `initialization:` key, so a bootstrapped file still
  reads as never initialized, and the marker write preserves every other top-level key; both hold under the repair.

## Relevant files

- `apps/desktop/src/main/index.ts`: `openWorkspaceInner` (the open, then `initialization.open` and the delayed
  `resolve`); `afterProviderChange`, the only `config.bootstrap` request.
- `apps/desktop/src/workspace-service/index.ts`: the `workspace.open` and `config.bootstrap` cases.
- `apps/desktop/src/main/initialization.ts`: the coordinator's `writeMarker`, wired to `config.setField`.
- `packages/config/src/writers.ts`: `bootstrapConfigFile`, `starterDocument`, `writeConfigFields`.
- `packages/config/src/init/execute.ts`: the per-task recording that creates the file.
- `apps/desktop/scripts/slice-proof.mjs`: scenario 1's starter assertion (line 234 on `1763f7f`).
- `apps/desktop/scripts/live-run.mjs`: the sign-in scenario's `existsSync(agentsFile)` check (acceptance F3, repaired
  by another bundle of the same round: [live-runs-sign-in-check-passes-on-any-agents-yaml-even-one-holding-only-the-initialization-record.md](live-runs-sign-in-check-passes-on-any-agents-yaml-even-one-holding-only-the-initialization-record.md)).

## Outcome — repaired 2026-10-03 (branch `finacc-accept1-3`)

**Confirmed on the branch's base** (origin/main `1763f7f`, the head acceptance judged). The new test drives the two
writers in the order the open ran them: initialization's per-field record into a missing file, then
`bootstrapConfigFile`. The file holds no `default_persona`, and the bootstrap answers `exists`.

**The reading taken** is REQ-CONFIG-025's "on first run" together with REQ-WORKSPACE-040, which the orchestrator's
brief did not name. REQ-WORKSPACE-040 says the writers of the persisted initialization state write the minimal
bootstrap first "when no `agents.yaml` exists", and no code cited it before this repair. Both repairs leave the
per-field path non-bootstrapping (REQ-CONFIG-030). No open question was needed, because the specification decides both
moments.

- **At the open.** The workspace service's `workspace.open` now bootstraps `<workspace>/.rotaris/agents.yaml` once the
  store is open and before it answers (`apps/desktop/src/workspace-service/open-bootstrap.ts`, `bootstrapAtOpen`). Main
  awaits that answer before `initialization.open`, so the starter is in place before initialization can record. An
  existing file is left alone (REQ-CONFIG-026). The open bootstraps whenever the file is absent, not only at a
  workspace's very first open, so a file the user deletes comes back as the starter at the next open: this reads
  REQ-CONFIG-025's "on first run" as every open that finds the file absent, and it is the only part of the repair that
  rests on that reading (the marker path rests on REQ-WORKSPACE-040's "when no `agents.yaml` exists"). A declined or failed write is logged as a warning and never refuses the
  open: `replaceDocumentSync` throws rather than refusing when the parent cannot be created, so the helper catches that
  throw ([replace-document-sync-throws-when-the-parent-cannot-be-created.md](../replace-document-sync-throws-when-the-parent-cannot-be-created.md)).
- **Before every initialization record.** `serviceMarkerWriter` (`apps/desktop/src/main/initialization.ts`) asks
  `config.bootstrap` before each `config.setField`, so a file removed while the workspace is open gets the starter
  before the record (REQ-WORKSPACE-040). A bootstrap that fails does not stop the record.
- **The proofs that passed over it.** `pnpm live-run`'s sign-in check read only that the file existed, which
  initialization's record alone satisfied. That is acceptance F3, repaired not here but by the sibling bundle
  `finacc-accept1-1`, merged first ([live-runs-sign-in-check-passes-on-any-agents-yaml-even-one-holding-only-the-initialization-record.md](live-runs-sign-in-check-passes-on-any-agents-yaml-even-one-holding-only-the-initialization-record.md)): its reader
  `apps/desktop/scripts/lib/starter-config.mjs` (`starterMissing`: the comment header, `default_persona: orchestrator`,
  the twelve null keys at the top level) is what the live run asks. This branch first wrote a reader of its own
  (`starterProblem`) and changed the same live-run line; at the merge with origin/main it took F3's reader and check
  and dropped its own, and `slice-proof` asks `starterMissing` too (F2, below).

**Pinned in:**
- `apps/desktop/src/workspace-service/open-bootstrap.test.ts`: the defect's order, reproduced; the starter at the open
  surviving the marker write whole; never over an existing file; blank written, directory declined; a refused write as
  a warning. It also reads the service's source to check that the open case bootstraps after `openOwn` and before it
  answers, and main's source to check that `initialization.open` comes after the awaited open. The source checks fail on
  the unrepaired tree.
- `apps/desktop/src/main/initialization-marker-writer.test.ts`: over the real writers, bootstrap then record, in that
  order, for a missing file; the user's file left as written; a failing bootstrap not stopping the record; and main
  wiring this writer, which fails on the unrepaired tree.
- `apps/desktop/scripts/lib/starter-config.test.ts` (F3's, extended here): the reader against `starterDocument` and
  against the file acceptance observed, live-run asking it, and slice-proof asking it (F2, below).

**Shown by the proof that found it** (`pnpm slice-proof`, the `katalyst` endpoint, each run on a fresh profile, load
recorded per run in the session scratchpad's `a13-slice-proof.r<N>.log`):
- Scenario 1 passed in all six runs on the branch. In every run the first launch logged `configuration bootstrap at the
  open of …/workspace: written` before anything else touched the file, and the sign-in's bootstrap then logged `exists`.
- **Run 3** (build `41af3a1`, 05:47 to 05:54 UTC, load 2.6 to 2.7, the code-intelligence bundle present) reproduced
  acceptance's exact order: `bootstrap at the open: written` 05:47:25.458, `code-intelligence-setup → success`
  05:47:28.111, `Added Katalyst` 05:47:30.278, sign-in bootstrap `exists` 05:47:30.281. The file then held the
  starter, the `initialization:` record (`completed: [code-intelligence-setup]`, `non-code`) and the proof's `runtime:`
  section, and all seven scenarios passed.
- **Run 6** (build `f9365cd`, the branch's head, 06:16 to 06:23 UTC, load 0.4 at start, 3.9 at end) passed all seven
  scenarios: the run completed `tasks_complete` with a settled tool row; the intents were `question`,
  `explicit_trivial` and `small_feature`; spike 6, the sign-out and the refusal ("Provider authentication required")
  all passed. The marker writer's own bootstrap logged `exists` at 06:16:04.598, just before
  `code-intelligence-setup → success`.
- Runs 2, 4 and 5 went red after scenario 1, on the live model's answers and the shared endpoint's latency
  ([slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md](../slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md)). Run 1 was
  green but had no code-intelligence bundle, so setup failed before the sign-in, as in the passing runs before
  acceptance.
- `pnpm init-proof` passed its five scenarios on `f9365cd` (06:02 UTC, load 3.0).
- The first execution is reported back in ADR-0064's "Seventeenth round (2026-10-03)" and has its row, of
  2026-10-03, in [first-executions.md](../../architecture/first-executions.md).

**Left as they were:** a workspace whose file already holds only `initialization:` keeps it. REQ-CONFIG-026 forbids
the bootstrap to write over a non-blank file, so the starter does not come back for those workspaces. Recorded beside
this repair: the starter writes fourteen nulls where REQ-WORKSPACE-038 names exactly twelve
([the-starter-agents-yaml-writes-fourteen-explicit-nulls-where-the-specification-names-twelve.md](../the-starter-agents-yaml-writes-fourteen-explicit-nulls-where-the-specification-names-twelve.md)).

## F2: slice-proof's scenario 1, on the repaired head

The proof's assertion was right (F2), so nothing in it needed repair. It was strengthened in the same terms as
live-run's (F3): scenario 1 now asks `starterMissing`, F3's reader, for the whole starter (the comment header,
`default_persona: orchestrator`, the twelve null keys) rather than the persona line alone, and its error names what the
file lacks. `apps/desktop/scripts/lib/starter-config.test.ts` checks that slice-proof asks the reader and no longer keeps
the persona-only check; that case fails on origin/main's script. It also checks that a file holding the persona line
and initialization's record alone, which the old check passed, lacks the header and the twelve keys.

**Run 7** (build `f9365cd`, the branch's own reader `starterProblem`, 06:25 to 06:33 UTC, load 2.4 to 2.9, another live
run sharing the endpoint) passed all seven scenarios: the run completed `tasks_complete` with a settled tool row; the
intents were `question`, `explicit_trivial` and `small_feature`; the refusal was "Provider authentication required".
The re-run on the merged branch, with `starterMissing`, is recorded below.

**Run 8, on the merged branch** (build `c10e2ce`: origin/main `43e3958` merged, slice-proof asking `starterMissing`,
the code-intelligence bundle present; 07:56:58 to 08:04:39 UTC, load 6.6 at start and 5.1 at end, other agents' work on
the host): exit 0, all seven scenarios. The first launch logged the open's bootstrap `written` at 07:57:19.795,
`code-intelligence-setup → success` at 07:57:23.555 (the marker writer's bootstrap `exists` 88 ms before it),
`Added Katalyst` at 07:57:26.959 and the sign-in's bootstrap `exists` 12 ms later. The workspace file held the comment
header, `default_persona: orchestrator`, the nulls, then `initialization:` and the proof's `runtime:` section. The run
completed `tasks_complete` with one settled tool row; the intents were `question`, `explicit_trivial` and
`small_feature`; spike 6 passed its four tests; the sign-out removed the credential file; the refusal was "Provider
authentication required". Log and evidence: the session scratchpad's `a13r/slice-proof.r8.log` and `a13r/slice-proof-r8/`.

**Run 9, at the second repair round** (build of `35d5b4f`, whose product code is `c10e2ce`'s; 08:41:34 to 08:48:55 UTC,
load 8.7 at start and 5.9 at end, other agents' work on the host): exit 0, all seven scenarios. The first launch logged
the open's bootstrap `written` at 08:41:36.389, the marker writer's bootstrap `exists` at 08:41:40.635,
`code-intelligence-setup → success` at 08:41:40.674, `Added Katalyst` at 08:41:41.379 and the sign-in's bootstrap
`exists` at 08:41:41.382. The run completed `tasks_complete` with one tool row; the intents were `question`,
`explicit_trivial` and `small_feature`; spike 6 passed its four tests; the sign-out removed the credential file; the
refusal was "Provider authentication required". Log and evidence: the session scratchpad's `a13r2/slice-proof.r9.log`
and `a13r2/slice-proof-r9/`.
