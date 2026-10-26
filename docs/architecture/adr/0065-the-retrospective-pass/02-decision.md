# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged — Decision

Part 2 of 13 of [ADR-0065](../0065-the-retrospective-pass.md), which indexes every part.

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
