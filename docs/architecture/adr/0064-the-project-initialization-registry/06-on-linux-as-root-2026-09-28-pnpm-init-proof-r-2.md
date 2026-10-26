# ADR-0064 — Project initialization: a task registry in `config`, one marker writer in main, and the work delegated to whoever can do it — On Linux as root — 2026-09-28 (`pnpm init-proof`, R-062): a third order of the same race (continued)

Part 6 of 6 of [ADR-0064](../0064-the-project-initialization-registry.md), which indexes every part.

**Measured** by the unit cases (three command-level cases red on the code before) and by `workspace-proof`'s new
scenario 8e. In 8e the first window reads its own state and cancels its own run while the second window, opened last and
focused, holds the other workspace: 44 passed, 0 failed, 2 skipped, as root under Xvfb, Node 24, `--skip-build` after
`pnpm build`. **Found besides:** the two initialization banners are application notices, shown in every window. Which
window should show a workspace's banner is raised as OQ-171. *Ruled 2026-10-06 ([R-071](../../../product/requests.md#r-071)): the banners stay
the application's and name their project — [`PD-WORKSPACE-005`](../../../product/directives/pd-workspace-005.md#pd-workspace-005), built the same
day: the title reads `{headline}: {the folder's name}` and the detail area opens on the project's folder
(`namedBanner`, `initialization.test.ts`, `init-proof` scenario 4).*

**Thirteenth round (2026-10-01): an undelivered cancellation at a quit.** At an orderly quit the close's cancellation
can reach a run host that is already shutting down. That run host has closed its stores, so it refuses the
cancellation, or it has exited and never answers. The live run at 71ad8e8 logged this as its sign-in launch's only
warning, "the setup's cancellation could not be delivered". The warning was half true. No cancellation reached the step,
and the run host's `shutdown` never ended the setup, so the step and what it had started outlived the application. Main
and the warning address were not the whole cause.

ADR-0035's report of the same date covers the run host's half: `shutdown` now ends the setup itself. The coordinator's
half: it now reads `QuitState` (`deps.quitting`). While the application is quitting, an undelivered cancellation is said
at `info`, because the shutdown ends the setup; otherwise it is said at `warn`, as before. The twelfth round already
addresses the cancellation by the run's own workspace rather than the focused window's. **Measured** by one unit case,
red on the code before, which gives no warn line at a quit and still warns for a refusal while the application stays.
The live-run check is reported in `first-executions.md`'s row of this date.

**Fourteenth round (2026-10-01): a setup start the run host never answers.** The eighth round made a start the run host
refuses this task's own retryable failure; a start it never answers was left to the runner's caller. Main's `mcp.setup`
request rejects on its 15 s bound, as for a run queued behind a setup whose run host was lost (the eleventh round's
scenario 8d), and the rejection escaped `run`, so `executeTasks` reported REQ-WORKSPACE-084's generic "Code intelligence
project setup ended without reporting an outcome: Error: no reply to mcp.setup within 15000 ms" with its generic summary
(`../../../defects/fixed/a-setup-start-the-run-host-never-answers-is-reported-as-a-task-with-no-outcome.md`). The runner now
catches it: a retryable failure in REQ-WORKSPACE-093's summary, under the build's reason for a setup that began no stage
(OQ-167), its detail the build's "the run host did not answer the setup's start" with the request's own error
(`SETUP_START_UNANSWERED_DETAIL`; OQ-169 records the reading). The task's status read for applicability was not changed:
one that rejects makes the predicate raise, which REQ-WORKSPACE-080 counts not applicable, and the resolution does not
fail. **Measured** by three unit cases (the start's red on the code before) and by scenario 8d, which now reads the queued
run's outcome and report: "… could not complete this project's setup: the run host did not answer the setup's start (no
reply to mcp.setup within 15000 ms)", retryable, REQ-WORKSPACE-093's summary (47 passed, 0 failed, 2 skipped; as root
under Xvfb, Node 24, `--skip-build` after `pnpm build`, load average about 7 to 8 from other agents). The scenario was
not run on a build of the code before; the note records what it read there on the same day.

