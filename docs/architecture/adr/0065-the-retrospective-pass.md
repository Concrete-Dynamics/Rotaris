# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged

- **Status:** accepted, awaiting its first execution
- **Date:** 2026-09-17
- **Origin:** `PD-LIBRARY-002`, raised by the owner as [R-033](../../product/requests.md#r-033) on
  2026-09-17. The directive is the whole of what this record implements; where it governs, this ADR
  cites it rather than the requirement it extends.
- **Depends on:** ADR-0061 (the improvement artifact store's write path — the one writer this pass
  saves through), ADR-0058 (the workspace database, whose migration discipline v19 follows), ADR-0030
  (credential leasing — how a pass with no run obtains a bearer), ADR-0026 (the model boundary),
  ADR-0044 (the IPC contract — one new renderer command and one new host request), ADR-0049 (notices —
  the two this pass posts, both in the existing vocabulary), ADR-0036/0037 (configuration loading and
  when a change takes effect — the three keys).
- **Requirements:** `PD-LIBRARY-002` governing; `REQ-LIBRARY-003`, `006`, `008`, `009`, `015`, `016`,
  `017`, `019`, `020`, `021`, `022`, `023`, `024`, `025`, `026`, `035`, `037`, `040`, `042`, `045`,
  `046`, `047`, `116`, `122`..`127`, `162`, `165`; `REQ-WORKSPACE-041` (instruction-file discovery);
  `REQ-SHELL-135`, `REQ-SHELL-149` (how the activity is conveyed).

## Context

The product has one analysis pass, and it is fenced. `REQ-LIBRARY-017`: "Data from another run, another
session, or another workspace MUST NOT inform it." That fence is right for a run's own analysis and it
is exactly why the corpus cannot answer the owner's request, which is for a pass that reads **across**
runs and proposes how the workspace is worked in. `PD-LIBRARY-002` therefore adds a second pass rather
than widening the first, and leaves `REQ-LIBRARY-015`'s scope — at most once per terminal task run —
untouched.

Everything the second pass needs downstream of itself already exists and is measured: the artifact
store (v18, ADR-0061), duplicate suppression (`REQ-LIBRARY-046`), versioned history
(`REQ-LIBRARY-162`), the review surfaces, the executor, the improvement checkpoints and the rollback.
The new mechanism is therefore small on purpose: a capture that reads a workspace instead of a run, a
prompt that asks a different question, and a trigger that is a person rather than a run ending.

## Decision

**1. One job, one analyst, two passes.** `ImprovementAnalysisJob` carries
`pass: 'post_run' | 'retrospective'` (defaulting to `post_run`, so every existing job parses unchanged)
and an optional `retrospective` sources block. `analyzeImprovement` is not forked: the timeout race,
the single retry of `REQ-LIBRARY-022`, the three recovery notes of `REQ-LIBRARY-023` and the
never-raise discipline of `REQ-LIBRARY-015` are the same code for both passes, which is what makes
`PD-LIBRARY-002`'s "bounded like its sibling" true rather than asserted. Only the system text and the
serialised evidence branch on `pass`.

**2. A retrospective artifact has no source session, and the record says so rather than inventing
one.** The artifact gains `source_kind: 'post_run' | 'retrospective'`, and `source_session_id` becomes
nullable **only** when `source_kind` is `retrospective` — a `superRefine`, so a post-run artifact still
cannot omit it and every reader of an existing artifact is unaffected. The sessions a pass actually
read are named in `considered_session_ids`, and every evidence entry keeps its own
`source_session_id`, which is how the directive's attribution clause is met: the entry names the record
that holds what it cites, and a proposal whose evidence cannot be so attributed never reaches a review
surface.

`RUN_TYPES` is **not** widened. It is `REQ-SESSION-021`'s session marker, and a retrospective starts no
session; `source_run_type` stays `task_run` on a retrospective artifact so that `REQ-LIBRARY-034`'s
history filter keeps meaning what it means, and `source_kind` is what tells the two apart.

**3. Store v19 rebuilds `improvement_artifacts`.** SQLite cannot relax `NOT NULL` in place, so the
migration creates the new table, copies every row with `source_kind='post_run'`, drops the old one,
renames, and recreates both indexes — all inside the one transaction `migrateStore` already wraps a
migration in. The two existing indexes keep their definitions; `improvement_artifacts_by_session`
continues to serve the by-session query, which no retrospective row can match.

**4. The capture runs in the run host; the workspace service stays the only writer.**
`REQ-LIBRARY-017`'s fence is a property of what a capture reads, not of where it runs, and the run host
is the process that already holds the workspace store open and can resolve a model. The artifact is
saved by the existing `save-collected` command (ADR-0061, W-02), so duplicate suppression, the
all-or-nothing write of `REQ-LIBRARY-047` and the version record apply to a retrospective artifact
without a second write path existing anywhere.

**5. A pass with no run resolves its own model and its own credential.** `configuredFor(workspaceRoot)`
already yields a configured workspace outside a run, and `leaseForContinuation` already obtains bearers
outside a launch. The retrospective uses both; nothing new about credentials is invented, and a
workspace whose slot resolves to nothing captures no pass at all.

**6. The evidence bounds are constants.** `PD-LIBRARY-002` fixes the configuration surface at exactly
three keys — `runtime.retrospective_timeout`, `retrospective_model` and
`retrospective_model_thinking` — mirroring the rule `REQ-LIBRARY-165` states for the sibling. The
bounds this pass applies, and the reason for each:

| Source | Bound | Why this number |
|---|---|---|
| session digests | 25 newest sessions, 2,000 chars each, 50,000 total | a digest, not a transcript: the pass is about how work goes across runs, and 25 covers ordinary recent use without the evidence growing with the workspace |
| improvement artifacts | 20 proposals, 400 chars each | enough for the pass to see what has already been proposed and rejected, which is what keeps it from re-proposing it |
| saved prompts | 50 prompts, 200 chars each | the prompt library is what a user has already chosen to keep; the head of each is what identifies it |
| persona memory | 10 files, 4,000 chars each | the executor's own cap on a memory file is 200 lines, and 4,000 characters holds one |
| instruction files | `AGENTS.md` + `AGENTS.override.md`, 20,000 chars total | these are the files most proposals will propose changing; the pass reads them whole where it can |

Every cut is marked `…` by the same `visiblyCut` the sibling uses, so an excerpt reaching a stored
artifact is either complete or visibly cut. Two passes over an unchanged workspace consume the same
evidence.

**7. The trigger is a person, and the pass is never chained.** Three surfaces raise the same command —
the Library's Proposals tab, the Overview's proposals card, and the command palette — and nothing else
may. No run completion, no schedule, no agent. The pass costs the owner's money, so the gesture that
spends it is theirs.

**8. The activity indicators are built here, for both passes.** `REQ-LIBRARY-125`/`126` were never
built (recorded as a defect in `docs/defects/` before this work began); the directive requires the
retrospective's activity to be signalled by that pattern, so the pattern is built once and labelled per
pass, and the channel that has carried the facts since Part V finally has a consumer.

## Consequences

1. A retrospective proposal is an ordinary proposal in every mechanical respect, which is the whole
   point: review, edit, delete, undo, history, export, the executor and the rollback all reach it
   without knowing it exists.
2. Two passes can be queued at once, and the existing FIFO orders them. `REQ-LIBRARY-123`'s ordering
   and `REQ-LIBRARY-127`'s shutdown cancellation therefore cover the retrospective for free.
3. A reader that assumed `source_session_id` names a session must now check `source_kind` first. The
   compiler finds these because the field's type changed; the surfaces that show a source label are the
   Proposals tab, the artifact export and the Overview card.
4. The pass reads material whose per-run handling never lifts it out of the workspace. Nothing leaves
   the machine except what the provider call already carries, and the pass writes nothing but proposals.

## Alternatives considered and rejected

- **A sentinel session id** (`retro_…`) in `source_session_id`, avoiding the table rebuild. Rejected:
  every reader would have to learn the sentinel anyway, and a column that names a session would hold a
  value that is not one — the by-session query would answer with a lie rather than with nothing.
- **Widening `REQ-LIBRARY-017`'s fence to admit cross-session material.** Rejected by the directive
  itself: the fence is faithful to the per-run analyst's scope, and widening it would make one pass
  answer two questions and be bounded for neither.
- **An insights report surface**, the other half of the comparison the owner drew. Rejected in
  `PD-LIBRARY-002`: a report is a fifth kind of record this corpus has no home for, while a proposal is
  already a first-class record with evidence, review, undo, history, export and an executor behind it.
- **Running the capture in the workspace service**, which owns the improvement rows. Rejected: it has
  no model boundary and no credential lease, and giving it one would put a provider call in the process
  that owns the store.

## What its first execution owes

`pnpm retrospective-proof`, against the built application and a scratch profile: the capture reading
several sessions, the artifact stored with `source_kind: 'retrospective'` and a null source session, the
proposals reaching both surfaces, the no-model refusal posting exactly one notice per gesture, the
timeout taking the empty-artifact outcome while the application stays usable, shutdown leaving nothing
behind, and both indicators present while a pass runs and gone when none does. The result is reported
**in this record, in place**, including if it finds nothing, and appended as a row to
`docs/architecture/first-executions.md`.

## What its first execution found — 2026-09-17

`pnpm retrospective-proof` was written and run against the built application: six launches over four scratch
profiles, **29 checks, all green on the third attempt**, evidence under `.proof/retrospective-proof/`. Every
scenario this record owed was measured — the capture reading three seeded sessions, the artifact stored with
`source_kind: 'retrospective'` and a null `source_session_id`, `considered_session_ids` naming exactly the
sessions read, the proposals on the Proposals tab and on the Overview card, an approval writing through, the
no-model refusal answering each gesture with its own notice, the timeout taking the empty-artifact outcome
inside its five-second bound while the composer still accepted input, shutdown leaving nothing behind, and both
indicators present while a pass ran and absent when none did.

**Three things it found that reading had not.**

1. **The Proposals tab drew a blank cell for a retrospective artifact.** The detail card's "Source session"
   value was `artifact.source_session_id` rendered directly, so a retrospective — which has none by
   construction — showed an empty cell where a session id belongs. This is consequence 3 of this decision
   arriving in the one place the type change did not force a compiler error, because `string | null` renders as
   nothing rather than failing. An empty cell reads as a record that failed to name its session, not as a pass
   that never had one. Repaired in the same commit: the cell is "Source", and a retrospective names the
   workspace's history and the number of sessions it read. **The hundred and nineteenth defect**, found by drawing
   the assertion rather than by running it.
2. **A gesture made in the first second after launch can have its answer replaced before it is read.** Exactly
   one notice is current (`REQ-NOTIFY-024`), and a launch with no authenticated provider publishes "No model
   provider is authenticated yet" about a second in. The no-model refusal's own notice was published and then
   replaced roughly 80 ms later, so the proof's first run read the startup notice and reported a failure
   against correct behaviour. **This is not a defect** — both notices behave exactly as `REQ-NOTIFY-024`
   specifies, and the second gesture's answer stood — but it is worth recording that the retrospective's
   refusal is as replaceable as any other notice, and that a proof which waits for a notice and then re-reads
   the DOM is reading whatever arrived in between. The proof now waits for the launch's own notices to settle
   and captures each notice *as it matched*.
3. **No proof had ever exercised the improvement analyst in the built application.** The scripted client
   recognises a role by its system text, and the analyst matched none of the five it knew — so every scripted
   post-run analysis since Part AF had been answered by the *child* script, parsed as unparsable output, and
   recovered into an empty artifact. The lifecycle's own proof is six Vitest lanes, so nothing noticed. The
   client now has an `improvement analyst` branch driven by `ROTARIS_IMPROVEMENT_SCRIPT`, and it serves both
   passes. The finding is against the harness rather than the product, and it is the reason this record's
   first execution is worth more than the 1,976 unit tests that were already green.

**What the WIDER sweep found, which is the part of the rule that pays.** Running the suite this part touches
rather than the script named after it turned up four defects that have nothing to do with the retrospective
and everything to do with the fact that nobody had run them: three proofs left red on `main` by the change
that moved what they measure — `palette-proof`'s hand-written command count (**121**), `config-proof`'s
`.seg-opt` selector for a control `PD-CHAT-001` turned into a press-revealed chip (**122**), and the timeline
entry name and severity OQ-46's audit corrected in the product and the unit tests but not in
`sessions-proof` and `checkpoint-proof` (**123**) — all three repaired here. Each failed PART WAY THROUGH its
script, so everything after the failing line had been unmeasured for as long as the miss stood, which is how
the fourth stayed hidden: past the corrected name, `sessions-proof` reports that `plan_cycles` (v17) is the
only session-scoped table in the store with no `REFERENCES sessions(session_id) ON DELETE CASCADE`, so
deleting a session leaves its plan text — stored VERBATIM by `REQ-ORCH-154` — behind for good (**125**,
`docs/defects/fixed/a-session-delete-leaves-its-plan-cycles-behind.md`). That one is NOT repaired here: it needs an
appended migration rebuilding a table this part does not own, and the note carries the repair's shape. Past the same
corrected name, `checkpoint-proof` reaches a scenario nothing had run in weeks and finds the Start session dialog
accepting a gesture and producing NOTHING — no session row, no refusal, no notice, reproduced twice (**126**,
`docs/defects/fixed/the-start-session-dialog-accepts-and-creates-nothing.md`). `pnpm ui-audit`, run for this part's own
surfaces, then measured the likely reason and a defect of its own beside it: that dialog stands 560 × **904** and
fits NO supported window — at the minimum 1000 × 680 its run-start selector, its `Cancel` and its `Start session`
are all off screen (**127**, `docs/defects/fixed/the-start-session-dialog-does-not-fit-the-minimum-window.md`), and a
click at a control's computed centre lands nowhere when that centre is outside the window. Two
defects, both hidden behind one stale string, which is the argument for running the whole suite rather than the
script named after the part.

**And one defect in the sibling this pass is built beside (124).** `REQ-LIBRARY-124` fixes the completion
notice's wording, its action and its zero-proposal outcome, and the built notice matched none of the three:
no count in the title, no action at all, and a success-shaped notice reading `0 proposals collected` where
the requirement fixes an informational one. The retrospective's own completion notice branches off that same
call, so the three were repaired here rather than worked around. A fourth limb of the same requirement stays
open and is recorded rather than fixed: a job that ends without an artifact for any reason but cancellation
owes a warning notice, and the coordinator writes a log line at each of its three failure points and posts
nothing — repairing it means separating cancellation from failure in the coordinator, which `REQ-LIBRARY-127`
makes a decision rather than an edit.

**What went right, and is therefore evidence rather than luck.** Decision 1 — one job, one analyst, two passes
— held without a single downstream change: the FIFO, the save, the canonical reread, the review, the history
and the Overview card all carried a retrospective artifact without knowing it existed. Decision 2's attribution
clause was measured in both directions in the built product: the analyst's answer cited one session the capture
had read and one it had not, and the stored artifact carries `["planted-03", null]` — the invented citation was
stripped rather than persisted.

## Live-run finding L10 — 2026-09-29 (R-067), the indicators' label measured, not only read

The first execution read both indicators' presence, text and roles. It never read their geometry, and that is where
the first live run found a defect. At 1440 px the run header cut "Reviewing run for improvem" mid-word with no
ellipsis. Decision 8's pattern was built as a Tag with a status dot, but two things kept it from drawing that way.
A `className` given to the design `Tag` replaces the `tag tag-<kind>` foundation, so the indicator was a plain span in
the body type with an unpainted dot. And its label was a bare text node in an inline-flex box, which `text-overflow`
never reaches. Repaired in `ImprovementActivity.tsx` and `shell.css`: the label is its own element and the Tag spells
`tag tag-run`. The run header wraps the label between words, never below its longest word, and the title bar elides
it with an ellipsis. `pnpm retrospective-proof` now measures every word of the run-header label with a Range at
1440 × 900 and at 1000 × 680. Before the repair it failed at both sizes ("cut: improvements…"). After it, 31 of 31
checks pass. The live `ask` scenario shows the post-run label whole on two lines at 1440 px. Notes: the repaired
`../../defects/fixed/the-improvement-label-is-clipped-without-an-ellipsis.md`, and, recorded without a repair,
`../../defects/fixed/the-design-tags-kinds-name-classes-the-adopted-stylesheet-does-not-define.md` (repaired
2026-10-01, acceptance A40). Not shown: Windows or
macOS (IC-3 — *corrected 2026-10-14: for the Windows half, a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*).

*(Added 2026-09-30, the verifier's fix round 1.)* The title-bar label is now measured at the same two sizes too
(`TITLE_BAR_LABEL_GEOMETRY`). It must be whole, or elided on the label element with `text-overflow: ellipsis` in force,
and it must not overflow the indicator or run under the next control. origin/main has no label element, so there the
check would fail at both sizes. It was not run there; that rests on `git grep`. On the repaired build the retrospective label is whole in 282 px at both
sizes, and the proof passes 33 of 33. The call site no longer passes `kind="running"`, which the spelled className
replaced.

## Decision 7's three surfaces made to agree — 2026-10-13 (`PD-LIBRARY-002` revision 2, OQ-236, R-072)

Decision 7 says three surfaces raise the same command, and they did not behave the same. The Library's and the Overview's
buttons were disabled whenever any analysis ran, a post-run one included, with "An improvement analysis is already
running."; the palette entry, listed always, raised the command and the job queued — which is consequence 2's reading, and
REQ-LIBRARY-125 lets no control be disabled while analysis runs. Nothing anywhere refused a second retrospective while one
was already queued or running in the workspace. Revision 2's clause (e) fixes the one state that rests the gesture: a
retrospective of this workspace queued or running. **Built:** the coordinator answers `retrospectivePending(workspaceId)`,
main sends each main window its own workspace's answer on `improvement:activity` (`retrospective_pending`), both buttons
are one `RetrospectiveGesture` reading it, and the handler refuses a press while it holds or while a capture is in flight,
with one info notice and no capture. **Measured:** `pnpm retrospective-proof`, 42 of 42 at a load average of about 5 on
four CPUs: while the pass ran the Library gesture read `aria-disabled=true` with the new reason, the palette's entry posted
one info notice and the store still held exactly one artifact afterwards, and the gesture was available again when the pass
ended. **Not measured in the built app:** a press made while a post-run analysis runs (the proof drives no run); the unit
cases in `main/improvements.test.ts` and `library/retrospective-gesture.test.ts` carry it.

## Decision 2 and the per-run history — 2026-10-14 (`PD-LIBRARY-002` revision 3 (h), OQ-271, R-072)

Reported back by fin43 (`fin43-analysis-and-artifacts`). Decision 2 kept `source_run_type` at `task_run` on a retrospective
artifact so that REQ-SESSION-021's marker stayed whole and "`REQ-LIBRARY-034`'s history filter keeps meaning what it means";
that stamp did not settle whether a later run's history should hold a retrospective's artifact, and by REQ-LIBRARY-034's letter
it did, with no session for REQ-LIBRARY-025 to record (fin42's
[`a-post-run-analysis-after-a-retrospective-is-never-captured`](../../defects/fixed/a-post-run-analysis-after-a-retrospective-is-never-captured.md)).
`source_kind` now settles it: `captureImprovementJob` keeps only `post_run` artifacts, dropping the retrospective's before the
bound of five. **Measured:** `analyst.test.ts`'s two revision-3 cases (red on the code before), and `pnpm retrospective-proof`
54 of 54 at a load average of 1.3 to 2.2 on four CPUs, launch 8 (`live-shape-timeout`) still capturing the later run's analysis
after a retrospective with no capture failure in its log. **Not measured:** a live run after a retrospective.

## Decision 5 measured live — 2026-10-14 (the live scenario run at `ce5f952`, F2; fin43)

**Found by the live run:** `ask-retrospective`, in a launch that had started no run, sent the retrospective's one
`/chat/completions` request with no `Authorization` header and got `401 Unauthorized`; the artifact's notes read "collector
crashed: Unauthorized…". Decision 5's reading — `configuredFor` and `leaseForContinuation` "already" give a pass with no run its
configuration and its bearers, so "the retrospective uses both" — **was false in the order the build used them**, and is kept
here beside its replacement: the capture took `configuredFor` first, a setup completed over the bearer map of its moment (empty
when nothing had leased), the lease then published a new map that setup never read, and the analysis reused the same cached
setup. A run never met it, because `launchSession` leases and then completes the setup over the bearers it leased. **Now:**
`leasedSetup` (`apps/desktop/src/run-host/launch.ts`) does exactly that for the retrospective — prepare, lease the providers the
configuration names (refusing as a continuation does when the entry provider is unresolved), complete over those bearers — and
the run host's `retrospectiveSetup` calls it at the capture and again at the analysis, publishing the lease and caching nothing
(`configure` stays a run start's). Pinned by `dispatch.test.ts`'s three cases (the analysis sends the leased bearer, the capture
reads its collector from the leased setup, a lease refusal returns before either; the first two red on the code before) and
`launch.test.ts`'s two `leasedSetup` cases.
([`../../defects/fixed/a-retrospective-sends-its-model-request-with-no-credential-when-no-run-has-leased-one.md`](../../defects/fixed/a-retrospective-sends-its-model-request-with-no-credential-when-no-run-has-leased-one.md).)
**Not measured:** the live `ask-retrospective` scenario since the change — it should show the request carrying a credential and
an artifact with no "collector crashed" note; the built app's proofs run the scripted provider, which takes no credential.

> **Corrected 2026-10-14 (fin46, `fin46-accept1-11`):** "refusing as a continuation does when the entry provider is unresolved",
> above, was the build's reading and is kept as written; it checked the **entry role's** provider, while the retrospective's one
> request goes to its own model (`retrospective_model`, then `medium_model`), so a retrospective was refused when only the entry
> role's provider was signed out and passed its lease when its own was, failing at its model call. `leasedSetup` now requires the
> retrospective model's sign-in provider (`PreparedRun.retrospectiveAuthProvider`), a continuation still the entry role's
> ([`../../defects/fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md`](../../defects/fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md)).


## Decision 1's system text measured live — 2026-10-14 (the default live run at `b9e3005`, L1; fin46)

**Found by the live run:** `ask-retrospective` at `b9e3005` asked for proposals whose `proposed_verifier_section` the model then
filled with keys of its own (`when`, `check`), on both of REQ-LIBRARY-022's attempts; the section schema is strict, so the pass
ended `collector parse failed` and the person saw PD-LIBRARY-005's warning. Decision 1 said "only the system text and the
serialised evidence branch on `pass`", and both texts said only "proposed_verifier_section when relevant": the reading that
naming the field was enough for the model to produce a block REQ-LIBRARY-009 (c) accepts **was false**, and is kept here beside
its replacement. **Now:** both texts carry `PROPOSAL_SHAPE` (`packages/engine/src/improvements/analyst.ts`), every proposal
field's vocabulary or bound and every key the verifier block and its checks take, with an example; the branch on `pass` is
unchanged. Pinned by `analyst.test.ts`'s four "the analyst is told the proposal's shape" cases (red on the text before), which
also hold the named keys equal to the strict schemas'. **Measured live** on the repaired build (`--only=ask`, 2026-10-14 from
23:22 UTC): the retrospective's one request carried the shape and its answer, a `verifier_gate_update` with a valid block, was
stored on the first attempt. One run of a nondeterministic model, so it shows the instruction followed once, not never broken
([`../../defects/fixed/the-improvement-analyst-is-never-told-the-verifier-sections-shape.md`](../../defects/fixed/the-improvement-analyst-is-never-told-the-verifier-sections-shape.md)).

## Decision 5 and ADR-0022's gate — 2026-10-15 (fin47, `fin47-accept1-4`; acceptance finding A3)

**Found by reading, then seen in the built app:** decision 5's "a pass with no run resolves its own model and its own credential"
was built by preparing the pass with the run start's own `prepareRun`, which carries ADR-0022's start-time confinement gate. With
`runtime.sandbox_mode` anything but `off` the gate refused the retrospective wherever the run host's verdict was unsettled (no run
start, no Settings read yet) or unavailable (every Windows host; a Linux host without `bwrap`), and `leasedSetup` turned that
refusal — like every refusal but `no-model` — into `unconfigured`: "The workspace configuration could not be loaded" at the
gesture, "The captured improvement job is no longer available" at the analysis. The reading that the run start's preparation was
the right one for a pass with no run **was false for its gate**, and is kept here beside its replacement. **Now:** `prepareRun`
leaves the gate out of a retrospective's setup (`PrepareOptions.retrospective`) — the pass opens no shell and its setup never
reaches a run — and only an unloadable configuration is said as one, with the loader's reason; a loaded configuration's other
refusals answer `retrospective.configuration` with their own reason, and whether they should refuse the pass at all is
[OQ-363](../open-questions/65-spikes-and-later-questions-32.md#oq-363). *(Ruled 2026-10-20 under R-072, (b) refined: neither refuses the pass — `PD-LIBRARY-002`
revision 6; built the same day, the next section.)* Pinned by `launch.test.ts`'s seven cases and a `dispatch.test.ts` case, and by
`retrospective-proof` launch 12 (`confinement-requested`), red on three checks on the base `7c9182c` and green after
([`../../defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md`](../../defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md)).

## Decision 5's refusal set, built and measured — 2026-10-20 (`PD-LIBRARY-002` revision 6, OQ-363, R-072; loc1)

**Reported back.** The question the previous section left as [OQ-363](../open-questions/65-spikes-and-later-questions-32.md#oq-363) was ruled (b), refined, on
2026-10-20 under R-072 *(the ruling in that entry; `PD-LIBRARY-002` revision 6)*, and built the same day by loc1
(`loc1-confinement-retro`). Of a configuration that loads, decision 5's pass is now refused for exactly what the directive's "The
model" states, and the run's refusals reach it no longer:

- **Refused:** a configuration that does not load or apply (`unloaded` → `retrospective.no-configuration` with the loader's reason);
  no resolvable retrospective model (`no-model` → `retrospective.no-model` at the capture, `improvement.no-model` at the analysis),
  now also where `default_persona` names no role this build knows and no retrospective model resolves, with the reason "default_persona
  '<x>' names no role this build knows, and no retrospective model resolves (retrospective_model, then medium_model)."; and revision
  5's lease refusal (`session.provider-auth`, the retrospective's sentence).
- **Not refused:** a `default_persona` naming no known role (the setup completed on the pass's own model, the configured name kept,
  no role's system text, logged "configuration: default_persona '<x>' names no role this build knows; a retrospective sends nothing to
  it, so its setup is completed on its own model '<key>' (PD-LIBRARY-002)"); an entry role with no usable model (fin47); a confinement
  mode (fin47); and REQ-CONFIG-246's referential errors, whatever the presenter — `prepareRun` reads no attendedness for a
  retrospective, and `retrospective.capture` writes each warning of the setup once at `warn`, prefixed `retrospective: `, the analysis
  none.
- **`retrospective.configuration`**, `leasedSetup`'s answer for a loaded configuration that refuses the pass, is reached by no current
  refusal; the branch stays as the truthful answer for one that ever does.

Every run start and continuation keeps both refusals word for word. **Measured:** in `apps/desktop/src/run-host/launch.test.ts`, four
retrospective cases red before the change (the unknown persona completed on `selected` over the leased bearer with an empty system
text and the stand-in line; the same with no one present, its referential message among the warnings; referential errors alone with
no one present; and `no-model` with nothing leased) and the run start's two refusals pinned beside them; in `dispatch.test.ts`, the
capture's two warn lines once each and none at the analysis, red before. `pnpm retrospective-proof` launch 13 (`unknown-persona`) went
red on its first five checks on the base and green after: no refusal notice, the indicator seen then gone, one `retrospective`
artifact with no source session, the stand-in line, and one `warning` line "retrospective: configuration: default_persona
'a-role-this-build-does-not-know' names no existing role"; its sixth check, a prompt refused "The run was refused before it started"
with "names no role this build knows", green on both. The whole proof read 83 of 84 on Windows 11 ARM64 (78 of 84 on the base); the
one red both times is launch 1's machine-wide-base check, Windows-only and recorded in
[`../../defects/retrospective-proofs-instruction-file-check-requires-a-machine-wide-base-windows-never-reads.md`](../../defects/retrospective-proofs-instruction-file-check-requires-a-machine-wide-base-windows-never-reads.md).
**Not measured in the built app:** the analysis with the presenter lapsed — the gesture is always attended there — which
`launch.test.ts` carries.
