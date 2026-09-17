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
`docs/defects/a-session-delete-leaves-its-plan-cycles-behind.md`). That one is NOT repaired here: it needs an
appended migration rebuilding a table this part does not own, and the note carries the repair's shape. Past the same
corrected name, `checkpoint-proof` reaches a scenario nothing had run in weeks and finds the Start session dialog
accepting a gesture and producing NOTHING — no session row, no refusal, no notice, reproduced twice (**126**,
`docs/defects/the-start-session-dialog-accepts-and-creates-nothing.md`, cause deliberately not guessed at). Two
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