**Fifteenth round (2026-10-01): every setup step in REQ-WORKSPACE-091/092's words.** The ninth round mapped a stopped
step's detail and left the others the run host's: a creation the marker skipped ("the project already exists (its marker
file is present); …"), the two `skipped-no-code` stages ("skipped: the workspace contains no file the runtime indexes")
and a non-zero exit ("exited with code N; its last output: …"), all the MCP category's sentences
(`../../../defects/fixed/the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md`). The ninth round's choice
holds: the run host's status carries facts beside its own `detail` — `McpSetupStep.skipped` (`marker-present`, `no-code`),
`output` (the trimmed tail of a step whose command ran, without the prose) and `startError` (a launch that failed) — and the
runner's `stepDetail` writes REQ-WORKSPACE-091's fixed sentences and REQ-WORKSPACE-092's last 400 bytes of the output, cut
where a UTF-8 character begins, with no prefix, in the live rows, the step rows and the error. Steps with no output to give
read empty, a launch that failed in its own error (OQ-175). **Measured** by the unit cases, which now push the run host's
real details and facts (eight red on the code before), and by `workspace-proof`'s new scenario 8g: a project carrying the
marker read "project file already exists; left as is", a documentation-only one its creation's output and the two
`skipped-no-code` sentences, and one whose creation wrote to both streams and exited 3 its output, "ä" intact, in the row
and the error, the run host's log lines keeping its own words (50 passed, 0 failed, 2 skipped; as root under Xvfb, Node 24,
`--skip-build` after `pnpm build`, load average about 6 from other agents). Not run on a build of the code before.
**Found besides:** in a documentation-only project carrying the marker every step ends without waiting, and the follow
never saw that setup finish — its run still under way 30 s later, as it would be until the 2235 s bound
(`../../../defects/fixed/a-setup-that-finishes-before-its-start-is-answered-is-never-seen-to-finish.md`, recorded, not repaired;
8g's marker project holds a source file so that its steps wait).

**Sixteenth round (2026-10-02): a setup that finishes before its start is answered.** The eleventh round's "pushed, not
polled" assumed the sink is installed before the first push it must take. It is installed once main's start request
answers, and a setup whose every step ends without waiting (a documentation-only project carrying the runtime's marker)
runs to its end inside the run host's start: its three step pushes and its `finished` push reach main ahead of the
answer, which still reads `running` with every step ended. All four were dropped, and the follow waited until the 2235 s
bound (`../../../defects/fixed/a-setup-that-finishes-before-its-start-is-answered-is-never-seen-to-finish.md`). The
coordinator now keeps the latest status pushed while its own start is in flight (`setupEarly`) and drains it after the
answer, and either is taken only when it is this setup's by `startedAt`. Where the drained status has every step ended
and still reads `running`, it asks the run host's status once, the one poll this record admits, for the one status that
must already have been sent. **Measured** by three cases in `initialization.test.ts` (two red on the code before), and by
`workspace-proof`'s scenario 8g, which gained the note's documentation-only marker project: on the unrepaired build its
run had not ended 18.2 s after the launch, and on the repair it ended 2.9 s after the launch as `success`, with the three
steps and the non-code summary (51 passed, 0 failed, 2 skipped; as root under Xvfb, Node 24, `--skip-build` after
`pnpm build`, load average 10 to 13 from other agents). OQ-169's bound and its readings are unchanged.

**Seventeenth round (2026-10-03): the marker write asks for the starter first.** "The single marker write routed through
`config.setField`" holds, with a step this record left unstated: REQ-WORKSPACE-040 has the writers of the persisted
initialization state write the minimal bootstrap first when no `agents.yaml` exists, and no code cited it. The per-field
writer never bootstraps (REQ-CONFIG-030), so on a first run whose code-intelligence setup succeeded before any sign-in,
the first recording created the workspace file holding `initialization:` alone, and the starter of REQ-CONFIG-025 never
came (`../../../defects/fixed/a-first-run-workspace-never-gets-the-starter-agents-yaml.md`). The workspace service's
`workspace.open` now writes the starter before it answers, which main awaits before `open` here; and main's marker writer
(`serviceMarkerWriter`) asks `config.bootstrap` before each `config.setField`, so a file removed while the workspace is
open gets the starter before the record. A bootstrap that fails does not stop the record. REQ-WORKSPACE-085's one writer
is unchanged. **Measured** by `initialization-marker-writer.test.ts` over the real writers and by `pnpm slice-proof`
against the registered endpoint, whose first launch logged the open's bootstrap `written` before code-intelligence setup
recorded `success`, and the file then held the starter followed by `initialization:` (the note gives the runs and loads).
